/**
 * Trade Analyzer Service
 * Analyzes recent trades to identify why they're not profitable
 * Provides actionable insights for improving trade quality
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getTradesFromDb(params?: { limit?: number; days?: number }) {
  const { getTrades } = await import('@/lib/db');
  const trades = await getTrades({ limit: params?.limit || 1000 });
  
  // Filter by days if specified
  if (params?.days) {
    const cutoffTime = Date.now() - (params.days * 24 * 60 * 60 * 1000);
    return trades.filter(trade => {
      const tradeTime = new Date(trade.timestamp).getTime();
      return tradeTime >= cutoffTime;
    });
  }
  
  return trades;
}

export interface TradeAnalysis {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  issues: string[];
  recommendations: string[];
  topLosingPatterns: Array<{
    pattern: string;
    count: number;
    avgLoss: number;
  }>;
  topWinningPatterns: Array<{
    pattern: string;
    count: number;
    avgWin: number;
  }>;
}

class TradeAnalyzer {
  /**
   * Analyze recent trades to identify issues
   */
  async analyzeRecentTrades(days: number = 7): Promise<TradeAnalysis> {
    try {
      const trades = await getTradesFromDb({ days, limit: 1000 });
      
      if (trades.length === 0) {
        return {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalPnL: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 0,
          issues: ['No trades found in the last ' + days + ' days'],
          recommendations: ['System needs to start trading to generate data'],
          topLosingPatterns: [],
          topWinningPatterns: []
        };
      }
      
      const wins = trades.filter(t => t.pnl > 0);
      const losses = trades.filter(t => t.pnl < 0);
      
      const winRate = trades.length > 0 ? wins.length / trades.length : 0;
      const avgWin = wins.length > 0 
        ? wins.reduce((sum, t) => sum + t.pnlPercent, 0) / wins.length 
        : 0;
      const avgLoss = losses.length > 0 
        ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPercent, 0) / losses.length)
        : 0;
      const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
      const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      
      const issues: string[] = [];
      const recommendations: string[] = [];
      
      // Analyze issues
      if (winRate < 0.5) {
        issues.push(`Low win rate: ${(winRate * 100).toFixed(1)}% (target: 50%+)`);
        recommendations.push('Increase confidence threshold to 70%+ (currently may be too low)');
        recommendations.push('Require multi-timeframe confirmation for all trades');
      }
      
      if (profitFactor < 1.5) {
        issues.push(`Low profit factor: ${profitFactor.toFixed(2)} (target: 1.5+)`);
        recommendations.push('Tighten R:R requirements to 3:1 minimum');
        recommendations.push('Improve take-profit execution (may be exiting too early)');
      }
      
      if (avgLoss > avgWin * 0.8) {
        issues.push(`Average loss too large: ${avgLoss.toFixed(2)}% vs avg win ${avgWin.toFixed(2)}%`);
        recommendations.push('Tighten stop-loss placement (may be too wide)');
        recommendations.push('Reduce position size to limit loss impact');
      }
      
      if (totalPnL < 0) {
        issues.push(`Negative total P&L: $${totalPnL.toFixed(2)}`);
        recommendations.push('Pause trading until system is optimized');
        recommendations.push('Review and tighten all quality gates');
      }
      
      // Analyze patterns
      const losingPatterns = new Map<string, { count: number; totalLoss: number }>();
      const winningPatterns = new Map<string, { count: number; totalWin: number }>();
      
      for (const trade of trades) {
        const exitReason = trade.exitReason || 'unknown';
        if (trade.pnl < 0) {
          const existing = losingPatterns.get(exitReason) || { count: 0, totalLoss: 0 };
          losingPatterns.set(exitReason, {
            count: existing.count + 1,
            totalLoss: existing.totalLoss + Math.abs(trade.pnlPercent)
          });
        } else {
          const existing = winningPatterns.get(exitReason) || { count: 0, totalWin: 0 };
          winningPatterns.set(exitReason, {
            count: existing.count + 1,
            totalWin: existing.totalWin + trade.pnlPercent
          });
        }
      }
      
      const topLosingPatterns = Array.from(losingPatterns.entries())
        .map(([pattern, data]) => ({
          pattern,
          count: data.count,
          avgLoss: data.totalLoss / data.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      const topWinningPatterns = Array.from(winningPatterns.entries())
        .map(([pattern, data]) => ({
          pattern,
          count: data.count,
          avgWin: data.totalWin / data.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      logger.info('Trade analysis completed', {
        context: 'TradeAnalyzer',
        data: {
          totalTrades: trades.length,
          winRate: (winRate * 100).toFixed(1) + '%',
          profitFactor: profitFactor.toFixed(2),
          totalPnL: totalPnL.toFixed(2),
          issues: issues.length,
          recommendations: recommendations.length
        }
      });
      
      return {
        totalTrades: trades.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate,
        totalPnL,
        avgWin,
        avgLoss,
        profitFactor,
        issues,
        recommendations,
        topLosingPatterns,
        topWinningPatterns
      };
    } catch (error) {
      logger.error('Failed to analyze trades', error, { context: 'TradeAnalyzer' });
      throw error;
    }
  }
}

// Export singleton instance
const globalForTradeAnalyzer = globalThis as typeof globalThis & {
  __tradeAnalyzer?: TradeAnalyzer;
};

if (!globalForTradeAnalyzer.__tradeAnalyzer) {
  globalForTradeAnalyzer.__tradeAnalyzer = new TradeAnalyzer();
}

export const tradeAnalyzer = globalForTradeAnalyzer.__tradeAnalyzer;
export default tradeAnalyzer;

