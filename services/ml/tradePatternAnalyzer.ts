/**
 * Trade Pattern Analyzer
 * Analyzes trade history to identify successful and failure patterns
 * WORLD-CLASS: Reinforcement learning insights for improving trading decisions
 */

import { logger } from '@/lib/logger';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getTradesFromDb(params?: { limit?: number }) {
  const { getTrades } = await import('@/lib/db');
  return getTrades(params);
}

export interface TradePattern {
  signals: string[];
  marketRegime: string;
  confidence: number;
  score: number;
  pnlPercent: number;
  count: number;
  entryReason?: string;
  exitReason?: string;
}

export interface LessonsLearned {
  successfulPatterns: TradePattern[];
  failurePatterns: TradePattern[];
  insights: string[];
  averageWinRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWinPnL: number;
  averageLossPnL: number;
  riskRewardRatio: number;
}

class TradePatternAnalyzer {
  private cache: Map<number, LessonsLearned> = new Map();
  private cacheTimestamp: Map<number, number> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get lessons learned from trade history
   * WORLD-CLASS: Analyzes patterns to identify what works and what doesn't
   */
  async getLessonsLearned(days: number = 30): Promise<LessonsLearned> {
    const cacheKey = days;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    const cacheTime = this.cacheTimestamp.get(cacheKey);
    if (cached && cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
      logger.debug('Returning cached lessons learned', {
        context: 'TradePatternAnalyzer',
        data: { days, cacheAge: Date.now() - cacheTime }
      });
      return cached;
    }

    try {
      logger.info('Analyzing trade patterns', {
        context: 'TradePatternAnalyzer',
        data: { days }
      });

      // Get trades from database
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const allTrades = await getTradesFromDb({ limit: 10000 });
      const recentTrades = allTrades.filter(trade => {
        const tradeDate = new Date(trade.timestamp);
        return tradeDate >= cutoffDate;
      });

      if (recentTrades.length === 0) {
        logger.info('No trades found for pattern analysis', {
          context: 'TradePatternAnalyzer',
          data: { days }
        });
        
        const emptyResult: LessonsLearned = {
          successfulPatterns: [],
          failurePatterns: [],
          insights: ['No historical trades yet - system will learn from first trades'],
          averageWinRate: 0,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          averageWinPnL: 0,
          averageLossPnL: 0,
          riskRewardRatio: 0
        };
        
        this.cache.set(cacheKey, emptyResult);
        this.cacheTimestamp.set(cacheKey, Date.now());
        return emptyResult;
      }

      // Separate winning and losing trades
      const winningTrades = recentTrades.filter(t => t.pnl > 0);
      const losingTrades = recentTrades.filter(t => t.pnl < 0);
      
      // Calculate statistics
      const totalTrades = recentTrades.length;
      const wins = winningTrades.length;
      const losses = losingTrades.length;
      const averageWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      
      const averageWinPnL = wins > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / wins
        : 0;
      
      const averageLossPnL = losses > 0
        ? losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losses
        : 0;
      
      const riskRewardRatio = averageLossPnL !== 0
        ? Math.abs(averageWinPnL / averageLossPnL)
        : 0;

      // Analyze successful patterns
      const successfulPatterns = this.analyzePatterns(winningTrades, true);
      
      // Analyze failure patterns
      const failurePatterns = this.analyzePatterns(losingTrades, false);
      
      // Generate insights
      const insights = this.generateInsights({
        averageWinRate,
        averageWinPnL,
        averageLossPnL,
        riskRewardRatio,
        totalTrades,
        winningTrades: successfulPatterns,
        losingTrades: failurePatterns
      });

      const result: LessonsLearned = {
        successfulPatterns: successfulPatterns.slice(0, 10), // Top 10 patterns
        failurePatterns: failurePatterns.slice(0, 10), // Top 10 patterns
        insights,
        averageWinRate,
        totalTrades,
        winningTrades: wins,
        losingTrades: losses,
        averageWinPnL,
        averageLossPnL,
        riskRewardRatio
      };

      // Cache result
      this.cache.set(cacheKey, result);
      this.cacheTimestamp.set(cacheKey, Date.now());

      logger.info('Trade pattern analysis complete', {
        context: 'TradePatternAnalyzer',
        data: {
          days,
          totalTrades,
          winRate: `${averageWinRate.toFixed(1)}%`,
          successfulPatterns: successfulPatterns.length,
          failurePatterns: failurePatterns.length,
          insights: insights.length
        }
      });

      return result;
    } catch (error) {
      logger.error('Failed to analyze trade patterns', error, {
        context: 'TradePatternAnalyzer'
      });
      
      // Return empty result on error
      const emptyResult: LessonsLearned = {
        successfulPatterns: [],
        failurePatterns: [],
        insights: ['Failed to analyze trade history - continuing without RL insights'],
        averageWinRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        averageWinPnL: 0,
        averageLossPnL: 0,
        riskRewardRatio: 0
      };
      
      return emptyResult;
    }
  }

  /**
   * Analyze patterns from trades
   */
  private analyzePatterns(trades: any[], isSuccessful: boolean): TradePattern[] {
    const patternMap = new Map<string, TradePattern>();

    trades.forEach(trade => {
      // Extract signals (if available)
      // CRITICAL FIX: Handle both JSON string and object formats
      let signals: string[] = [];
      try {
        if (trade.entrySignals) {
          if (Array.isArray(trade.entrySignals)) {
            signals = trade.entrySignals;
          } else if (typeof trade.entrySignals === 'string') {
            // Try to parse as JSON string
            const parsed = JSON.parse(trade.entrySignals);
            signals = Array.isArray(parsed) ? parsed : (parsed.signals || Object.keys(parsed).slice(0, 5));
          } else if (typeof trade.entrySignals === 'object') {
            // Extract signal names from object keys
            signals = Object.keys(trade.entrySignals).slice(0, 10);
          }
        }
      } catch (parseError) {
        logger.debug('Failed to parse entrySignals, using empty array', {
          context: 'TradePatternAnalyzer',
          error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        signals = [];
      }
      
      // Create pattern key from signals and market regime
      // CRITICAL FIX: Normalize confidence (DB stores as decimal 0-1, but might be percentage 0-100)
      const marketRegime = trade.entryMarketRegime || 'unknown';
      let confidence = trade.entryConfidence || 0;
      // Normalize if stored as percentage (0-100) instead of decimal (0-1)
      if (confidence > 1 && confidence <= 100) {
        confidence = confidence / 100;
      }
      // Convert to percentage for pattern key (0-100)
      const confidencePercent = Math.floor(confidence * 100);
      const score = trade.entryScore || 0;
      
      // Group similar patterns
      // CRITICAL FIX: Use normalized confidence for pattern key
      const patternKey = `${marketRegime}_${Math.floor(confidencePercent / 10)}_${Math.floor(score / 10)}`;
      
      if (!patternMap.has(patternKey)) {
        patternMap.set(patternKey, {
          signals: signals.slice(0, 5), // Limit to top 5 signals for readability
          marketRegime,
          confidence: confidencePercent, // Store as percentage for consistency
          score,
          pnlPercent: 0,
          count: 0,
          entryReason: trade.entryReason || 'No reason recorded',
          exitReason: trade.exitReason || 'No exit reason recorded'
        });
      }
      
      const pattern = patternMap.get(patternKey)!;
      pattern.pnlPercent += trade.pnlPercent;
      pattern.count += 1;
    });

    // Calculate average P&L per pattern and sort
    const patterns = Array.from(patternMap.values()).map(pattern => ({
      ...pattern,
      pnlPercent: pattern.pnlPercent / pattern.count
    }));

    // Sort by P&L (descending for successful, ascending for failures)
    patterns.sort((a, b) => {
      if (isSuccessful) {
        return b.pnlPercent - a.pnlPercent; // Best wins first
      } else {
        return a.pnlPercent - b.pnlPercent; // Worst losses first
      }
    });

    return patterns;
  }

  /**
   * Generate insights from analysis
   */
  private generateInsights(data: {
    averageWinRate: number;
    averageWinPnL: number;
    averageLossPnL: number;
    riskRewardRatio: number;
    totalTrades: number;
    winningTrades: TradePattern[];
    losingTrades: TradePattern[];
  }): string[] {
    const insights: string[] = [];

    if (data.totalTrades === 0) {
      insights.push('No trades yet - system will learn from first trades');
      return insights;
    }

    // Win rate insights
    if (data.averageWinRate >= 60) {
      insights.push(`Strong win rate of ${data.averageWinRate.toFixed(1)}% - continue current strategy`);
    } else if (data.averageWinRate >= 45) {
      insights.push(`Moderate win rate of ${data.averageWinRate.toFixed(1)}% - consider refining entry signals`);
    } else if (data.averageWinRate > 0) {
      insights.push(`Low win rate of ${data.averageWinRate.toFixed(1)}% - need to improve entry criteria`);
    }

    // Risk-reward insights
    if (data.riskRewardRatio >= 2.5) {
      insights.push(`Excellent risk-reward ratio of ${data.riskRewardRatio.toFixed(2)}:1 - winners are large`);
    } else if (data.riskRewardRatio >= 1.5) {
      insights.push(`Good risk-reward ratio of ${data.riskRewardRatio.toFixed(2)}:1 - maintain discipline`);
    } else if (data.riskRewardRatio > 0) {
      insights.push(`Poor risk-reward ratio of ${data.riskRewardRatio.toFixed(2)}:1 - need larger winners or smaller losers`);
    }

    // Market regime insights
    if (data.winningTrades.length > 0) {
      const topRegime = data.winningTrades[0]?.marketRegime;
      if (topRegime) {
        insights.push(`Best performance in ${topRegime} market conditions`);
      }
    }

    if (data.losingTrades.length > 0) {
      const worstRegime = data.losingTrades[0]?.marketRegime;
      if (worstRegime) {
        insights.push(`Avoid trading in ${worstRegime} conditions - historically poor performance`);
      }
    }

    // Confidence insights
    if (data.winningTrades.length > 0) {
      const avgConfidence = data.winningTrades.reduce((sum, p) => sum + p.confidence, 0) / data.winningTrades.length;
      insights.push(`Average confidence for winners: ${avgConfidence.toFixed(1)}%`);
    }

    // Pattern frequency insights
    if (data.winningTrades.length > 0) {
      const mostCommonPattern = data.winningTrades.reduce((max, p) => p.count > max.count ? p : max, data.winningTrades[0]);
      insights.push(`Most successful pattern occurred ${mostCommonPattern.count} times with ${mostCommonPattern.pnlPercent.toFixed(2)}% avg profit`);
    }

    return insights;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamp.clear();
    logger.debug('Trade pattern analyzer cache cleared', {
      context: 'TradePatternAnalyzer'
    });
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForPatternAnalyzer = globalThis as typeof globalThis & {
  __tradePatternAnalyzer?: TradePatternAnalyzer;
};

if (!globalForPatternAnalyzer.__tradePatternAnalyzer) {
  globalForPatternAnalyzer.__tradePatternAnalyzer = new TradePatternAnalyzer();
}

export const tradePatternAnalyzer = globalForPatternAnalyzer.__tradePatternAnalyzer;

