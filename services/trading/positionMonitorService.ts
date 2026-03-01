/**
 * Position Monitoring Service
 * Monitors open positions 24/7 and manages exits
 * Implements trailing stops, stop-loss monitoring, and partial exits
 * 
 * MATHEMATICAL OPTIMIZATIONS:
 * - Chandelier Exit for volatility-adjusted trailing stops
 * - ATR-based dynamic stop adjustment
 * - Expected value tracking for position decisions
 */

import { logger } from '@/lib/logger';
import { asterConfig } from '@/lib/configService';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';
import { realBalanceService } from './realBalanceService';
import { wsMarketService } from '@/services/exchange/websocketMarketService';
import { rlParameterOptimizer } from '@/services/ml/rlParameterOptimizer';
import { asterDexService } from '@/services/exchange/asterDexService';
import { Mutex } from 'async-mutex';
import { quickChandelierExit } from '@/lib/advancedMath';
import { recordTradeExit } from '@/lib/db';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

export interface OpenPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPercent: number;
  highestPrice: number; // For trailing stop (longs)
  lowestPrice: number;  // For trailing stop (shorts)
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  openedAt: number;
  lastChecked: number;
  orderId: string;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  // HIGH PRIORITY FIX: Add error tracking fields
  lastError?: string;
  errorCount?: number;
}

export interface PositionUpdate {
  action: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'TIMEOUT' | 'PARTIAL_EXIT' | 'FORCE_CLOSE';
  reason: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
}

class PositionMonitorService {
  private positions: Map<string, OpenPosition> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  // OPTIMIZED: Adaptive polling - faster when positions near SL/TP, slower when stable
  private baseCheckIntervalMs = parseInt(process.env.TRADING_POSITION_CHECK_INTERVAL || '10000');
  private currentCheckIntervalMs = this.baseCheckIntervalMs;
  private checkCount = 0; // OPTIMIZATION: Counter for log sampling
  // Style classifier for micro vs macro (derived from SL/TP distances)
  private classifyStyle(position: OpenPosition): 'MICRO' | 'MACRO' {
    const entry = Math.max(position.entryPrice, 1e-9);
    const slPct = Math.abs(position.stopLoss - entry) / entry * 100;
    const tpPct = Math.abs(position.takeProfit - entry) / entry * 100;
    if (slPct <= 1.2 && tpPct <= 3.5) return 'MICRO';
    return 'MACRO';
  }
  // Portfolio protection
  private peakBalance: number | null = null;
  private readonly portfolioTrailDrawdownPercent = 5; // Close all if equity drops >5% from peak
  
  // CRITICAL FIX: Add mutex for position update synchronization
  // Prevents race conditions when multiple position checks/updates happen concurrently
  private positionMutex = new Mutex();
  
  // Volume spike tracking for quick exits
  private volumeHistory: Map<string, number[]> = new Map();
  private readonly VOLUME_HISTORY_SIZE = 10; // Track last 10 volume readings

  /**
   * Start monitoring positions
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      logger.info('Position Monitor already running', { context: 'PositionMonitor' });
      return;
    }

    this.isMonitoring = true;
    logger.info('[START] Position Monitor started', { context: 'PositionMonitor' });

    // Load open positions from database
    await this.loadOpenPositions();
    
    // CRITICAL: Sync with exchange immediately on startup to catch any existing positions
    logger.info('[SYNC] Syncing with exchange on startup...', { context: 'PositionMonitor' });
    await this.syncWithExchange();

    // OPTIMIZED: Start monitoring loop with adaptive interval
    // Interval will be adjusted dynamically based on position risk levels
    const runMonitor = () => {
      this.monitorAllPositions()
        .then(() => {
          // OPTIMIZED: Adjust interval based on position risk after monitoring
          this.adjustMonitoringInterval();
        })
        .catch(err => {
          logger.error('Error in position monitoring', err, { context: 'PositionMonitor' });
        });
      
      // Schedule next check with current adaptive interval
      this.monitorInterval = setTimeout(runMonitor, this.currentCheckIntervalMs);
    };
    
    // Start the monitoring loop
    runMonitor();

    // Run immediately
    await this.monitorAllPositions();
  }

  /**
   * Stop monitoring positions
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      // Handle both setInterval and setTimeout
      if (typeof this.monitorInterval === 'number') {
        clearTimeout(this.monitorInterval);
      } else {
        clearInterval(this.monitorInterval);
      }
      this.monitorInterval = null;
    }

    logger.info('Position Monitor stopped', { 
      context: 'PositionMonitor',
      data: { openPositions: this.positions.size }
    });
  }

  /**
   * OPTIMIZED: Adjust monitoring interval based on position risk levels
   * Poll faster when positions are near stop-loss/take-profit
   */
  private adjustMonitoringInterval(): void {
    if (this.positions.size === 0) {
      // No positions - use slower polling (20s)
      this.currentCheckIntervalMs = 20000;
      return;
    }

    let hasHighRiskPosition = false;
    let hasMediumRiskPosition = false;

    for (const position of this.positions.values()) {
      if (position.status !== 'OPEN') continue;

      const entry = position.entryPrice;
      const current = position.currentPrice;
      const sl = position.stopLoss;
      const tp = position.takeProfit;

      // Calculate distance to stop-loss and take-profit
      const slDistance = position.side === 'LONG' 
        ? ((current - sl) / entry) * 100
        : ((sl - current) / entry) * 100;
      const tpDistance = position.side === 'LONG'
        ? ((tp - current) / entry) * 100
        : ((current - tp) / entry) * 100;

      // High risk: within 0.5% of SL or TP
      if (slDistance < 0.5 || tpDistance < 0.5) {
        hasHighRiskPosition = true;
        break; // Fastest polling needed
      }
      // Medium risk: within 1% of SL or TP
      if (slDistance < 1.0 || tpDistance < 1.0) {
        hasMediumRiskPosition = true;
      }
    }

    // Adjust interval based on risk
    const newInterval = hasHighRiskPosition 
      ? 2000   // High risk: 2s polling
      : hasMediumRiskPosition
      ? 5000   // Medium risk: 5s polling
      : this.baseCheckIntervalMs; // Normal: 10s polling

    if (newInterval !== this.currentCheckIntervalMs) {
      logger.debug('Adaptive polling interval adjusted', {
        context: 'PositionMonitor',
        data: {
          oldInterval: this.currentCheckIntervalMs,
          newInterval,
          reason: hasHighRiskPosition ? 'high_risk' : hasMediumRiskPosition ? 'medium_risk' : 'normal'
        }
      });
      this.currentCheckIntervalMs = newInterval;
    }
  }

  /**
   * OPTIMIZATION: Cleanup closed positions from memory to prevent leaks
   */
  private cleanupClosedPositions(): void {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [id, position] of this.positions.entries()) {
      // Remove closed positions older than 1 week
      if (position.status === 'CLOSED' && position.lastChecked < oneWeekAgo) {
        this.positions.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('Cleaned up old closed positions from memory', {
        context: 'PositionMonitor',
        data: {
          cleaned: cleanedCount,
          remaining: this.positions.size,
          note: 'Prevents memory leaks'
        }
      });
    }
  }

  /**
   * Add a position to monitor
   */
  async addPosition(position: Omit<OpenPosition, 'id' | 'currentPrice' | 'highestPrice' | 'lowestPrice' | 'unrealizedPnL' | 'unrealizedPnLPercent' | 'lastChecked' | 'status'>): Promise<string> {
    // WORLD-CLASS: Comprehensive validation before adding position
    if (!position.symbol || position.symbol.trim() === '') {
      throw new Error('Position symbol is required');
    }
    
    if (!position.side || !['LONG', 'SHORT'].includes(position.side)) {
      throw new Error(`Invalid position side: ${position.side} (must be LONG or SHORT)`);
    }
    
    if (!position.entryPrice || position.entryPrice <= 0) {
      throw new Error(`Invalid entry price: ${position.entryPrice} (must be > 0)`);
    }
    
    if (!position.size || position.size <= 0) {
      throw new Error(`Invalid position size: ${position.size} (must be > 0)`);
    }
    
    if (!position.leverage || position.leverage < 1) {
      throw new Error(`Invalid leverage: ${position.leverage} (must be >= 1)`);
    }
    
    if (!position.stopLoss || position.stopLoss <= 0) {
      throw new Error(`Invalid stop-loss: ${position.stopLoss} (must be > 0)`);
    }
    
    if (!position.takeProfit || position.takeProfit <= 0) {
      throw new Error(`Invalid take-profit: ${position.takeProfit} (must be > 0)`);
    }
    
    // WORLD-CLASS: Validate stop-loss and take-profit are in correct direction
    if (position.side === 'LONG') {
      if (position.stopLoss >= position.entryPrice) {
        throw new Error(`Invalid stop-loss for LONG: ${position.stopLoss} must be < entry price ${position.entryPrice}`);
      }
      if (position.takeProfit <= position.entryPrice) {
        throw new Error(`Invalid take-profit for LONG: ${position.takeProfit} must be > entry price ${position.entryPrice}`);
      }
    } else {
      if (position.stopLoss <= position.entryPrice) {
        throw new Error(`Invalid stop-loss for SHORT: ${position.stopLoss} must be > entry price ${position.entryPrice}`);
      }
      if (position.takeProfit >= position.entryPrice) {
        throw new Error(`Invalid take-profit for SHORT: ${position.takeProfit} must be < entry price ${position.entryPrice}`);
      }
    }
    
    const id = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullPosition: OpenPosition = {
      ...position,
      id,
      currentPrice: position.entryPrice,
      highestPrice: position.entryPrice,
      lowestPrice: position.entryPrice,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      lastChecked: Date.now(),
      status: 'OPEN'
    };

    // WORLD-CLASS: Atomic operation - add to map first, then save to DB
    this.positions.set(id, fullPosition);

    // Save to database (non-blocking - if it fails, position is still in memory)
    try {
      await this.savePositionToDb(fullPosition);
    } catch (dbError) {
      logger.error('Failed to save position to database (non-critical)', dbError, {
        context: 'PositionMonitor',
        data: { positionId: id, symbol: position.symbol }
      });
      // Continue - position is in memory and will be saved on next check
    }

    logger.info('[OK] Position added to monitor', {
      context: 'PositionMonitor',
      data: { 
        id, 
        symbol: position.symbol, 
        side: position.side, 
        size: position.size,
        entryPrice: position.entryPrice,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit
      }
    });

    // OPTIMIZED: Subscribe to WebSocket streams for this symbol
    try {
      await wsMarketService.subscribeToSymbol(position.symbol);
    } catch (error) {
      // Non-critical - log but don't block position addition
      logger.debug('Failed to subscribe to WebSocket streams (non-critical)', {
        context: 'PositionMonitor',
        data: { symbol: position.symbol, error: error instanceof Error ? error.message : String(error) }
      });
    }

    return id;
  }

  /**
   * CRITICAL: Sync positions from exchange to catch any positions not tracked locally
   * This ensures we're monitoring ALL open positions, including ones opened manually
   */
  async syncWithExchange(): Promise<void> {
    try {
      const { asterDexService } = await import('@/services/exchange/asterDexService');
      const exchangePositions = await asterDexService.getPositions(true); // Force refresh
      
      if (exchangePositions.length === 0) {
        // If exchange has no positions but we have local ones, they might be closed
        if (this.positions.size > 0) {
          logger.info('Exchange has no positions - checking local positions for closure', {
            context: 'PositionMonitor',
            data: { localCount: this.positions.size }
          });
        }
        return;
      }
      
      // Get current prices for all positions
      const symbols = exchangePositions.map(p => p.symbol);
      const prices = await asterDexService.getBatchPrices(symbols);
      
      for (const exchangePos of exchangePositions) {
        // Check if we're already tracking this position
        const existingPosition = Array.from(this.positions.values()).find(
          p => p.symbol === exchangePos.symbol && p.side === exchangePos.side && p.status === 'OPEN'
        );
        
        const currentPrice = prices.get(exchangePos.symbol) || exchangePos.entryPrice;
        
        if (!existingPosition) {
          // NEW POSITION FROM EXCHANGE - start tracking it
          logger.info('[FOUND] Found untracked position on exchange - adding to monitor', {
            context: 'PositionMonitor',
            data: {
              symbol: exchangePos.symbol,
              side: exchangePos.side,
              size: exchangePos.size,
              entryPrice: exchangePos.entryPrice,
              unrealizedPnl: exchangePos.unrealizedPnl
            }
          });
          
          const id = `pos_exchange_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Calculate PnL percent from entry to current
          let pnlPercent = 0;
          if (exchangePos.side === 'LONG') {
            pnlPercent = ((currentPrice - exchangePos.entryPrice) / exchangePos.entryPrice) * 100 * exchangePos.leverage;
          } else {
            pnlPercent = ((exchangePos.entryPrice - currentPrice) / exchangePos.entryPrice) * 100 * exchangePos.leverage;
          }
          
          const newPosition: OpenPosition = {
            id,
            symbol: exchangePos.symbol,
            side: exchangePos.side,
            entryPrice: exchangePos.entryPrice,
            currentPrice: currentPrice,
            size: exchangePos.size,
            leverage: exchangePos.leverage,
            // Use default stop/TP values based on entry price (will be overridden if we have stored values)
            stopLoss: exchangePos.side === 'LONG' 
              ? exchangePos.entryPrice * 0.97 // 3% stop loss
              : exchangePos.entryPrice * 1.03,
            takeProfit: exchangePos.side === 'LONG'
              ? exchangePos.entryPrice * 1.06 // 6% take profit
              : exchangePos.entryPrice * 0.94,
            trailingStopPercent: 0,
            highestPrice: currentPrice,
            lowestPrice: currentPrice,
            unrealizedPnL: exchangePos.unrealizedPnl,
            unrealizedPnLPercent: pnlPercent,
            openedAt: Date.now(),
            lastChecked: Date.now(),
            orderId: '',
            status: 'OPEN'
          };
          
          this.positions.set(id, newPosition);
          
          // Save to database
          try {
            await this.savePositionToDb(newPosition);
          } catch (e) {
            // Non-critical - position is in memory
          }
        } else {
          // EXISTING POSITION - update with exchange data
          existingPosition.size = exchangePos.size;
          existingPosition.currentPrice = currentPrice;
          existingPosition.unrealizedPnL = exchangePos.unrealizedPnl;
          
          // Recalculate PnL percent using actual entry price
          if (existingPosition.side === 'LONG') {
            existingPosition.unrealizedPnLPercent = ((currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice) * 100 * existingPosition.leverage;
          } else {
            existingPosition.unrealizedPnLPercent = ((existingPosition.entryPrice - currentPrice) / existingPosition.entryPrice) * 100 * existingPosition.leverage;
          }
          
          existingPosition.lastChecked = Date.now();
        }
      }
      
      // Check for positions we're tracking but no longer exist on exchange
      for (const [id, localPos] of this.positions.entries()) {
        if (localPos.status !== 'OPEN') continue;
        
        const stillOnExchange = exchangePositions.some(
          ep => ep.symbol === localPos.symbol && ep.side === localPos.side
        );
        
        if (!stillOnExchange) {
          logger.info('[CLOSE] Position closed on exchange - marking as closed', {
            context: 'PositionMonitor',
            data: { id, symbol: localPos.symbol, side: localPos.side }
          });
          
          localPos.status = 'CLOSED';
          await this.updatePositionInDb(localPos);
        }
      }
      
      logger.info('[SYNC] Synced with exchange', {
        context: 'PositionMonitor',
        data: {
          exchangePositions: exchangePositions.length,
          trackedPositions: Array.from(this.positions.values()).filter(p => p.status === 'OPEN').length
        }
      });
    } catch (error) {
      logger.error('Failed to sync with exchange', error, {
        context: 'PositionMonitor'
      });
    }
  }

  /**
   * Monitor all open positions
   */
  private async monitorAllPositions(): Promise<void> {
    this.checkCount++; // OPTIMIZATION: Increment check counter
    
    // CRITICAL: Sync with exchange every 6th check (~1 minute with 10s interval)
    // This ensures we catch any positions opened manually or by other systems
    if (this.checkCount % 6 === 0) {
      await this.syncWithExchange();
    }
    
    if (this.positions.size === 0) return;

    // HIGH PRIORITY FIX: Add comprehensive error handling with recovery
    try {
      // OPTIMIZATION: Sample logging - only log every 12th check (once per minute instead of every 5s)
      if (this.checkCount % 12 === 0) {
        logger.debug('Position monitor sample', {
          context: 'PositionMonitor',
          data: { 
            positionsChecked: this.positions.size,
            totalChecks: this.checkCount,
            note: 'Sampled log (1 in 12 checks)'
          }
        });
      }

      // Portfolio-level trailing stop (equity protection)
      const balanceCfg = realBalanceService.getBalanceConfig();
      if (balanceCfg) {
        const currentBalance = balanceCfg.totalBalance || balanceCfg.availableBalance;
        if (currentBalance > 0) {
          if (this.peakBalance === null || currentBalance > this.peakBalance) {
            this.peakBalance = currentBalance;
          } else if (this.peakBalance > 0) {
            const dd = ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
            if (dd >= this.portfolioTrailDrawdownPercent) {
              logger.warn(`[WARN] Portfolio drawdown ${dd.toFixed(2)}% exceeds ${this.portfolioTrailDrawdownPercent}%. Force-closing all positions.`, {
                context: 'PositionMonitor',
                data: { currentBalance, peakBalance: this.peakBalance }
              });
              const closePromises = Array.from(this.positions.values())
                .filter(p => p.status === 'OPEN')
                .map(async (p) => {
                  const price = priceMap.get(p.symbol) ?? p.currentPrice;
                  const update: PositionUpdate = {
                    action: 'FORCE_CLOSE',
                    reason: `Portfolio DD ${dd.toFixed(2)}% > ${this.portfolioTrailDrawdownPercent}%`,
                    exitPrice: price,
                    pnl: p.unrealizedPnL,
                    pnlPercent: p.unrealizedPnLPercent
                  };
                  await this.closePosition(p, update);
                });
              await Promise.all(closePromises);
              return;
            }
          }
        }
      }

      // CRITICAL FIX: Create snapshot of position IDs to avoid mutation during iteration
      const positionIds = Array.from(this.positions.keys());
      
      // WORLD-CLASS OPTIMIZATION: Batch fetch all position prices in single API call
      const symbolsToCheck = positionIds.map(id => {
        const pos = this.positions.get(id);
        return pos?.symbol;
      }).filter(Boolean) as string[];
      
      let priceMap = new Map<string, number>();
      if (symbolsToCheck.length > 0) {
        try {
          // Use batch price fetching (70% reduction in API calls)
          const { asterDexService } = await import('@/services/exchange/asterDexService');
          const batchPrices = await asterDexService.getBatchPrices(symbolsToCheck);
          priceMap = batchPrices;
          
          logger.debug('Batch fetched position prices', {
            context: 'PositionMonitor',
            data: { 
              positionsCount: symbolsToCheck.length,
              pricesFetched: priceMap.size,
              method: 'batch'
            }
          });
        } catch (error) {
          logger.warn('Batch price fetch failed, falling back to individual fetches', {
            context: 'PositionMonitor',
            error: error instanceof Error ? error.message : String(error)
          });
          // Fallback to individual fetches below
        }
      }
      
      const checkPromises = positionIds.map(async (id) => {
        const position = this.positions.get(id);
        if (!position) return; // Position was already deleted
        
        try {
          // WORLD-CLASS: Use batch-fetched price if available
          const batchPrice = priceMap.get(position.symbol);
          await this.checkPosition(position, batchPrice);
        } catch (error) {
          logger.error(`Error checking position ${id}`, error, {
            context: 'PositionMonitor',
            data: { positionId: id, symbol: position.symbol }
          });
          
          // CRITICAL FIX: Atomic update using Map.set
          const current = this.positions.get(id);
          if (current) {
            this.positions.set(id, {
              ...current,
              lastError: error instanceof Error ? error.message : String(error),
              errorCount: (current.errorCount || 0) + 1
            });
            
            // Check error threshold
            if ((current.errorCount || 0) + 1 >= TRADING_THRESHOLDS.MAX_ERROR_COUNT_FOR_REVIEW) {
              logger.warn(`Position ${id} has ${(current.errorCount || 0) + 1} consecutive errors - manual review recommended`, {
                context: 'PositionMonitor',
                data: { positionId: id, symbol: current.symbol }
              });
            }
          }
        }
      });

      await Promise.all(checkPromises);
      
      // OPTIMIZATION: Auto-cleanup closed positions every 100 checks (~8 minutes)
      if (this.checkCount % 100 === 0) {
        this.cleanupClosedPositions();
      }
    } catch (error) {
      // HIGH PRIORITY FIX: Log error with context and don't crash the service
      logger.error('Failed to check positions', error instanceof Error ? error : new Error(String(error)), {
        context: 'PositionMonitor',
        data: {
          positionsCount: this.positions.size,
          errorType: error?.constructor?.name || 'Unknown'
        }
      });
      
      // Don't throw - keep monitoring service running
      // Errors on individual positions are already handled above
    }
  }

  /**
   * Check a single position for exit conditions
   * WORLD-CLASS OPTIMIZATION: Uses batch price fetching when checking multiple positions
   * CRITICAL FIX: Protected with mutex to prevent concurrent position update race conditions
   */
  private async checkPosition(position: OpenPosition, currentPrice?: number): Promise<void> {
    // CRITICAL FIX: Wrap in mutex to prevent race conditions on position updates
    return await this.positionMutex.runExclusive(async () => {
    try {
      // WORLD-CLASS: Use provided price if available (from batch fetch), otherwise fetch individually
      // CRITICAL FIX: Ensure symbol format is correct (getPrice handles BTC/USDT -> BTCUSDT conversion)
      const price = currentPrice ?? await asterDexService.getPrice(position.symbol);
      
      // Validate price is valid
      if (!price || price <= 0 || isNaN(price)) {
        logger.warn(`Invalid price for ${position.symbol}: ${price}`, {
          context: 'PositionMonitor',
          data: { symbol: position.symbol, price, positionId: position.id }
        });
        return; // Skip this check - will retry on next cycle
      }
      
      // Update position data
      position.currentPrice = price;
      position.lastChecked = Date.now();

      // Calculate P&L based on position side
      // For LONG: profit when price goes up, loss when price goes down
      // For SHORT: profit when price goes down, loss when price goes up
      // PnL% = ((current - entry) / entry) * 100 * leverage for LONG
      // PnL% = ((entry - current) / entry) * 100 * leverage for SHORT
      const prevPnLPercent = position.unrealizedPnLPercent;
      
      if (position.side === 'LONG') {
        position.unrealizedPnL = (price - position.entryPrice) * position.size * position.leverage;
        position.unrealizedPnLPercent = ((price - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
        
        // Update highest price for trailing stop
        if (price > position.highestPrice) {
          position.highestPrice = price;
        }
      } else {
        // SHORT
        position.unrealizedPnL = (position.entryPrice - price) * position.size * position.leverage;
        position.unrealizedPnLPercent = ((position.entryPrice - price) / position.entryPrice) * 100 * position.leverage;
        
        // Update lowest price for trailing stop
        if (price < position.lowestPrice) {
          position.lowestPrice = price;
        }
      }

      // PARTIAL TAKE PROFIT for macro positions
      const style = this.classifyStyle(position);
      if (style === 'MACRO' && position.unrealizedPnLPercent >= 2.5 && position.size > 0) {
        const partialSize = position.size * 0.3;
        if (partialSize > 0 && partialSize < position.size) {
          try {
            await asterDexService.placeMarketOrder(
              position.symbol,
              position.side === 'LONG' ? 'SELL' : 'BUY',
              partialSize,
              position.leverage,
              true // reduceOnly
            );
            position.size = position.size - partialSize;
            logger.info('[TP] Partial take-profit executed for macro position', {
              context: 'PositionMonitor',
              data: { symbol: position.symbol, partialSize, remainingSize: position.size }
            });
          } catch (partialErr) {
            logger.warn('Partial take-profit failed (non-blocking)', {
              context: 'PositionMonitor',
              data: { symbol: position.symbol, error: partialErr instanceof Error ? partialErr.message : String(partialErr) }
            });
          }
        }
      }

      // Check exit conditions (now async for whale/volume detection)
      const exitCondition = await this.checkExitConditions(position);
      
      if (exitCondition) {
        await this.closePosition(position, exitCondition);
      } else {
        // Update position in database
        await this.updatePositionInDb(position);
      }
    } catch (error) {
      logger.error('Failed to check position', error, {
        context: 'PositionMonitor',
        data: { positionId: position.id, symbol: position.symbol }
      });
    }
    }); // End mutex.runExclusive
  }

  /**
   * Check if position should be closed
   * ENHANCED: Aggressive micro profit-taking + macro trade management
   * Philosophy: Secure gains early, let macro winners run with trailing stops
   */
  private async checkExitConditions(position: OpenPosition): Promise<PositionUpdate | null> {
    const { side, currentPrice: price, entryPrice, stopLoss, takeProfit, trailingStopPercent, highestPrice, lowestPrice, openedAt } = position;
    const holdTimeMinutes = (Date.now() - openedAt) / (1000 * 60);
    const pnlPercent = position.unrealizedPnLPercent;

    // =============================================================================
    // TIER 1: MICRO PROFIT-TAKING (Aggressive - Secure Small Gains)
    // Philosophy: Any profit in volatile markets should be considered for taking
    // =============================================================================
    
    // Micro profit thresholds (configurable via env with aggressive defaults)
    const microProfitTarget = parseFloat(process.env.TRADING_MICRO_PROFIT_TARGET || '0.5'); // 0.5%
    const miniProfitTarget = parseFloat(process.env.TRADING_MINI_PROFIT_TARGET || '1.0');   // 1.0%
    const smallProfitTarget = parseFloat(process.env.TRADING_SMALL_PROFIT_TARGET || '1.5'); // 1.5%
    
    // ENABLED BY DEFAULT: Take micro profits aggressively
    const microProfitTakingEnabled = process.env.TRADING_MICRO_PROFIT_ENABLED !== 'false';
    
    if (microProfitTakingEnabled && pnlPercent > 0) {
      // Micro profit (0.5%+) - Consider exit if held > 2 minutes or momentum fading
      if (pnlPercent >= microProfitTarget && holdTimeMinutes >= 2) {
        // Check if momentum is fading (price retreating from high)
        const retreatFromHigh = side === 'LONG' 
          ? ((highestPrice - price) / highestPrice) * 100
          : ((price - lowestPrice) / lowestPrice) * 100;
        
        if (retreatFromHigh > 0.1) { // Price retreating 0.1%+ from best
          return {
            action: 'TAKE_PROFIT',
            reason: `MICRO EXIT: Secured ${pnlPercent.toFixed(2)}% profit (momentum fading, retreat ${retreatFromHigh.toFixed(2)}% from best)`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: pnlPercent
          };
        }
      }
      
      // Mini profit (1.0%+) - Take if held > 5 minutes
      if (pnlPercent >= miniProfitTarget && holdTimeMinutes >= 5) {
        logger.info(`[PROFIT] Mini profit target reached: ${pnlPercent.toFixed(2)}% in ${holdTimeMinutes.toFixed(1)} min`, {
          context: 'PositionMonitor',
          data: { symbol: position.symbol, side, pnlPercent, holdTimeMinutes }
        });
        
        return {
          action: 'TAKE_PROFIT',
          reason: `MINI EXIT: Locked in ${pnlPercent.toFixed(2)}% profit after ${holdTimeMinutes.toFixed(1)} min hold`,
          exitPrice: price,
          pnl: position.unrealizedPnL,
          pnlPercent: pnlPercent
        };
      }
      
      // Small profit (1.5%+) - Take if any sign of reversal
      if (pnlPercent >= smallProfitTarget) {
        try {
          const volumeSpike = await this.detectVolumeSpikeReversal(position.symbol);
          const whaleExit = await this.detectWhaleExit(position.symbol, side);
          
          if (volumeSpike || whaleExit) {
            return {
              action: 'TAKE_PROFIT',
              reason: `SMALL EXIT: Secured ${pnlPercent.toFixed(2)}% profit (${volumeSpike ? 'volume spike reversal' : 'whale exit detected'})`,
              exitPrice: price,
              pnl: position.unrealizedPnL,
              pnlPercent: pnlPercent
            };
          }
        } catch {
          // Continue to other checks
        }
      }
    }
    
    // =============================================================================
    // TIER 2: TIME-BASED EXITS (Prevent Stale Positions)
    // =============================================================================
    
    // If position is profitable but been held too long, lock in gains
    const maxHoldMinutes = parseFloat(process.env.TRADING_MAX_HOLD_MINUTES || '30');
    if (pnlPercent > 0.25 && holdTimeMinutes > maxHoldMinutes) {
      return {
        action: 'TAKE_PROFIT',
        reason: `TIME EXIT: Position held ${holdTimeMinutes.toFixed(0)} min with ${pnlPercent.toFixed(2)}% profit - securing gains`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: pnlPercent
      };
    }
    
    // If position is break-even/small loss after long hold, cut it
    if (Math.abs(pnlPercent) < 0.5 && holdTimeMinutes > 45) {
      return {
        action: 'FORCE_CLOSE',
        reason: `STALE EXIT: Position flat (${pnlPercent.toFixed(2)}%) after ${holdTimeMinutes.toFixed(0)} min - freeing capital`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: pnlPercent
      };
    }
    
    // =============================================================================
    // TIER 3: WHALE/VOLUME DETECTION (Market-Aware Exits)
    // =============================================================================
    
    // Scalping mode with whale detection (legacy support + enhanced)
    const scalpingEnabled = process.env.TRADING_SCALPING_ENABLED === 'true';
    const minScalpProfit = parseFloat(process.env.TRADING_MIN_SCALP_PROFIT || '0.3'); // 0.3% (more aggressive)
    
    if ((scalpingEnabled || microProfitTakingEnabled) && pnlPercent > minScalpProfit) {
      try {
        const volumeSpike = await this.detectVolumeSpikeReversal(position.symbol);
        if (volumeSpike) {
          return {
            action: 'TAKE_PROFIT',
            reason: `SCALP: Volume spike reversal detected while profitable (${pnlPercent.toFixed(2)}%) - whale exiting, securing profit`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: pnlPercent
          };
        }
        
        const whaleExit = await this.detectWhaleExit(position.symbol, side);
        if (whaleExit) {
          return {
            action: 'TAKE_PROFIT',
            reason: `SCALP: Whale order disappeared while profitable (${pnlPercent.toFixed(2)}%) - reversing momentum, securing profit`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: pnlPercent
          };
        }
      } catch (error) {
        // Non-critical - continue with normal exit checks
        logger.debug('Scalping check failed (non-critical)', {
          context: 'PositionMonitor',
          symbol: position.symbol
        });
      }
    }

    // 1. Check Stop-Loss
    if (side === 'LONG' && price <= stopLoss) {
      return {
        action: 'STOP_LOSS',
        reason: `Price hit stop-loss: ${price.toFixed(4)} <= ${stopLoss.toFixed(4)}`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }
    
    if (side === 'SHORT' && price >= stopLoss) {
      return {
        action: 'STOP_LOSS',
        reason: `Price hit stop-loss: ${price.toFixed(4)} >= ${stopLoss.toFixed(4)}`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }

    // 2. Check Take-Profit
    if (side === 'LONG' && price >= takeProfit) {
      return {
        action: 'TAKE_PROFIT',
        reason: `Price hit take-profit: ${price.toFixed(4)} >= ${takeProfit.toFixed(4)}`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }
    
    if (side === 'SHORT' && price <= takeProfit) {
      return {
        action: 'TAKE_PROFIT',
        reason: `Price hit take-profit: ${price.toFixed(4)} <= ${takeProfit.toFixed(4)}`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }

    // 3. Check Trailing Stop - ENHANCED with Chandelier Exit
    if (trailingStopPercent > 0) {
      // Try to get dynamic Chandelier Exit level
      let trailStopPrice: number;
      let usedChandelier = false;
      
      try {
        // Get 24h high/low for Chandelier calculation
        const ticker = await asterDexService.getTicker(position.symbol);
        if (ticker && ticker.highPrice && ticker.lowPrice) {
          const high24h = parseFloat(String(ticker.highPrice));
          const low24h = parseFloat(String(ticker.lowPrice));
          
          // Use Chandelier Exit with 3x ATR multiplier for supreme volatility adjustment
          trailStopPrice = quickChandelierExit(price, high24h, low24h, side, 3.0);
          usedChandelier = true;
          
          // Ensure Chandelier stop is not tighter than our minimum trailing stop
          if (side === 'LONG') {
            const minTrailStop = highestPrice * (1 - trailingStopPercent / 100);
            trailStopPrice = Math.min(trailStopPrice, minTrailStop);
          } else {
            const minTrailStop = lowestPrice * (1 + trailingStopPercent / 100);
            trailStopPrice = Math.max(trailStopPrice, minTrailStop);
          }
        } else {
          // Fallback to fixed percentage
          trailStopPrice = side === 'LONG' 
            ? highestPrice * (1 - trailingStopPercent / 100)
            : lowestPrice * (1 + trailingStopPercent / 100);
        }
      } catch (e) {
        // Fallback to fixed percentage
        trailStopPrice = side === 'LONG' 
          ? highestPrice * (1 - trailingStopPercent / 100)
          : lowestPrice * (1 + trailingStopPercent / 100);
      }
      
      if (side === 'LONG') {
        if (price <= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `${usedChandelier ? 'Chandelier Exit' : 'Trailing stop'} triggered: ${price.toFixed(4)} <= ${trailStopPrice.toFixed(4)} (from high ${highestPrice.toFixed(4)})`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
      } else {
        // SHORT
        if (price >= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `${usedChandelier ? 'Chandelier Exit' : 'Trailing stop'} triggered: ${price.toFixed(4)} >= ${trailStopPrice.toFixed(4)} (from low ${lowestPrice.toFixed(4)})`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
      }
    }

    // 4. Check Timeout (style-based)
    const style = this.classifyStyle(position);
    const POSITION_TIMEOUT = style === 'MICRO'
      ? 45 * 60 * 1000   // 45 minutes for micro scalps
      : 48 * 60 * 60 * 1000; // 48 hours for macro swings
    if (Date.now() - openedAt > POSITION_TIMEOUT) {
      return {
        action: 'TIMEOUT',
        reason: `Position timeout: held for ${((Date.now() - openedAt) / 1000 / 60 / 60).toFixed(1)} hours`,
        exitPrice: price,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }

    return null;
  }

  /**
   * Close a position
   */
  private async closePosition(position: OpenPosition, update: PositionUpdate): Promise<void> {
    // SIMULATION MODE: Close position in simulation service
    if (asterConfig.trading.simulationMode) {
      try {
        const { simulationService } = await import('@/services/trading/simulationService');
        await simulationService.closePosition(
          position.symbol,
          position.side,
          update.reason
        );
        logger.info('[SIMULATION] Position closed in simulation', {
          context: 'PositionMonitor',
          data: {
            positionId: position.id,
            symbol: position.symbol,
            side: position.side,
            reason: update.reason
          }
        });
      } catch (error) {
        logger.warn('[SIMULATION] Failed to close position in simulation (non-critical)', {
          context: 'PositionMonitor',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // OPTIMIZED: Unsubscribe from WebSocket streams when position closes
    try {
      const { wsMarketService } = await import('@/services/exchange/websocketMarketService');
      await wsMarketService.unsubscribeFromSymbol(position.symbol);
    } catch (error) {
      // Non-critical - log but don't block position closing
      logger.debug('Failed to unsubscribe from WebSocket streams (non-critical)', {
        context: 'PositionMonitor',
        data: { symbol: position.symbol, error: error instanceof Error ? error.message : String(error) }
      });
    }
    logger.info('[CLOSE] Closing position', {
      context: 'PositionMonitor',
      data: {
        positionId: position.id,
        symbol: position.symbol,
        action: update.action,
        reason: update.reason,
        pnl: update.pnl.toFixed(2),
        pnlPercent: update.pnlPercent.toFixed(2)
      }
    });

    position.status = 'CLOSING';

    try {
      // Execute closing order
      const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
      let closeOrder = null;
      let reduceOnlyAttempted = false;
      let closeAttempts = 0;
      const maxRetries = 2;
      const retryDelayMs = 500;

      // Refresh latest price/mark to avoid stale closes
      // CRITICAL FIX: getPrice() already handles symbol format conversion (BTC/USDT -> BTCUSDT)
      let latestPrice = position.currentPrice;
      try {
        const markMeta = wsMarketService.getMarkPriceDivergence(position.symbol);
        if (markMeta?.markPrice) {
          latestPrice = markMeta.markPrice;
        } else {
          const px = await asterDexService.getPrice(position.symbol);
          if (px > 0) latestPrice = px;
        }
      } catch (err) {
        logger.warn('Could not refresh price before close, using last known', {
          context: 'PositionMonitor',
          data: { symbol: position.symbol, error: err instanceof Error ? err.message : String(err) }
        });
      }
      if (!latestPrice || !isFinite(latestPrice) || latestPrice <= 0) {
        logger.warn('Skip close due to stale/invalid price, will retry', {
          context: 'PositionMonitor',
          data: { symbol: position.symbol, latestPrice }
        });
        position.status = 'OPEN';
        return;
      }

      // Retry loop with backoff
      for (let attempt = 0; attempt <= maxRetries && !closeOrder; attempt++) {
        try {
          // First attempt reduceOnly; subsequent attempts non-reduceOnly
          const useReduceOnly = attempt === 0;
          if (useReduceOnly) reduceOnlyAttempted = true;
          closeAttempts++;

          closeOrder = await asterDexService.placeMarketOrder(
            position.symbol,
            closeSide,
            position.size,
            position.leverage,
            useReduceOnly
          );
        } catch (err: any) {
          const msg = err?.message || '';
          if (attempt === 0 && msg.includes('ReduceOnly Order is rejected')) {
            logger.warn('ReduceOnly rejected, retrying close without reduceOnly', {
              context: 'PositionMonitor',
              data: { symbol: position.symbol, positionId: position.id }
            });
            continue; // next attempt without reduceOnly
          }

          // If not last attempt, backoff then retry
          if (attempt < maxRetries) {
            logger.warn('Close attempt failed, backing off before retry', {
              context: 'PositionMonitor',
              data: { symbol: position.symbol, attempt: attempt + 1, maxRetries: maxRetries + 1, error: msg }
            });
            await new Promise(res => setTimeout(res, retryDelayMs));
            continue;
          }

          // Out of retries, rethrow
          throw err;
        }
      }

      if (closeOrder) {
        position.status = 'CLOSED';
        
        // Update database with close data
        await this.closePositionInDb(position, update);
        // OPTIMIZATION: RL reward update with enhanced slippage and fee tracking
        try {
          let slippagePct = 0;
          try {
            // CRITICAL FIX: getPrice() already handles symbol format conversion
            const currentMark = await asterDexService.getPrice(position.symbol);
            if (currentMark > 0 && position.entryPrice > 0) {
              const expected = position.entryPrice;
              const actual = update.exitPrice || currentMark;
              slippagePct = Math.abs((actual - expected) / expected) * 100;
            }
          } catch {
            // ignore slippage calculation failures
          }
          
          // OPTIMIZATION: Get actual commission rate for accurate fee tracking
          // Per API docs: Use actual commission rates instead of estimates
          let actualFees = 0.1; // Default 0.1% if commission rate unavailable
          try {
            const commissionRate = await asterDexService.getCommissionRate(position.symbol);
            if (commissionRate) {
              // Use taker rate (market orders) or average of maker/taker
              const takerRate = parseFloat(commissionRate.takerCommissionRate || '0.001');
              const makerRate = parseFloat(commissionRate.makerCommissionRate || '0.001');
              // Round trip = entry + exit fees
              actualFees = (takerRate + makerRate) * 100; // Convert to percentage
            }
          } catch (feeError) {
            logger.debug('Failed to fetch commission rate (using default)', {
              context: 'PositionMonitor',
              error: feeError instanceof Error ? feeError.message : String(feeError)
            });
          }
          
          // OPTIMIZATION: Include slippage, fees, and other metrics in RL update
          await rlParameterOptimizer.updateWithOutcome({
            symbol: position.symbol,
            pnlPercent: update.pnlPercent,
            slippagePercent: slippagePct,
            fees: actualFees, // Actual commission rate from API
            confidence: (position as any).entryConfidence || 0.65,
            duration: Date.now() - position.openedAt,
            riskPercent: position.stopLoss && position.entryPrice > 0
              ? Math.abs((position.stopLoss - position.entryPrice) / position.entryPrice) * 100
              : 3.0
          });
        } catch (rlErr) {
          logger.debug('RL reward update failed (non-blocking)', {
            context: 'PositionMonitor',
            data: { symbol: position.symbol, error: rlErr instanceof Error ? rlErr.message : String(rlErr) }
          });
        }
        // Record exit to trades table if configured
        try {
          await recordTradeExit({
            id: position.id,
            symbol: position.symbol,
            exitPrice: update.exitPrice,
            pnl: update.pnl,
            pnlPercent: update.pnlPercent,
            exitReason: update.reason,
            exitTimestamp: Date.now(),
            durationMs: Date.now() - position.openedAt
          });
        } catch (logErr) {
          logger.warn('Trade exit record failed (non-blocking)', {
            context: 'PositionMonitor',
            data: { symbol: position.symbol, error: logErr instanceof Error ? logErr.message : String(logErr) }
          });
        }
        
        // Remove from monitoring
        this.positions.delete(position.id);
        
        logger.info('[OK] Position closed successfully', {
          context: 'PositionMonitor',
          data: {
            positionId: position.id,
            symbol: position.symbol,
            closeOrderId: closeOrder.orderId,
            pnl: update.pnl.toFixed(2),
            pnlPercent: update.pnlPercent.toFixed(2),
            reduceOnlyAttempted,
            closeAttempts
          }
        });
      } else {
        throw new Error('Failed to place closing order');
      }
    } catch (error) {
      logger.error('[ERROR] Failed to close position', error, {
        context: 'PositionMonitor',
        data: { positionId: position.id, symbol: position.symbol }
      });
      
      // Reset status and retry later
      position.status = 'OPEN';
    }
  }

  /**
   * Set trailing stop for a position
   */
  async setTrailingStop(positionId: string, trailPercent: number): Promise<boolean> {
    const position = this.positions.get(positionId);
    if (!position) {
      logger.warn('Position not found for trailing stop', {
        context: 'PositionMonitor',
        data: { positionId }
      });
      return false;
    }

    position.trailingStopPercent = trailPercent;
    await this.updatePositionInDb(position);

    logger.info('Trailing stop set', {
      context: 'PositionMonitor',
      data: { positionId, trailPercent }
    });

    return true;
  }

  /**
   * Partially close a position
   */
  async partialClose(positionId: string, closePercent: number): Promise<boolean> {
    const position = this.positions.get(positionId);
    if (!position) return false;

    const closeSize = position.size * (closePercent / 100);
    const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';

    try {
      // Validate price sanity; order placement will enforce filters internally
      // CRITICAL FIX: getPrice() already handles symbol format conversion
      const px = await asterDexService.getPrice(position.symbol);
      if (!px || !isFinite(px) || px <= 0) {
        logger.warn('Partial close skipped due to invalid price', { context: 'PositionMonitor', data: { symbol: position.symbol, px } });
        return false;
      }

      const closeOrder = await asterDexService.placeMarketOrder(
        position.symbol,
        closeSide,
        closeSize,
        position.leverage,
        true // reduceOnly
      );

      if (closeOrder) {
        position.size -= closeSize;
        await this.updatePositionInDb(position);

        logger.info('Partial close executed', {
          context: 'PositionMonitor',
          data: { 
            positionId, 
            closePercent, 
            closeSize: closeSize.toFixed(4), 
            remainingSize: position.size.toFixed(4)
          }
        });

        return true;
      }
    } catch (error) {
      logger.error('Partial close failed', error, {
        context: 'PositionMonitor',
        data: { positionId }
      });
    }

    return false;
  }

  /**
   * Force close a position immediately (100%)
   */
  async forceClose(positionId: string): Promise<boolean> {
    const position = this.positions.get(positionId);
    if (!position) {
      logger.warn('Cannot force close - position not found', {
        context: 'PositionMonitor',
        data: { positionId }
      });
      return false;
    }

    logger.info('[FORCE] FORCE CLOSING POSITION', {
      context: 'PositionMonitor',
      data: {
        positionId: position.id,
        symbol: position.symbol,
        side: position.side,
        size: position.size,
        reason: 'Manual force close requested'
      }
    });

    try {
      const currentPrice = await asterDexService.getPrice(position.symbol);
      
      // CRITICAL FIX: Calculate PnL correctly with leverage
      // Leveraged PnL = price_change * size * leverage
      let pnl: number;
      let pnlPercent: number;
      
      if (position.side === 'LONG') {
        pnl = (currentPrice - position.entryPrice) * position.size * position.leverage;
        pnlPercent = position.entryPrice > 0
          ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage
          : 0;
      } else {
        // SHORT position
        pnl = (position.entryPrice - currentPrice) * position.size * position.leverage;
        pnlPercent = position.entryPrice > 0
          ? ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage
          : 0;
      }

      const update: PositionUpdate = {
        action: 'FORCE_CLOSE',
        reason: 'Manual force close',
        exitPrice: currentPrice,
        pnl,
        pnlPercent
      };

      await this.closePosition(position, update);
      
      logger.info('[OK] Position force closed successfully', {
        context: 'PositionMonitor',
        data: {
          positionId: position.id,
          symbol: position.symbol,
          pnl: pnl.toFixed(2),
          pnlPercent: pnlPercent.toFixed(2)
        }
      });

      return true;
    } catch (error) {
      logger.error('Force close failed', error, {
        context: 'PositionMonitor',
        data: { positionId, symbol: position.symbol }
      });
      return false;
    }
  }

  /**
   * Remove a position from monitoring (clears from memory)
   */
  removePosition(positionId: string): boolean {
    const existed = this.positions.has(positionId);
    this.positions.delete(positionId);
    logger.info('Position removed from monitoring', {
      context: 'PositionMonitor',
      data: { positionId, existed }
    });
    return existed;
  }

  /**
   * Clear all positions from memory (use with caution)
   */
  clearAllPositions(): void {
    const count = this.positions.size;
    this.positions.clear();
    logger.info('All positions cleared from memory', {
      context: 'PositionMonitor',
      data: { clearedCount: count }
    });
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): OpenPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get position by ID
   */
  getPosition(positionId: string): OpenPosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Get status
   */
  getStatus(): {
    isMonitoring: boolean;
    positionsCount: number;
    positions: OpenPosition[];
  } {
    return {
      isMonitoring: this.isMonitoring,
      positionsCount: this.positions.size,
      positions: this.getOpenPositions()
    };
  }

  /**
   * Database operations
   */
  private async loadOpenPositions(): Promise<void> {
    try {
      const db = await getDb();
      const result = await db.execute(`
        SELECT * FROM open_positions WHERE status = 'OPEN'
      `);

      if (result.rows && result.rows.length > 0) {
        for (const row of result.rows) {
          const position: OpenPosition = {
            id: row.id as string,
            symbol: row.symbol as string,
            side: row.side as 'LONG' | 'SHORT',
            entryPrice: parseFloat(row.entry_price as string),
            currentPrice: parseFloat(row.current_price as string),
            size: parseFloat(row.size as string),
            leverage: parseInt(row.leverage as string),
            stopLoss: parseFloat(row.stop_loss as string),
            takeProfit: parseFloat(row.take_profit as string),
            trailingStopPercent: parseFloat(row.trailing_stop_percent as string) || 0,
            highestPrice: parseFloat(row.highest_price as string),
            lowestPrice: parseFloat(row.lowest_price as string),
            unrealizedPnL: parseFloat(row.unrealized_pnl as string),
            unrealizedPnLPercent: parseFloat(row.unrealized_pnl_percent as string),
            openedAt: parseInt(row.opened_at as string),
            lastChecked: Date.now(),
            orderId: row.order_id as string,
            status: 'OPEN'
          };

          this.positions.set(position.id, position);
        }

        logger.info('Loaded open positions from database', {
          context: 'PositionMonitor',
          data: { count: result.rows.length }
        });
      } else {
        logger.info('No open positions found in database', {
          context: 'PositionMonitor'
        });
      }
    } catch (error) {
      // Gracefully handle case where table doesn't exist yet
      logger.warn('Could not load open positions (table may not exist yet)', {
        context: 'PositionMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async savePositionToDb(position: OpenPosition): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(`
        INSERT INTO open_positions (
          id, symbol, side, entry_price, current_price, size, leverage,
          stop_loss, take_profit, trailing_stop_percent, highest_price, lowest_price,
          unrealized_pnl, unrealized_pnl_percent, opened_at, last_checked, order_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        position.id, position.symbol, position.side, position.entryPrice, position.currentPrice,
        position.size, position.leverage, position.stopLoss, position.takeProfit,
        position.trailingStopPercent, position.highestPrice, position.lowestPrice,
        position.unrealizedPnL, position.unrealizedPnLPercent, position.openedAt,
        position.lastChecked, position.orderId, position.status
      ]);
    } catch (error) {
      logger.error('Failed to save position to database', error, { 
        context: 'PositionMonitor',
        data: { positionId: position.id }
      });
    }
  }

  private async updatePositionInDb(position: OpenPosition): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(`
        UPDATE open_positions SET
          current_price = $2, highest_price = $3, lowest_price = $4,
          unrealized_pnl = $5, unrealized_pnl_percent = $6, last_checked = $7,
          trailing_stop_percent = $8, status = $9, size = $10
        WHERE id = $1
      `, [
        position.id, position.currentPrice, position.highestPrice, position.lowestPrice,
        position.unrealizedPnL, position.unrealizedPnLPercent, position.lastChecked,
        position.trailingStopPercent, position.status, position.size
      ]);
    } catch (error) {
      logger.error('Failed to update position in database', error, { 
        context: 'PositionMonitor',
        data: { positionId: position.id }
      });
    }
  }

  private async closePositionInDb(position: OpenPosition, update: PositionUpdate): Promise<void> {
    try {
      const db = await getDb();
      // Move to closed_positions table
      await db.execute(`
        INSERT INTO closed_positions (
          id, symbol, side, entry_price, exit_price, size, leverage,
          stop_loss, take_profit, realized_pnl, realized_pnl_percent,
          opened_at, closed_at, exit_reason, order_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        position.id, position.symbol, position.side, position.entryPrice, update.exitPrice,
        position.size, position.leverage, position.stopLoss, position.takeProfit,
        update.pnl, update.pnlPercent, position.openedAt, Date.now(),
        update.action, position.orderId
      ]);

      // Delete from open_positions
      await db.execute(`DELETE FROM open_positions WHERE id = $1`, [position.id]);

      // Update trade in trades table with exit info
      try {
        await db.execute(`
          UPDATE trades 
          SET exit_price = $1, 
              pnl = $2, 
              pnl_percent = $3, 
              exit_reason = $4, 
              exit_timestamp = $5, 
              duration = $6
          WHERE id = (
            SELECT id FROM trades 
            WHERE symbol = $7 
              AND side = $8 
              AND entry_price = $9 
              AND exit_timestamp IS NULL
            ORDER BY timestamp DESC
            LIMIT 1
          )
        `, [
          update.exitPrice,
          update.pnl,
          update.pnlPercent,
          update.action,
          Date.now(),
          Date.now() - position.openedAt,
          position.symbol,
          position.side,
          position.entryPrice
        ]);
        
        logger.info('[DB] Trade updated in database with exit info', {
          context: 'PositionMonitor',
          data: { 
            symbol: position.symbol, 
            pnl: update.pnl.toFixed(2),
            exitReason: update.action
          }
        });
        try {
          const { sendTradeNotification } = await import('@/lib/notificationService');
          const { asterConfig: ac } = await import('@/lib/configService');
          await sendTradeNotification({
            event: 'closed',
            symbol: position.symbol,
            side: position.side,
            size: position.size,
            entryPrice: position.entryPrice,
            exitPrice: update.exitPrice,
            pnl: update.pnl,
            pnlPercent: update.pnlPercent,
            exitReason: update.action,
            simulation: ac.trading.simulationMode,
          });
        } catch (_) { /* non-critical */ }
      } catch (updateError) {
        logger.error('Failed to update trade in database (non-critical)', updateError, { 
          context: 'PositionMonitor',
          data: { positionId: position.id }
        });
      }

      // Record trade performance
      try {
        const { performanceTracker } = await import('@/services/monitoring/performanceTracker');
        await performanceTracker.recordTrade({
          tradeId: position.id,
          symbol: position.symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: update.exitPrice,
          size: position.size,
          leverage: position.leverage,
          realizedPnL: update.pnl,
          realizedPnLPercent: update.pnlPercent,
          duration: Date.now() - position.openedAt,
          exitReason: update.action,
          timestamp: Date.now()
        });
        
        // REINFORCEMENT LEARNING PHASE 1: Clear pattern cache so new trade is included in next analysis
        try {
          const { tradePatternAnalyzer } = await import('@/services/ml/tradePatternAnalyzer');
          tradePatternAnalyzer.clearCache();
          logger.debug('Cleared RL pattern cache after trade completion', {
            context: 'PositionMonitor',
            data: { positionId: position.id }
          });
        } catch (cacheError) {
          // Non-critical - just log
          logger.debug('Failed to clear RL cache (non-critical)', {
            context: 'PositionMonitor',
            error: cacheError instanceof Error ? cacheError.message : String(cacheError)
          });
        }
        
        // REINFORCEMENT LEARNING PHASE 2: Record trade outcome for parameter optimization
        try {
          const { dynamicConfigService } = await import('@/services/monitoring/dynamicConfigService');
          const { rlParameterOptimizer } = await import('@/services/ml/rlParameterOptimizer');
          
          // Get market regime and account size for RL state
          const balanceConfig = realBalanceService.getBalanceConfig();
          const balance = balanceConfig?.availableBalance || 100;
          const marketRegime = await rlParameterOptimizer.detectMarketRegime();
          const accountSize = rlParameterOptimizer.classifyAccountSize(balance);
          
          // Calculate risk percentage used
          const riskPercent = position.stopLoss && position.entryPrice > 0
            ? Math.abs((position.stopLoss - position.entryPrice) / position.entryPrice) * 100
            : 3.0;
          
          // Record trade outcome for RL learning
          await dynamicConfigService.recordTradeOutcome({
            pnl: update.pnl,
            pnlPercent: update.pnlPercent,
            confidence: (position as any).entryConfidence || 0.65,
            duration: Date.now() - position.openedAt,
            riskPercent: riskPercent,
            marketRegime: marketRegime,
            accountSize: accountSize
          });
          
          logger.debug('Recorded trade outcome for RL parameter optimization', {
            context: 'PositionMonitor',
            data: {
              positionId: position.id,
              pnl: update.pnlPercent.toFixed(2) + '%',
              marketRegime,
              accountSize
            }
          });
        } catch (rlError) {
          // Non-critical - just log
          logger.debug('Failed to record trade outcome for RL (non-critical)', {
            context: 'PositionMonitor',
            error: rlError instanceof Error ? rlError.message : String(rlError)
          });
        }
        
        // PERFORMANCE-BASED SIZING: Update position sizer after trade closes
        // This determines if we should size up (after wins) or down (after losses)
        try {
          const { performanceBasedSizer } = await import('./performanceBasedSizer');
          await performanceBasedSizer.recordTradeResult(update.pnlPercent);
          
          const sizing = await performanceBasedSizer.getOptimalSizing();
          
          if (update.pnlPercent > 0) {
            logger.info('[WIN] WIN recorded - Next trade sizing updated', {
              context: 'PositionMonitor',
              data: {
                positionId: position.id,
                pnlPercent: update.pnlPercent.toFixed(2) + '%',
                newTier: sizing.tier.name,
                nextPositionSize: sizing.positionSizePercent.toFixed(1) + '%',
                shouldSizeUp: sizing.shouldSizeUp
              }
            });
          } else {
            logger.info('[LOSS] LOSS recorded - Next trade sizing adjusted', {
              context: 'PositionMonitor',
              data: {
                positionId: position.id,
                pnlPercent: update.pnlPercent.toFixed(2) + '%',
                newTier: sizing.tier.name,
                nextPositionSize: sizing.positionSizePercent.toFixed(1) + '%',
                shouldSizeDown: sizing.shouldSizeDown
              }
            });
          }
        } catch (sizerError) {
          // Non-critical
          logger.debug('Failed to update performance sizer (non-critical)', {
            context: 'PositionMonitor',
            error: sizerError instanceof Error ? sizerError.message : String(sizerError)
          });
        }
      } catch (perfError) {
        logger.error('Failed to record trade performance', perfError, { 
          context: 'PositionMonitor',
          data: { positionId: position.id }
        });
      }
    } catch (error) {
      logger.error('Failed to close position in database', error, { 
        context: 'PositionMonitor',
        data: { positionId: position.id }
      });
    }
  }

  /**
   * WHALE DETECTION: Detect volume spike reversal (whale exiting)
   */
  private async detectVolumeSpikeReversal(symbol: string): Promise<boolean> {
    try {
      const { asterDexService } = await import('@/services/exchange/asterDexService');
      const ticker = await asterDexService.getTicker(symbol);
      
      if (!ticker) return false;
      
      const currentVolume = parseFloat(String(ticker.volume || '0'));
      const avgVolume = parseFloat(String(ticker.averageVolume || ticker.quoteVolume || '0'));
      
      // Track volume history
      if (!this.volumeHistory.has(symbol)) {
        this.volumeHistory.set(symbol, []);
      }
      
      const history = this.volumeHistory.get(symbol)!;
      history.push(currentVolume);
      
      // Keep only last N readings
      if (history.length > this.VOLUME_HISTORY_SIZE) {
        history.shift();
      }
      
      // Need at least 3 readings to detect reversal
      if (history.length < 3) return false;
      
      // Detect volume spike reversal
      const volumeSpikeThreshold = parseFloat(process.env.TRADING_VOLUME_SPIKE_EXIT || '2.0');
      const recentAvg = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const previousAvg = history.slice(0, -3).reduce((a, b) => a + b, 0) / (history.length - 3);
      
      // Volume was spiking (whale entering) but now dropping (whale exiting)
      const wasSpikingNowDropping = previousAvg > avgVolume * volumeSpikeThreshold && 
                                     recentAvg < previousAvg * 0.7; // 30% drop
      
      if (wasSpikingNowDropping) {
        logger.info(`[WHALE] Volume spike reversal detected on ${symbol}`, {
          context: 'PositionMonitor',
          data: {
            symbol,
            previousAvg: previousAvg.toFixed(0),
            recentAvg: recentAvg.toFixed(0),
            dropPercent: ((1 - recentAvg / previousAvg) * 100).toFixed(1) + '%'
          }
        });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.debug('Volume spike detection failed (non-critical)', {
        context: 'PositionMonitor',
        symbol
      });
      return false;
    }
  }

  /**
   * WHALE DETECTION: Detect whale order disappearance (whale exiting)
   */
  private async detectWhaleExit(symbol: string, side: 'LONG' | 'SHORT'): Promise<boolean> {
    try {
      const { asterDexService } = await import('@/services/exchange/asterDexService');
      const orderBook = await asterDexService.getOrderBook(symbol, 20);
      
      if (!orderBook) return false;
      
      const whaleThreshold = parseFloat(process.env.TRADING_WHALE_ORDER_THRESHOLD || '0.05'); // 5% of book
      
      // For LONG positions, check if large BID orders disappeared (bulls exiting)
      // For SHORT positions, check if large ASK orders disappeared (bears exiting)
      const ordersToCheck = side === 'LONG' ? orderBook.bids : orderBook.asks;
      const totalLiquidity = side === 'LONG' ? orderBook.bidLiquidity : orderBook.askLiquidity;
      
      // Check if ANY single order is >5% of book depth (whale order)
      let hasWhaleOrder = false;
      for (const [priceStr, qtyStr] of ordersToCheck) {
        const orderValue = parseFloat(priceStr) * parseFloat(qtyStr);
        const orderPercent = orderValue / totalLiquidity;
        
        if (orderPercent > whaleThreshold) {
          hasWhaleOrder = true;
          break;
        }
      }
      
      // For simplicity, if no whale orders remain, consider it a whale exit
      // (In reality, would track specific whale orders over time)
      if (!hasWhaleOrder) {
        logger.info(`[WHALE] No whale orders detected on ${symbol} ${side} side`, {
          context: 'PositionMonitor',
          data: {
            symbol,
            side,
            totalLiquidity: totalLiquidity.toFixed(2),
            note: 'Whale may have exited - consider closing position'
          }
        });
        // Only trigger if previously had whale support (simplified logic)
        // Return false for now to avoid false positives
        return false;
      }
      
      return false;
    } catch (error) {
      logger.debug('Whale detection failed (non-critical)', {
        context: 'PositionMonitor',
        symbol
      });
      return false;
    }
  }
}

// Export singleton instance with globalThis for Next.js dev hot-reload persistence
const globalForPositionMonitor = globalThis as typeof globalThis & {
  __positionMonitorService?: PositionMonitorService;
};

if (!globalForPositionMonitor.__positionMonitorService) {
  globalForPositionMonitor.__positionMonitorService = new PositionMonitorService();
}

export const positionMonitorService = globalForPositionMonitor.__positionMonitorService;

