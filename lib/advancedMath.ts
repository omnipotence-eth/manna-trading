/**
 * Advanced Mathematical Models for Supreme Trading
 * 
 * MATHEMATICAL FOUNDATIONS:
 * - Sharpe Ratio with risk-free rate
 * - Sortino Ratio (downside deviation)
 * - Chandelier Exit (volatility-based trailing stop)
 * - Market Regime Detection via price action
 * - Optimal R:R based on win rate
 * - Monte Carlo risk simulation
 */

import { logger } from './logger';

// ============================================================================
// SHARPE RATIO - Risk-adjusted return measurement
// ============================================================================

export interface SharpeResult {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  riskFreeRate: number;
}

/**
 * Calculate Sharpe Ratio (annualized)
 * 
 * Formula: (Rp - Rf) / σp
 * where:
 *   Rp = Portfolio return (annualized)
 *   Rf = Risk-free rate (annualized)
 *   σp = Portfolio standard deviation (annualized)
 * 
 * @param returns - Array of periodic returns (as decimals, e.g., 0.05 = 5%)
 * @param riskFreeRate - Annual risk-free rate (default 5% = 0.05)
 * @param periodsPerYear - Number of periods per year (365 for daily)
 */
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.05,
  periodsPerYear: number = 365
): number {
  if (returns.length < 2) return 0;
  
  // Calculate average return per period
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  
  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualize
  const annualizedReturn = avgReturn * periodsPerYear;
  const annualizedStdDev = stdDev * Math.sqrt(periodsPerYear);
  
  // Sharpe = (Return - RiskFree) / StdDev
  const sharpe = (annualizedReturn - riskFreeRate) / annualizedStdDev;
  
  return sharpe;
}

/**
 * Calculate Sortino Ratio (focuses on downside volatility only)
 * 
 * Formula: (Rp - Rf) / σd
 * where σd is downside deviation (only negative returns)
 * 
 * More appropriate for trading where we care about losses, not gains volatility
 */
export function calculateSortinoRatio(
  returns: number[],
  riskFreeRate: number = 0.05,
  periodsPerYear: number = 365
): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  
  // Calculate downside deviation (only negative returns)
  const negativeReturns = returns.filter(r => r < 0);
  if (negativeReturns.length === 0) return Infinity; // No losses = infinite Sortino
  
  const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  
  if (downsideDeviation === 0) return Infinity;
  
  // Annualize
  const annualizedReturn = avgReturn * periodsPerYear;
  const annualizedDownsideDev = downsideDeviation * Math.sqrt(periodsPerYear);
  
  return (annualizedReturn - riskFreeRate) / annualizedDownsideDev;
}

/**
 * Calculate Calmar Ratio (return / max drawdown)
 * 
 * Excellent for comparing trading systems
 */
export function calculateCalmarRatio(
  returns: number[],
  periodsPerYear: number = 365
): number {
  if (returns.length < 2) return 0;
  
  // Calculate cumulative returns
  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;
  
  for (const ret of returns) {
    cumulative *= (1 + ret);
    if (cumulative > peak) peak = cumulative;
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  if (maxDrawdown === 0) return Infinity;
  
  // Annualized return
  const totalReturn = cumulative - 1;
  const periods = returns.length;
  const annualizedReturn = Math.pow(1 + totalReturn, periodsPerYear / periods) - 1;
  
  return annualizedReturn / maxDrawdown;
}

/**
 * Complete risk-adjusted performance analysis
 */
export function calculateRiskMetrics(
  returns: number[],
  riskFreeRate: number = 0.05,
  periodsPerYear: number = 365
): SharpeResult {
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
  
  return {
    sharpeRatio: calculateSharpeRatio(returns, riskFreeRate, periodsPerYear),
    sortinoRatio: calculateSortinoRatio(returns, riskFreeRate, periodsPerYear),
    calmarRatio: calculateCalmarRatio(returns, periodsPerYear),
    annualizedReturn: avgReturn * periodsPerYear,
    annualizedVolatility: Math.sqrt(variance) * Math.sqrt(periodsPerYear),
    riskFreeRate
  };
}


// ============================================================================
// CHANDELIER EXIT - Volatility-based trailing stop
// ============================================================================

export interface ChandelierResult {
  longStop: number;
  shortStop: number;
  atr: number;
  multiplier: number;
}

/**
 * Calculate Chandelier Exit levels
 * 
 * Long Exit = Highest High(n) - ATR(n) × Multiplier
 * Short Exit = Lowest Low(n) + ATR(n) × Multiplier
 * 
 * Superior to fixed percentage trailing stops because it adapts to volatility
 * 
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param period - Lookback period (default 22)
 * @param multiplier - ATR multiplier (default 3.0)
 */
export function calculateChandelierExit(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 22,
  multiplier: number = 3.0
): ChandelierResult {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    // Return reasonable defaults if insufficient data
    const currentClose = closes[closes.length - 1] || 0;
    const atrEstimate = currentClose * 0.03; // Estimate 3% ATR
    return {
      longStop: currentClose - atrEstimate * multiplier,
      shortStop: currentClose + atrEstimate * multiplier,
      atr: atrEstimate,
      multiplier
    };
  }
  
  // Calculate ATR
  const trueRanges: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  // Average True Range over period
  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / period;
  
  // Highest high and lowest low over period
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  
  return {
    longStop: highestHigh - atr * multiplier,
    shortStop: lowestLow + atr * multiplier,
    atr,
    multiplier
  };
}

/**
 * Quick Chandelier calculation from 24h data
 */
export function quickChandelierExit(
  currentPrice: number,
  high24h: number,
  low24h: number,
  side: 'LONG' | 'SHORT',
  multiplier: number = 3.0
): number {
  // Estimate ATR from 24h range
  const range = high24h - low24h;
  const atr = range / 3; // Approximate daily ATR as 1/3 of range
  
  if (side === 'LONG') {
    return high24h - atr * multiplier;
  } else {
    return low24h + atr * multiplier;
  }
}


// ============================================================================
// MARKET REGIME DETECTION - Price action based
// ============================================================================

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'choppy';

export interface RegimeResult {
  regime: MarketRegime;
  strength: number;        // 0-1 how strong the regime signal is
  direction: number;       // -1 to 1 (bearish to bullish)
  volatility: number;      // ATR as percentage
  trendConsistency: number; // How consistent the trend is
  recommendation: 'LONG' | 'SHORT' | 'HOLD';
}

/**
 * Detect market regime from price action
 * 
 * Uses multiple factors:
 * 1. ADX for trend strength
 * 2. Price position relative to moving averages
 * 3. Volatility (ATR)
 * 4. Directional consistency (consecutive higher/lower closes)
 */
export function detectMarketRegime(
  closes: number[],
  highs: number[],
  lows: number[],
  period: number = 14
): RegimeResult {
  if (closes.length < period * 2) {
    return {
      regime: 'ranging',
      strength: 0.5,
      direction: 0,
      volatility: 5,
      trendConsistency: 0.5,
      recommendation: 'HOLD'
    };
  }
  
  // 1. Calculate directional movement (+DM, -DM)
  let plusDM = 0;
  let minusDM = 0;
  let trSum = 0;
  
  for (let i = Math.max(1, closes.length - period); i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    if (upMove > downMove && upMove > 0) {
      plusDM += upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM += downMove;
    }
    
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }
  
  // 2. Calculate +DI, -DI, and ADX proxy
  const avgTR = trSum / period;
  const plusDI = (plusDM / avgTR) * 100;
  const minusDI = (minusDM / avgTR) * 100;
  const diDiff = Math.abs(plusDI - minusDI);
  const diSum = plusDI + minusDI;
  const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
  
  // 3. Calculate volatility as ATR percentage
  const currentPrice = closes[closes.length - 1];
  const volatility = (avgTR / currentPrice) * 100;
  
  // 4. Calculate trend consistency
  let consecutiveUp = 0;
  let consecutiveDown = 0;
  let currentStreak = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      if (currentStreak > 0) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
      consecutiveUp = Math.max(consecutiveUp, currentStreak);
    } else if (closes[i] < closes[i - 1]) {
      if (currentStreak < 0) {
        currentStreak--;
      } else {
        currentStreak = -1;
      }
      consecutiveDown = Math.max(consecutiveDown, Math.abs(currentStreak));
    }
  }
  
  const trendConsistency = Math.max(consecutiveUp, consecutiveDown) / period;
  
  // 5. Calculate direction bias
  const direction = (plusDI - minusDI) / Math.max(plusDI + minusDI, 1);
  
  // 6. Determine regime
  let regime: MarketRegime;
  let strength: number;
  let recommendation: 'LONG' | 'SHORT' | 'HOLD';
  
  if (dx > 25 && volatility < 8) {
    // Strong trend, moderate volatility
    if (direction > 0.3) {
      regime = 'trending_up';
      recommendation = 'LONG';
    } else if (direction < -0.3) {
      regime = 'trending_down';
      recommendation = 'SHORT';
    } else {
      regime = 'ranging';
      recommendation = 'HOLD';
    }
    strength = dx / 50; // Normalize to 0-1
  } else if (volatility > 12) {
    regime = 'volatile';
    strength = Math.min(volatility / 20, 1);
    recommendation = 'HOLD';
  } else if (dx < 15 && volatility > 6) {
    regime = 'choppy';
    strength = 1 - (dx / 25);
    recommendation = 'HOLD';
  } else {
    regime = 'ranging';
    strength = 0.5;
    // In ranging, trade reversals at extremes
    if (direction > 0.2) {
      recommendation = 'SHORT'; // Fade the move
    } else if (direction < -0.2) {
      recommendation = 'LONG'; // Fade the move
    } else {
      recommendation = 'HOLD';
    }
  }
  
  return {
    regime,
    strength: Math.min(1, Math.max(0, strength)),
    direction,
    volatility,
    trendConsistency,
    recommendation
  };
}


// ============================================================================
// OPTIMAL R:R BASED ON WIN RATE
// ============================================================================

export interface OptimalRR {
  minimumRR: number;        // Minimum R:R to be profitable
  optimalRR: number;        // Optimal R:R for max expectancy
  targetRR: number;         // Recommended target
  breakEvenWinRate: number; // Win rate needed at given R:R
  expectancy: number;       // Expected value per trade
}

/**
 * Calculate optimal Risk:Reward ratio based on win rate
 * 
 * The math:
 * Breakeven: R:R = (1 - WinRate) / WinRate
 * Optimal: Balance between hitting targets and risk
 * 
 * @param winRate - Historical win rate (0-1)
 * @param avgHoldTime - Average trade duration in hours
 * @param volatility - Market volatility (ATR %)
 */
export function calculateOptimalRR(
  winRate: number,
  avgHoldTime: number = 4,
  volatility: number = 5
): OptimalRR {
  // Breakeven R:R
  // At 50% win rate, need 1:1 R:R
  // At 60% win rate, need 0.67:1 R:R
  // At 40% win rate, need 1.5:1 R:R
  const minimumRR = winRate > 0 ? (1 - winRate) / winRate : 1;
  
  // Optimal R:R adds buffer for:
  // 1. Slippage (0.1% each way)
  // 2. Fees (0.1%)
  // 3. Stop-hunt wicks
  const feeAdjustment = 1.1;
  
  // Volatility adjustment
  // Higher volatility = need wider targets = can achieve better R:R
  const volatilityMultiplier = 1 + (volatility / 20);
  
  // Hold time adjustment
  // Shorter holds = tighter targets more achievable
  // Longer holds = wider targets more achievable
  const holdTimeMultiplier = avgHoldTime > 12 ? 1.2 : avgHoldTime < 2 ? 0.9 : 1.0;
  
  const optimalRR = minimumRR * feeAdjustment * volatilityMultiplier * holdTimeMultiplier;
  
  // Target R:R (round to nice number)
  let targetRR: number;
  if (optimalRR < 1.5) targetRR = 1.5;
  else if (optimalRR < 2.0) targetRR = 2.0;
  else if (optimalRR < 2.5) targetRR = 2.5;
  else if (optimalRR < 3.0) targetRR = 3.0;
  else targetRR = Math.ceil(optimalRR);
  
  // What win rate would break even at target R:R?
  const breakEvenWinRate = 1 / (1 + targetRR);
  
  // Expectancy at target R:R
  // E = (WinRate × AvgWin) - (LossRate × AvgLoss)
  // With R:R, AvgWin = R:R × AvgLoss
  // E = (WinRate × R:R × 1) - ((1-WinRate) × 1) = WinRate × R:R - 1 + WinRate
  const expectancy = winRate * targetRR - (1 - winRate);
  
  return {
    minimumRR,
    optimalRR,
    targetRR,
    breakEvenWinRate,
    expectancy
  };
}


// ============================================================================
// MONTE CARLO SIMULATION - Risk analysis
// ============================================================================

export interface MonteCarloResult {
  medianReturn: number;
  percentile5: number;     // 5th percentile (worst case)
  percentile95: number;    // 95th percentile (best case)
  probabilityOfProfit: number;
  probabilityOfRuin: number;
  maxDrawdown: {
    median: number;
    worst: number;
  };
}

/**
 * Monte Carlo simulation for trade outcomes
 * 
 * Simulates thousands of possible paths to assess risk
 * 
 * @param winRate - Historical win rate (0-1)
 * @param avgWin - Average win percentage
 * @param avgLoss - Average loss percentage
 * @param numTrades - Number of trades to simulate
 * @param simulations - Number of Monte Carlo paths
 */
export function runMonteCarloSimulation(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  numTrades: number = 100,
  simulations: number = 1000
): MonteCarloResult {
  const finalReturns: number[] = [];
  const maxDrawdowns: number[] = [];
  
  for (let sim = 0; sim < simulations; sim++) {
    let equity = 100; // Start with 100
    let peak = 100;
    let maxDD = 0;
    
    for (let trade = 0; trade < numTrades; trade++) {
      // Random trade outcome based on win rate
      const isWin = Math.random() < winRate;
      const change = isWin ? avgWin : -avgLoss;
      
      equity *= (1 + change / 100);
      
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
      
      // Check for ruin (50% loss)
      if (equity < 50) break;
    }
    
    finalReturns.push((equity - 100) / 100); // As decimal
    maxDrawdowns.push(maxDD);
  }
  
  // Sort for percentile calculations
  finalReturns.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);
  
  const getPercentile = (arr: number[], p: number) => {
    const index = Math.floor(arr.length * p);
    return arr[index];
  };
  
  return {
    medianReturn: getPercentile(finalReturns, 0.5),
    percentile5: getPercentile(finalReturns, 0.05),
    percentile95: getPercentile(finalReturns, 0.95),
    probabilityOfProfit: finalReturns.filter(r => r > 0).length / simulations,
    probabilityOfRuin: finalReturns.filter(r => r < -0.5).length / simulations,
    maxDrawdown: {
      median: getPercentile(maxDrawdowns, 0.5),
      worst: getPercentile(maxDrawdowns, 0.95)
    }
  };
}


// ============================================================================
// EXPORTS
// ============================================================================

export const AdvancedMathUtils = {
  // Risk metrics
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateCalmarRatio,
  calculateRiskMetrics,
  
  // Trailing stops
  calculateChandelierExit,
  quickChandelierExit,
  
  // Market regime
  detectMarketRegime,
  
  // R:R optimization
  calculateOptimalRR,
  
  // Monte Carlo
  runMonteCarloSimulation
};

export default AdvancedMathUtils;

