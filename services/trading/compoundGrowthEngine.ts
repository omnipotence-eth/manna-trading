/**
 * COMPOUND GROWTH ENGINE
 * 
 * The #1 way to turn $60 into infinite wealth: COMPOUND GROWTH
 * 
 * Key Principles:
 * 1. Never risk more than you can afford to lose
 * 2. Let winners run with trailing stops
 * 3. Cut losers FAST (no hoping, no praying)
 * 4. Compound every single dollar of profit
 * 5. Trade LESS, but make each trade COUNT
 * 
 * Math behind compound growth:
 * - $60 → $63 (+5%) → $66.15 (+5%) → $69.46 (+5%)
 * - 10 successful 5% trades = $97.73 (63% total gain)
 * - 20 successful 5% trades = $159.29 (165% total gain)
 * - 50 successful 5% trades = $687.34 (1045% total gain)
 */

import { logger } from '@/lib/logger';
import { createSingleton } from '@/lib/singleton';
import { performanceBasedSizer } from './performanceBasedSizer';

// Dynamic import
async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}

export interface GrowthMetrics {
  startingBalance: number;
  currentBalance: number;
  totalGrowthPercent: number;
  totalTrades: number;
  winningTrades: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitFactor: number;
  winRate: number;
  expectancy: number;  // Expected $ per trade
  compoundRate: number;  // Average % per trade
  projectedBalanceAt100Trades: number;
  projectedBalanceAt500Trades: number;
  currentStreak: number;
  bestStreak: number;
  worstDrawdown: number;
}

export interface TradeQualityGates {
  minConfidence: number;
  minRiskReward: number;
  maxSpread: number;
  minLiquidity: number;
  minScore: number;
  requireMultiTimeframe: boolean;
  requireVolumeConfirmation: boolean;
}

// QUALITY GATES - Only take A+ setups
// With $60, you can't afford to waste trades on mediocre setups
const QUALITY_GATES: { [key: string]: TradeQualityGates } = {
  // Ultra conservative - rebuild confidence
  RECOVERY: {
    minConfidence: 0.75,  // 75% AI confidence
    minRiskReward: 3.0,   // 3:1 minimum
    maxSpread: 0.15,      // Very tight spread
    minLiquidity: 2000000, // $2M minimum volume
    minScore: 80,         // Top 20% of setups only
    requireMultiTimeframe: true,
    requireVolumeConfirmation: true
  },
  
  // Conservative - small account, protect capital (TIGHTENED)
  CONSERVATIVE: {
    minConfidence: 0.75,  // 75% AI confidence (TIGHTENED from 70%)
    minRiskReward: 3.0,   // 3:1 minimum (TIGHTENED from 2.5:1)
    maxSpread: 0.15,       // Tighter spread (TIGHTENED from 0.2%)
    minLiquidity: 2000000, // $2M minimum volume (TIGHTENED from $1.5M)
    minScore: 80,         // Top 20% of setups (TIGHTENED from 75)
    requireMultiTimeframe: true,
    requireVolumeConfirmation: true
  },
  
  // Normal - proven track record (TIGHTENED)
  NORMAL: {
    minConfidence: 0.70,  // 70% AI confidence (TIGHTENED from 65%)
    minRiskReward: 2.5,   // 2.5:1 minimum (TIGHTENED from 2:1)
    maxSpread: 0.2,       // Tighter spread (TIGHTENED from 0.3%)
    minLiquidity: 1500000, // $1.5M minimum volume (TIGHTENED from $1M)
    minScore: 75,         // Top 25% of setups (TIGHTENED from 70)
    requireMultiTimeframe: true,
    requireVolumeConfirmation: true // TIGHTENED: Require volume confirmation
  },
  
  // Aggressive - strong track record, sized up
  AGGRESSIVE: {
    minConfidence: 0.60,  // 60% AI confidence
    minRiskReward: 1.75,  // 1.75:1 minimum
    maxSpread: 0.4,       // Accept wider spread
    minLiquidity: 750000, // $750K minimum volume
    minScore: 65,         // Top 35% of setups
    requireMultiTimeframe: false,
    requireVolumeConfirmation: false
  }
};

// COMPOUND GROWTH TARGETS
const GROWTH_TARGETS = [
  { balance: 75, milestone: '[TARGET] First +25%', reward: 'Unlock CAUTIOUS sizing' },
  { balance: 100, milestone: '[MILESTONE] First $100', reward: 'Unlock MODERATE sizing + 2 concurrent positions' },
  { balance: 150, milestone: '[GROWTH] 2.5x Growth', reward: 'Unlock CONFIDENT sizing' },
  { balance: 200, milestone: '[MILESTONE] First $200', reward: 'Unlock AGGRESSIVE sizing + 3 concurrent positions' },
  { balance: 500, milestone: '[MILESTONE] First $500', reward: 'Full system unlocked + ML fine-tuning ready' },
  { balance: 1000, milestone: '[MILESTONE] First $1000', reward: 'Consider withdrawal + reinvestment strategy' },
  { balance: 5000, milestone: '[CLUB] $5000 Club', reward: 'Consider diversification to multiple strategies' },
  { balance: 10000, milestone: '[LEGEND] $10K Legend', reward: 'System has proven edge, consider scaling' }
];

class CompoundGrowthEngine {
  private metrics: GrowthMetrics | null = null;
  private startingBalance: number = 60;  // Default
  private qualityGate: TradeQualityGates = QUALITY_GATES.CONSERVATIVE;
  
  /**
   * Initialize with starting balance
   */
  async initialize(startingBalance: number = 60): Promise<void> {
    this.startingBalance = startingBalance;
    await this.updateMetrics();
    await this.updateQualityGate();
    
    logger.info('[INIT] Compound Growth Engine initialized', {
      context: 'CompoundGrowth',
      data: {
        startingBalance: this.startingBalance,
        qualityGate: this.getQualityGateName()
      }
    });
  }
  
  /**
   * Get current quality gate name
   */
  private getQualityGateName(): string {
    for (const [name, gate] of Object.entries(QUALITY_GATES)) {
      if (gate === this.qualityGate) return name;
    }
    return 'UNKNOWN';
  }
  
  /**
   * Check if a trade opportunity passes quality gates
   */
  async shouldTakeTrade(opportunity: {
    confidence: number;
    riskReward: number;
    spread: number;
    liquidity: number;
    score: number;
    hasMultiTimeframe?: boolean;
    hasVolumeConfirmation?: boolean;
  }): Promise<{
    shouldTrade: boolean;
    reason: string;
    qualityScore: number;
    improvements: string[];
  }> {
    const gate = this.qualityGate;
    const improvements: string[] = [];
    let qualityScore = 0;
    
    // Check each gate
    const checks = [
      {
        name: 'Confidence',
        passed: opportunity.confidence >= gate.minConfidence,
        score: opportunity.confidence >= gate.minConfidence ? 25 : 0,
        improvement: `Need ${(gate.minConfidence * 100).toFixed(0)}% confidence (have ${(opportunity.confidence * 100).toFixed(0)}%)`
      },
      {
        name: 'Risk/Reward',
        passed: opportunity.riskReward >= gate.minRiskReward,
        score: opportunity.riskReward >= gate.minRiskReward ? 25 : 0,
        improvement: `Need ${gate.minRiskReward}:1 R:R (have ${opportunity.riskReward.toFixed(1)}:1)`
      },
      {
        name: 'Spread',
        passed: opportunity.spread <= gate.maxSpread,
        score: opportunity.spread <= gate.maxSpread ? 15 : 0,
        improvement: `Need spread ≤${gate.maxSpread}% (have ${opportunity.spread.toFixed(2)}%)`
      },
      {
        name: 'Liquidity',
        passed: opportunity.liquidity >= gate.minLiquidity,
        score: opportunity.liquidity >= gate.minLiquidity ? 15 : 0,
        improvement: `Need $${(gate.minLiquidity / 1000000).toFixed(1)}M volume (have $${(opportunity.liquidity / 1000000).toFixed(1)}M)`
      },
      {
        name: 'Score',
        passed: opportunity.score >= gate.minScore,
        score: opportunity.score >= gate.minScore ? 10 : 0,
        improvement: `Need score ≥${gate.minScore} (have ${opportunity.score})`
      },
      {
        name: 'Multi-TF',
        passed: !gate.requireMultiTimeframe || opportunity.hasMultiTimeframe,
        score: (!gate.requireMultiTimeframe || opportunity.hasMultiTimeframe) ? 5 : 0,
        improvement: 'Need multi-timeframe confirmation'
      },
      {
        name: 'Volume',
        passed: !gate.requireVolumeConfirmation || opportunity.hasVolumeConfirmation,
        score: (!gate.requireVolumeConfirmation || opportunity.hasVolumeConfirmation) ? 5 : 0,
        improvement: 'Need volume confirmation'
      }
    ];
    
    for (const check of checks) {
      qualityScore += check.score;
      if (!check.passed) {
        improvements.push(check.improvement);
      }
    }
    
    const shouldTrade = improvements.length === 0;
    const reason = shouldTrade 
      ? `[OK] A+ setup: All quality gates passed (${qualityScore}/100)`
      : `[REJECT] Not trading: ${improvements.length} gates failed - ${improvements[0]}`;
    
    if (!shouldTrade) {
      logger.info('[REJECT] Trade rejected by quality gates', {
        context: 'CompoundGrowth',
        data: {
          qualityScore,
          failedChecks: improvements.length,
          reason: improvements[0]
        }
      });
    }
    
    return { shouldTrade, reason, qualityScore, improvements };
  }
  
  /**
   * Calculate optimal position size for compound growth
   */
  async getOptimalPositionSize(
    currentBalance: number,
    riskReward: number,
    confidence: number
  ): Promise<{
    positionSizePercent: number;
    riskAmount: number;
    potentialProfit: number;
    reasoning: string;
  }> {
    // Get performance-based sizing
    const sizing = await performanceBasedSizer.getOptimalSizing();
    
    // Adjust based on R:R and confidence
    // Higher R:R = can risk more (less likely to lose)
    // Higher confidence = can risk more
    const rrMultiplier = Math.min(1.5, riskReward / 2);  // Max 1.5x at 3:1 R:R
    const confMultiplier = Math.min(1.3, confidence / 0.65);  // Max 1.3x at 85% confidence
    
    // Calculate adjusted position size
    let adjustedPercent = sizing.positionSizePercent * rrMultiplier * confMultiplier;
    
    // Apply safety caps
    adjustedPercent = Math.min(adjustedPercent, 3.0);  // Never more than 3%
    adjustedPercent = Math.max(adjustedPercent, 0.5);  // Never less than 0.5%
    
    // For small accounts, be extra careful
    if (currentBalance < 100) {
      adjustedPercent = Math.min(adjustedPercent, 2.0);  // Cap at 2% for <$100
    }
    
    const riskAmount = currentBalance * (adjustedPercent / 100);
    const potentialProfit = riskAmount * riskReward;
    
    const reasoning = `${sizing.tier.name} tier (${sizing.positionSizePercent}% base) × ${rrMultiplier.toFixed(2)} R:R × ${confMultiplier.toFixed(2)} conf = ${adjustedPercent.toFixed(1)}% position`;
    
    return {
      positionSizePercent: adjustedPercent,
      riskAmount,
      potentialProfit,
      reasoning
    };
  }
  
  /**
   * Update quality gate based on performance
   */
  async updateQualityGate(): Promise<void> {
    const sizing = await performanceBasedSizer.getOptimalSizing();
    
    // Determine gate based on performance tier
    switch (sizing.tier.name) {
      case 'CONSERVATIVE':
        // After losses, be extra careful
        if (sizing.shouldSizeDown) {
          this.qualityGate = QUALITY_GATES.RECOVERY;
        } else {
          this.qualityGate = QUALITY_GATES.CONSERVATIVE;
        }
        break;
      case 'CAUTIOUS':
        this.qualityGate = QUALITY_GATES.CONSERVATIVE;
        break;
      case 'MODERATE':
        this.qualityGate = QUALITY_GATES.NORMAL;
        break;
      case 'CONFIDENT':
        this.qualityGate = QUALITY_GATES.NORMAL;
        break;
      case 'AGGRESSIVE':
        this.qualityGate = QUALITY_GATES.AGGRESSIVE;
        break;
      default:
        this.qualityGate = QUALITY_GATES.CONSERVATIVE;
    }
    
    logger.debug(`Quality gate updated to ${this.getQualityGateName()}`, {
      context: 'CompoundGrowth',
      data: {
        tier: sizing.tier.name,
        minConfidence: this.qualityGate.minConfidence,
        minRR: this.qualityGate.minRiskReward
      }
    });
  }
  
  /**
   * Get current quality gate requirements
   */
  getQualityGate(): TradeQualityGates & { name: string } {
    return {
      ...this.qualityGate,
      name: this.getQualityGateName()
    };
  }
  
  /**
   * Update growth metrics
   */
  async updateMetrics(): Promise<GrowthMetrics> {
    try {
      const db = await getDb();
      
      const result = await db.execute(`
        SELECT 
          pnl,
          pnl_percent,
          timestamp,
          exit_timestamp
        FROM trades
        WHERE exit_timestamp IS NOT NULL
        ORDER BY exit_timestamp ASC
      `);
      
      const trades = result.rows || [];
      
      let currentBalance = this.startingBalance;
      let winningTrades = 0;
      let totalWinPercent = 0;
      let totalLossPercent = 0;
      let peak = this.startingBalance;
      let worstDrawdown = 0;
      let currentStreak = 0;
      let bestStreak = 0;
      let lastResult = 0;
      
      for (const trade of trades) {
        const pnl = parseFloat(trade.pnl) || 0;
        const pnlPercent = parseFloat(trade.pnl_percent) || 0;
        
        // Compound the balance
        currentBalance += pnl;
        
        if (pnl > 0) {
          winningTrades++;
          totalWinPercent += pnlPercent;
          
          // Track streak
          if (lastResult >= 0) {
            currentStreak++;
            if (currentStreak > bestStreak) bestStreak = currentStreak;
          } else {
            currentStreak = 1;
          }
          lastResult = 1;
        } else {
          totalLossPercent += Math.abs(pnlPercent);
          
          if (lastResult <= 0) {
            currentStreak--;
          } else {
            currentStreak = -1;
          }
          lastResult = -1;
        }
        
        // Track drawdown
        if (currentBalance > peak) peak = currentBalance;
        const drawdown = (peak - currentBalance) / peak * 100;
        if (drawdown > worstDrawdown) worstDrawdown = drawdown;
      }
      
      const totalTrades = trades.length;
      const losingTrades = totalTrades - winningTrades;
      const avgWinPercent = winningTrades > 0 ? totalWinPercent / winningTrades : 0;
      const avgLossPercent = losingTrades > 0 ? totalLossPercent / losingTrades : 0;
      const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
      const profitFactor = totalLossPercent > 0 ? totalWinPercent / totalLossPercent : (totalWinPercent > 0 ? 10 : 0);
      
      // Expectancy = (WinRate × AvgWin) - (LossRate × AvgLoss)
      const expectancy = (winRate * avgWinPercent) - ((1 - winRate) * avgLossPercent);
      
      // Compound rate = average % per trade
      const compoundRate = totalTrades > 0 
        ? ((currentBalance / this.startingBalance) - 1) / totalTrades * 100
        : 0;
      
      // Project future balances (assuming compound growth continues)
      const growthMultiplier = totalTrades > 0 
        ? Math.pow(currentBalance / this.startingBalance, 1 / totalTrades)
        : 1.02; // Assume 2% per trade if no data
      
      this.metrics = {
        startingBalance: this.startingBalance,
        currentBalance,
        totalGrowthPercent: ((currentBalance / this.startingBalance) - 1) * 100,
        totalTrades,
        winningTrades,
        avgWinPercent,
        avgLossPercent,
        profitFactor,
        winRate,
        expectancy,
        compoundRate,
        projectedBalanceAt100Trades: this.startingBalance * Math.pow(growthMultiplier, 100),
        projectedBalanceAt500Trades: this.startingBalance * Math.pow(growthMultiplier, 500),
        currentStreak,
        bestStreak,
        worstDrawdown
      };
      
      return this.metrics;
    } catch (error) {
      logger.error('Failed to update growth metrics', error, {
        context: 'CompoundGrowth'
      });
      
      return this.getDefaultMetrics();
    }
  }
  
  /**
   * Get next milestone
   */
  getNextMilestone(currentBalance: number): {
    target: number;
    milestone: string;
    reward: string;
    progress: number;
    amountNeeded: number;
  } | null {
    for (const target of GROWTH_TARGETS) {
      if (currentBalance < target.balance) {
        const previousTarget = GROWTH_TARGETS[GROWTH_TARGETS.indexOf(target) - 1];
        const baseBalance = previousTarget?.balance || this.startingBalance;
        const progress = Math.min(100, ((currentBalance - baseBalance) / (target.balance - baseBalance)) * 100);
        
        return {
          target: target.balance,
          milestone: target.milestone,
          reward: target.reward,
          progress,
          amountNeeded: target.balance - currentBalance
        };
      }
    }
    return null;
  }
  
  /**
   * Get all completed milestones
   */
  getCompletedMilestones(currentBalance: number): Array<{
    balance: number;
    milestone: string;
    reward: string;
  }> {
    return GROWTH_TARGETS.filter(t => currentBalance >= t.balance);
  }
  
  /**
   * Get growth summary
   */
  async getSummary(): Promise<{
    metrics: GrowthMetrics;
    qualityGate: TradeQualityGates & { name: string };
    nextMilestone: {
      target: number;
      milestone: string;
      reward: string;
      progress: number;
      amountNeeded: number;
    } | null;
    completedMilestones: Array<{
      balance: number;
      milestone: string;
      reward: string;
    }>;
    tradingAdvice: string[];
  }> {
    const metrics = await this.updateMetrics();
    await this.updateQualityGate();
    
    const advice: string[] = [];
    
    // Generate personalized advice
    if (metrics.winRate < 0.5) {
      advice.push('[ADVICE] Focus on quality over quantity - only take A+ setups');
    }
    if (metrics.avgLossPercent > metrics.avgWinPercent) {
      advice.push('[ADVICE] Cut losses faster - your losses are bigger than wins');
    }
    if (metrics.profitFactor < 1.5) {
      advice.push('[ADVICE] Improve R:R - aim for 2.5:1 minimum to compensate for losses');
    }
    if (metrics.currentStreak < 0) {
      advice.push('[ADVICE] In drawdown - reduce position size and wait for A+ setups');
    }
    if (metrics.currentStreak > 2) {
      advice.push('[ADVICE] On a hot streak - stick to the system, dont get overconfident');
    }
    if (metrics.worstDrawdown > 15) {
      advice.push('[WARN] Large drawdown detected - review risk management');
    }
    if (metrics.totalTrades < 10) {
      advice.push('[ADVICE] Build track record - need 10+ trades for reliable metrics');
    }
    
    if (advice.length === 0) {
      advice.push('[OK] System performing well - keep following the rules!');
    }
    
    return {
      metrics,
      qualityGate: this.getQualityGate(),
      nextMilestone: this.getNextMilestone(metrics.currentBalance),
      completedMilestones: this.getCompletedMilestones(metrics.currentBalance),
      tradingAdvice: advice
    };
  }
  
  /**
   * Get metrics
   */
  getMetrics(): GrowthMetrics {
    return this.metrics || this.getDefaultMetrics();
  }
  
  /**
   * Default metrics
   */
  private getDefaultMetrics(): GrowthMetrics {
    return {
      startingBalance: this.startingBalance,
      currentBalance: this.startingBalance,
      totalGrowthPercent: 0,
      totalTrades: 0,
      winningTrades: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      profitFactor: 0,
      winRate: 0,
      expectancy: 0,
      compoundRate: 0,
      projectedBalanceAt100Trades: this.startingBalance,
      projectedBalanceAt500Trades: this.startingBalance,
      currentStreak: 0,
      bestStreak: 0,
      worstDrawdown: 0
    };
  }
}

// Export singleton
export const compoundGrowthEngine = createSingleton(
  'compoundGrowthEngine',
  () => new CompoundGrowthEngine()
);

