/**
 * Performance Tracking Service
 * Tracks trade performance and calculates profitability metrics
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

export interface TradePerformance {
  tradeId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  leverage: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  duration: number; // milliseconds
  exitReason: string;
  timestamp: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWinAmount: number;
  avgLossAmount: number;
  avgProfitPerTrade: number;
  profitFactor: number;
  totalPnL: number;
  totalPnLPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  bestTrade: number;
  worstTrade: number;
  avgTradeDuration: number; // milliseconds
  lastUpdated: number;
}

export interface SymbolPerformance {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
}

export interface DailyPerformance {
  date: string;
  trades: number;
  pnl: number;
  winRate: number;
}

class PerformanceTracker {
  /**
   * Record a closed trade
   */
  async recordTrade(trade: TradePerformance): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(`
        INSERT INTO trade_performance (
          trade_id, symbol, side, entry_price, exit_price, size, leverage,
          realized_pnl, realized_pnl_percent, duration, exit_reason, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        trade.tradeId, trade.symbol, trade.side, trade.entryPrice, trade.exitPrice,
        trade.size, trade.leverage, trade.realizedPnL, trade.realizedPnLPercent,
        trade.duration, trade.exitReason, trade.timestamp
      ]);

      logger.info('📊 Trade performance recorded', {
        context: 'PerformanceTracker',
        data: {
          tradeId: trade.tradeId,
          symbol: trade.symbol,
          pnl: trade.realizedPnL.toFixed(2),
          pnlPercent: trade.realizedPnLPercent.toFixed(2)
        }
      });
    } catch (error) {
      logger.error('Failed to record trade performance', error, { 
        context: 'PerformanceTracker',
        data: { tradeId: trade.tradeId }
      });
    }
  }

  /**
   * Calculate overall performance metrics
   */
  async getPerformanceMetrics(days: number = 30): Promise<PerformanceMetrics> {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      const db = await getDb();
      const result = await db.execute(`
        SELECT * FROM trade_performance WHERE timestamp >= $1 ORDER BY timestamp ASC
      `, [cutoffTime]);

      if (!result.rows || result.rows.length === 0) {
        return this.getEmptyMetrics();
      }

      const trades = result.rows.map((row: any) => ({
        realizedPnL: parseFloat(row.realized_pnl as string),
        realizedPnLPercent: parseFloat(row.realized_pnl_percent as string),
        duration: parseInt(row.duration as string)
      }));

      const winningTrades = trades.filter((t: any) => t.realizedPnL > 0);
      const losingTrades = trades.filter((t: any) => t.realizedPnL < 0);

      const totalPnL = trades.reduce((sum: number, t: any) => sum + t.realizedPnL, 0);
      const totalWinAmount = winningTrades.reduce((sum: number, t: any) => sum + t.realizedPnL, 0);
      const totalLossAmount = Math.abs(losingTrades.reduce((sum: number, t: any) => sum + t.realizedPnL, 0));

      // Calculate max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let runningPnL = 0;

      for (const trade of trades) {
        runningPnL += trade.realizedPnL;
        if (runningPnL > peak) {
          peak = runningPnL;
        }
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      // Calculate Sharpe Ratio
      const sharpeRatio = this.calculateSharpeRatio(trades.map((t: any) => t.realizedPnLPercent));

      return {
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: (winningTrades.length / trades.length) * 100,
        avgWinAmount: winningTrades.length > 0 ? totalWinAmount / winningTrades.length : 0,
        avgLossAmount: losingTrades.length > 0 ? totalLossAmount / losingTrades.length : 0,
        avgProfitPerTrade: totalPnL / trades.length,
        profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount,
        totalPnL,
        totalPnLPercent: totalPnL, // Can be improved with initial capital tracking
        maxDrawdown,
        maxDrawdownPercent: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
        sharpeRatio,
        bestTrade: Math.max(...trades.map((t: any) => t.realizedPnL)),
        worstTrade: Math.min(...trades.map((t: any) => t.realizedPnL)),
        avgTradeDuration: trades.reduce((sum: number, t: any) => sum + t.duration, 0) / trades.length,
        lastUpdated: Date.now()
      };

    } catch (error) {
      logger.error('Failed to calculate performance metrics', error, { context: 'PerformanceTracker' });
      return this.getEmptyMetrics();
    }
  }

  /**
   * Get performance by symbol
   */
  async getSymbolPerformance(days: number = 30): Promise<SymbolPerformance[]> {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      const db = await getDb();
      const result = await db.execute(`
        SELECT 
          symbol,
          COUNT(*) as trades,
          SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as losses,
          SUM(realized_pnl) as total_pnl,
          AVG(realized_pnl) as avg_pnl
        FROM trade_performance
        WHERE timestamp >= $1
        GROUP BY symbol
        ORDER BY total_pnl DESC
      `, [cutoffTime]);

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row: any) => ({
        symbol: row.symbol as string,
        trades: parseInt(row.trades as string),
        wins: parseInt(row.wins as string),
        losses: parseInt(row.losses as string),
        winRate: (parseInt(row.wins as string) / parseInt(row.trades as string)) * 100,
        totalPnL: parseFloat(row.total_pnl as string),
        avgPnL: parseFloat(row.avg_pnl as string)
      }));

    } catch (error) {
      logger.error('Failed to get symbol performance', error, { context: 'PerformanceTracker' });
      return [];
    }
  }

  /**
   * Get daily performance for chart
   */
  async getDailyPerformance(days: number = 30): Promise<DailyPerformance[]> {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      const db = await getDb();
      const result = await db.execute(`
        SELECT 
          DATE(to_timestamp(timestamp / 1000)) as date,
          COUNT(*) as trades,
          SUM(realized_pnl) as pnl,
          CAST(SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as win_rate
        FROM trade_performance
        WHERE timestamp >= $1
        GROUP BY DATE(to_timestamp(timestamp / 1000))
        ORDER BY date ASC
      `, [cutoffTime]);

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row: any) => ({
        date: row.date as string,
        trades: parseInt(row.trades as string),
        pnl: parseFloat(row.pnl as string),
        winRate: parseFloat(row.win_rate as string)
      }));

    } catch (error) {
      logger.error('Failed to get daily performance', error, { context: 'PerformanceTracker' });
      return [];
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(limit: number = 20): Promise<TradePerformance[]> {
    try {
      const db = await getDb();
      const result = await db.execute(`
        SELECT * FROM trade_performance 
        ORDER BY timestamp DESC 
        LIMIT $1
      `, [limit]);

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row: any) => ({
        tradeId: row.trade_id as string,
        symbol: row.symbol as string,
        side: row.side as 'LONG' | 'SHORT',
        entryPrice: parseFloat(row.entry_price as string),
        exitPrice: parseFloat(row.exit_price as string),
        size: parseFloat(row.size as string),
        leverage: parseInt(row.leverage as string),
        realizedPnL: parseFloat(row.realized_pnl as string),
        realizedPnLPercent: parseFloat(row.realized_pnl_percent as string),
        duration: parseInt(row.duration as string),
        exitReason: row.exit_reason as string,
        timestamp: parseInt(row.timestamp as string)
      }));

    } catch (error) {
      logger.error('Failed to get recent trades', error, { context: 'PerformanceTracker' });
      return [];
    }
  }

  /**
   * Get performance summary for display
   */
  async getPerformanceSummary(days: number = 30): Promise<{
    metrics: PerformanceMetrics;
    symbolPerformance: SymbolPerformance[];
    dailyPerformance: DailyPerformance[];
    recentTrades: TradePerformance[];
  }> {
    try {
      const [metrics, symbolPerformance, dailyPerformance, recentTrades] = await Promise.all([
        this.getPerformanceMetrics(days),
        this.getSymbolPerformance(days),
        this.getDailyPerformance(days),
        this.getRecentTrades(20)
      ]);

      return {
        metrics,
        symbolPerformance,
        dailyPerformance,
        recentTrades
      };

    } catch (error) {
      logger.error('Failed to get performance summary', error, { context: 'PerformanceTracker' });
      throw error;
    }
  }

  /**
   * Calculate Sharpe Ratio (annualized)
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize assuming 365 trading days
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
  }

  /**
   * Get empty metrics object
   */
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWinAmount: 0,
      avgLossAmount: 0,
      avgProfitPerTrade: 0,
      profitFactor: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgTradeDuration: 0,
      lastUpdated: Date.now()
    };
  }

  /**
   * Check if trading is profitable
   */
  async isProfitable(minWinRate: number = 55, minTrades: number = 10): Promise<{
    isProfitable: boolean;
    reason: string;
    metrics: PerformanceMetrics;
  }> {
    try {
      const metrics = await this.getPerformanceMetrics(30);

      if (metrics.totalTrades < minTrades) {
        return {
          isProfitable: false,
          reason: `Not enough trades (${metrics.totalTrades}/${minTrades})`,
          metrics
        };
      }

      if (metrics.winRate < minWinRate) {
        return {
          isProfitable: false,
          reason: `Win rate too low (${metrics.winRate.toFixed(1)}% < ${minWinRate}%)`,
          metrics
        };
      }

      if (metrics.totalPnL < 0) {
        return {
          isProfitable: false,
          reason: `Negative P&L ($${metrics.totalPnL.toFixed(2)})`,
          metrics
        };
      }

      if (metrics.profitFactor < 1.5) {
        return {
          isProfitable: false,
          reason: `Low profit factor (${metrics.profitFactor.toFixed(2)} < 1.5)`,
          metrics
        };
      }

      return {
        isProfitable: true,
        reason: `System is profitable: ${metrics.winRate.toFixed(1)}% win rate, $${metrics.totalPnL.toFixed(2)} P&L`,
        metrics
      };

    } catch (error) {
      logger.error('Failed to check profitability', error, { context: 'PerformanceTracker' });
      throw error;
    }
  }
}

// Export singleton instance with globalThis for Next.js dev hot-reload persistence
const globalForPerformanceTracker = globalThis as typeof globalThis & {
  __performanceTracker?: PerformanceTracker;
};

if (!globalForPerformanceTracker.__performanceTracker) {
  globalForPerformanceTracker.__performanceTracker = new PerformanceTracker();
}

export const performanceTracker = globalForPerformanceTracker.__performanceTracker;

