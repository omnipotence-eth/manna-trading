/**
 * ML Milestone Tracker
 * 
 * Tracks progress toward having enough quality data to fine-tune a model.
 * Sets goals and milestones for data collection based on:
 * - Number of trades
 * - Win rate consistency
 * - Data quality metrics
 * - Profit factor
 */

import { logger } from '@/lib/logger';
import { createSingleton } from '@/lib/singleton';

// Dynamic import to avoid Next.js build issues
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

// Milestones for model fine-tuning readiness
export interface MLMilestone {
  id: string;
  name: string;
  description: string;
  requirement: number;
  current: number;
  completed: boolean;
  completedAt?: number;
  reward: string;  // What unlocks when this milestone is reached
}

// Data quality metrics
export interface DataQualityMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgTradeProfit: number;
  avgTradeLoss: number;
  totalProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
  consistencyScore: number;  // How consistent are the wins?
  dataCompleteness: number;  // % of trades with full feature data
}

// Readiness level for fine-tuning
export type ReadinessLevel = 
  | 'NOT_READY'      // Not enough data
  | 'COLLECTING'     // Actively collecting, need more trades
  | 'MINIMUM'        // Minimum viable dataset (can start experimenting)
  | 'GOOD'           // Good dataset (recommended for fine-tuning)
  | 'EXCELLENT';     // Excellent dataset (high-quality fine-tuning)

// Milestone definitions
const MILESTONES: Omit<MLMilestone, 'current' | 'completed' | 'completedAt'>[] = [
  {
    id: 'first_10_trades',
    name: '[MILESTONE] First 10 Trades',
    description: 'Complete your first 10 trades to establish baseline',
    requirement: 10,
    reward: 'Unlock basic performance metrics and sizing tier 1'
  },
  {
    id: 'first_profitable_streak',
    name: '[MILESTONE] First Win Streak',
    description: 'Achieve 3 consecutive profitable trades',
    requirement: 3,
    reward: 'Unlock CAUTIOUS sizing tier (1.5% positions)'
  },
  {
    id: '50_trades',
    name: '[MILESTONE] 50 Trade Dataset',
    description: 'Build a dataset of 50 trades for pattern analysis',
    requirement: 50,
    reward: 'Unlock pattern recognition and MODERATE sizing (2%)'
  },
  {
    id: 'positive_pf',
    name: '[MILESTONE] Profitable System',
    description: 'Achieve profit factor > 1.5 over 50+ trades',
    requirement: 1.5,
    reward: 'Unlock CONFIDENT sizing tier (2.5% positions)'
  },
  {
    id: '100_trades',
    name: '[MILESTONE] 100 Trade Milestone',
    description: 'MINIMUM viable dataset for model fine-tuning',
    requirement: 100,
    reward: 'Can begin experimental fine-tuning with caution'
  },
  {
    id: 'consistent_wins',
    name: '[MILESTONE] Consistent Performance',
    description: 'Maintain 55%+ win rate over 100+ trades',
    requirement: 55,
    reward: 'Unlock AGGRESSIVE sizing tier (3% positions)'
  },
  {
    id: '250_trades',
    name: '🏆 Quality Dataset',
    description: 'GOOD dataset for reliable model fine-tuning',
    requirement: 250,
    reward: 'Recommended for production fine-tuning'
  },
  {
    id: '500_trades',
    name: '👑 Expert Dataset',
    description: 'EXCELLENT dataset for high-quality fine-tuning',
    requirement: 500,
    reward: 'Premium fine-tuning with high confidence'
  },
  {
    id: 'pf_2_0',
    name: '[MILESTONE] System Mastery',
    description: 'Achieve profit factor > 2.0 with 250+ trades',
    requirement: 2.0,
    reward: 'Unlock advanced strategies and maximum sizing'
  }
];

class MLMilestoneTracker {
  private milestones: MLMilestone[] = [];
  private dataQuality: DataQualityMetrics | null = null;
  private lastUpdate: number = 0;
  private updateInterval = 60 * 1000; // Update every minute

  /**
   * Initialize and calculate all milestones
   */
  async initialize(): Promise<void> {
    await this.updateMilestones();
  }

  /**
   * Update all milestone progress
   */
  async updateMilestones(): Promise<MLMilestone[]> {
    try {
      // Get data quality metrics first
      this.dataQuality = await this.calculateDataQuality();
      
      // Calculate each milestone
      this.milestones = await Promise.all(
        MILESTONES.map(async (m) => {
          const current = await this.getMilestoneProgress(m.id);
          const wasCompleted = this.milestones.find(x => x.id === m.id)?.completed;
          const completed = current >= m.requirement;
          
          // Log when milestone is newly completed
          if (completed && !wasCompleted) {
            logger.info(`🏆 MILESTONE ACHIEVED: ${m.name}`, {
              context: 'MLMilestoneTracker',
              data: {
                milestone: m.name,
                reward: m.reward,
                current,
                requirement: m.requirement
              }
            });
          }
          
          return {
            ...m,
            current,
            completed,
            completedAt: completed ? Date.now() : undefined
          };
        })
      );
      
      this.lastUpdate = Date.now();
      
      return this.milestones;
    } catch (error) {
      logger.error('Failed to update milestones', error, {
        context: 'MLMilestoneTracker'
      });
      return this.milestones;
    }
  }

  /**
   * Get progress for a specific milestone
   */
  private async getMilestoneProgress(milestoneId: string): Promise<number> {
    if (!this.dataQuality) {
      this.dataQuality = await this.calculateDataQuality();
    }
    
    const dq = this.dataQuality;
    
    switch (milestoneId) {
      case 'first_10_trades':
        return dq.totalTrades;
      case 'first_profitable_streak':
        return await this.getMaxWinStreak();
      case '50_trades':
        return dq.totalTrades;
      case 'positive_pf':
        return dq.totalTrades >= 50 ? dq.profitFactor : 0;
      case '100_trades':
        return dq.totalTrades;
      case 'consistent_wins':
        return dq.totalTrades >= 100 ? dq.winRate * 100 : 0;
      case '250_trades':
        return dq.totalTrades;
      case '500_trades':
        return dq.totalTrades;
      case 'pf_2_0':
        return dq.totalTrades >= 250 ? dq.profitFactor : 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate data quality metrics from trade history
   */
  async calculateDataQuality(): Promise<DataQualityMetrics> {
    try {
      const db = await getDb();
      
      // Get all closed trades
      const result = await db.execute(`
        SELECT 
          pnl,
          pnl_percent,
          entry_price,
          exit_price,
          entry_confidence,
          entry_signals,
          timestamp,
          exit_timestamp
        FROM trades
        WHERE exit_timestamp IS NOT NULL
        ORDER BY exit_timestamp DESC
      `);
      
      const trades = result.rows || [];
      
      if (trades.length === 0) {
        return this.getDefaultMetrics();
      }
      
      // Calculate metrics
      let winningTrades = 0;
      let losingTrades = 0;
      let totalProfit = 0;
      let totalLoss = 0;
      let totalPnL = 0;
      let maxDrawdown = 0;
      let runningPnL = 0;
      let peak = 0;
      let tradesWithCompleteData = 0;
      
      const pnlPercentages: number[] = [];
      
      for (const trade of trades) {
        const pnl = parseFloat(trade.pnl) || 0;
        const pnlPercent = parseFloat(trade.pnl_percent) || 0;
        
        if (pnl > 0) {
          winningTrades++;
          totalProfit += pnl;
        } else {
          losingTrades++;
          totalLoss += Math.abs(pnl);
        }
        
        totalPnL += pnl;
        pnlPercentages.push(pnlPercent);
        
        // Track drawdown
        runningPnL += pnl;
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        
        // Check data completeness
        if (trade.entry_confidence && trade.entry_signals && trade.entry_price && trade.exit_price) {
          tradesWithCompleteData++;
        }
      }
      
      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? 10 : 0);
      const avgTradeProfit = winningTrades > 0 ? totalProfit / winningTrades : 0;
      const avgTradeLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
      const dataCompleteness = totalTrades > 0 ? tradesWithCompleteData / totalTrades : 0;
      
      // Calculate Sharpe Ratio (simplified)
      const avgReturn = pnlPercentages.length > 0 
        ? pnlPercentages.reduce((a, b) => a + b, 0) / pnlPercentages.length 
        : 0;
      const stdDev = pnlPercentages.length > 1
        ? Math.sqrt(pnlPercentages.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) / (pnlPercentages.length - 1))
        : 1;
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
      
      // Calculate consistency score (lower variance = higher consistency)
      const consistencyScore = Math.max(0, Math.min(100, 
        100 - (stdDev * 10) + (winRate * 50)
      ));
      
      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        profitFactor,
        avgTradeProfit,
        avgTradeLoss,
        totalProfit: totalPnL,
        maxDrawdown,
        sharpeRatio,
        consistencyScore,
        dataCompleteness
      };
    } catch (error) {
      logger.error('Failed to calculate data quality', error, {
        context: 'MLMilestoneTracker'
      });
      return this.getDefaultMetrics();
    }
  }

  /**
   * Get maximum consecutive win streak
   */
  private async getMaxWinStreak(): Promise<number> {
    try {
      const db = await getDb();
      
      const result = await db.execute(`
        SELECT pnl_percent
        FROM trades
        WHERE exit_timestamp IS NOT NULL
        ORDER BY exit_timestamp ASC
      `);
      
      const trades = result.rows || [];
      let maxStreak = 0;
      let currentStreak = 0;
      
      for (const trade of trades) {
        const pnl = parseFloat(trade.pnl_percent) || 0;
        if (pnl > 0) {
          currentStreak++;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      }
      
      return maxStreak;
    } catch {
      return 0;
    }
  }

  /**
   * Get readiness level for fine-tuning
   */
  getReadinessLevel(): {
    level: ReadinessLevel;
    progress: number;
    nextMilestone: MLMilestone | null;
    recommendation: string;
  } {
    const dq = this.dataQuality;
    if (!dq) {
      return {
        level: 'NOT_READY',
        progress: 0,
        nextMilestone: this.milestones[0] || null,
        recommendation: 'Start trading to collect data'
      };
    }
    
    let level: ReadinessLevel;
    let progress: number;
    let recommendation: string;
    
    if (dq.totalTrades < 50) {
      level = 'NOT_READY';
      progress = (dq.totalTrades / 50) * 100;
      recommendation = `Need ${50 - dq.totalTrades} more trades to start pattern analysis`;
    } else if (dq.totalTrades < 100) {
      level = 'COLLECTING';
      progress = (dq.totalTrades / 100) * 100;
      recommendation = `Need ${100 - dq.totalTrades} more trades for minimum viable dataset`;
    } else if (dq.totalTrades < 250 || dq.profitFactor < 1.3) {
      level = 'MINIMUM';
      progress = Math.min(100, (dq.totalTrades / 250) * 50 + (dq.profitFactor / 1.5) * 50);
      recommendation = dq.profitFactor < 1.3 
        ? 'Improve win rate and profit factor before fine-tuning'
        : `Collect ${250 - dq.totalTrades} more trades for better results`;
    } else if (dq.totalTrades < 500 || dq.profitFactor < 1.8) {
      level = 'GOOD';
      progress = Math.min(100, (dq.totalTrades / 500) * 50 + (dq.profitFactor / 2.0) * 50);
      recommendation = '[OK] Ready for production fine-tuning. More data = better model.';
    } else {
      level = 'EXCELLENT';
      progress = 100;
      recommendation = '🏆 Excellent dataset! Ready for high-quality fine-tuning.';
    }
    
    // Find next incomplete milestone
    const nextMilestone = this.milestones.find(m => !m.completed) || null;
    
    return { level, progress, nextMilestone, recommendation };
  }

  /**
   * Get all milestones with current progress
   */
  getMilestones(): MLMilestone[] {
    return this.milestones;
  }

  /**
   * Get data quality metrics
   */
  getDataQuality(): DataQualityMetrics | null {
    return this.dataQuality;
  }

  /**
   * Get summary for display
   */
  async getSummary(): Promise<{
    readiness: {
      level: ReadinessLevel;
      progress: number;
      nextMilestone: MLMilestone | null;
      recommendation: string;
    };
    quality: DataQualityMetrics;
    milestones: MLMilestone[];
    completedCount: number;
    totalMilestones: number;
  }> {
    await this.updateMilestones();
    
    return {
      readiness: this.getReadinessLevel(),
      quality: this.dataQuality || this.getDefaultMetrics(),
      milestones: this.milestones,
      completedCount: this.milestones.filter(m => m.completed).length,
      totalMilestones: this.milestones.length
    };
  }

  /**
   * Get default metrics when no trades exist
   */
  private getDefaultMetrics(): DataQualityMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      profitFactor: 0,
      avgTradeProfit: 0,
      avgTradeLoss: 0,
      totalProfit: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      consistencyScore: 0,
      dataCompleteness: 0
    };
  }
}

// Export singleton
export const mlMilestoneTracker = createSingleton(
  'mlMilestoneTracker',
  () => new MLMilestoneTracker()
);

