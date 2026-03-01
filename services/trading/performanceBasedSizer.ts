/**
 * Performance-Based Position Sizer
 * 
 * Dynamically adjusts position sizing based on recent trading performance.
 * Key principles:
 * - Start conservative (small positions)
 * - Scale up after consecutive profitable trades
 * - Scale back down after losses
 * - Never risk too much regardless of streak
 */

import { logger } from '@/lib/logger';
import { createSingleton } from '@/lib/singleton';

// Dynamic import to avoid Next.js build issues
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

export interface PerformanceMetrics {
  consecutiveWins: number;
  consecutiveLosses: number;
  recentWinRate: number;       // Last N trades win rate
  totalProfitPercent: number;  // Sum of profitable trade %s
  totalLossPercent: number;    // Sum of losing trade %s
  avgWinPercent: number;       // Average win size
  avgLossPercent: number;      // Average loss size
  profitFactor: number;        // Gross profits / Gross losses
  currentStreak: 'winning' | 'losing' | 'neutral';
  streakLength: number;
  lastUpdated: number;
}

export interface SizingTier {
  name: string;
  positionSizePercent: number;
  maxLeverage: number;
  minConsecutiveWins: number;
  minWinRate: number;
  minProfitFactor: number;
}

// Position sizing tiers - start small, scale up with proven performance
const SIZING_TIERS: SizingTier[] = [
  {
    name: 'CONSERVATIVE',
    positionSizePercent: 1.0,  // 1% of balance
    maxLeverage: 10,
    minConsecutiveWins: 0,
    minWinRate: 0,
    minProfitFactor: 0
  },
  {
    name: 'CAUTIOUS',
    positionSizePercent: 1.5,  // 1.5% of balance
    maxLeverage: 12,
    minConsecutiveWins: 2,
    minWinRate: 0.50,
    minProfitFactor: 1.2
  },
  {
    name: 'MODERATE',
    positionSizePercent: 2.0,  // 2% of balance
    maxLeverage: 15,
    minConsecutiveWins: 3,
    minWinRate: 0.55,
    minProfitFactor: 1.5
  },
  {
    name: 'CONFIDENT',
    positionSizePercent: 2.5,  // 2.5% of balance
    maxLeverage: 18,
    minConsecutiveWins: 4,
    minWinRate: 0.60,
    minProfitFactor: 1.8
  },
  {
    name: 'AGGRESSIVE',
    positionSizePercent: 3.0,  // 3% of balance (max)
    maxLeverage: 20,
    minConsecutiveWins: 5,
    minWinRate: 0.65,
    minProfitFactor: 2.0
  }
];

// Safety limits
const SAFETY_LIMITS = {
  MAX_POSITION_SIZE_PERCENT: 3.0,   // Never more than 3% per trade
  MAX_LEVERAGE: 20,                  // Never more than 20x
  MIN_POSITION_SIZE_PERCENT: 0.5,   // Never less than 0.5%
  LOOKBACK_TRADES: 10,               // Look at last 10 trades for metrics
  LOSS_SCALE_BACK_FACTOR: 0.5,      // Cut position size by 50% after consecutive losses
  MAX_CONSECUTIVE_LOSSES_RESET: 3   // After 3 consecutive losses, reset to tier 0
};

class PerformanceBasedSizer {
  private metrics: PerformanceMetrics | null = null;
  private currentTier: number = 0;
  private lastTradeTimestamp: number = 0;

  /**
   * Calculate current performance metrics from recent trades
   */
  async calculateMetrics(): Promise<PerformanceMetrics> {
    try {
      const db = await getDb();
      
      // Get last N closed trades
      const result = await db.execute(`
        SELECT 
          pnl, 
          pnl_percent,
          exit_timestamp
        FROM trades
        WHERE exit_timestamp IS NOT NULL
        ORDER BY exit_timestamp DESC
        LIMIT $1
      `, [SAFETY_LIMITS.LOOKBACK_TRADES]);
      
      const trades = result.rows || [];
      
      if (trades.length === 0) {
        return this.getDefaultMetrics();
      }
      
      // Calculate metrics
      let wins = 0;
      let losses = 0;
      let totalWinPercent = 0;
      let totalLossPercent = 0;
      let consecutiveWins = 0;
      let consecutiveLosses = 0;
      let currentStreak: 'winning' | 'losing' | 'neutral' = 'neutral';
      let streakLength = 0;
      
      // Process trades (newest first)
      for (let i = 0; i < trades.length; i++) {
        const pnlPercent = parseFloat(trades[i].pnl_percent) || 0;
        const isWin = pnlPercent > 0;
        
        if (isWin) {
          wins++;
          totalWinPercent += pnlPercent;
        } else {
          losses++;
          totalLossPercent += Math.abs(pnlPercent);
        }
        
        // Track consecutive wins/losses from most recent trades
        if (i === 0) {
          currentStreak = isWin ? 'winning' : 'losing';
          streakLength = 1;
          if (isWin) consecutiveWins = 1;
          else consecutiveLosses = 1;
        } else {
          // Count consecutive from start
          if (currentStreak === 'winning' && isWin) {
            consecutiveWins++;
            streakLength++;
          } else if (currentStreak === 'losing' && !isWin) {
            consecutiveLosses++;
            streakLength++;
          }
        }
      }
      
      const recentWinRate = trades.length > 0 ? wins / trades.length : 0;
      const avgWinPercent = wins > 0 ? totalWinPercent / wins : 0;
      const avgLossPercent = losses > 0 ? totalLossPercent / losses : 0;
      const profitFactor = totalLossPercent > 0 ? totalWinPercent / totalLossPercent : (totalWinPercent > 0 ? 10 : 0);
      
      this.metrics = {
        consecutiveWins,
        consecutiveLosses,
        recentWinRate,
        totalProfitPercent: totalWinPercent,
        totalLossPercent,
        avgWinPercent,
        avgLossPercent,
        profitFactor,
        currentStreak,
        streakLength,
        lastUpdated: Date.now()
      };
      
      logger.info('[METRICS] Performance metrics calculated', {
        context: 'PerformanceBasedSizer',
        data: {
          trades: trades.length,
          winRate: (recentWinRate * 100).toFixed(1) + '%',
          consecutiveWins,
          consecutiveLosses,
          profitFactor: profitFactor.toFixed(2),
          currentStreak,
          streakLength
        }
      });
      
      return this.metrics;
    } catch (error) {
      logger.error('Failed to calculate performance metrics', error, {
        context: 'PerformanceBasedSizer'
      });
      return this.getDefaultMetrics();
    }
  }

  /**
   * Get the optimal position sizing based on current performance
   */
  async getOptimalSizing(): Promise<{
    tier: SizingTier;
    tierIndex: number;
    positionSizePercent: number;
    maxLeverage: number;
    reasoning: string;
    shouldSizeUp: boolean;
    shouldSizeDown: boolean;
  }> {
    // Refresh metrics
    const metrics = await this.calculateMetrics();
    
    // Find the highest tier we qualify for
    let qualifiedTier = 0;
    const reasons: string[] = [];
    
    for (let i = SIZING_TIERS.length - 1; i >= 0; i--) {
      const tier = SIZING_TIERS[i];
      
      if (
        metrics.consecutiveWins >= tier.minConsecutiveWins &&
        metrics.recentWinRate >= tier.minWinRate &&
        metrics.profitFactor >= tier.minProfitFactor
      ) {
        qualifiedTier = i;
        reasons.push(`Qualified for ${tier.name}: ${metrics.consecutiveWins} wins, ${(metrics.recentWinRate * 100).toFixed(0)}% WR, ${metrics.profitFactor.toFixed(1)} PF`);
        break;
      }
    }
    
    // IMPORTANT: Check for loss conditions that override tier
    let adjustedPositionSize = SIZING_TIERS[qualifiedTier].positionSizePercent;
    let adjustedLeverage = SIZING_TIERS[qualifiedTier].maxLeverage;
    
    // Scale back after consecutive losses
    if (metrics.consecutiveLosses >= SAFETY_LIMITS.MAX_CONSECUTIVE_LOSSES_RESET) {
      qualifiedTier = 0;
      reasons.push(`[WARN] Reset to CONSERVATIVE after ${metrics.consecutiveLosses} consecutive losses`);
    } else if (metrics.consecutiveLosses >= 2) {
      adjustedPositionSize *= SAFETY_LIMITS.LOSS_SCALE_BACK_FACTOR;
      adjustedLeverage = Math.max(5, adjustedLeverage - 5);
      reasons.push(`[SCALE DOWN] Scaled back ${(SAFETY_LIMITS.LOSS_SCALE_BACK_FACTOR * 100).toFixed(0)}% after ${metrics.consecutiveLosses} losses`);
    }
    
    // Apply safety limits
    adjustedPositionSize = Math.max(
      SAFETY_LIMITS.MIN_POSITION_SIZE_PERCENT,
      Math.min(SAFETY_LIMITS.MAX_POSITION_SIZE_PERCENT, adjustedPositionSize)
    );
    adjustedLeverage = Math.min(SAFETY_LIMITS.MAX_LEVERAGE, adjustedLeverage);
    
    // Determine if we should size up or down
    const shouldSizeUp = qualifiedTier > this.currentTier && metrics.consecutiveWins >= 2;
    const shouldSizeDown = qualifiedTier < this.currentTier || metrics.consecutiveLosses >= 2;
    
    // Update current tier
    const previousTier = this.currentTier;
    this.currentTier = qualifiedTier;
    
    if (shouldSizeUp) {
      logger.info('[SIZE UP] SIZING UP: Consecutive wins unlock larger position', {
        context: 'PerformanceBasedSizer',
        data: {
          previousTier: SIZING_TIERS[previousTier].name,
          newTier: SIZING_TIERS[qualifiedTier].name,
          consecutiveWins: metrics.consecutiveWins,
          positionSize: adjustedPositionSize.toFixed(1) + '%'
        }
      });
    } else if (shouldSizeDown) {
      logger.info('[SIZE DOWN] SIZING DOWN: Reducing risk after losses', {
        context: 'PerformanceBasedSizer',
        data: {
          previousTier: SIZING_TIERS[previousTier].name,
          newTier: SIZING_TIERS[qualifiedTier].name,
          consecutiveLosses: metrics.consecutiveLosses,
          positionSize: adjustedPositionSize.toFixed(1) + '%'
        }
      });
    }
    
    return {
      tier: SIZING_TIERS[qualifiedTier],
      tierIndex: qualifiedTier,
      positionSizePercent: adjustedPositionSize,
      maxLeverage: adjustedLeverage,
      reasoning: reasons.join(' | ') || 'Using default sizing',
      shouldSizeUp,
      shouldSizeDown
    };
  }

  /**
   * Record a new trade result and update sizing
   */
  async recordTradeResult(pnlPercent: number): Promise<void> {
    this.lastTradeTimestamp = Date.now();
    
    // Recalculate metrics after new trade
    await this.calculateMetrics();
    
    const sizing = await this.getOptimalSizing();
    
    logger.info('[UPDATE] Trade recorded, sizing updated', {
      context: 'PerformanceBasedSizer',
      data: {
        pnlPercent: pnlPercent.toFixed(2) + '%',
        newTier: sizing.tier.name,
        newPositionSize: sizing.positionSizePercent.toFixed(1) + '%',
        shouldSizeUp: sizing.shouldSizeUp,
        shouldSizeDown: sizing.shouldSizeDown
      }
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics | null {
    return this.metrics;
  }

  /**
   * Get current tier
   */
  getCurrentTier(): SizingTier {
    return SIZING_TIERS[this.currentTier];
  }

  /**
   * Get all tiers for display
   */
  getAllTiers(): SizingTier[] {
    return SIZING_TIERS;
  }

  /**
   * Get default metrics when no trades exist
   */
  private getDefaultMetrics(): PerformanceMetrics {
    return {
      consecutiveWins: 0,
      consecutiveLosses: 0,
      recentWinRate: 0,
      totalProfitPercent: 0,
      totalLossPercent: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      profitFactor: 0,
      currentStreak: 'neutral',
      streakLength: 0,
      lastUpdated: Date.now()
    };
  }
}

// Export singleton instance
export const performanceBasedSizer = createSingleton(
  'performanceBasedSizer',
  () => new PerformanceBasedSizer()
);

