/**
 * Opportunity Ranker - Quality Over Quantity Trading
 * 
 * Scans, compares, and ranks trading opportunities to select only the BEST.
 * The goal: Fewer trades, higher win rate, consistent profitability.
 * 
 * KEY PRINCIPLES:
 * 1. Compare ALL opportunities before trading
 * 2. Only trade the top-ranked opportunity
 * 3. Minimum quality thresholds must be met
 * 4. Collect comprehensive data for ML fine-tuning
 */

import { logger } from '@/lib/logger';
import { MATH_CONSTANTS, TRADING_THRESHOLDS } from '@/constants/tradingConstants';

// ============================================================================
// QUALITY THRESHOLDS - Higher standards for better trades
// ============================================================================

export const QUALITY_THRESHOLDS = {
  // Minimum confidence to even consider a trade
  MIN_CONFIDENCE: 0.65, // Was 0.35 - Now require 65%+ confidence
  
  // Minimum expected value (% per trade)
  MIN_EXPECTED_VALUE: 1.5, // Was 0.5% - Now require 1.5%+ EV
  
  // Minimum risk/reward ratio
  MIN_RISK_REWARD: 2.5, // Require 2.5:1 or better
  
  // Minimum win probability from AI analysis
  MIN_WIN_PROBABILITY: 0.55, // Require 55%+ win probability
  
  // Minimum multi-timeframe agreement
  MIN_TIMEFRAME_AGREEMENT: 0.6, // 60%+ of timeframes must agree
  
  // Minimum indicator agreement
  MIN_INDICATOR_AGREEMENT: 0.7, // 70%+ of indicators must agree
  
  // Maximum spread for entry (lower = better execution)
  MAX_SPREAD_PERCENT: 0.15, // 0.15% max spread
  
  // Minimum liquidity score
  MIN_LIQUIDITY_SCORE: 0.6, // 60%+ liquidity
  
  // Opportunity comparison
  MIN_OPPORTUNITIES_TO_COMPARE: 3, // Scan at least 3 opportunities before deciding
  MAX_OPPORTUNITIES_TO_TRADE: 1, // Only trade the BEST opportunity
  
  // Cooldown between trades
  MIN_TRADE_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes between trades (was none)
  
  // Quality score components (weights must sum to 1.0)
  QUALITY_WEIGHTS: {
    confidence: 0.25,
    expectedValue: 0.20,
    riskReward: 0.15,
    winProbability: 0.15,
    timeframeAgreement: 0.10,
    indicatorAgreement: 0.10,
    liquidity: 0.05
  }
} as const;

// ============================================================================
// INTERFACES
// ============================================================================

export interface OpportunityScore {
  symbol: string;
  side: 'LONG' | 'SHORT';
  
  // Core metrics
  confidence: number;
  expectedValue: number;
  riskReward: number;
  winProbability: number;
  
  // Signal quality
  timeframeAgreement: number;
  indicatorAgreement: number;
  
  // Execution quality
  liquidity: number;
  spread: number;
  
  // Calculated quality score (0-100)
  qualityScore: number;
  
  // Breakdown of why this score
  scoreBreakdown: {
    component: string;
    value: number;
    weighted: number;
  }[];
  
  // Trade parameters if selected
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  
  // ML features for training
  mlFeatures: Record<string, number>;
  
  // Reasons for/against
  strengths: string[];
  weaknesses: string[];
  
  // Timestamps
  analyzedAt: number;
}

export interface OpportunityComparison {
  timestamp: number;
  totalScanned: number;
  passed: number;
  rejected: number;
  opportunities: OpportunityScore[];
  selectedOpportunity: OpportunityScore | null;
  selectionReason: string;
  rejectionReasons: Map<string, string[]>;
}

// ============================================================================
// OPPORTUNITY RANKER CLASS
// ============================================================================

class OpportunityRanker {
  private lastTradeTime: number = 0;
  private recentComparisons: OpportunityComparison[] = [];
  private readonly maxComparisonHistory = 100;

  /**
   * Calculate quality score for an opportunity
   */
  calculateQualityScore(opportunity: Partial<OpportunityScore>): number {
    const weights = QUALITY_THRESHOLDS.QUALITY_WEIGHTS;
    
    // Normalize each component to 0-1 scale
    const normalized = {
      confidence: Math.min(1, (opportunity.confidence || 0)),
      expectedValue: Math.min(1, (opportunity.expectedValue || 0) / 5), // 5% = max
      riskReward: Math.min(1, (opportunity.riskReward || 0) / 5), // 5:1 = max
      winProbability: Math.min(1, (opportunity.winProbability || 0)),
      timeframeAgreement: Math.min(1, (opportunity.timeframeAgreement || 0)),
      indicatorAgreement: Math.min(1, (opportunity.indicatorAgreement || 0)),
      liquidity: Math.min(1, (opportunity.liquidity || 0))
    };
    
    // Calculate weighted score
    let totalScore = 0;
    const breakdown: OpportunityScore['scoreBreakdown'] = [];
    
    for (const [component, weight] of Object.entries(weights)) {
      const value = normalized[component as keyof typeof normalized] || 0;
      const weighted = value * weight * 100;
      totalScore += weighted;
      
      breakdown.push({
        component,
        value: value * 100,
        weighted
      });
    }
    
    return Math.round(totalScore);
  }

  /**
   * Check if opportunity meets minimum quality thresholds
   */
  meetsQualityThresholds(opportunity: OpportunityScore): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // Check each threshold
    if (opportunity.confidence < QUALITY_THRESHOLDS.MIN_CONFIDENCE) {
      reasons.push(`Confidence ${(opportunity.confidence * 100).toFixed(0)}% < ${QUALITY_THRESHOLDS.MIN_CONFIDENCE * 100}% required`);
    }
    
    if (opportunity.expectedValue < QUALITY_THRESHOLDS.MIN_EXPECTED_VALUE) {
      reasons.push(`Expected Value ${opportunity.expectedValue.toFixed(2)}% < ${QUALITY_THRESHOLDS.MIN_EXPECTED_VALUE}% required`);
    }
    
    if (opportunity.riskReward < QUALITY_THRESHOLDS.MIN_RISK_REWARD) {
      reasons.push(`Risk/Reward ${opportunity.riskReward.toFixed(2)}:1 < ${QUALITY_THRESHOLDS.MIN_RISK_REWARD}:1 required`);
    }
    
    if (opportunity.winProbability < QUALITY_THRESHOLDS.MIN_WIN_PROBABILITY) {
      reasons.push(`Win Probability ${(opportunity.winProbability * 100).toFixed(0)}% < ${QUALITY_THRESHOLDS.MIN_WIN_PROBABILITY * 100}% required`);
    }
    
    if (opportunity.timeframeAgreement < QUALITY_THRESHOLDS.MIN_TIMEFRAME_AGREEMENT) {
      reasons.push(`Timeframe Agreement ${(opportunity.timeframeAgreement * 100).toFixed(0)}% < ${QUALITY_THRESHOLDS.MIN_TIMEFRAME_AGREEMENT * 100}% required`);
    }
    
    if (opportunity.spread > QUALITY_THRESHOLDS.MAX_SPREAD_PERCENT) {
      reasons.push(`Spread ${opportunity.spread.toFixed(3)}% > ${QUALITY_THRESHOLDS.MAX_SPREAD_PERCENT}% max allowed`);
    }
    
    if (opportunity.liquidity < QUALITY_THRESHOLDS.MIN_LIQUIDITY_SCORE) {
      reasons.push(`Liquidity ${(opportunity.liquidity * 100).toFixed(0)}% < ${QUALITY_THRESHOLDS.MIN_LIQUIDITY_SCORE * 100}% required`);
    }
    
    return {
      passed: reasons.length === 0,
      reasons
    };
  }

  /**
   * Check trade cooldown
   */
  canTradeNow(): { allowed: boolean; waitMs: number; reason: string } {
    const now = Date.now();
    const elapsed = now - this.lastTradeTime;
    const required = QUALITY_THRESHOLDS.MIN_TRADE_INTERVAL_MS;
    
    if (elapsed < required) {
      const waitMs = required - elapsed;
      return {
        allowed: false,
        waitMs,
        reason: `Trade cooldown: Wait ${Math.ceil(waitMs / 1000)}s before next trade`
      };
    }
    
    return { allowed: true, waitMs: 0, reason: 'Ready to trade' };
  }

  /**
   * Record that a trade was taken
   */
  recordTrade(symbol: string): void {
    this.lastTradeTime = Date.now();
    logger.info(`[COOLDOWN] Trade recorded for ${symbol} - Cooldown started`, {
      context: 'OpportunityRanker',
      data: { symbol, cooldownMs: QUALITY_THRESHOLDS.MIN_TRADE_INTERVAL_MS }
    });
  }

  /**
   * Compare and rank multiple opportunities
   */
  async rankOpportunities(opportunities: OpportunityScore[]): Promise<OpportunityComparison> {
    const comparison: OpportunityComparison = {
      timestamp: Date.now(),
      totalScanned: opportunities.length,
      passed: 0,
      rejected: 0,
      opportunities: [],
      selectedOpportunity: null,
      selectionReason: '',
      rejectionReasons: new Map()
    };
    
    // Check trade cooldown first
    const cooldownCheck = this.canTradeNow();
    if (!cooldownCheck.allowed) {
      comparison.selectionReason = cooldownCheck.reason;
      logger.info('⏳ Trade cooldown active', {
        context: 'OpportunityRanker',
        data: { waitMs: cooldownCheck.waitMs }
      });
      return comparison;
    }
    
    // Calculate quality scores for all opportunities
    for (const opp of opportunities) {
      opp.qualityScore = this.calculateQualityScore(opp);
      opp.analyzedAt = Date.now();
      
      // Check thresholds
      const { passed, reasons } = this.meetsQualityThresholds(opp);
      
      if (passed) {
        comparison.passed++;
        comparison.opportunities.push(opp);
      } else {
        comparison.rejected++;
        comparison.rejectionReasons.set(opp.symbol, reasons);
      }
    }
    
    // Sort by quality score (highest first)
    comparison.opportunities.sort((a, b) => b.qualityScore - a.qualityScore);
    
    // Log the ranking
    logger.info(`[RANK] Opportunity Ranking Complete`, {
      context: 'OpportunityRanker',
      data: {
        scanned: comparison.totalScanned,
        passed: comparison.passed,
        rejected: comparison.rejected,
        topOpportunities: comparison.opportunities.slice(0, 5).map(o => ({
          symbol: o.symbol,
          side: o.side,
          score: o.qualityScore,
          confidence: (o.confidence * 100).toFixed(0) + '%'
        }))
      }
    });
    
    // Select the best opportunity if any passed
    if (comparison.opportunities.length > 0) {
      const best = comparison.opportunities[0];
      
      // Additional check: Is it significantly better than alternatives?
      if (comparison.opportunities.length >= 2) {
        const secondBest = comparison.opportunities[1];
        const scoreDiff = best.qualityScore - secondBest.qualityScore;
        
        if (scoreDiff < 5) {
          // Too close - be more selective
          logger.info(`[WARN] Top opportunities too close in score`, {
            context: 'OpportunityRanker',
            data: {
              best: { symbol: best.symbol, score: best.qualityScore },
              secondBest: { symbol: secondBest.symbol, score: secondBest.qualityScore },
              diff: scoreDiff
            }
          });
          // Still select the best, but note it's marginal
          comparison.selectionReason = `Selected ${best.symbol} (marginally better by ${scoreDiff} points)`;
        } else {
          comparison.selectionReason = `Selected ${best.symbol} (clearly best by ${scoreDiff} points)`;
        }
      } else {
        comparison.selectionReason = `Selected ${best.symbol} (only opportunity passing thresholds)`;
      }
      
      comparison.selectedOpportunity = best;
      
      logger.info(`[SELECT] BEST OPPORTUNITY SELECTED: ${best.symbol}`, {
        context: 'OpportunityRanker',
        data: {
          symbol: best.symbol,
          side: best.side,
          qualityScore: best.qualityScore,
          confidence: (best.confidence * 100).toFixed(0) + '%',
          expectedValue: best.expectedValue.toFixed(2) + '%',
          riskReward: best.riskReward.toFixed(2) + ':1',
          winProbability: (best.winProbability * 100).toFixed(0) + '%',
          strengths: best.strengths,
          scoreBreakdown: best.scoreBreakdown
        }
      });
    } else {
      comparison.selectionReason = 'No opportunities met quality thresholds';
      logger.info(`[REJECT] NO OPPORTUNITIES PASSED QUALITY CHECK`, {
        context: 'OpportunityRanker',
        data: {
          scanned: comparison.totalScanned,
          rejected: comparison.rejected,
          sampleRejections: Array.from(comparison.rejectionReasons.entries()).slice(0, 3)
        }
      });
    }
    
    // Store comparison for analysis
    this.recentComparisons.push(comparison);
    if (this.recentComparisons.length > this.maxComparisonHistory) {
      this.recentComparisons.shift();
    }
    
    return comparison;
  }

  /**
   * Calculate expected value for a trade
   * EV = (WinRate × AvgWin) - (LossRate × AvgLoss)
   */
  calculateExpectedValue(
    winProbability: number,
    takeProfit: number,
    stopLoss: number,
    entryPrice: number
  ): number {
    const tpPercent = Math.abs((takeProfit - entryPrice) / entryPrice * 100);
    const slPercent = Math.abs((stopLoss - entryPrice) / entryPrice * 100);
    
    const lossProbability = 1 - winProbability;
    
    // Expected value per trade (as percentage)
    const ev = (winProbability * tpPercent) - (lossProbability * slPercent);
    
    return ev;
  }

  /**
   * Convert market scanner opportunity to scored opportunity
   */
  convertToScoredOpportunity(
    scannerOpportunity: {
      symbol: string;
      recommendation: string;
      confidence: number;
      score: number;
      volume24h: number;
      priceChange24h: number;
      spread?: number;
      liquidity?: number;
    },
    aiAnalysis?: {
      action: string;
      confidence: number;
      winProbability?: number;
      keyLevels?: {
        entry: number;
        stopLoss: number;
        takeProfit1: number;
      };
      riskReward?: string;
      timeframeAgreement?: number;
      indicatorAgreement?: number;
    }
  ): OpportunityScore {
    const side = scannerOpportunity.recommendation.includes('BUY') ? 'LONG' : 'SHORT';
    const confidence = aiAnalysis?.confidence || scannerOpportunity.confidence / 100;
    const winProbability = aiAnalysis?.winProbability || confidence * 0.9;
    
    // Parse risk/reward
    let riskReward = 1.5;
    if (aiAnalysis?.riskReward) {
      const match = aiAnalysis.riskReward.match(/1:(\d+\.?\d*)/);
      if (match) riskReward = parseFloat(match[1]);
    }
    
    // Get price levels
    const entryPrice = aiAnalysis?.keyLevels?.entry || 0;
    const stopLoss = aiAnalysis?.keyLevels?.stopLoss || 0;
    const takeProfit = aiAnalysis?.keyLevels?.takeProfit1 || 0;
    
    // Calculate expected value
    const expectedValue = entryPrice > 0 && stopLoss > 0 && takeProfit > 0
      ? this.calculateExpectedValue(winProbability, takeProfit, stopLoss, entryPrice)
      : riskReward * winProbability - (1 - winProbability); // Simplified EV
    
    // Calculate liquidity score
    const volume = scannerOpportunity.volume24h;
    const liquidity = Math.min(1, volume / 10_000_000); // $10M = 100% liquidity
    
    const opportunity: OpportunityScore = {
      symbol: scannerOpportunity.symbol,
      side,
      confidence,
      expectedValue,
      riskReward,
      winProbability,
      timeframeAgreement: aiAnalysis?.timeframeAgreement || 0.5,
      indicatorAgreement: aiAnalysis?.indicatorAgreement || 0.5,
      liquidity,
      spread: scannerOpportunity.spread || 0.1,
      qualityScore: 0, // Will be calculated
      scoreBreakdown: [],
      entryPrice,
      stopLoss,
      takeProfit,
      positionSize: 0, // Will be calculated based on Kelly
      mlFeatures: {
        // Features for ML training
        confidence,
        expectedValue,
        riskReward,
        winProbability,
        volume24h: volume,
        priceChange24h: scannerOpportunity.priceChange24h,
        liquidity,
        spread: scannerOpportunity.spread || 0.1,
        scannerScore: scannerOpportunity.score
      },
      strengths: [],
      weaknesses: [],
      analyzedAt: Date.now()
    };
    
    // Calculate quality score
    opportunity.qualityScore = this.calculateQualityScore(opportunity);
    
    // Identify strengths and weaknesses
    if (confidence >= 0.75) opportunity.strengths.push('High confidence');
    if (confidence < 0.5) opportunity.weaknesses.push('Low confidence');
    
    if (expectedValue >= 2) opportunity.strengths.push('Strong expected value');
    if (expectedValue < 1) opportunity.weaknesses.push('Weak expected value');
    
    if (riskReward >= 3) opportunity.strengths.push('Excellent R:R ratio');
    if (riskReward < 2) opportunity.weaknesses.push('Poor R:R ratio');
    
    if (liquidity >= 0.8) opportunity.strengths.push('High liquidity');
    if (liquidity < 0.5) opportunity.weaknesses.push('Low liquidity');
    
    return opportunity;
  }

  /**
   * Get statistics on recent comparisons
   */
  getComparisonStats(): {
    totalComparisons: number;
    avgScanned: number;
    avgPassed: number;
    passRate: number;
    avgQualityScore: number;
    topSymbols: { symbol: string; count: number; avgScore: number }[];
  } {
    if (this.recentComparisons.length === 0) {
      return {
        totalComparisons: 0,
        avgScanned: 0,
        avgPassed: 0,
        passRate: 0,
        avgQualityScore: 0,
        topSymbols: []
      };
    }
    
    const totalScanned = this.recentComparisons.reduce((sum, c) => sum + c.totalScanned, 0);
    const totalPassed = this.recentComparisons.reduce((sum, c) => sum + c.passed, 0);
    
    // Track symbol performance
    const symbolStats = new Map<string, { count: number; totalScore: number }>();
    for (const comparison of this.recentComparisons) {
      if (comparison.selectedOpportunity) {
        const symbol = comparison.selectedOpportunity.symbol;
        const existing = symbolStats.get(symbol) || { count: 0, totalScore: 0 };
        existing.count++;
        existing.totalScore += comparison.selectedOpportunity.qualityScore;
        symbolStats.set(symbol, existing);
      }
    }
    
    const topSymbols = Array.from(symbolStats.entries())
      .map(([symbol, stats]) => ({
        symbol,
        count: stats.count,
        avgScore: stats.totalScore / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Calculate average quality score of selected opportunities
    const selectedScores = this.recentComparisons
      .filter(c => c.selectedOpportunity)
      .map(c => c.selectedOpportunity!.qualityScore);
    
    const avgQualityScore = selectedScores.length > 0
      ? selectedScores.reduce((a, b) => a + b, 0) / selectedScores.length
      : 0;
    
    return {
      totalComparisons: this.recentComparisons.length,
      avgScanned: totalScanned / this.recentComparisons.length,
      avgPassed: totalPassed / this.recentComparisons.length,
      passRate: totalScanned > 0 ? (totalPassed / totalScanned) * 100 : 0,
      avgQualityScore,
      topSymbols
    };
  }
}

// Export singleton
const globalForRanker = globalThis as typeof globalThis & {
  __opportunityRanker?: OpportunityRanker;
};

if (!globalForRanker.__opportunityRanker) {
  globalForRanker.__opportunityRanker = new OpportunityRanker();
}

export const opportunityRanker = globalForRanker.__opportunityRanker;
export default opportunityRanker;

