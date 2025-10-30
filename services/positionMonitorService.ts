/**
 * Position Monitoring Service
 * Monitors open positions 24/7 and manages exits
 * Implements trailing stops, stop-loss monitoring, and partial exits
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { db } from '@/lib/db';

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
  private checkIntervalMs = 5000; // Check every 5 seconds

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
   * Add a position to monitor
   */
  async addPosition(position: Omit<OpenPosition, 'id' | 'currentPrice' | 'highestPrice' | 'lowestPrice' | 'unrealizedPnL' | 'unrealizedPnLPercent' | 'lastChecked' | 'status'>): Promise<string> {
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

    this.positions.set(id, fullPosition);

    // Save to database
    await this.savePositionToDb(fullPosition);

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

    logger.debug('Checking positions', {
      context: 'PositionMonitor',
      data: { count: this.positions.size }
    });

    const checkPromises = Array.from(this.positions.values()).map(position =>
      this.checkPosition(position).catch(error => {
        logger.error(`Error checking position ${position.id}`, error, {
          context: 'PositionMonitor',
          data: { positionId: position.id, symbol: position.symbol }
        });
      })
    );

    await Promise.all(checkPromises);
  }

  /**
   * Check a single position for exit conditions
   */
  private async checkPosition(position: OpenPosition): Promise<void> {
    try {
      // Get current price
      const currentPrice = await asterDexService.getPrice(position.symbol);
      
      // Update position data
      position.currentPrice = currentPrice;
      position.lastChecked = Date.now();

      // Calculate P&L
      if (position.side === 'LONG') {
        position.unrealizedPnL = (currentPrice - position.entryPrice) * position.size * position.leverage;
        position.unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
        
        // Update highest price for trailing stop
        if (currentPrice > position.highestPrice) {
          position.highestPrice = currentPrice;
        }
      } else {
        // SHORT
        position.unrealizedPnL = (position.entryPrice - currentPrice) * position.size * position.leverage;
        position.unrealizedPnLPercent = ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
        
        // Update lowest price for trailing stop
        if (currentPrice < position.lowestPrice) {
          position.lowestPrice = currentPrice;
        }
      }

      // Check exit conditions
      const exitCondition = this.checkExitConditions(position);
      
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
  }

  /**
   * Check if position should be closed
   */
  private checkExitConditions(position: OpenPosition): PositionUpdate | null {
    const { side, currentPrice, entryPrice, stopLoss, takeProfit, trailingStopPercent, highestPrice, lowestPrice, openedAt } = position;

    // 1. Check Stop-Loss
    if (side === 'LONG' && currentPrice <= stopLoss) {
      return {
        action: 'STOP_LOSS',
        reason: `Price hit stop-loss: ${currentPrice.toFixed(4)} <= ${stopLoss.toFixed(4)}`,
        exitPrice: currentPrice,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }
    
    if (side === 'SHORT' && currentPrice >= stopLoss) {
      return {
        action: 'STOP_LOSS',
        reason: `Price hit stop-loss: ${currentPrice.toFixed(4)} >= ${stopLoss.toFixed(4)}`,
        exitPrice: currentPrice,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }

    // 2. Check Take-Profit
    if (side === 'LONG' && currentPrice >= takeProfit) {
      return {
        action: 'TAKE_PROFIT',
        reason: `Price hit take-profit: ${currentPrice.toFixed(4)} >= ${takeProfit.toFixed(4)}`,
        exitPrice: currentPrice,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }
    
    if (side === 'SHORT' && currentPrice <= takeProfit) {
      return {
        action: 'TAKE_PROFIT',
        reason: `Price hit take-profit: ${currentPrice.toFixed(4)} <= ${takeProfit.toFixed(4)}`,
        exitPrice: currentPrice,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent
      };
    }

    // 3. Check Trailing Stop
    if (trailingStopPercent > 0) {
      if (side === 'LONG') {
        const trailStopPrice = highestPrice * (1 - trailingStopPercent / 100);
        if (currentPrice <= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `Trailing stop triggered: ${currentPrice.toFixed(4)} <= ${trailStopPrice.toFixed(4)} (from high ${highestPrice.toFixed(4)})`,
            exitPrice: currentPrice,
            pnl: position.unrealizedPnL,
            pnlPercent: position.unrealizedPnLPercent
          };
        }
      } else {
        // SHORT
        const trailStopPrice = lowestPrice * (1 + trailingStopPercent / 100);
        if (currentPrice >= trailStopPrice) {
          return {
            action: 'TRAILING_STOP',
            reason: `Trailing stop triggered: ${currentPrice.toFixed(4)} >= ${trailStopPrice.toFixed(4)} (from low ${lowestPrice.toFixed(4)})`,
            exitPrice: currentPrice,
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
        exitPrice: currentPrice,
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
}

// Export singleton instance with globalThis for Next.js dev hot-reload persistence
const globalForPositionMonitor = globalThis as typeof globalThis & {
  __positionMonitorService?: PositionMonitorService;
};

if (!globalForPositionMonitor.__positionMonitorService) {
  globalForPositionMonitor.__positionMonitorService = new PositionMonitorService();
}

export const positionMonitorService = globalForPositionMonitor.__positionMonitorService;

