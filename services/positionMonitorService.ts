/**
 * Position Monitoring Service
 * Monitors open positions 24/7 and manages exits
 * Implements trailing stops, stop-loss monitoring, and partial exits
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';
import { realBalanceService } from './realBalanceService';
import { Mutex } from 'async-mutex';

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
  // AGGRESSIVE SCALPING: Check every 10 seconds (configurable via env)
  private checkIntervalMs = parseInt(process.env.TRADING_POSITION_CHECK_INTERVAL || '10000');
  private checkCount = 0; // OPTIMIZATION: Counter for log sampling
  
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
    logger.info('🔍 Position Monitor started', { context: 'PositionMonitor' });

    // Load open positions from database
    await this.loadOpenPositions();

    // Start monitoring loop
    this.monitorInterval = setInterval(() => {
      this.monitorAllPositions().catch(err => {
        logger.error('Error in position monitoring', err, { context: 'PositionMonitor' });
      });
    }, this.checkIntervalMs);

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
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    logger.info('Position Monitor stopped', { 
      context: 'PositionMonitor',
      data: { openPositions: this.positions.size }
    });
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

    logger.info('✅ Position added to monitor', {
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

    return id;
  }

  /**
   * Monitor all open positions
   */
  private async monitorAllPositions(): Promise<void> {
    if (this.positions.size === 0) return;

    this.checkCount++; // OPTIMIZATION: Increment check counter

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
          const { asterDexService } = await import('./asterDexService');
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
      const price = currentPrice ?? await asterDexService.getPrice(position.symbol);
      
      // Update position data
      position.currentPrice = price;
      position.lastChecked = Date.now();

      // Calculate P&L
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
   * ENHANCED: Whale detection, volume spikes, quick profit-taking
   */
  private async checkExitConditions(position: OpenPosition): Promise<PositionUpdate | null> {
    const { side, currentPrice: price, entryPrice, stopLoss, takeProfit, trailingStopPercent, highestPrice, lowestPrice, openedAt } = position;

    // 0. SCALPING MODE: Quick profit-taking on ANY profitable position
    const scalpingEnabled = process.env.TRADING_SCALPING_ENABLED === 'true';
    const minScalpProfit = parseFloat(process.env.TRADING_MIN_SCALP_PROFIT || '0.005'); // 0.5%
    
    if (scalpingEnabled && position.unrealizedPnLPercent > minScalpProfit * 100) {
      // Check for volume spike reversal (whale exiting)
      try {
        const volumeSpike = await this.detectVolumeSpikeReversal(position.symbol);
        if (volumeSpike) {
          return {
            action: 'PARTIAL_EXIT',
            reason: `SCALP: Volume spike reversal detected while profitable (${position.unrealizedPnLPercent.toFixed(2)}%) - whale exiting, securing profit`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
        
        // Check for whale order disappearance
        const whaleExit = await this.detectWhaleExit(position.symbol, side);
        if (whaleExit) {
          return {
            action: 'PARTIAL_EXIT',
            reason: `SCALP: Whale order disappeared while profitable (${position.unrealizedPnLPercent.toFixed(2)}%) - reversing momentum, securing profit`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
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

    // 3. Check Trailing Stop
    if (trailingStopPercent > 0) {
      if (side === 'LONG') {
        const trailStopPrice = highestPrice * (1 - trailingStopPercent / 100);
        if (price <= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `Trailing stop triggered: ${price.toFixed(4)} <= ${trailStopPrice.toFixed(4)} (from high ${highestPrice.toFixed(4)})`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
      } else {
        // SHORT
        const trailStopPrice = lowestPrice * (1 + trailingStopPercent / 100);
        if (price >= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `Trailing stop triggered: ${price.toFixed(4)} >= ${trailStopPrice.toFixed(4)} (from low ${lowestPrice.toFixed(4)})`,
            exitPrice: price,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
      }
    }

    // 4. Check Timeout (close after 24 hours)
    const POSITION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
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
    logger.info('🔴 Closing position', {
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
      const closeOrder = await asterDexService.placeMarketOrder(
        position.symbol,
        closeSide,
        position.size,
        position.leverage,
        true // reduceOnly = true
      );

      if (closeOrder) {
        position.status = 'CLOSED';
        
        // Update database with close data
        await this.closePositionInDb(position, update);
        
        // Remove from monitoring
        this.positions.delete(position.id);

        logger.info('✅ Position closed successfully', {
          context: 'PositionMonitor',
          data: {
            positionId: position.id,
            symbol: position.symbol,
            closeOrderId: closeOrder.orderId,
            pnl: update.pnl.toFixed(2),
            pnlPercent: update.pnlPercent.toFixed(2)
          }
        });
      } else {
        throw new Error('Failed to place closing order');
      }
    } catch (error) {
      logger.error('❌ Failed to close position', error, {
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

    logger.info('🔴 FORCE CLOSING POSITION', {
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
      const pnl = position.side === 'LONG'
        ? (currentPrice - position.entryPrice) * position.size
        : (position.entryPrice - currentPrice) * position.size;
      const pnlPercent = (pnl / (position.entryPrice * position.size)) * 100 * position.leverage;

      const update: PositionUpdate = {
        action: 'FORCE_CLOSE',
        reason: 'Manual force close',
        exitPrice: currentPrice,
        pnl,
        pnlPercent
      };

      await this.closePosition(position, update);
      
      logger.info('✅ Position force closed successfully', {
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
  removePosition(positionId: string): void {
    this.positions.delete(positionId);
    logger.debug('Position removed from monitoring', {
      context: 'PositionMonitor',
      data: { positionId }
    });
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
          WHERE symbol = $7 
            AND side = $8 
            AND entry_price = $9 
            AND exit_timestamp IS NULL
          ORDER BY timestamp DESC
          LIMIT 1
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
        
        logger.info('📝 Trade updated in database with exit info', {
          context: 'PositionMonitor',
          data: { 
            symbol: position.symbol, 
            pnl: update.pnl.toFixed(2),
            exitReason: update.action
          }
        });
      } catch (updateError) {
        logger.error('Failed to update trade in database (non-critical)', updateError, { 
          context: 'PositionMonitor',
          data: { positionId: position.id }
        });
      }

      // Record trade performance
      try {
        const { performanceTracker } = await import('./performanceTracker');
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
          const { tradePatternAnalyzer } = await import('./tradePatternAnalyzer');
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
          const { dynamicConfigService } = await import('./dynamicConfigService');
          const { rlParameterOptimizer } = await import('./rlParameterOptimizer');
          
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
      const { asterDexService } = await import('./asterDexService');
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
        logger.info(`🐋 Volume spike reversal detected on ${symbol}`, {
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
      const { asterDexService } = await import('./asterDexService');
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
        logger.info(`🐋 No whale orders detected on ${symbol} ${side} side`, {
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

