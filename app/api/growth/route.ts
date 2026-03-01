/**
 * Growth Progress API
 * 
 * Returns compound growth metrics, milestones, and trading recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Dynamic imports to avoid build issues
    const { compoundGrowthEngine } = await import('@/services/trading/compoundGrowthEngine');
    const { mlMilestoneTracker } = await import('@/services/ml/mlMilestoneTracker');
    const { performanceBasedSizer } = await import('@/services/trading/performanceBasedSizer');
    
    // Get current balance
    const { realBalanceService } = await import('@/services/trading/realBalanceService');
    const balanceConfig = realBalanceService.getBalanceConfig();
    // FIX: RealBalanceConfig uses 'availableBalance', not 'realBalance'
    const currentBalance = balanceConfig?.availableBalance || 60;
    
    // Initialize growth engine with current balance
    await compoundGrowthEngine.initialize(currentBalance);
    
    // Get all data in parallel
    const [growthSummary, mlSummary, sizingSummary] = await Promise.all([
      compoundGrowthEngine.getSummary(),
      mlMilestoneTracker.getSummary(),
      performanceBasedSizer.getOptimalSizing()
    ]);
    
    return NextResponse.json({
      success: true,
      currentBalance,
      
      // Compound growth metrics
      growth: {
        startingBalance: growthSummary.metrics.startingBalance,
        currentBalance: growthSummary.metrics.currentBalance,
        totalGrowthPercent: growthSummary.metrics.totalGrowthPercent,
        totalTrades: growthSummary.metrics.totalTrades,
        winRate: growthSummary.metrics.winRate,
        profitFactor: growthSummary.metrics.profitFactor,
        expectancy: growthSummary.metrics.expectancy,
        compoundRate: growthSummary.metrics.compoundRate,
        projectedAt100: growthSummary.metrics.projectedBalanceAt100Trades,
        projectedAt500: growthSummary.metrics.projectedBalanceAt500Trades,
        currentStreak: growthSummary.metrics.currentStreak,
        bestStreak: growthSummary.metrics.bestStreak,
        worstDrawdown: growthSummary.metrics.worstDrawdown
      },
      
      // Current quality gate
      qualityGate: growthSummary.qualityGate,
      
      // Milestones
      nextMilestone: growthSummary.nextMilestone,
      completedMilestones: growthSummary.completedMilestones,
      
      // Trading advice
      tradingAdvice: growthSummary.tradingAdvice,
      
      // ML training readiness
      mlReadiness: mlSummary.readiness,
      mlMilestones: mlSummary.milestones,
      dataQuality: mlSummary.quality,
      
      // Current position sizing
      sizing: {
        tier: sizingSummary.tier.name,
        positionSizePercent: sizingSummary.positionSizePercent,
        maxLeverage: sizingSummary.maxLeverage,
        shouldSizeUp: sizingSummary.shouldSizeUp,
        shouldSizeDown: sizingSummary.shouldSizeDown,
        reasoning: sizingSummary.reasoning
      }
    });
    
  } catch (error) {
    logger.error('Failed to get growth data', error, {
      context: 'GrowthAPI'
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


