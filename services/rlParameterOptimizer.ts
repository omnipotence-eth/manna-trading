/**
 * RL Parameter Optimizer
 * Reinforcement learning system for optimizing trading parameters
 * WORLD-CLASS: Adaptive parameter tuning based on trade outcomes
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';

// Dynamic import to prevent Next.js from analyzing pg during build
async function getTradesFromDb(filters?: { limit?: number }) {
  const { getTrades } = await import('@/lib/db');
  return getTrades(filters);
}

export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'choppy';
export type AccountSize = 'micro' | 'small' | 'medium' | 'large';

export interface ParameterState {
  marketRegime: MarketRegime;
  accountSize: AccountSize;
  recentWinRate: number; // 0-100
  recentVolatility: number; // 0-100
}

export interface TradingParameters {
  confidenceThreshold: number; // 0-1
  rrRatio: number; // Risk-reward ratio
  positionSizePercent: number; // 0-100
  stopLossPercent: number; // 0-100
  takeProfitPercent: number; // 0-100
}

interface QTableEntry {
  qValue: number;
  visits: number;
  lastUpdated: number;
}

class RLParameterOptimizer {
  // Q-learning table: state -> action -> Q-value
  private qTable: Map<string, Map<string, QTableEntry>> = new Map();
  private learningRate = 0.1;
  private discountFactor = 0.9;
  private explorationRate = 0.3; // Start with 30% exploration
  private minExplorationRate = 0.05; // Minimum 5% exploration
  private explorationDecay = 0.995; // Decay exploration rate over time

  /**
   * Detect current market regime
   */
  async detectMarketRegime(): Promise<MarketRegime> {
    try {
      // Get recent price data to determine regime
      const recentTrades = await getTradesFromDb({ limit: 50 });
      
      if (recentTrades.length < 10) {
        return 'trending'; // Default to trending if not enough data
      }

      // Calculate volatility from recent trades
      const pnlValues = recentTrades.map(t => Math.abs(t.pnlPercent));
      const avgVolatility = pnlValues.reduce((sum, v) => sum + v, 0) / pnlValues.length;
      
      // Simple regime detection based on volatility
      if (avgVolatility > 10) {
        return 'volatile';
      } else if (avgVolatility > 5) {
        return 'choppy';
      } else if (avgVolatility > 2) {
        return 'trending';
      } else {
        return 'ranging';
      }
    } catch (error) {
      logger.warn('Failed to detect market regime, defaulting to trending', {
        context: 'RLParameterOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });
      return 'trending';
    }
  }

  /**
   * Classify account size
   */
  classifyAccountSize(balance: number): AccountSize {
    if (balance < 100) return 'micro';
    if (balance < 500) return 'small';
    if (balance < 5000) return 'medium';
    return 'large';
  }

  /**
   * Get recent win rate from trades
   */
  async getRecentWinRateFromTrades(days: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const allTrades = await getTradesFromDb({ limit: 1000 });
      const recentTrades = allTrades.filter(trade => {
        const tradeDate = new Date(trade.timestamp);
        return tradeDate >= cutoffDate;
      });

      if (recentTrades.length === 0) {
        return 50; // Default 50% if no trades
      }

      const wins = recentTrades.filter(t => t.pnl > 0).length;
      return (wins / recentTrades.length) * 100;
    } catch (error) {
      logger.warn('Failed to calculate win rate, defaulting to 50%', {
        context: 'RLParameterOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });
      return 50;
    }
  }

  /**
   * Get recent volatility
   */
  async getRecentVolatility(days: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const allTrades = await getTradesFromDb({ limit: 1000 });
      const recentTrades = allTrades.filter(trade => {
        const tradeDate = new Date(trade.timestamp);
        return tradeDate >= cutoffDate;
      });

      if (recentTrades.length === 0) {
        return 5; // Default volatility
      }

      const pnlPercentages = recentTrades.map(t => Math.abs(t.pnlPercent));
      const avgVolatility = pnlPercentages.reduce((sum, v) => sum + v, 0) / pnlPercentages.length;
      
      // Normalize to 0-100 scale
      return Math.min(100, avgVolatility * 10);
    } catch (error) {
      logger.warn('Failed to calculate volatility, defaulting to 5%', {
        context: 'RLParameterOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });
      return 5;
    }
  }

  /**
   * Get optimal parameters for current state
   */
  getOptimalParameters(state: ParameterState): TradingParameters {
    const stateKey = this.getStateKey(state);
    
    // Get Q-values for this state
    const stateQValues = this.qTable.get(stateKey);
    
    // If no learning yet, use default parameters
    if (!stateQValues || stateQValues.size === 0) {
      return this.getDefaultParameters(state);
    }

    // Explore or exploit
    const shouldExplore = Math.random() < this.explorationRate;
    
    if (shouldExplore) {
      // Random exploration
      return this.getRandomParameters(state);
    } else {
      // Exploit: choose best action
      let bestAction = '';
      let bestQValue = -Infinity;
      
      for (const [action, entry] of stateQValues.entries()) {
        if (entry.qValue > bestQValue) {
          bestQValue = entry.qValue;
          bestAction = action;
        }
      }
      
      if (bestAction) {
        return this.parseAction(bestAction);
      }
    }

    // Fallback to default
    return this.getDefaultParameters(state);
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
    // Base reward from P&L
    let reward = trade.pnlPercent;
    
    // Bonus for quick wins (time efficiency)
    if (trade.pnlPercent > 0 && trade.duration < 300000) { // < 5 minutes
      reward += 2;
    }
    
    // Penalty for slow losses (capital tied up)
    if (trade.pnlPercent < 0 && trade.duration > 1800000) { // > 30 minutes
      reward -= 5;
    }
    
    // Penalty for high confidence on losses (overconfidence)
    if (trade.pnlPercent < 0 && trade.confidence > 0.8) {
      reward -= 3;
    }
    
    // Bonus for high confidence on wins (good judgment)
    if (trade.pnlPercent > 0 && trade.confidence > 0.7) {
      reward += 1;
    }
    
    // Risk-adjusted reward
    const riskAdjustedReward = reward / (trade.riskPercent || 1);
    
    return riskAdjustedReward;
  }

  /**
   * Learn from trade outcome (Q-learning update)
   */
  async learnFromTrade(
    state: ParameterState,
    action: TradingParameters,
    reward: number
  ): Promise<void> {
    try {
      const stateKey = this.getStateKey(state);
      const actionKey = this.getActionKey(action);
      
      // Initialize state if needed
      if (!this.qTable.has(stateKey)) {
        this.qTable.set(stateKey, new Map());
      }
      
      const stateQValues = this.qTable.get(stateKey)!;
      
      // Get current Q-value
      const currentEntry = stateQValues.get(actionKey) || {
        qValue: 0,
        visits: 0,
        lastUpdated: Date.now()
      };
      
      // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
      // Simplified: Q(s,a) = Q(s,a) + α[r - Q(s,a)]
      const newQValue = currentEntry.qValue + this.learningRate * (reward - currentEntry.qValue);
      
      // Update Q-table
      stateQValues.set(actionKey, {
        qValue: newQValue,
        visits: currentEntry.visits + 1,
        lastUpdated: Date.now()
      });
      
      // Decay exploration rate
      this.explorationRate = Math.max(
        this.minExplorationRate,
        this.explorationRate * this.explorationDecay
      );
      
      logger.debug('RL learned from trade', {
        context: 'RLParameterOptimizer',
        data: {
          state: stateKey,
          reward: reward.toFixed(2),
          newQValue: newQValue.toFixed(2),
          explorationRate: (this.explorationRate * 100).toFixed(1) + '%'
        }
      });
    } catch (error) {
      logger.error('Failed to learn from trade', error, {
        context: 'RLParameterOptimizer'
      });
    }
  }

  /**
   * Get statistics about RL system
   */
  getStatistics(): {
    totalStates: number;
    totalActions: number;
    explorationRate: number;
    averageQValue: number;
  } {
    let totalActions = 0;
    let totalQValue = 0;
    
    for (const stateQValues of this.qTable.values()) {
      totalActions += stateQValues.size;
      for (const entry of stateQValues.values()) {
        totalQValue += entry.qValue;
      }
    }
    
    const averageQValue = totalActions > 0 ? totalQValue / totalActions : 0;
    
    return {
      totalStates: this.qTable.size,
      totalActions,
      explorationRate: this.explorationRate,
      averageQValue
    };
  }

  // Helper methods

  private getStateKey(state: ParameterState): string {
    return `${state.marketRegime}_${state.accountSize}_${Math.floor(state.recentWinRate / 10)}_${Math.floor(state.recentVolatility / 10)}`;
  }

  private getActionKey(action: TradingParameters): string {
    return `conf${Math.floor(action.confidenceThreshold * 10)}_rr${Math.floor(action.rrRatio)}_size${Math.floor(action.positionSizePercent)}_sl${Math.floor(action.stopLossPercent)}_tp${Math.floor(action.takeProfitPercent)}`;
  }

  private parseAction(actionKey: string): TradingParameters {
    const parts = actionKey.split('_');
    const conf = parseInt(parts[0].replace('conf', '')) / 10;
    const rr = parseInt(parts[1].replace('rr', ''));
    const size = parseInt(parts[2].replace('size', ''));
    const sl = parseInt(parts[3].replace('sl', ''));
    const tp = parseInt(parts[4].replace('tp', ''));
    
    return {
      confidenceThreshold: conf,
      rrRatio: rr,
      positionSizePercent: size,
      stopLossPercent: sl,
      takeProfitPercent: tp
    };
  }

  private getDefaultParameters(state: ParameterState): TradingParameters {
    // ADAPTIVE PARAMETERS for all market types
    // Goal: Find profitable opportunities in ANY market condition while staying safe
    
    // Base parameters - adaptive to market type
    let confidenceThreshold = 0.50; // LOWERED: Start at 50% - we need to trade to learn
    let stopLossPercent = 3.0;
    let takeProfitPercent = 6.0;
    let positionSizePercent = 5.0;
    
    // MARKET REGIME ADJUSTMENTS
    switch (state.marketRegime) {
      case 'trending':
        // Trend following: Let winners run
        confidenceThreshold = 0.55;
        stopLossPercent = 3.5;
        takeProfitPercent = 9.0; // 2.5:1 R:R for trends
        break;
        
      case 'ranging':
        // CRITICAL: Range trading strategy - lower confidence OK for mean reversion
        // Range-bound = predictable support/resistance bounces
        confidenceThreshold = 0.45; // LOWER for ranges - they're actually predictable!
        stopLossPercent = 2.5; // Tighter SL since ranges are bounded
        takeProfitPercent = 5.0; // Smaller targets in ranges
        break;
        
      case 'volatile':
        // High volatility: Be more selective, wider stops
        confidenceThreshold = 0.60;
        stopLossPercent = 5.0;
        takeProfitPercent = 10.0;
        break;
        
      case 'choppy':
        // Choppy: Most dangerous - require higher confidence
        confidenceThreshold = 0.55;
        stopLossPercent = 3.0;
        takeProfitPercent = 4.5; // 1.5:1 - quick exits in chop
        break;
    }
    
    // ACCOUNT SIZE ADJUSTMENTS - Position sizing, not confidence!
    switch (state.accountSize) {
      case 'micro':
        // Micro accounts: LOWER confidence to allow learning, SMALLER positions for safety
        // Key insight: We need trades to learn! 75% confidence = no trades = no learning
        positionSizePercent = 2.0; // Smaller positions for safety
        // DON'T increase confidence - that prevents learning
        break;
        
      case 'small':
        positionSizePercent = 3.0;
        break;
        
      case 'medium':
        positionSizePercent = 5.0;
        break;
        
      case 'large':
        positionSizePercent = 8.0;
        break;
    }
    
    // WIN RATE ADJUSTMENTS (but don't be too restrictive)
    if (state.recentWinRate < 30) {
      // Poor performance: Slightly more selective + smaller positions
      confidenceThreshold += 0.05;
      positionSizePercent *= 0.8;
    } else if (state.recentWinRate > 65) {
      // Great performance: Can be slightly less selective
      confidenceThreshold -= 0.05;
    }
    
    // SAFETY BOUNDS
    confidenceThreshold = Math.max(0.40, Math.min(0.70, confidenceThreshold)); // 40-70% range
    positionSizePercent = Math.max(1.0, Math.min(10.0, positionSizePercent)); // 1-10% range
    
    return {
      confidenceThreshold,
      rrRatio: takeProfitPercent / stopLossPercent,
      positionSizePercent,
      stopLossPercent,
      takeProfitPercent
    };
  }

  private getRandomParameters(state: ParameterState): TradingParameters {
    // ADAPTIVE exploration within market-appropriate bounds
    let confBase = 0.45;
    let confRange = 0.25; // 0.45-0.70
    let slBase = 2.5;
    let slRange = 3.0;
    
    // Adjust exploration based on market regime
    if (state.marketRegime === 'volatile') {
      slBase = 3.5;
      slRange = 3.5;
      confBase = 0.50;
    } else if (state.marketRegime === 'ranging') {
      slBase = 2.0;
      slRange = 2.0;
      confBase = 0.40;
    }
    
    const confidenceThreshold = confBase + Math.random() * confRange;
    const stopLossPercent = slBase + Math.random() * slRange;
    const takeProfitPercent = stopLossPercent * (1.5 + Math.random() * 1.5); // 1.5-3x SL
    
    // Position size based on account size
    let positionSizePercent = 2 + Math.random() * 4; // 2-6%
    if (state.accountSize === 'micro') {
      positionSizePercent = 1 + Math.random() * 2; // 1-3% for micro
    }
    
    return {
      confidenceThreshold,
      rrRatio: takeProfitPercent / stopLossPercent,
      positionSizePercent,
      stopLossPercent,
      takeProfitPercent
    };
  }
}

// Export singleton instance
export const rlParameterOptimizer = new RLParameterOptimizer();

