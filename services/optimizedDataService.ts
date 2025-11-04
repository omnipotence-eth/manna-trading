/**
 * Optimized Data Service
 * Fetches account value, positions, and P&L data as quickly as possible
 * Uses parallel requests, intelligent caching, and WebSocket updates
 */

import { asterDexService } from './asterDexService';
import { apiCache } from './apiCache';
import { logger } from '@/lib/logger';

export interface OptimizedAccountData {
  accountValue: number;
  positions: any[];
  totalPnL: number;
  unrealizedPnL: number;
  marginBalance: number;
  lastUpdated: number;
  cacheHit: boolean;
}

export interface OptimizedPositionData {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  lastUpdated: number;
}

class OptimizedDataService {
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating: boolean = false;
  private lastUpdateTime: number = 0;
  
  // Rate limiting - OPTIMIZED for real-time trading
  private readonly MIN_UPDATE_INTERVAL = 500; // 500ms minimum between updates (2 req/sec max)
  private readonly CACHE_TTL = 1000; // 1 second cache TTL for real-time data (enterprise-grade)
  
  /**
   * Get all account data in a single optimized call
   */
  async getAllAccountData(): Promise<OptimizedAccountData> {
    const cacheKey = 'optimized:account:all';
    
    // Check cache first
    const cached = apiCache.get<OptimizedAccountData>(cacheKey);
    if (cached && (Date.now() - cached.lastUpdated) < this.CACHE_TTL) {
      logger.debug('📊 Using cached account data', { 
        context: 'OptimizedData',
        data: { age: Date.now() - cached.lastUpdated }
      });
      return { ...cached, cacheHit: true };
    }
    
    // Rate limiting check
    const now = Date.now();
    if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL) {
      logger.debug('⏱️ Rate limiting active, using cached data', { 
        context: 'OptimizedData',
        data: { timeSinceLastUpdate: now - this.lastUpdateTime }
      });
      return cached || this.getDefaultAccountData();
    }
    
    // Prevent concurrent updates
    if (this.isUpdating) {
      logger.debug('🔄 Update in progress, using cached data', { 
        context: 'OptimizedData',
        data: { isUpdating: this.isUpdating }
      });
      return cached || this.getDefaultAccountData();
    }
    
    this.isUpdating = true;
    this.lastUpdateTime = now;
    
    try {
      // Fetch all data in parallel for maximum speed
      const [accountValue, positions] = await Promise.allSettled([
        this.getAccountValueFast(),
        this.getPositionsFast()
      ]);
      
      const data: OptimizedAccountData = {
        accountValue: accountValue.status === 'fulfilled' ? accountValue.value : 0,
        positions: positions.status === 'fulfilled' ? positions.value : [],
        totalPnL: 0,
        unrealizedPnL: 0,
        marginBalance: 0,
        lastUpdated: now,
        cacheHit: false
      };
      
      // Log the raw data for debugging
      logger.debug('Raw optimized data', {
        context: 'OptimizedData',
        data: {
          accountValue: data.accountValue,
          positionsCount: data.positions.length,
          positions: data.positions.map(p => ({ symbol: p.symbol, positionAmt: p.positionAmt, unRealizedProfit: p.unRealizedProfit }))
        }
      });
      
      // Calculate P&L from positions and format them for the dashboard
      if (data.positions.length > 0) {
        // Use the correct field names from Aster DEX service (already formatted)
        data.unrealizedPnL = data.positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
        data.totalPnL = data.unrealizedPnL;
        
        // OPTIMIZED: Fetch prices ONCE for all positions (was N requests, now 1 request)
        const priceData = await this.getCurrentPrices();
        
        // Format positions for dashboard compatibility with real-time prices
        data.positions = data.positions.map((pos: any) => {
          // pos is already formatted by asterDexService.getPositions()
          const symbol = pos.symbol;
          const side = pos.side;
          const size = pos.size;
          const entryPrice = pos.entryPrice;
          const pnl = pos.unrealizedPnl;
          const leverage = pos.leverage;
          
          // Get real-time price from pre-fetched data (no HTTP request per position)
          const priceKey = symbol.replace('/USDT', 'USDT');
          const currentPrice = priceData[priceKey] || entryPrice;
          
          // Calculate P&L percentage using real-time price
          const marginUsed = size * entryPrice / leverage;
          const pnlPercent = marginUsed !== 0 ? (pnl / marginUsed) * 100 : 0;
          
          return {
            id: symbol,
            symbol: symbol,
            side: side,
            size: isNaN(size) ? 0 : size,
            entryPrice: isNaN(entryPrice) ? 0 : entryPrice,
            currentPrice: isNaN(currentPrice) ? 0 : currentPrice,
            pnl: isNaN(pnl) ? 0 : pnl,
            pnlPercent: isNaN(pnlPercent) ? 0 : pnlPercent,
            leverage: isNaN(leverage) ? 1 : leverage,
            model: 'Multi-Agent AI',
          };
        });
      }
      
      // Cache the result
      apiCache.set(cacheKey, data, this.CACHE_TTL);
      
      logger.info('📊 Optimized account data fetched', {
        context: 'OptimizedData',
        data: {
          accountValue: data.accountValue,
          positions: data.positions.length,
          unrealizedPnL: data.unrealizedPnL
        }
      });
      
      return data;
      
    } catch (error) {
      logger.error('Failed to fetch optimized account data', error, { context: 'OptimizedData' });
      return cached || this.getDefaultAccountData();
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Fast account value fetch with fallback
   * OPTIMIZED: Use asterDexService directly instead of HTTP call (faster, uses 30-key system)
   */
  private async getAccountValueFast(): Promise<number> {
    try {
      // CRITICAL OPTIMIZATION: Use asterDexService.getBalance() directly
      // This uses the 30-key system, caching, and deduplication - much faster than HTTP
      return await asterDexService.getBalance();
    } catch (error) {
      logger.error('Failed to get account value from service', error, { context: 'OptimizedData' });
      return 100; // Default fallback
    }
  }
  
  /**
   * Fast positions fetch with fallback
   * OPTIMIZED: Use asterDexService directly instead of HTTP call (faster, uses 30-key system)
   */
  private async getPositionsFast(): Promise<any[]> {
    try {
      // CRITICAL OPTIMIZATION: Use asterDexService.getPositions() directly
      // This uses the 30-key system, caching (20s), and deduplication - much faster than HTTP
      const positions = await asterDexService.getPositions();
      
      // Transform to format expected by this service (if needed)
      const formatted = positions.map(pos => ({
        symbol: pos.symbol, // Already in BTC/USDT format
        positionAmt: pos.side === 'LONG' ? pos.size.toString() : `-${pos.size.toString()}`,
        entryPrice: pos.entryPrice.toString(),
        leverage: pos.leverage.toString(),
        unRealizedProfit: pos.unrealizedPnl.toString()
      }));
      
      logger.debug('Positions from optimized service', { 
        context: 'OptimizedData', 
        data: { count: positions.length, positions: positions.map((p: any) => ({ symbol: p.symbol, side: p.side, pnl: p.unrealizedPnl })) }
      });
      
      return formatted;
    } catch (error) {
      logger.error('Failed to get positions from service', error, { context: 'OptimizedData' });
      return [];
    }
  }
  
  /**
   * Get optimized position data with current prices
   */
  async getOptimizedPositions(): Promise<OptimizedPositionData[]> {
    const cacheKey = 'optimized:positions:detailed';
    
    // Check cache
    const cached = apiCache.get<OptimizedPositionData[]>(cacheKey);
    if (cached && (Date.now() - cached[0]?.lastUpdated || 0) < this.CACHE_TTL) {
      return cached;
    }
    
    try {
      const [positions, prices] = await Promise.allSettled([
        this.getPositionsFast(),
        this.getCurrentPrices()
      ]);
      
      const positionsData = positions.status === 'fulfilled' ? positions.value : [];
      const priceData = prices.status === 'fulfilled' ? prices.value : {};
      
      const optimizedPositions: OptimizedPositionData[] = positionsData.map(pos => {
        const currentPrice = priceData[pos.symbol] || pos.entryPrice;
        const pnl = (currentPrice - pos.entryPrice) * pos.size * (pos.side === 'LONG' ? 1 : -1);
        const pnlPercent = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0;
        
        return {
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entryPrice: pos.entryPrice,
          currentPrice,
          pnl,
          pnlPercent,
          leverage: pos.leverage || 1,
          lastUpdated: Date.now()
        };
      });
      
      // Cache the result
      apiCache.set(cacheKey, optimizedPositions, this.CACHE_TTL);
      
      return optimizedPositions;
      
    } catch (error) {
      logger.error('Failed to fetch optimized positions', error, { context: 'OptimizedData' });
      return cached || [];
    }
  }
  
  /**
   * Get current prices for all symbols
   */
  private async getCurrentPrices(): Promise<Record<string, number>> {
    try {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/prices`);
      if (response.ok) {
        const data = await response.json();
        return data.prices || {};
      }
    } catch (error) {
      logger.debug('Failed to fetch current prices', { context: 'OptimizedData' });
    }
    return {};
  }
  
  /**
   * Start automatic updates
   */
  startAutoUpdates(intervalMs: number = 3000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(async () => {
      try {
        await this.getAllAccountData();
      } catch (error) {
        logger.error('Auto-update failed', error, { context: 'OptimizedData' });
      }
    }, intervalMs);
    
    logger.info('🔄 Started optimized auto-updates', { 
      context: 'OptimizedData',
      data: { interval: intervalMs }
    });
  }
  
  /**
   * Stop automatic updates
   */
  stopAutoUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  /**
   * Force refresh all data
   */
  async forceRefresh(): Promise<OptimizedAccountData> {
    // Clear cache
    apiCache.invalidatePattern('optimized:');
    this.lastUpdateTime = 0;
    
    return await this.getAllAccountData();
  }
  
  /**
   * Get default account data when API fails
   */
  private getDefaultAccountData(): OptimizedAccountData {
    return {
      accountValue: 0,
      positions: [],
      totalPnL: 0,
      unrealizedPnL: 0,
      marginBalance: 0,
      lastUpdated: Date.now(),
      cacheHit: false
    };
  }
}

export const optimizedDataService = new OptimizedDataService();
