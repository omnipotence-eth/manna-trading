/**
 * GOAL-AWARE TRADING CONFIGURATION
 * 
 * Dynamically adjusts trading parameters based on goal progress and urgency.
 * This module integrates with the goal tracker to optimize for the target.
 * 
 * Current Goal: $60 → $100 in 24 hours (66.67% growth)
 * 
 * Strategy:
 * - Start conservative, become more aggressive if behind schedule
 * - Protect profits when ahead of schedule
 * - Use quant data for high-probability setups
 */

import { goalTracker, StrategyRecommendation } from '@/services/trading/goalTracker';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';

export interface GoalAwareTradingConfig {
  // Position sizing
  positionSizePercent: number;
  maxPositionSize: number;
  
  // Entry criteria
  minConfidence: number;
  minRiskReward: number;
  minLiquidityScore: number;
  
  // Risk management
  maxConcurrentPositions: number;
  maxPortfolioRisk: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  
  // Trade frequency
  scanIntervalMs: number;
  cooldownBetweenTradesMs: number;
  
  // Strategy notes
  urgency: 'low' | 'medium' | 'high' | 'critical';
  strategyMessage: string;
  tactics: string[];
}

/**
 * Get trading configuration optimized for current goal progress
 */
export function getGoalAwareTradingConfig(currentBalance: number): GoalAwareTradingConfig {
  const { recommendation } = goalTracker.getGoalStatus();
  
  // Base configuration
  let config: GoalAwareTradingConfig = {
    positionSizePercent: 2.0,
    maxPositionSize: currentBalance * 0.15, // Max 15% of balance per trade
    minConfidence: 0.65,
    minRiskReward: 2.5,
    minLiquidityScore: 0.5,
    maxConcurrentPositions: 2,
    maxPortfolioRisk: 8.0,
    stopLossPercent: 3.0,
    takeProfitPercent: 7.5,
    scanIntervalMs: 60000,
    cooldownBetweenTradesMs: 180000,
    urgency: recommendation.urgency,
    strategyMessage: recommendation.message,
    tactics: recommendation.tactics
  };
  
  // Adjust based on urgency
  switch (recommendation.urgency) {
    case 'critical':
      // Need aggressive approach
      config = {
        ...config,
        positionSizePercent: 3.0, // Larger positions
        maxPositionSize: currentBalance * 0.20, // Up to 20% per trade
        minConfidence: 0.55, // Lower threshold
        minRiskReward: 2.0, // Accept 2:1
        maxConcurrentPositions: 4, // More positions
        maxPortfolioRisk: 15.0, // Higher risk tolerance
        stopLossPercent: 2.5, // Tighter stops
        takeProfitPercent: 5.0, // Faster profit taking
        scanIntervalMs: 30000, // Faster scanning
        cooldownBetweenTradesMs: 60000, // Less cooldown
      };
      break;
      
    case 'high':
      config = {
        ...config,
        positionSizePercent: 2.5,
        maxPositionSize: currentBalance * 0.18,
        minConfidence: 0.60,
        minRiskReward: 2.0,
        maxConcurrentPositions: 3,
        maxPortfolioRisk: 12.0,
        stopLossPercent: 2.5,
        takeProfitPercent: 6.0,
        scanIntervalMs: 45000,
        cooldownBetweenTradesMs: 120000,
      };
      break;
      
    case 'medium':
      // Balanced approach
      config = {
        ...config,
        positionSizePercent: 2.0,
        maxPositionSize: currentBalance * 0.15,
        minConfidence: 0.65,
        minRiskReward: 2.5,
        maxConcurrentPositions: 3,
        maxPortfolioRisk: 10.0,
        stopLossPercent: 3.0,
        takeProfitPercent: 7.5,
        scanIntervalMs: 60000,
        cooldownBetweenTradesMs: 180000,
      };
      break;
      
    case 'low':
      // Protective approach - ahead of schedule
      config = {
        ...config,
        positionSizePercent: 1.5,
        maxPositionSize: currentBalance * 0.10,
        minConfidence: 0.70,
        minRiskReward: 3.0,
        maxConcurrentPositions: 2,
        maxPortfolioRisk: 6.0,
        stopLossPercent: 2.0,
        takeProfitPercent: 6.0,
        scanIntervalMs: 90000,
        cooldownBetweenTradesMs: 300000,
      };
      break;
  }
  
  // Apply position size multiplier from recommendation
  config.positionSizePercent *= recommendation.positionSizeMultiplier;
  config.maxPositionSize *= recommendation.positionSizeMultiplier;
  
  return config;
}

/**
 * Check if a trade opportunity meets goal-aware criteria
 */
export function shouldTakeTrade(params: {
  confidence: number;
  riskReward: number;
  liquidityScore: number;
  currentPositions: number;
  currentBalance: number;
}): { approved: boolean; reason: string } {
  const config = getGoalAwareTradingConfig(params.currentBalance);
  
  // Check position limits
  if (params.currentPositions >= config.maxConcurrentPositions) {
    return {
      approved: false,
      reason: `Max positions reached (${params.currentPositions}/${config.maxConcurrentPositions})`
    };
  }
  
  // Check confidence
  if (params.confidence < config.minConfidence) {
    return {
      approved: false,
      reason: `Confidence too low: ${(params.confidence * 100).toFixed(1)}% < ${(config.minConfidence * 100).toFixed(1)}%`
    };
  }
  
  // Check risk/reward
  if (params.riskReward < config.minRiskReward) {
    return {
      approved: false,
      reason: `R:R too low: ${params.riskReward.toFixed(2)}:1 < ${config.minRiskReward.toFixed(2)}:1`
    };
  }
  
  // Check liquidity
  if (params.liquidityScore < config.minLiquidityScore) {
    return {
      approved: false,
      reason: `Liquidity too low: ${(params.liquidityScore * 100).toFixed(1)}% < ${(config.minLiquidityScore * 100).toFixed(1)}%`
    };
  }
  
  return {
    approved: true,
    reason: `Trade approved (Urgency: ${config.urgency}, Conf: ${(params.confidence * 100).toFixed(1)}%, R:R: ${params.riskReward.toFixed(2)}:1)`
  };
}

/**
 * Calculate optimal position size for goal achievement
 */
export function calculateGoalOptimalSize(params: {
  currentBalance: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}): number {
  const config = getGoalAwareTradingConfig(params.currentBalance);
  
  // Risk per trade in dollars
  const riskDollars = params.currentBalance * (config.maxPortfolioRisk / 100);
  
  // Price difference to stop loss
  const riskPerUnit = Math.abs(params.entryPrice - params.stopLossPrice);
  
  if (riskPerUnit <= 0) {
    return 0;
  }
  
  // Position size = Risk$ / Risk per unit
  let positionSize = riskDollars / riskPerUnit;
  
  // Cap to max position size
  const maxByPercent = params.currentBalance * (config.positionSizePercent / 100);
  positionSize = Math.min(positionSize, maxByPercent, config.maxPositionSize);
  
  // Minimum position value check
  const positionValue = positionSize * params.entryPrice;
  if (positionValue < 5) { // Minimum $5 trade
    return 0;
  }
  
  return positionSize;
}

/**
 * Get trading summary for display
 */
export function getGoalTradingSummary(currentBalance: number): {
  config: GoalAwareTradingConfig;
  goalProgress: number;
  hoursRemaining: number;
  recommendedAction: string;
} {
  const config = getGoalAwareTradingConfig(currentBalance);
  const status = goalTracker.getGoalStatus();
  
  let recommendedAction = 'Continue current strategy';
  
  if (status.goal?.status === 'achieved') {
    recommendedAction = '[ACHIEVED] Goal achieved! Consider setting a new target.';
  } else if (config.urgency === 'critical') {
    recommendedAction = '[URGENT] Increase trade frequency and position sizes';
  } else if (config.urgency === 'high') {
    recommendedAction = '[HIGH] Look for high-probability momentum trades';
  } else if (config.urgency === 'low') {
    recommendedAction = '[OK] Protect profits - only take A+ setups';
  }
  
  return {
    config,
    goalProgress: status.progress,
    hoursRemaining: status.hoursRemaining,
    recommendedAction
  };
}


