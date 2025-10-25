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
  private readonly MIN_UPDATE_INTERVAL = 1000; // 1 second minimum between updates
  private readonly CACHE_TTL = 2000; // 2 seconds cache TTL for real-time data
  
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
        
        // Format positions for dashboard compatibility with real-time prices
        data.positions = await Promise.all(data.positions.map(async (pos: any) => {
          // pos is already formatted by asterDexService.getPositions()
          const symbol = pos.symbol;
          const side = pos.side;
          const size = pos.size;
          const entryPrice = pos.entryPrice;
          const pnl = pos.unrealizedPnl;
          const leverage = pos.leverage;
          
          // Get real-time price for accurate P&L calculation
          let currentPrice = entryPrice; // Default to entry price
          try {
            // Try to get current price from prices API
            const baseUrl = process.env.VERCEL_URL 
              ? `https://${process.env.VERCEL_URL}` 
              : 'http://localhost:3000';
            const priceResponse = await fetch(`${baseUrl}/api/prices`);
            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              const priceKey = symbol.replace('/USDT', 'USDT');
              if (priceData[priceKey]) {
                currentPrice = parseFloat(priceData[priceKey].price || currentPrice);
              }
            }
          } catch (error) {
            // Fallback to entry price if price fetch fails
            currentPrice = entryPrice;
          }
          
          // Calculate P&L percentage using real-time price
          const marginUsed = size * entryPrice / leverage;
          const pnlPercent = marginUsed !== 0 ? (pnl / marginUsed) * 100 : 0;
          
          return {
            id: symbol,
            symbol: symbol,
            side: side,
            size: size,
            entryPrice: entryPrice,
            currentPrice: currentPrice,
            pnl: pnl,
            pnlPercent: pnlPercent,
            leverage: leverage,
            model: 'DeepSeek R1',
          };
        }));
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
   */
  private async getAccountValueFast(): Promise<number> {
    try {
      // Use direct API call to get the correct account value
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/aster/account`);
      if (response.ok) {
        const data = await response.json();
        // Use the pre-calculated balance field from the API (this is the correct ~$59.87 value)
        const balance = parseFloat(data.balance || 0);
        
        logger.debug('Account value from API', { 
          context: 'OptimizedData', 
          data: { 
            balance: balance,
            accountEquity: data.accountEquity,
            totalMarginBalance: data.totalMarginBalance,
            totalWalletBalance: data.totalWalletBalance,
            totalUnrealizedProfit: data.totalUnrealizedProfit
          }
        });
        return balance;
      }
    } catch (error) {
      logger.error('Failed to get account value from API', error, { context: 'OptimizedData' });
    }
    
    // Fallback to service
    try {
      return await asterDexService.getBalance();
    } catch (error) {
      logger.error('Failed to get account value from service', error, { context: 'OptimizedData' });
      return 100; // Default fallback
    }
  }
  
  /**
   * Fast positions fetch with fallback
   */
  private async getPositionsFast(): Promise<any[]> {
    try {
      // Use direct API call to get positions data
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/aster/positions`);
      if (response.ok) {
        const data = await response.json();
        // Transform Aster API response to our format (same as asterDexService.getPositions())
        const positions = data.map((pos: any) => ({
          symbol: pos.symbol.replace('USDT', '/USDT'),
          side: parseFloat(pos.positionAmt) > 0 ? 'LONG' as const : 'SHORT' as const,
          size: Math.abs(parseFloat(pos.positionAmt)),
          entryPrice: parseFloat(pos.entryPrice),
          leverage: parseInt(pos.leverage),
          unrealizedPnl: parseFloat(pos.unRealizedProfit),
        }));
        
        logger.debug('Positions from API', { 
          context: 'OptimizedData', 
          data: { count: positions.length, positions: positions.map((p: any) => ({ symbol: p.symbol, side: p.side, pnl: p.unrealizedPnl })) }
        });
        return positions;
      }
    } catch (error) {
      logger.error('Failed to get positions from API', error, { context: 'OptimizedData' });
    }
    
    // Fallback to service
    try {
      return await asterDexService.getPositions();
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
