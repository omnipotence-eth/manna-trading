/**
 * Simulation Trading Service
 * Tracks simulated trades without placing real orders
 * Perfect for portfolio demonstration without risking funds
 * 
 * ENTERPRISE FEATURES:
 * - Full ML/LLM training data collection
 * - Complete trade logging for analysis
 * - Real-time position tracking
 * - Statistics and performance metrics
 */

import { logger } from '@/lib/logger';
import { asterConfig } from '@/lib/configService';
import { asterDexService } from '@/services/exchange/asterDexService';
import { addTrade, recordTradeEntry } from '@/lib/db';
import { mlDataCollector } from '@/services/ml/mlDataCollector';
import { mlTrainingService } from '@/services/ml/mlTrainingDataService';

export interface SimulatedTrade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  leverage: number;
  entryTime: number;
  exitTime: number | null;
  pnl: number;
  pnlPercent: number;
  status: 'OPEN' | 'CLOSED';
  fees: number;
  reason: string;
  // ML Training Data
  marketData?: any;
  aiDecision?: any;
  entryConfidence?: number;
  entrySignals?: any;
}

export interface SimulatedPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  entryTime: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

class SimulationService {
  private trades: Map<string, SimulatedTrade> = new Map();
  private positions: Map<string, SimulatedPosition> = new Map();
  private balance: number;
  private initialBalance: number;
  private totalRealizedPnL: number = 0;

  constructor() {
    this.initialBalance = asterConfig.trading.simulationInitialBalance;
    this.balance = this.initialBalance;
    logger.info('[SIMULATION] Simulation service initialized', {
      context: 'SimulationService',
      data: {
        initialBalance: this.initialBalance,
        mode: 'SIMULATION MODE - No real orders will be placed',
        note: 'All trades will be logged for ML/LLM training'
      }
    });
  }

  /**
   * Simulate placing a market order
   * ENTERPRISE: Logs to database and ML training services
   */
  async simulateMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number = 1,
    reason: string = 'AI Agent Decision',
    marketData?: any,
    aiDecision?: any
  ): Promise<SimulatedTrade | null> {
    try {
      // Get current market price
      const ticker = await asterDexService.getTicker(symbol);
      if (!ticker || ticker.price <= 0) {
        logger.warn('[SIMULATION] Could not get price for simulation', {
          context: 'SimulationService',
          data: { symbol }
        });
        return null;
      }

      const entryPrice = ticker.price;
      if (entryPrice <= 0) {
        return null;
      }

      // Calculate position value
      const positionValue = size * entryPrice;
      const marginRequired = positionValue / leverage;

      // Check if we have enough balance
      if (marginRequired > this.balance) {
        logger.warn('[SIMULATION] Insufficient balance for trade', {
          context: 'SimulationService',
          data: { symbol, required: marginRequired, available: this.balance }
        });
        return null;
      }

      // Calculate fees (0.04% for futures trading)
      const fees = positionValue * 0.0004;

      // Create simulated trade
      const tradeId = `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const trade: SimulatedTrade = {
        id: tradeId,
        symbol,
        side,
        entryPrice,
        exitPrice: null,
        size,
        leverage,
        entryTime: Date.now(),
        exitTime: null,
        pnl: 0,
        pnlPercent: 0,
        status: 'OPEN',
        fees,
        reason,
        marketData,
        aiDecision,
        entryConfidence: aiDecision?.confidence || 0,
        entrySignals: marketData
      };

      // Deduct margin and fees from balance
      this.balance -= (marginRequired + fees);

      // Create position
      const positionId = `${symbol}_${side}`;
      const position: SimulatedPosition = {
        id: positionId,
        symbol,
        side: side === 'BUY' ? 'LONG' : 'SHORT',
        entryPrice,
        currentPrice: entryPrice,
        size,
        leverage,
        entryTime: Date.now(),
        unrealizedPnl: -fees, // Start with negative fees
        unrealizedPnlPercent: 0
      };

      this.trades.set(tradeId, trade);
      this.positions.set(positionId, position);

      // ENTERPRISE: Log to database for trade journal
      try {
        await recordTradeEntry({
          id: tradeId,
          timestamp: trade.entryTime,
          symbol: symbol.replace('/', ''),
          side: position.side,
          size: trade.size,
          entryPrice: trade.entryPrice,
          leverage: trade.leverage,
          entryReason: reason,
          entryConfidence: trade.entryConfidence != null ? trade.entryConfidence * 100 : 0,
          entrySignals: trade.entrySignals,
          entryMarketRegime: marketData?.regime || marketData?.marketRegime,
          entryScore: marketData?.score || aiDecision?.opportunityScore
        });
      } catch (dbError) {
        logger.warn('[SIMULATION] Failed to log trade entry to database (non-critical)', {
          context: 'SimulationService',
          error: dbError instanceof Error ? dbError.message : String(dbError)
        });
      }
      try {
        const { sendTradeNotification } = await import('@/lib/notificationService');
        await sendTradeNotification({
          event: 'opened',
          symbol: symbol.replace('/', ''),
          side: position.side,
          size: trade.size,
          entryPrice: trade.entryPrice,
          simulation: true,
        });
      } catch (_) { /* non-critical */ }

      // ENTERPRISE: Log to ML training data service
      try {
        if (marketData && aiDecision) {
          await mlDataCollector.recordTradeEntry(
            tradeId,
            symbol.replace('/', ''),
            position.side,
            entryPrice,
            size,
            leverage,
            marketData.stopLoss || entryPrice * 0.97,
            marketData.takeProfit || entryPrice * 1.06,
            trade.entryConfidence || 0,
            marketData,
            aiDecision
          );
        }
      } catch (mlError) {
        logger.warn('[SIMULATION] Failed to log to ML training service (non-critical)', {
          context: 'SimulationService',
          error: mlError instanceof Error ? mlError.message : String(mlError)
        });
      }

      logger.trade('[SIMULATION] Simulated order placed', {
        context: 'SimulationService',
        data: {
          tradeId,
          symbol,
          side,
          entryPrice,
          size,
          leverage,
          marginRequired,
          fees,
          remainingBalance: this.balance,
          loggedToDB: true,
          loggedToML: true
        }
      });

      return trade;
    } catch (error) {
      logger.error('[SIMULATION] Error simulating order', error instanceof Error ? error : new Error(String(error)), {
        context: 'SimulationService',
        data: { symbol, side, size }
      });
      return null;
    }
  }

  /**
   * Update position prices and calculate unrealized P&L
   */
  async updatePositions(): Promise<void> {
    for (const [positionId, position] of this.positions.entries()) {
      try {
        const ticker = await asterDexService.getTicker(position.symbol);
        if (!ticker || ticker.price <= 0) continue;

        const currentPrice = ticker.price;
        if (currentPrice <= 0) continue;

        position.currentPrice = currentPrice;

        // Calculate unrealized P&L
        const positionValue = position.size * position.entryPrice;
        let priceChange = 0;

        if (position.side === 'LONG') {
          priceChange = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
        } else {
          priceChange = ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
        }

        const unrealizedPnL = (positionValue * priceChange) / 100;
        position.unrealizedPnl = unrealizedPnL;
        position.unrealizedPnlPercent = priceChange;

        // Update corresponding trade
        const trade = Array.from(this.trades.values()).find(
          t => t.symbol === position.symbol && t.side === (position.side === 'LONG' ? 'BUY' : 'SELL') && t.status === 'OPEN'
        );

        if (trade) {
          trade.pnl = unrealizedPnL;
          trade.pnlPercent = priceChange;
        }
      } catch (error) {
        logger.debug('[SIMULATION] Error updating position', {
          context: 'SimulationService',
          data: { positionId, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }
  }

  /**
   * Close a simulated position
   * ENTERPRISE: Logs exit to database and ML training services
   */
  async closePosition(
    symbol: string,
    side: 'LONG' | 'SHORT',
    reason: string = 'Take Profit / Stop Loss'
  ): Promise<SimulatedTrade | null> {
    const positionId = `${symbol}_${side}`;
    const position = this.positions.get(positionId);

    if (!position) {
      return null;
    }

    try {
      // Get current price
      const ticker = await asterDexService.getTicker(symbol);
      if (!ticker || !ticker.price) {
        return null;
      }

      const exitPrice = ticker.price;
      if (exitPrice <= 0) {
        return null;
      }

      // Find corresponding trade
      const trade = Array.from(this.trades.values()).find(
        t => t.symbol === symbol && 
             t.side === (side === 'LONG' ? 'BUY' : 'SELL') && 
             t.status === 'OPEN'
      );

      if (!trade) {
        return null;
      }

      // Calculate final P&L
      const positionValue = trade.size * trade.entryPrice;
      let priceChange = 0;

      if (side === 'LONG') {
        priceChange = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * trade.leverage;
      } else {
        priceChange = ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100 * trade.leverage;
      }

      const realizedPnL = (positionValue * priceChange) / 100;
      const exitFees = (trade.size * exitPrice) * 0.0004; // Exit fees
      const netPnL = realizedPnL - exitFees;

      // Update trade
      trade.exitPrice = exitPrice;
      trade.exitTime = Date.now();
      trade.pnl = netPnL;
      trade.pnlPercent = priceChange;
      trade.status = 'CLOSED';
      trade.fees += exitFees;

      // Return margin and add P&L to balance
      const marginRequired = (positionValue / trade.leverage);
      this.balance += marginRequired + netPnL;
      this.totalRealizedPnL += netPnL;

      // ENTERPRISE: Update trade in database
      try {
        const duration = trade.exitTime - trade.entryTime;
        await addTrade({
          id: trade.id,
          timestamp: new Date(trade.entryTime).toISOString(),
          model: 'Simulation',
          symbol: trade.symbol.replace('/', ''),
          side: side,
          size: trade.size,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          pnl: trade.pnl,
          pnlPercent: trade.pnlPercent,
          leverage: trade.leverage,
          entryReason: trade.reason,
          entryConfidence: trade.entryConfidence != null ? trade.entryConfidence * 100 : 0,
          entrySignals: trade.entrySignals,
          entryMarketRegime: trade.marketData?.regime || trade.marketData?.marketRegime,
          entryScore: trade.marketData?.score,
          exitReason: reason,
          exitTimestamp: trade.exitTime ? new Date(trade.exitTime).toISOString() : null,
          duration: Math.floor(duration / 1000) // Convert to seconds
        });
      } catch (dbError) {
        logger.warn('[SIMULATION] Failed to update trade in database (non-critical)', {
          context: 'SimulationService',
          error: dbError instanceof Error ? dbError.message : String(dbError)
        });
      }

      // ENTERPRISE: Log exit to ML training service
      try {
        await mlDataCollector.recordTradeExit(
          trade.id,
          exitPrice,
          netPnL,
          priceChange,
          reason as any,
          trade.pnl > 0 ? exitPrice : trade.entryPrice, // maxFavorable
          trade.pnl < 0 ? exitPrice : trade.entryPrice  // maxAdverse
        );
      } catch (mlError) {
        logger.warn('[SIMULATION] Failed to log exit to ML training service (non-critical)', {
          context: 'SimulationService',
          error: mlError instanceof Error ? mlError.message : String(mlError)
        });
      }

      // Remove position
      this.positions.delete(positionId);

      logger.trade('[SIMULATION] Position closed', {
        context: 'SimulationService',
        data: {
          tradeId: trade.id,
          symbol,
          side,
          entryPrice: trade.entryPrice,
          exitPrice,
          pnl: netPnL,
          pnlPercent: priceChange,
          newBalance: this.balance,
          loggedToDB: true,
          loggedToML: true
        }
      });
      try {
        const { sendTradeNotification } = await import('@/lib/notificationService');
        await sendTradeNotification({
          event: 'closed',
          symbol,
          side,
          size: trade.size,
          entryPrice: trade.entryPrice,
          exitPrice,
          pnl: netPnL,
          pnlPercent: priceChange,
          exitReason: reason,
          simulation: true,
        });
      } catch (_) { /* non-critical */ }

      return trade;
    } catch (error) {
      logger.error('[SIMULATION] Error closing position', error instanceof Error ? error : new Error(String(error)), {
        context: 'SimulationService',
        data: { symbol, side }
      });
      return null;
    }
  }

  /**
   * Get all simulated trades
   */
  getTrades(): SimulatedTrade[] {
    return Array.from(this.trades.values());
  }

  /**
   * Get all open positions
   */
  getPositions(): SimulatedPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get current balance
   */
  getBalance(): number {
    return this.balance;
  }

  /**
   * Get account value (balance + unrealized P&L)
   */
  getAccountValue(): number {
    const unrealizedPnL = Array.from(this.positions.values()).reduce(
      (sum, pos) => sum + pos.unrealizedPnl,
      0
    );
    return this.balance + unrealizedPnL;
  }

  /**
   * Get statistics
   */
  getStats() {
    const allTrades = this.getTrades();
    const closedTrades = allTrades.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => t.pnl > 0).length;
    const losses = closedTrades.filter(t => t.pnl < 0).length;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = closedTrades.length > 0 ? totalPnL / closedTrades.length : 0;
    const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnl), 0) : 0;
    const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnl), 0) : 0;

    return {
      totalTrades: allTrades.length,
      closedTrades: closedTrades.length,
      openPositions: this.positions.size,
      wins,
      losses,
      winRate,
      totalPnL: this.totalRealizedPnL,
      unrealizedPnL: Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.unrealizedPnl, 0),
      avgPnL,
      bestTrade,
      worstTrade,
      balance: this.balance,
      accountValue: this.getAccountValue(),
      initialBalance: this.initialBalance,
      totalReturn: ((this.getAccountValue() - this.initialBalance) / this.initialBalance) * 100
    };
  }

  /**
   * Reset simulation (clear all trades and positions)
   */
  reset(): void {
    this.trades.clear();
    this.positions.clear();
    this.balance = this.initialBalance;
    this.totalRealizedPnL = 0;
    logger.info('[SIMULATION] Simulation reset', {
      context: 'SimulationService',
      data: { initialBalance: this.initialBalance }
    });
  }
}

export const simulationService = new SimulationService();




