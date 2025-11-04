/**
 * RL Parameter Optimizer
 * Uses Q-learning to optimize trading parameters based on trade outcomes
 * Learns optimal confidence thresholds, R:R ratios, and position sizes
 */

import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

export interface TradingParameters {
  confidenceThreshold: number; // 0.55 - 0.75
  rrRatio: number; // 1.5 - 3.0
  positionSizePercent: number; // 0.6 - 1.2
  stopLossPercent: number; // 2.5 - 4.0
  takeProfitPercent: number; // 6.0 - 12.0
}

export interface ParameterState {
  marketRegime: 'trending' | 'volatile' | 'choppy' | 'mean-reverting';
  accountSize: 'micro' | 'small' | 'medium' | 'large';
  recentWinRate: number; // Last 10 trades win rate
  recentVolatility: number; // Market volatility
}

export interface RLState {
  state: ParameterState;
  action: TradingParameters;
  reward: number;
  timestamp: number;
}

export class RLParameterOptimizer {
  private qTable: Map<string, Map<string, number>> = new Map();
  private learningRate = 0.1;
  private discountFactor = 0.9;
  private explorationRate = 0.2; // Start with 20% exploration
  private minExplorationRate = 0.05; // Minimum 5% exploration
  private explorationDecay = 0.99; // Decay exploration over time
  
  // Parameter ranges - AGGRESSIVE CRYPTO TRADING
  // High confidence required (50-70%) but willing to take strong setups
  private readonly CONFIDENCE_RANGE = [0.50, 0.55, 0.60, 0.65, 0.70];
  // Higher R:R ratios for crypto volatility (2.0-4.0x targets)
  private readonly RR_RANGE = [2.0, 2.5, 3.0, 3.5, 4.0];
  // Larger position sizes with leverage (1.0-2.0% of balance)
  private readonly POSITION_SIZE_RANGE = [1.0, 1.2, 1.5, 1.8, 2.0];
  // Tighter stops for quick exits (1.5-3.0% ATR-based)
  private readonly STOP_LOSS_RANGE = [1.5, 2.0, 2.5, 3.0];
  
  private stateHistory: RLState[] = [];
  private maxHistorySize = 1000;

  /**
   * Get current optimal parameters based on RL learning
   */
  getOptimalParameters(state: ParameterState): TradingParameters {
    const stateKey = this.getStateKey(state);
    
    // If we have Q-values for this state, use them
    if (this.qTable.has(stateKey)) {
      const qValues = this.qTable.get(stateKey)!;
      
      // Choose best action (exploitation) or random action (exploration)
      if (Math.random() > this.explorationRate) {
        // Exploitation: Choose action with highest Q-value
        const bestAction = Array.from(qValues.entries())
          .sort((a, b) => b[1] - a[1])[0];
        
        if (bestAction) {
          return this.parseActionKey(bestAction[0]);
        }
      }
    }
    
    // Exploration or default: Return conservative parameters
    return this.getDefaultParameters(state);
  }

  /**
   * Learn from trade outcome
   */
  async learnFromTrade(
    state: ParameterState,
    action: TradingParameters,
    reward: number
  ): Promise<void> {
    try {
      const stateKey = this.getStateKey(state);
      const actionKey = this.getActionKey(action);
      
      // Initialize Q-table if needed
      if (!this.qTable.has(stateKey)) {
        this.qTable.set(stateKey, new Map());
      }
      
      const qValues = this.qTable.get(stateKey)!;
      
      // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
      const currentQ = qValues.get(actionKey) || 0;
      
      // Find max Q-value for next state (simplified: use current state for now)
      const maxNextQ = Math.max(...Array.from(qValues.values()), 0);
      
      // Update Q-value
      const newQ = currentQ + this.learningRate * (reward + this.discountFactor * maxNextQ - currentQ);
      qValues.set(actionKey, newQ);
      
      // Store state for analysis
      this.stateHistory.push({
        state,
        action,
        reward,
        timestamp: Date.now()
      });
      
      // Keep history size manageable
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      // Decay exploration rate
      this.explorationRate = Math.max(
        this.minExplorationRate,
        this.explorationRate * this.explorationDecay
      );
      
      logger.info('🧠 RL Parameter Optimizer learned from trade', {
        context: 'RLParameterOptimizer',
        data: {
          state: stateKey,
          action: actionKey,
          reward: reward.toFixed(2),
          newQValue: newQ.toFixed(2),
          explorationRate: (this.explorationRate * 100).toFixed(1) + '%'
        }
      });
      
      // Persist Q-table to database periodically
      if (this.stateHistory.length % 10 === 0) {
        await this.persistQTable();
      }
    } catch (error) {
      logger.error('Failed to learn from trade', error as Error, {
        context: 'RLParameterOptimizer'
      });
    }
  }

  /**
   * Calculate reward from trade outcome
   */
  calculateReward(trade: {
    pnl: number;
    pnlPercent: number;
    confidence: number;
    duration: number;
    riskPercent: number;
  }): number {
    // Multi-factor reward function
    let reward = 0;
    
    // 1. P&L reward (primary factor)
    reward += trade.pnlPercent * 10; // Scale P&L (1% = 10 points)
    
    // 2. Risk-adjusted reward
    const riskAdjustedReturn = trade.pnlPercent / trade.riskPercent;
    reward += riskAdjustedReturn * 5; // Risk-adjusted returns bonus
    
    // 3. Confidence accuracy bonus
    // If high confidence led to profit, reward more
    if (trade.pnl > 0 && trade.confidence > 0.65) {
      reward += 2; // Confidence accuracy bonus
    }
    
    // 4. Duration penalty (longer trades = more risk)
    // Prefer shorter trades for better capital efficiency
    const durationHours = trade.duration / (1000 * 60 * 60);
    if (durationHours > 24) {
      reward -= 1; // Penalty for trades > 24 hours
    }
    
    // 5. Win consistency bonus
    // Recent wins boost reward
    const recentWins = this.getRecentWinRate();
    if (recentWins > 0.6 && trade.pnl > 0) {
      reward += 1; // Consistency bonus
    }
    
    return reward;
  }

  /**
   * Get recent win rate
   */
  private getRecentWinRate(): number {
    if (this.stateHistory.length === 0) return 0;
    
    const recentTrades = this.stateHistory.slice(-10);
    const wins = recentTrades.filter(s => s.reward > 0).length;
    return wins / recentTrades.length;
  }

  /**
   * Get default parameters for state
   */
  private getDefaultParameters(state: ParameterState): TradingParameters {
    // AGGRESSIVE CRYPTO TRADING: High confidence but maximized leverage
    // Responsible trading with 55-60% base confidence, tight stops, high R:R
    // Crypto volatility allows for larger position sizes with proper risk management
    let confidenceThreshold = 0.55; // Base: 55% confidence (high quality setups)
    let rrRatio = 3.0; // Target 3:1 reward:risk (crypto volatility supports this)
    let positionSizePercent = 1.5; // 1.5% of balance per trade (with 15x leverage = 22.5% exposure)
    let stopLossPercent = 2.0; // Tight 2% stops (quick exit on wrong trades)
    
    // Adjust based on account size
    if (state.accountSize === 'micro') {
      confidenceThreshold = 0.50; // Slightly lower for micro (50%) - need to grow
      rrRatio = 3.5; // Higher R:R for micro accounts (aggressive growth)
      positionSizePercent = 2.0; // 2% per trade (with leverage = aggressive)
      stopLossPercent = 1.5; // Very tight stops (protect small balance)
    } else if (state.accountSize === 'small') {
      confidenceThreshold = 0.52; // 52% for small accounts
      rrRatio = 3.2;
      positionSizePercent = 1.8;
      stopLossPercent = 1.8;
    } else if (state.accountSize === 'medium') {
      confidenceThreshold = 0.55; // Standard 55%
      rrRatio = 3.0;
      positionSizePercent = 1.5;
      stopLossPercent = 2.0;
    } else if (state.accountSize === 'large') {
      confidenceThreshold = 0.60; // Higher confidence for large accounts (protect capital)
      rrRatio = 2.5;
      positionSizePercent = 1.2;
      stopLossPercent = 2.5;
    }
    
    // Adjust based on market regime - CRYPTO IS VOLATILE!
    if (state.marketRegime === 'volatile') {
      // Volatile: Tighter stops, higher R:R, take quick profits
      stopLossPercent = stopLossPercent * 0.75; // 25% tighter stops
      rrRatio = 4.0; // 4:1 R:R (big moves in volatility)
      positionSizePercent = positionSizePercent * 0.8; // 20% smaller size
    } else if (state.marketRegime === 'trending') {
      // Trending: Standard stops, good R:R, ride the trend
      rrRatio = 3.0; // 3:1 R:R in trends
      stopLossPercent = stopLossPercent; // Normal stops
      positionSizePercent = positionSizePercent * 1.1; // 10% larger (trends are reliable)
    } else if (state.marketRegime === 'choppy') {
      // Choppy: Wider stops, lower R:R, smaller size
      stopLossPercent = stopLossPercent * 1.2; // 20% wider stops
      rrRatio = 2.5; // 2.5:1 R:R (harder to get big moves)
      positionSizePercent = positionSizePercent * 0.7; // 30% smaller size
      confidenceThreshold = Math.min(0.70, confidenceThreshold + 0.05); // Higher confidence required
    }
    
    // Adjust based on recent win rate - ADAPTIVE LEARNING
    if (state.recentWinRate > 0.70) {
      // Hot streak: Be more aggressive (winning = good market fit)
      confidenceThreshold = Math.max(0.50, confidenceThreshold - 0.03); // 3% lower confidence OK
      positionSizePercent = Math.min(2.0, positionSizePercent * 1.15); // 15% larger positions
    } else if (state.recentWinRate < 0.50) {
      // Cold streak: Be more selective (losing = bad market fit)
      confidenceThreshold = Math.min(0.70, confidenceThreshold + 0.05); // 5% higher confidence required
      positionSizePercent = Math.max(1.0, positionSizePercent * 0.85); // 15% smaller positions
    }
    
    const takeProfitPercent = stopLossPercent * rrRatio;
    
    return {
      confidenceThreshold,
      rrRatio,
      positionSizePercent,
      stopLossPercent,
      takeProfitPercent
    };
  }

  /**
   * Convert state to key for Q-table
   */
  private getStateKey(state: ParameterState): string {
    // Discretize continuous values
    const winRateBucket = Math.floor(state.recentWinRate * 10) / 10; // 0.0, 0.1, 0.2, ...
    const volatilityBucket = state.recentVolatility < 10 ? 'low' : 
                            state.recentVolatility < 20 ? 'med' : 'high';
    
    return `${state.marketRegime}_${state.accountSize}_${winRateBucket}_${volatilityBucket}`;
  }

  /**
   * Convert action to key for Q-table
   */
  private getActionKey(action: TradingParameters): string {
    // Round to nearest discrete values
    const conf = this.CONFIDENCE_RANGE.reduce((prev, curr) => 
      Math.abs(curr - action.confidenceThreshold) < Math.abs(prev - action.confidenceThreshold) ? curr : prev
    );
    const rr = this.RR_RANGE.reduce((prev, curr) => 
      Math.abs(curr - action.rrRatio) < Math.abs(prev - action.rrRatio) ? curr : prev
    );
    const pos = this.POSITION_SIZE_RANGE.reduce((prev, curr) => 
      Math.abs(curr - action.positionSizePercent) < Math.abs(prev - action.positionSizePercent) ? curr : prev
    );
    
    return `${conf}_${rr}_${pos}`;
  }

  /**
   * Parse action key back to parameters
   */
  private parseActionKey(key: string): TradingParameters {
    const [conf, rr, pos] = key.split('_').map(Number);
    const stopLoss = 3.0; // Default
    const takeProfit = stopLoss * rr;
    
    return {
      confidenceThreshold: conf,
      rrRatio: rr,
      positionSizePercent: pos,
      stopLossPercent: stopLoss,
      takeProfitPercent: takeProfit
    };
  }

  /**
   * Detect current market regime
   */
  async detectMarketRegime(): Promise<'trending' | 'volatile' | 'choppy' | 'mean-reverting'> {
    try {
      // Analyze recent trades and market conditions
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      const result = await db.execute(`
        SELECT 
          AVG(pnl_percent) as avg_pnl,
          STDDEV(pnl_percent) as volatility,
          COUNT(*) as trade_count
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND timestamp >= $1
      `, [cutoffDate.toISOString()]);
      
      if (result.rows.length === 0 || parseInt(result.rows[0].trade_count) < 5) {
        return 'trending'; // Default
      }
      
      const avgPnL = parseFloat(result.rows[0].avg_pnl) || 0;
      const volatility = parseFloat(result.rows[0].volatility) || 0;
      
      // Classify regime based on statistics
      if (volatility > 5) {
        return 'volatile';
      } else if (avgPnL > 1 && volatility < 3) {
        return 'trending';
      } else if (Math.abs(avgPnL) < 0.5) {
        return 'choppy';
      } else {
        return 'mean-reverting';
      }
    } catch (error) {
      logger.error('Failed to detect market regime', error as Error, {
        context: 'RLParameterOptimizer'
      });
      return 'trending'; // Default
    }
  }

  /**
   * Classify account size
   */
  classifyAccountSize(balance: number): 'micro' | 'small' | 'medium' | 'large' {
    if (balance < 100) return 'micro';
    if (balance < 500) return 'small';
    if (balance < 2000) return 'medium';
    return 'large';
  }

  /**
   * Get recent win rate from trades
   */
  async getRecentWinRateFromTrades(days: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const result = await db.execute(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as wins
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND timestamp >= $1
      `, [cutoffDate.toISOString()]);
      
      if (result.rows.length === 0) return 0.5; // Default 50%
      
      const total = parseInt(result.rows[0].total) || 0;
      const wins = parseInt(result.rows[0].wins) || 0;
      
      return total > 0 ? wins / total : 0.5;
    } catch (error) {
      logger.error('Failed to get recent win rate', error as Error, {
        context: 'RLParameterOptimizer'
      });
      return 0.5;
    }
  }

  /**
   * Get recent market volatility
   */
  async getRecentVolatility(days: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const result = await db.execute(`
        SELECT STDDEV(pnl_percent) as volatility
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND timestamp >= $1
      `, [cutoffDate.toISOString()]);
      
      return parseFloat(result.rows[0]?.volatility) || 5.0; // Default 5%
    } catch (error) {
      logger.error('Failed to get recent volatility', error as Error, {
        context: 'RLParameterOptimizer'
      });
      return 5.0;
    }
  }

  /**
   * Persist Q-table to database
   */
  private async persistQTable(): Promise<void> {
    try {
      // Note: Q-table is stored in-memory for MVP. Future enhancement: persist to database for long-term learning across restarts.
      // For now, Q-table is in-memory and rebuilds from trade history
      logger.debug('Q-table updated (in-memory)', {
        context: 'RLParameterOptimizer',
        data: {
          states: this.qTable.size,
          totalEntries: Array.from(this.qTable.values()).reduce((sum, map) => sum + map.size, 0)
        }
      });
    } catch (error) {
      logger.error('Failed to persist Q-table', error as Error, {
        context: 'RLParameterOptimizer'
      });
    }
  }

  /**
   * Get Q-table statistics
   */
  getStatistics(): {
    totalStates: number;
    totalActions: number;
    explorationRate: number;
    averageReward: number;
  } {
    const totalActions = Array.from(this.qTable.values()).reduce(
      (sum, map) => sum + map.size, 0
    );
    
    const averageReward = this.stateHistory.length > 0
      ? this.stateHistory.reduce((sum, s) => sum + s.reward, 0) / this.stateHistory.length
      : 0;
    
    return {
      totalStates: this.qTable.size,
      totalActions,
      explorationRate: this.explorationRate,
      averageReward
    };
  }

  /**
   * Reset learning (start fresh)
   */
  reset(): void {
    this.qTable.clear();
    this.stateHistory = [];
    this.explorationRate = 0.2;
    logger.info('RL Parameter Optimizer reset', {
      context: 'RLParameterOptimizer'
    });
  }
}

// Export singleton instance
const globalForRLParameterOptimizer = globalThis as unknown as {
  rlParameterOptimizer: RLParameterOptimizer | undefined;
};

export const rlParameterOptimizer = globalForRLParameterOptimizer.rlParameterOptimizer || new RLParameterOptimizer();

if (process.env.NODE_ENV !== 'production') {
  globalForRLParameterOptimizer.rlParameterOptimizer = rlParameterOptimizer;
}

