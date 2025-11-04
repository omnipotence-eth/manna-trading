/**
 * Trade Pattern Analyzer
 * Analyzes trade history to extract successful and failed patterns
 * Feeds patterns back to LLM as "lessons learned" for improved decision-making
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export interface TradePattern {
  signals: string[];
  marketRegime: string;
  confidence: number;
  score: number;
  pnl: number;
  pnlPercent: number;
  symbol: string;
  entryReason: string;
  exitReason: string;
  count: number; // How many times this pattern occurred
}

export interface LessonsLearned {
  successfulPatterns: TradePattern[];
  failurePatterns: TradePattern[];
  insights: string[];
  averageWinRate: number;
  averageLoss: number;
  averageWin: number;
}

export class TradePatternAnalyzer {
  private cache: Map<string, LessonsLearned> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Analyze successful trades and extract patterns
   */
  async getSuccessfulPatterns(days: number = 30): Promise<TradePattern[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await db.execute(`
        SELECT 
          entry_signals,
          entry_market_regime,
          entry_confidence,
          entry_score,
          pnl,
          pnl_percent,
          symbol,
          entry_reason,
          exit_reason,
          COUNT(*) as pattern_count
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND pnl > 0
          AND timestamp >= $1
        GROUP BY 
          entry_signals,
          entry_market_regime,
          entry_confidence,
          entry_score,
          pnl,
          pnl_percent,
          symbol,
          entry_reason,
          exit_reason
        ORDER BY AVG(pnl_percent) DESC, pattern_count DESC
        LIMIT 10
      `, [cutoffDate.toISOString()]);

      const patterns: TradePattern[] = result.rows.map((row: any) => ({
        signals: row.entry_signals ? JSON.parse(row.entry_signals) : [],
        marketRegime: row.entry_market_regime || 'unknown',
        confidence: row.entry_confidence ? Math.round(row.entry_confidence * 100) : 0,
        score: row.entry_score || 0,
        pnl: parseFloat(row.pnl) || 0,
        pnlPercent: parseFloat(row.pnl_percent) || 0,
        symbol: row.symbol || 'unknown',
        entryReason: row.entry_reason || 'no reason',
        exitReason: row.exit_reason || 'no reason',
        count: parseInt(row.pattern_count) || 1
      }));

      logger.info(`✅ Analyzed ${patterns.length} successful trade patterns`, {
        context: 'TradePatternAnalyzer',
        data: {
          days,
          patternsFound: patterns.length,
          topPatternPnL: patterns[0]?.pnlPercent || 0
        }
      });

      return patterns;
    } catch (error) {
      logger.error('Failed to analyze successful patterns', error as Error, {
        context: 'TradePatternAnalyzer'
      });
      return [];
    }
  }

  /**
   * Analyze failed trades and extract failure patterns
   */
  async getFailurePatterns(days: number = 30): Promise<TradePattern[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await db.execute(`
        SELECT 
          entry_signals,
          entry_market_regime,
          entry_confidence,
          entry_score,
          pnl,
          pnl_percent,
          symbol,
          entry_reason,
          exit_reason,
          COUNT(*) as pattern_count
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND pnl < 0
          AND timestamp >= $1
        GROUP BY 
          entry_signals,
          entry_market_regime,
          entry_confidence,
          entry_score,
          pnl,
          pnl_percent,
          symbol,
          entry_reason,
          exit_reason
        ORDER BY AVG(pnl_percent) ASC, pattern_count DESC
        LIMIT 10
      `, [cutoffDate.toISOString()]);

      const patterns: TradePattern[] = result.rows.map((row: any) => ({
        signals: row.entry_signals ? JSON.parse(row.entry_signals) : [],
        marketRegime: row.entry_market_regime || 'unknown',
        confidence: row.entry_confidence ? Math.round(row.entry_confidence * 100) : 0,
        score: row.entry_score || 0,
        pnl: parseFloat(row.pnl) || 0,
        pnlPercent: parseFloat(row.pnl_percent) || 0,
        symbol: row.symbol || 'unknown',
        entryReason: row.entry_reason || 'no reason',
        exitReason: row.exit_reason || 'no reason',
        count: parseInt(row.pattern_count) || 1
      }));

      logger.info(`⚠️ Analyzed ${patterns.length} failure trade patterns`, {
        context: 'TradePatternAnalyzer',
        data: {
          days,
          patternsFound: patterns.length,
          worstPatternPnL: patterns[0]?.pnlPercent || 0
        }
      });

      return patterns;
    } catch (error) {
      logger.error('Failed to analyze failure patterns', error as Error, {
        context: 'TradePatternAnalyzer'
      });
      return [];
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(days: number = 30): Promise<{
    averageWinRate: number;
    averageLoss: number;
    averageWin: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await db.execute(`
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_trades,
          AVG(CASE WHEN pnl > 0 THEN pnl_percent END) as avg_win,
          AVG(CASE WHEN pnl < 0 THEN pnl_percent END) as avg_loss
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND timestamp >= $1
      `, [cutoffDate.toISOString()]);

      const row = result.rows[0];
      const totalTrades = parseInt(row.total_trades) || 0;
      const winningTrades = parseInt(row.winning_trades) || 0;
      const losingTrades = parseInt(row.losing_trades) || 0;
      const averageWinRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const averageWin = parseFloat(row.avg_win) || 0;
      const averageLoss = parseFloat(row.avg_loss) || 0;

      return {
        averageWinRate,
        averageLoss,
        averageWin,
        totalTrades,
        winningTrades,
        losingTrades
      };
    } catch (error) {
      logger.error('Failed to get performance metrics', error as Error, {
        context: 'TradePatternAnalyzer'
      });
      return {
        averageWinRate: 0,
        averageLoss: 0,
        averageWin: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0
      };
    }
  }

  /**
   * Generate insights from patterns
   */
  private generateInsights(
    successfulPatterns: TradePattern[],
    failurePatterns: TradePattern[],
    metrics: { averageWinRate: number; averageLoss: number; averageWin: number }
  ): string[] {
    const insights: string[] = [];

    // Successful pattern insights
    if (successfulPatterns.length > 0) {
      const topPattern = successfulPatterns[0];
      insights.push(
        `✅ Best performing pattern: ${topPattern.signals.slice(0, 3).join(', ')} in ${topPattern.marketRegime} market (${topPattern.confidence}% confidence) → +${topPattern.pnlPercent.toFixed(2)}% average`
      );
    }

    // Failure pattern insights
    if (failurePatterns.length > 0) {
      const worstPattern = failurePatterns[0];
      insights.push(
        `❌ Worst performing pattern: ${worstPattern.signals.slice(0, 3).join(', ')} in ${worstPattern.marketRegime} market (${worstPattern.confidence}% confidence) → ${worstPattern.pnlPercent.toFixed(2)}% average loss`
      );
    }

    // Market regime insights
    const regimeSuccess = new Map<string, number>();
    successfulPatterns.forEach(p => {
      regimeSuccess.set(p.marketRegime, (regimeSuccess.get(p.marketRegime) || 0) + p.pnlPercent);
    });
    const bestRegime = Array.from(regimeSuccess.entries())
      .sort((a, b) => b[1] - a[1])[0];
    if (bestRegime) {
      insights.push(`📈 Most profitable market regime: ${bestRegime[0]} (${bestRegime[1].toFixed(2)}% total)`);
    }

    // Confidence insights
    const avgConfidenceWin = successfulPatterns.reduce((sum, p) => sum + p.confidence, 0) / (successfulPatterns.length || 1);
    const avgConfidenceLoss = failurePatterns.reduce((sum, p) => sum + p.confidence, 0) / (failurePatterns.length || 1);
    if (avgConfidenceWin > avgConfidenceLoss) {
      insights.push(`🎯 Higher confidence (${avgConfidenceWin.toFixed(0)}% vs ${avgConfidenceLoss.toFixed(0)}%) correlates with better outcomes`);
    }

    // R:R insights
    if (metrics.averageWin > 0 && metrics.averageLoss < 0) {
      const rr = Math.abs(metrics.averageWin / metrics.averageLoss);
      insights.push(`💰 Risk/Reward ratio: ${rr.toFixed(2)}:1 (Win: ${metrics.averageWin.toFixed(2)}%, Loss: ${Math.abs(metrics.averageLoss).toFixed(2)}%)`);
    }

    return insights;
  }

  /**
   * Get comprehensive lessons learned from recent trades
   */
  async getLessonsLearned(days: number = 30): Promise<LessonsLearned> {
    const cacheKey = `lessons_${days}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      const cacheAge = Date.now() - (cached as any).cachedAt;
      if (cacheAge < this.cacheTimeout) {
        return cached;
      }
    }

    try {
      logger.info('🔍 Analyzing trade patterns for lessons learned', {
        context: 'TradePatternAnalyzer',
        data: { days }
      });

      const [successfulPatterns, failurePatterns, metrics] = await Promise.all([
        this.getSuccessfulPatterns(days),
        this.getFailurePatterns(days),
        this.getPerformanceMetrics(days)
      ]);

      const insights = this.generateInsights(successfulPatterns, failurePatterns, metrics);

      const lessonsLearned: LessonsLearned = {
        successfulPatterns: successfulPatterns.slice(0, 5), // Top 5 patterns
        failurePatterns: failurePatterns.slice(0, 5), // Top 5 failures
        insights,
        averageWinRate: metrics.averageWinRate,
        averageLoss: metrics.averageLoss,
        averageWin: metrics.averageWin
      };

      // Cache result
      (lessonsLearned as any).cachedAt = Date.now();
      this.cache.set(cacheKey, lessonsLearned);

      logger.info('✅ Generated lessons learned from trade history', {
        context: 'TradePatternAnalyzer',
        data: {
          successfulPatterns: successfulPatterns.length,
          failurePatterns: failurePatterns.length,
          insights: insights.length,
          winRate: metrics.averageWinRate.toFixed(1) + '%'
        }
      });

      return lessonsLearned;
    } catch (error) {
      logger.error('Failed to get lessons learned', error as Error, {
        context: 'TradePatternAnalyzer'
      });
      
      // Return empty lessons learned on error
      return {
        successfulPatterns: [],
        failurePatterns: [],
        insights: [],
        averageWinRate: 0,
        averageLoss: 0,
        averageWin: 0
      };
    }
  }

  /**
   * Clear cache (useful after trades complete)
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared', { context: 'TradePatternAnalyzer' });
  }
}

// Export singleton instance
const globalForTradePatternAnalyzer = globalThis as unknown as {
  tradePatternAnalyzer: TradePatternAnalyzer | undefined;
};

export const tradePatternAnalyzer = globalForTradePatternAnalyzer.tradePatternAnalyzer || new TradePatternAnalyzer();

if (process.env.NODE_ENV !== 'production') {
  globalForTradePatternAnalyzer.tradePatternAnalyzer = tradePatternAnalyzer;
}

