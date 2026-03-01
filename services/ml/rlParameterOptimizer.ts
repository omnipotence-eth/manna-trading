/**
 * RL Parameter Optimizer
 * Reinforcement learning system for optimizing trading parameters
 * WORLD-CLASS: Adaptive parameter tuning based on trade outcomes
 * 
 * MATHEMATICAL FOUNDATIONS:
 * - Kelly Criterion for position sizing
 * - Q-Learning for parameter optimization
 * - Price-action based market regime detection
 * - Expected Value calculations for trade decisions
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';
import { calculateOptimalPositionSize, quickKelly, type TradeStatistics, type MarketConditions } from '@/lib/kellyCriterion';
import { detectMarketRegime, calculateOptimalRR, calculateSharpeRatio, type RegimeResult } from '@/lib/advancedMath';

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
  // OPTIMIZATION: Per-symbol Q-tables with shared global priors
  // Global Q-table for shared learning across all symbols
  private globalQTable: Map<string, Map<string, QTableEntry>> = new Map();
  // Per-symbol Q-tables for symbol-specific learning
  private symbolQTables: Map<string, Map<string, Map<string, QTableEntry>>> = new Map();
  
  private learningRate = 0.1;
  private discountFactor = 0.9;
  private explorationRate = 0.3; // Start with 30% exploration
  private minExplorationRate = 0.05; // Minimum 5% exploration
  private explorationDecay = 0.995; // Decay exploration rate over time
  // Persistence disabled in client/edge builds to avoid fs/path issues
  // Will use DB persistence when available
  private readonly stateFile: string | null = null;
  private lastParams: TradingParameters | null = null;
  private lastRunTs: number | null = null;
  private rewardHistory: Array<{ symbol: string; pnlPercent: number; ts: number }> = [];
  private lastStateKey: string | null = null;
  private lastActionKey: string | null = null;
  private lastSymbol: string | null = null; // Track last symbol for per-symbol learning
  private minRewardsToTrust = 20; // require some history before trusting Q
  private dbKey = 'rl_optimizer_state';
  
  // Per-symbol performance tracking for better optimization
  private symbolStats: Map<string, {
    wins: number;
    losses: number;
    totalTrades: number;
    avgWinPercent: number;
    avgLossPercent: number;
    avgSlippagePercent: number;
    totalSlippage: number;
    slippageCount: number;
    lastUpdated: number;
  }> = new Map();
  
  // OPTIMIZATION: Q-value confidence tracking for adaptive exploration
  private qValueConfidence: Map<string, {
    variance: number;
    sampleSize: number;
    lastUpdated: number;
  }> = new Map();

  constructor() {
    this.loadState();
  }

  private loadState() {
    // Try DB-backed persistence if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { kvStore } = require('@/lib/db');
      if (kvStore && typeof kvStore.get === 'function') {
        kvStore.get(this.dbKey).then((saved: any) => {
          if (saved) {
            this.lastParams = saved.lastParams || null;
            this.lastRunTs = saved.lastRunTs || null;
            this.rewardHistory = saved.rewardHistory || [];
            const savedQ = saved.globalQTable || saved.qTable || {};
            this.globalQTable = new Map();
            Object.entries(savedQ).forEach(([stateKey, actions]: any) => {
              const actionMap = new Map<string, QTableEntry>();
              Object.entries(actions || {}).forEach(([k, v]: any) => {
                if (v && typeof v.qValue === 'number') {
                  actionMap.set(k, { qValue: v.qValue, visits: v.visits || 0, lastUpdated: v.lastUpdated || Date.now() });
                }
              });
              this.globalQTable.set(stateKey, actionMap);
            });
          }
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  private saveState() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { kvStore } = require('@/lib/db');
      if (kvStore && typeof kvStore.set === 'function') {
        // Serialize global Q-table
        const serializableGlobalQ: Record<string, any> = {};
        this.globalQTable.forEach((map, stateKey) => {
          serializableGlobalQ[stateKey] = {};
          map.forEach((entry, actionKey) => {
            serializableGlobalQ[stateKey][actionKey] = entry;
          });
        });
        
        // OPTIMIZATION: Serialize per-symbol Q-tables
        const serializableSymbolQ: Record<string, any> = {};
        this.symbolQTables.forEach((symbolQTable, symbol) => {
          serializableSymbolQ[symbol] = {};
          symbolQTable.forEach((map, stateKey) => {
            serializableSymbolQ[symbol][stateKey] = {};
            map.forEach((entry, actionKey) => {
              serializableSymbolQ[symbol][stateKey][actionKey] = entry;
            });
          });
        });
        
        kvStore.set(this.dbKey, {
          lastParams: this.lastParams,
          lastRunTs: this.lastRunTs,
          rewardHistory: this.rewardHistory.slice(-200),
          globalQTable: serializableGlobalQ,
          symbolQTables: serializableSymbolQ,
          qTable: serializableGlobalQ // Backward compat
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  /**
   * Detect current market regime using PRICE ACTION (not trade PnL)
   * MATHEMATICAL OPTIMIZATION: Uses ADX, directional movement, and volatility
   */
  async detectMarketRegime(): Promise<MarketRegime> {
    try {
      // Try to get actual price data for regime detection
      const topSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      
      for (const symbol of topSymbols) {
        try {
          const klines = await asterDexService.getKlines(symbol, '1h', 50);
          
          if (klines && klines.length >= 30) {
            const closes = klines.map((k: any) => parseFloat(k.close || k[4]));
            const highs = klines.map((k: any) => parseFloat(k.high || k[2]));
            const lows = klines.map((k: any) => parseFloat(k.low || k[3]));
            
            // Use advanced math for regime detection
            const regime = detectMarketRegime(closes, highs, lows, 14);
            
            // Map to simpler regime types
            if (regime.regime === 'trending_up' || regime.regime === 'trending_down') {
              return 'trending';
            } else if (regime.regime === 'volatile') {
              return 'volatile';
            } else if (regime.regime === 'choppy') {
              return 'choppy';
            } else {
              return 'ranging';
            }
          }
        } catch (e) {
          // Try next symbol
          continue;
        }
      }
      
      // Fallback: use trade PnL volatility if no price data available
      const recentTrades = await getTradesFromDb({ limit: 50 });
      
      if (recentTrades.length < 10) {
        return 'trending';
      }

      const pnlValues = recentTrades.map(t => Math.abs(t.pnlPercent));
      const avgVolatility = pnlValues.reduce((sum, v) => sum + v, 0) / pnlValues.length;
      
      if (avgVolatility > 10) return 'volatile';
      else if (avgVolatility > 5) return 'choppy';
      else if (avgVolatility > 2) return 'trending';
      else return 'ranging';
      
    } catch (error) {
      logger.warn('Failed to detect market regime, defaulting to trending', {
        context: 'RLParameterOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });
      return 'trending';
    }
  }

  /**
   * SUPREME MATHEMATICS: Get Kelly-optimized position size
   * Uses true Kelly Criterion with all adjustments
   */
  async getKellyOptimizedSize(
    symbol: string,
    accountBalance: number,
    volatility: number,
    liquidityScore: number
  ): Promise<{ positionSizePercent: number; expectedValue: number; confidence: number }> {
    try {
      // Get trade statistics from database
      const recentTrades = await getTradesFromDb({ limit: 100 });
      
      if (recentTrades.length < 5) {
        // Insufficient data - use conservative defaults
        return {
          positionSizePercent: accountBalance < 100 ? 2 : accountBalance < 500 ? 3 : 5,
          expectedValue: 0,
          confidence: 0.1
        };
      }
      
      // Calculate trade statistics
      const wins = recentTrades.filter(t => t.pnl > 0);
      const losses = recentTrades.filter(t => t.pnl < 0);
      
      const stats: TradeStatistics = {
        winRate: recentTrades.length > 0 ? wins.length / recentTrades.length : 0.5,
        avgWinPercent: wins.length > 0 
          ? wins.reduce((sum, t) => sum + Math.abs(t.pnlPercent), 0) / wins.length 
          : 5,
        avgLossPercent: losses.length > 0 
          ? losses.reduce((sum, t) => sum + Math.abs(t.pnlPercent), 0) / losses.length 
          : 3,
        largestWinPercent: wins.length > 0 ? Math.max(...wins.map(t => t.pnlPercent)) : 10,
        largestLossPercent: losses.length > 0 ? Math.max(...losses.map(t => Math.abs(t.pnlPercent))) : 5,
        totalTrades: recentTrades.length,
        consecutiveLosses: this.calculateMaxConsecutiveLosses(recentTrades)
      };
      
      const marketRegime = await this.detectMarketRegime();
      
      const market: MarketConditions = {
        volatility,
        liquidityScore,
        regime: marketRegime
      };
      
      // Get Kelly-optimized position size
      const kelly = calculateOptimalPositionSize(
        stats,
        market,
        accountBalance,
        recentTrades.map(t => t.pnlPercent)
      );
      
      logger.debug('Kelly-optimized position size calculated', {
        context: 'RLParameterOptimizer',
        data: {
          symbol,
          winRate: `${(stats.winRate * 100).toFixed(1)}%`,
          recommendedSize: `${kelly.recommendedSize.toFixed(2)}%`,
          expectedValue: `${kelly.expectedValue.toFixed(2)}%`,
          confidence: `${(kelly.confidence * 100).toFixed(0)}%`,
          riskOfRuin: `${(kelly.riskOfRuin * 100).toFixed(2)}%`
        }
      });
      
      return {
        positionSizePercent: kelly.recommendedSize,
        expectedValue: kelly.expectedValue,
        confidence: kelly.confidence
      };
    } catch (error) {
      logger.error('Kelly calculation failed', error, { context: 'RLParameterOptimizer' });
      return {
        positionSizePercent: accountBalance < 100 ? 2 : 3,
        expectedValue: 0,
        confidence: 0
      };
    }
  }
  
  /**
   * Calculate maximum consecutive losses from trade history
   */
  private calculateMaxConsecutiveLosses(trades: any[]): number {
    let maxConsecutive = 0;
    let current = 0;
    
    for (const trade of trades) {
      if (trade.pnl < 0) {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 0;
      }
    }
    
    return maxConsecutive;
  }

  /**
   * Get optimal R:R ratio based on historical performance
   */
  async getOptimalRiskReward(volatility: number = 5): Promise<{ targetRR: number; breakEvenWinRate: number }> {
    try {
      const recentTrades = await getTradesFromDb({ limit: 100 });
      
      if (recentTrades.length < 10) {
        return { targetRR: 2.0, breakEvenWinRate: 0.33 };
      }
      
      const winRate = recentTrades.filter(t => t.pnl > 0).length / recentTrades.length;
      const avgHoldTime = recentTrades.reduce((sum, t) => sum + (t.duration || 0), 0) / recentTrades.length / (1000 * 60 * 60); // hours
      
      const optimalRR = calculateOptimalRR(winRate, avgHoldTime, volatility);
      
      return {
        targetRR: optimalRR.targetRR,
        breakEvenWinRate: optimalRR.breakEvenWinRate
      };
    } catch (error) {
      return { targetRR: 2.0, breakEvenWinRate: 0.33 };
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
   * OPTIMIZATION: Uses per-symbol Q-table with shared global priors
   */
  getOptimalParameters(state: ParameterState, symbol?: string): TradingParameters {
    const stateKey = this.getStateKey(state);
    const normalizedSymbol = symbol ? symbol.replace('/', '').toUpperCase() : null;
    
    // OPTIMIZATION: Get Q-values from per-symbol table if available, fallback to global
    let stateQValues: Map<string, QTableEntry> | undefined;
    let qTableSource: 'symbol' | 'global' | 'none' = 'none';
    
    if (normalizedSymbol) {
      const symbolQTable = this.symbolQTables.get(normalizedSymbol);
      if (symbolQTable) {
        stateQValues = symbolQTable.get(stateKey);
        if (stateQValues && stateQValues.size > 0) {
          qTableSource = 'symbol';
        }
      }
    }
    
    // Fallback to global Q-table if no symbol-specific data
    if (qTableSource === 'none') {
      stateQValues = this.globalQTable.get(stateKey);
      if (stateQValues && stateQValues.size > 0) {
        qTableSource = 'global';
      }
    }
    
    // OPTIMIZATION: Combine symbol-specific and global Q-values with shared priors
    if (qTableSource === 'symbol' && normalizedSymbol) {
      // Blend with global priors (weighted average: 70% symbol, 30% global)
      const globalQValues = this.globalQTable.get(stateKey);
      if (globalQValues && globalQValues.size > 0) {
        const blendedQValues = new Map<string, QTableEntry>();
        
        // Start with symbol-specific values
        if (stateQValues) {
          stateQValues.forEach((entry, actionKey) => {
            blendedQValues.set(actionKey, { ...entry });
          });
        }
        
        // Blend with global priors
        globalQValues.forEach((globalEntry, actionKey) => {
          const symbolEntry = blendedQValues.get(actionKey);
          if (symbolEntry) {
            // Weighted average: 70% symbol, 30% global
            blendedQValues.set(actionKey, {
              qValue: symbolEntry.qValue * 0.7 + globalEntry.qValue * 0.3,
              visits: symbolEntry.visits,
              lastUpdated: Math.max(symbolEntry.lastUpdated, globalEntry.lastUpdated)
            });
          } else {
            // Use global as prior if symbol has no data
            blendedQValues.set(actionKey, {
              qValue: globalEntry.qValue * 0.3, // Reduced weight for prior
              visits: 0,
              lastUpdated: globalEntry.lastUpdated
            });
          }
        });
        
        stateQValues = blendedQValues;
      }
    }
    
    // If no learning yet, use default parameters
    if (!stateQValues || stateQValues.size === 0) {
      return this.getDefaultParameters(state);
    }

    // OPTIMIZATION: Adaptive exploration based on Q-value confidence
    const adaptiveExplorationRate = this.calculateAdaptiveExplorationRate(stateKey, normalizedSymbol);
    const shouldExplore = Math.random() < adaptiveExplorationRate;
    
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
   * OPTIMIZATION: Calculate adaptive exploration rate based on Q-value confidence
   */
  private calculateAdaptiveExplorationRate(stateKey: string, symbol: string | null): number {
    const confidenceKey = symbol ? `${symbol}:${stateKey}` : `global:${stateKey}`;
    const confidence = this.qValueConfidence.get(confidenceKey);
    
    if (!confidence || confidence.sampleSize < 5) {
      // Not enough data - use default exploration
      return this.explorationRate;
    }
    
    // High variance = low confidence = explore more
    // Low variance = high confidence = exploit more
    const varianceNormalized = Math.min(1, confidence.variance / 10); // Normalize variance
    const confidenceScore = 1 - varianceNormalized; // Higher confidence = lower variance
    
    // Adaptive exploration: lower when confident, higher when uncertain
    // Range: minExplorationRate to explorationRate
    const adaptiveRate = this.minExplorationRate + 
                        (this.explorationRate - this.minExplorationRate) * (1 - confidenceScore);
    
    return Math.max(this.minExplorationRate, Math.min(this.explorationRate, adaptiveRate));
  }
  
  /**
   * OPTIMIZATION: Update Q-value confidence tracking
   */
  private updateQValueConfidence(stateKey: string, symbol: string | null, qValues: Map<string, QTableEntry>): void {
    const confidenceKey = symbol ? `${symbol}:${stateKey}` : `global:${stateKey}`;
    
    if (qValues.size === 0) return;
    
    // Calculate variance of Q-values
    const qValueArray = Array.from(qValues.values()).map(e => e.qValue);
    const mean = qValueArray.reduce((a, b) => a + b, 0) / qValueArray.length;
    const variance = qValueArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / qValueArray.length;
    
    const current = this.qValueConfidence.get(confidenceKey) || {
      variance: 0,
      sampleSize: 0,
      lastUpdated: Date.now()
    };
    
    // Exponential moving average of variance
    const alpha = 0.3; // Smoothing factor
    const updatedVariance = current.sampleSize === 0 
      ? variance 
      : current.variance * (1 - alpha) + variance * alpha;
    
    this.qValueConfidence.set(confidenceKey, {
      variance: updatedVariance,
      sampleSize: current.sampleSize + 1,
      lastUpdated: Date.now()
    });
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
    slippagePercent?: number; // OPTIMIZATION: Include slippage
    fees?: number; // OPTIMIZATION: Include fees
  }): number {
    // Base reward from P&L
    let reward = trade.pnlPercent;
    
    // OPTIMIZATION: Subtract slippage penalty (if provided)
    const slippagePenalty = trade.slippagePercent || 0;
    reward -= slippagePenalty;
    
    // OPTIMIZATION: Subtract fees (estimated 0.1% round trip if not provided)
    const feeCost = trade.fees || 0.1;
    reward -= feeCost;
    
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
    
    // OPTIMIZATION: Time-based decay for long trades (opportunity cost)
    const hoursHeld = trade.duration / (1000 * 60 * 60);
    if (hoursHeld > 1) {
      reward -= 0.1 * (hoursHeld - 1); // -0.1% per hour after 1 hour
    }
    
    // Risk-adjusted reward
    const riskAdjustedReward = reward / (trade.riskPercent || 1);
    
    return riskAdjustedReward;
  }
  
  /**
   * OPTIMIZATION: Track per-symbol performance for better optimization
   */
  trackSymbolPerformance(symbol: string, outcome: {
    pnlPercent: number;
    slippagePercent?: number;
  }): void {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const stats = this.symbolStats.get(normalizedSymbol) || {
      wins: 0,
      losses: 0,
      totalTrades: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      avgSlippagePercent: 0,
      totalSlippage: 0,
      slippageCount: 0,
      lastUpdated: Date.now()
    };
    
    stats.totalTrades++;
    if (outcome.pnlPercent > 0) {
      stats.wins++;
      // Exponential moving average for wins
      stats.avgWinPercent = (stats.avgWinPercent * (stats.wins - 1) + outcome.pnlPercent) / stats.wins;
    } else {
      stats.losses++;
      // Exponential moving average for losses
      stats.avgLossPercent = (stats.avgLossPercent * (stats.losses - 1) + Math.abs(outcome.pnlPercent)) / stats.losses;
    }
    
    // Track slippage
    if (outcome.slippagePercent !== undefined) {
      stats.slippageCount++;
      stats.totalSlippage += outcome.slippagePercent;
      stats.avgSlippagePercent = stats.totalSlippage / stats.slippageCount;
    }
    
    stats.lastUpdated = Date.now();
    this.symbolStats.set(normalizedSymbol, stats);
  }
  
  /**
   * OPTIMIZATION: Get per-symbol performance stats
   */
  getSymbolStats(symbol: string): {
    winRate: number;
    avgWinPercent: number;
    avgLossPercent: number;
    avgSlippagePercent: number;
    totalTrades: number;
  } | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const stats = this.symbolStats.get(normalizedSymbol);
    if (!stats || stats.totalTrades === 0) {
      return null;
    }
    
    return {
      winRate: stats.wins / stats.totalTrades,
      avgWinPercent: stats.avgWinPercent,
      avgLossPercent: stats.avgLossPercent,
      avgSlippagePercent: stats.avgSlippagePercent,
      totalTrades: stats.totalTrades
    };
  }

  /**
   * Learn from trade outcome (Q-learning update)
   * OPTIMIZATION: Now uses per-symbol Q-tables with shared global priors
   * NOTE: This method is kept for backward compatibility but updateWithOutcome is preferred
   */
  async learnFromTrade(
    state: ParameterState,
    action: TradingParameters,
    reward: number,
    symbol?: string
  ): Promise<void> {
    try {
      // OPTIMIZATION: Use the new implementation that handles per-symbol Q-tables
      const normalizedSymbol = symbol ? symbol.replace('/', '').toUpperCase() : null;
      const stateKey = this.getStateKey(state);
      const actionKey = this.getActionKey(action);
      
      // Update global Q-table
      if (!this.globalQTable.has(stateKey)) {
        this.globalQTable.set(stateKey, new Map());
      }
      const globalStateQValues = this.globalQTable.get(stateKey)!;
      const globalEntry = globalStateQValues.get(actionKey) || {
        qValue: 0,
        visits: 0,
        lastUpdated: Date.now()
      };
      const newGlobalQValue = globalEntry.qValue + this.learningRate * (reward - globalEntry.qValue);
      globalStateQValues.set(actionKey, {
        qValue: newGlobalQValue,
        visits: globalEntry.visits + 1,
        lastUpdated: Date.now()
      });
      this.updateQValueConfidence(stateKey, null, globalStateQValues);
      
      // Update per-symbol Q-table if symbol provided
      if (normalizedSymbol) {
        if (!this.symbolQTables.has(normalizedSymbol)) {
          this.symbolQTables.set(normalizedSymbol, new Map());
        }
        const symbolQTable = this.symbolQTables.get(normalizedSymbol)!;
        if (!symbolQTable.has(stateKey)) {
          symbolQTable.set(stateKey, new Map());
        }
        const symbolStateQValues = symbolQTable.get(stateKey)!;
        const symbolEntry = symbolStateQValues.get(actionKey) || {
          qValue: 0,
          visits: 0,
          lastUpdated: Date.now()
        };
        const newSymbolQValue = symbolEntry.qValue + this.learningRate * (reward - symbolEntry.qValue);
        symbolStateQValues.set(actionKey, {
          qValue: newSymbolQValue,
          visits: symbolEntry.visits + 1,
          lastUpdated: Date.now()
        });
        this.updateQValueConfidence(stateKey, normalizedSymbol, symbolStateQValues);
      }
      
      // Decay exploration rate
      this.explorationRate = Math.max(
        this.minExplorationRate,
        this.explorationRate * this.explorationDecay
      );
      
      logger.debug('RL learned from trade', {
        context: 'RLParameterOptimizer',
        data: {
          state: stateKey,
          symbol: normalizedSymbol || 'global',
          reward: reward.toFixed(2),
          newQValue: normalizedSymbol ? 'symbol-specific' : newGlobalQValue.toFixed(2),
          explorationRate: (this.explorationRate * 100).toFixed(1) + '%'
        }
      });
      
      this.saveState();
    } catch (error) {
      logger.error('Failed to learn from trade', error, {
        context: 'RLParameterOptimizer'
      });
    }
  }

  /**
   * Get statistics about RL system
   * OPTIMIZATION: Now includes per-symbol Q-table statistics
   */
  getStatistics(): {
    totalStates: number;
    totalActions: number;
    explorationRate: number;
    averageQValue: number;
    symbolQTables: number;
    totalSymbolStates: number;
  } {
    let totalActions = 0;
    let totalQValue = 0;
    
    // Count global Q-table
    for (const stateQValues of this.globalQTable.values()) {
      totalActions += stateQValues.size;
      for (const entry of stateQValues.values()) {
        totalQValue += entry.qValue;
      }
    }
    
    // OPTIMIZATION: Count per-symbol Q-tables
    let totalSymbolStates = 0;
    for (const symbolQTable of this.symbolQTables.values()) {
      totalSymbolStates += symbolQTable.size;
      for (const stateQValues of symbolQTable.values()) {
        totalActions += stateQValues.size;
        for (const entry of stateQValues.values()) {
          totalQValue += entry.qValue;
        }
      }
    }
    
    const averageQValue = totalActions > 0 ? totalQValue / totalActions : 0;
    
    return {
      totalStates: this.globalQTable.size,
      totalActions,
      explorationRate: this.explorationRate,
      averageQValue,
      symbolQTables: this.symbolQTables.size,
      totalSymbolStates
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

  /**
   * Lightweight optimization runner (supports dryRun for self-tests)
   */
  async runOptimization(options?: { dryRun?: boolean; maxSteps?: number }) {
    const maxSteps = options?.maxSteps ?? 1;
    const regime = await this.detectMarketRegime();
    const state: ParameterState = {
      marketRegime: regime,
      accountSize: 'medium',
      recentWinRate: 55,
      recentVolatility: 20
    };
    const stateKey = this.makeStateKey(regime);
    const params = this.pickAction(stateKey, state);

    if (!options?.dryRun) {
      logger.info('RL optimization run', {
        context: 'RLParameterOptimizer',
        data: { regime, maxSteps, params, stateKey }
      });
    }

    this.lastParams = params;
    this.lastRunTs = Date.now();
    this.lastStateKey = stateKey;
    this.lastActionKey = this.makeActionKey(params);
    this.saveState();

    return { regime, params, maxSteps };
  }

  /**
   * Update RL with trade outcome (reward signal)
   * OPTIMIZATION: Now includes slippage and fees, and updates per-symbol Q-tables
   */
  async updateWithOutcome(outcome: { 
    symbol: string; 
    pnlPercent: number;
    slippagePercent?: number;
    fees?: number;
    confidence?: number;
    duration?: number;
    riskPercent?: number;
  }) {
    // OPTIMIZATION: Track per-symbol performance
    this.trackSymbolPerformance(outcome.symbol, {
      pnlPercent: outcome.pnlPercent,
      slippagePercent: outcome.slippagePercent
    });
    
    this.rewardHistory.push({ symbol: outcome.symbol, pnlPercent: outcome.pnlPercent, ts: Date.now() });
    this.rewardHistory = this.rewardHistory.slice(-200);
    
    if (this.lastStateKey && this.lastActionKey && this.lastSymbol) {
      // OPTIMIZATION: Use enhanced reward function with slippage and fees
      const reward = this.calculateReward({
        pnl: 0, // Not used in reward calculation
        pnlPercent: outcome.pnlPercent,
        confidence: outcome.confidence || 0.65,
        duration: outcome.duration || 0,
        riskPercent: outcome.riskPercent || 3.0,
        slippagePercent: outcome.slippagePercent,
        fees: outcome.fees
      });
      
      const normalizedSymbol = this.lastSymbol.replace('/', '').toUpperCase();
      
      // OPTIMIZATION: Update per-symbol Q-table
      if (!this.symbolQTables.has(normalizedSymbol)) {
        this.symbolQTables.set(normalizedSymbol, new Map());
      }
      const symbolQTable = this.symbolQTables.get(normalizedSymbol)!;
      
      if (!symbolQTable.has(this.lastStateKey)) {
        symbolQTable.set(this.lastStateKey, new Map());
      }
      const symbolActionMap = symbolQTable.get(this.lastStateKey)!;
      
      const symbolPrev = symbolActionMap.get(this.lastActionKey) || { qValue: 0, visits: 0, lastUpdated: Date.now() };
      const symbolUpdated: QTableEntry = {
        qValue: symbolPrev.qValue + this.learningRate * (reward - symbolPrev.qValue),
        visits: symbolPrev.visits + 1,
        lastUpdated: Date.now()
      };
      symbolActionMap.set(this.lastActionKey, symbolUpdated);
      
      // OPTIMIZATION: Update Q-value confidence
      this.updateQValueConfidence(this.lastStateKey, normalizedSymbol, symbolActionMap);
      
      // Also update global Q-table for shared learning
      const globalActionMap = this.globalQTable.get(this.lastStateKey) || new Map<string, QTableEntry>();
      const globalPrev = globalActionMap.get(this.lastActionKey) || { qValue: 0, visits: 0, lastUpdated: Date.now() };
      const globalUpdated: QTableEntry = {
        qValue: globalPrev.qValue + this.learningRate * (reward - globalPrev.qValue),
        visits: globalPrev.visits + 1,
        lastUpdated: Date.now()
      };
      globalActionMap.set(this.lastActionKey, globalUpdated);
      this.globalQTable.set(this.lastStateKey, globalActionMap);
      
      // Update global Q-value confidence
      this.updateQValueConfidence(this.lastStateKey, null, globalActionMap);
    }
    this.saveState();
  }

  getDiagnostics() {
    return {
      lastParams: this.lastParams,
      lastRunTs: this.lastRunTs,
      rewardsTracked: this.rewardHistory.length
    };
  }

  private pickAction(stateKey: string, state: ParameterState, symbol?: string): TradingParameters {
    // OPTIMIZATION: Use getOptimalParameters which handles per-symbol Q-tables
    return this.getOptimalParameters(state, symbol);
  }

  private makeStateKey(regime: string): string {
    return `regime:${regime}`;
  }

  private makeActionKey(params: TradingParameters): string {
    return [
      params.confidenceThreshold.toFixed(3),
      params.rrRatio.toFixed(3),
      params.positionSizePercent.toFixed(3),
      params.stopLossPercent.toFixed(3),
      params.takeProfitPercent.toFixed(3)
    ].join('|');
  }

  private parseActionKey(key: string): TradingParameters | null {
    const parts = key.split('|').map(Number);
    if (parts.length !== 5 || parts.some(p => !isFinite(p))) return null;
    return {
      confidenceThreshold: parts[0],
      rrRatio: parts[1],
      positionSizePercent: parts[2],
      stopLossPercent: parts[3],
      takeProfitPercent: parts[4]
    };
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForRLOptimizer = globalThis as typeof globalThis & {
  __rlParameterOptimizer?: RLParameterOptimizer;
};

if (!globalForRLOptimizer.__rlParameterOptimizer || typeof globalForRLOptimizer.__rlParameterOptimizer.runOptimization !== 'function') {
  globalForRLOptimizer.__rlParameterOptimizer = new RLParameterOptimizer();
}

export const rlParameterOptimizer = globalForRLOptimizer.__rlParameterOptimizer;

