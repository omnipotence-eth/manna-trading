/**
 * GOAL TRACKER - Enterprise Growth Target System
 * 
 * Tracks progress towards specific financial goals with:
 * - Real-time progress monitoring
 * - Adaptive strategy recommendations
 * - Risk-adjusted position sizing
 * - Time-based urgency calculations
 * 
 * Current Goal: $60 → $100 in 24 hours (66.67% growth)
 */

import { createSingleton } from '@/lib/singleton';
import { logger } from '@/lib/logger';

export interface TradingGoal {
  id: string;
  name: string;
  startBalance: number;
  targetBalance: number;
  startTime: Date;
  deadline: Date;
  currentBalance: number;
  status: 'active' | 'achieved' | 'failed' | 'paused';
  trades: GoalTrade[];
  milestones: Milestone[];
}

export interface GoalTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  size: number;
  pnl?: number;
  timestamp: Date;
  status: 'open' | 'closed';
}

export interface Milestone {
  target: number;
  label: string;
  achieved: boolean;
  achievedAt?: Date;
}

export interface StrategyRecommendation {
  urgency: 'low' | 'medium' | 'high' | 'critical';
  positionSizeMultiplier: number;
  minConfidence: number;
  minRiskReward: number;
  maxConcurrentPositions: number;
  preferredTimeframes: string[];
  message: string;
  tactics: string[];
}

class GoalTrackerService {
  private currentGoal: TradingGoal | null = null;
  private updateCallbacks: Set<(goal: TradingGoal) => void> = new Set();

  constructor() {
    // Initialize with the $60 → $100 goal
    this.setGoal({
      startBalance: 60,
      targetBalance: 100,
      durationHours: 24
    });
  }

  /**
   * Set a new trading goal
   */
  setGoal(params: {
    startBalance: number;
    targetBalance: number;
    durationHours: number;
    name?: string;
  }): TradingGoal {
    const now = new Date();
    const deadline = new Date(now.getTime() + params.durationHours * 60 * 60 * 1000);
    
    // Calculate milestones (25%, 50%, 75%, 100%)
    const growthNeeded = params.targetBalance - params.startBalance;
    const milestones: Milestone[] = [
      { target: params.startBalance + growthNeeded * 0.25, label: '25%', achieved: false },
      { target: params.startBalance + growthNeeded * 0.50, label: '50%', achieved: false },
      { target: params.startBalance + growthNeeded * 0.75, label: '75%', achieved: false },
      { target: params.targetBalance, label: '100% [TARGET]', achieved: false },
    ];

    this.currentGoal = {
      id: `goal_${Date.now()}`,
      name: params.name || `$${params.startBalance} → $${params.targetBalance}`,
      startBalance: params.startBalance,
      targetBalance: params.targetBalance,
      startTime: now,
      deadline,
      currentBalance: params.startBalance,
      status: 'active',
      trades: [],
      milestones,
    };

    this.notifyUpdate();
    return this.currentGoal;
  }

  /**
   * Update current balance and check milestones
   */
  updateBalance(newBalance: number): void {
    if (!this.currentGoal) return;
    
    this.currentGoal.currentBalance = newBalance;
    
    // Check milestones
    for (const milestone of this.currentGoal.milestones) {
      if (!milestone.achieved && newBalance >= milestone.target) {
        milestone.achieved = true;
        milestone.achievedAt = new Date();
        logger.info(`[SUCCESS] Milestone achieved: ${milestone.label} ($${milestone.target.toFixed(2)})`, {
          context: 'GoalTracker',
          milestone: milestone.label,
          target: milestone.target
        });
      }
    }
    
    // Check if goal achieved
    if (newBalance >= this.currentGoal.targetBalance) {
      this.currentGoal.status = 'achieved';
      logger.info(`[SUCCESS] GOAL ACHIEVED! $${this.currentGoal.startBalance} → $${newBalance.toFixed(2)}`, {
        context: 'GoalTracker',
        startBalance: this.currentGoal.startBalance,
        finalBalance: newBalance,
        targetBalance: this.currentGoal.targetBalance
      });
    }
    
    // Check if deadline passed
    if (new Date() > this.currentGoal.deadline && this.currentGoal.status === 'active') {
      this.currentGoal.status = newBalance >= this.currentGoal.targetBalance ? 'achieved' : 'failed';
    }
    
    this.notifyUpdate();
  }

  /**
   * Record a trade for the goal
   */
  recordTrade(trade: Omit<GoalTrade, 'id'>): void {
    if (!this.currentGoal) return;
    
    const newTrade: GoalTrade = {
      ...trade,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    
    this.currentGoal.trades.push(newTrade);
    this.notifyUpdate();
  }

  /**
   * Get strategy recommendation based on current progress
   */
  getStrategyRecommendation(): StrategyRecommendation {
    if (!this.currentGoal) {
      return this.getDefaultStrategy();
    }

    const { currentBalance, targetBalance, startBalance, deadline, startTime } = this.currentGoal;
    
    // Calculate progress metrics
    const progressPercent = ((currentBalance - startBalance) / (targetBalance - startBalance)) * 100;
    const remainingGrowth = ((targetBalance - currentBalance) / currentBalance) * 100;
    const timeElapsedMs = Date.now() - startTime.getTime();
    const totalTimeMs = deadline.getTime() - startTime.getTime();
    const timeRemainingMs = deadline.getTime() - Date.now();
    const timeProgressPercent = (timeElapsedMs / totalTimeMs) * 100;
    
    // Calculate expected vs actual progress
    const expectedProgress = timeProgressPercent;
    const progressDelta = progressPercent - expectedProgress;
    
    // Determine urgency
    let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (progressDelta < -20) urgency = 'critical';
    else if (progressDelta < -10) urgency = 'high';
    else if (progressDelta < 0) urgency = 'medium';
    
    // Hours remaining
    const hoursRemaining = timeRemainingMs / (60 * 60 * 1000);
    
    // Required hourly growth rate
    const requiredHourlyGrowth = remainingGrowth / Math.max(hoursRemaining, 0.1);
    
    // Generate strategy based on urgency
    if (urgency === 'critical') {
      return {
        urgency: 'critical',
        positionSizeMultiplier: 1.5,
        minConfidence: 0.55,
        minRiskReward: 2.0,
        maxConcurrentPositions: 4,
        preferredTimeframes: ['1m', '5m', '15m'],
        message: `[CRITICAL] Need ${remainingGrowth.toFixed(1)}% in ${hoursRemaining.toFixed(1)}h (${requiredHourlyGrowth.toFixed(1)}%/h)`,
        tactics: [
          'Increase position frequency',
          'Focus on high-momentum breakouts',
          'Use tighter stops with higher leverage',
          'Trade multiple coins simultaneously',
        ]
      };
    } else if (urgency === 'high') {
      return {
        urgency: 'high',
        positionSizeMultiplier: 1.25,
        minConfidence: 0.60,
        minRiskReward: 2.5,
        maxConcurrentPositions: 3,
        preferredTimeframes: ['5m', '15m', '1h'],
        message: `[HIGH] Need ${remainingGrowth.toFixed(1)}% growth in ${hoursRemaining.toFixed(1)} hours`,
        tactics: [
          'Prioritize high-probability setups',
          'Increase trade frequency slightly',
          'Look for momentum continuation trades',
        ]
      };
    } else if (urgency === 'medium') {
      return {
        urgency: 'medium',
        positionSizeMultiplier: 1.0,
        minConfidence: 0.65,
        minRiskReward: 3.0,
        maxConcurrentPositions: 3,
        preferredTimeframes: ['15m', '1h', '4h'],
        message: `[ON TRACK] ${progressPercent.toFixed(1)}% complete, ${hoursRemaining.toFixed(1)}h remaining`,
        tactics: [
          'Maintain current strategy',
          'Focus on quality over quantity',
          'Protect profits with trailing stops',
        ]
      };
    } else {
      return {
        urgency: 'low',
        positionSizeMultiplier: 0.8,
        minConfidence: 0.70,
        minRiskReward: 3.5,
        maxConcurrentPositions: 2,
        preferredTimeframes: ['1h', '4h'],
        message: `[AHEAD] ${progressPercent.toFixed(1)}% complete - protect gains!`,
        tactics: [
          'Reduce position sizes to protect profits',
          'Only take A+ setups',
          'Consider partial profit taking',
        ]
      };
    }
  }

  private getDefaultStrategy(): StrategyRecommendation {
    return {
      urgency: 'medium',
      positionSizeMultiplier: 1.0,
      minConfidence: 0.65,
      minRiskReward: 3.0,
      maxConcurrentPositions: 3,
      preferredTimeframes: ['15m', '1h'],
      message: 'No active goal set',
      tactics: ['Set a trading goal to get personalized recommendations']
    };
  }

  /**
   * Get current goal status
   */
  getGoalStatus(): {
    goal: TradingGoal | null;
    progress: number;
    remainingGrowth: number;
    hoursRemaining: number;
    pnlToday: number;
    winRate: number;
    recommendation: StrategyRecommendation;
  } {
    if (!this.currentGoal) {
      return {
        goal: null,
        progress: 0,
        remainingGrowth: 0,
        hoursRemaining: 0,
        pnlToday: 0,
        winRate: 0,
        recommendation: this.getDefaultStrategy()
      };
    }

    const { currentBalance, targetBalance, startBalance, deadline, trades } = this.currentGoal;
    
    const progress = ((currentBalance - startBalance) / (targetBalance - startBalance)) * 100;
    const remainingGrowth = ((targetBalance - currentBalance) / currentBalance) * 100;
    const hoursRemaining = Math.max(0, (deadline.getTime() - Date.now()) / (60 * 60 * 1000));
    
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);
    const pnlToday = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 
      ? (closedTrades.filter(t => (t.pnl || 0) > 0).length / closedTrades.length) * 100 
      : 0;

    return {
      goal: this.currentGoal,
      progress: Math.min(100, Math.max(0, progress)),
      remainingGrowth,
      hoursRemaining,
      pnlToday,
      winRate,
      recommendation: this.getStrategyRecommendation()
    };
  }

  /**
   * Subscribe to goal updates
   */
  subscribe(callback: (goal: TradingGoal) => void): () => void {
    this.updateCallbacks.add(callback);
    if (this.currentGoal) {
      callback(this.currentGoal);
    }
    return () => this.updateCallbacks.delete(callback);
  }

  private notifyUpdate(): void {
    if (this.currentGoal) {
      for (const callback of this.updateCallbacks) {
        callback(this.currentGoal);
      }
    }
  }

  /**
   * Reset to default goal ($60 → $100)
   */
  resetToDefaultGoal(): TradingGoal {
    return this.setGoal({
      startBalance: 60,
      targetBalance: 100,
      durationHours: 24,
      name: '24h Challenge: $60 → $100'
    });
  }
}

export const goalTracker = createSingleton('goalTracker', () => new GoalTrackerService());

