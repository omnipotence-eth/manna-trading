/**
 * Goal Tracking API
 * Provides real-time goal progress and strategy recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { goalTracker } from '@/services/trading/goalTracker';
import { asterDexService } from '@/services/exchange/asterDexService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get current balance from exchange
    const balance = await asterDexService.getBalance();
    
    // Update goal tracker with current balance
    goalTracker.updateBalance(balance);
    
    // Get full goal status
    const status = goalTracker.getGoalStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        goal: status.goal ? {
          id: status.goal.id,
          name: status.goal.name,
          startBalance: status.goal.startBalance,
          targetBalance: status.goal.targetBalance,
          currentBalance: status.goal.currentBalance,
          startTime: status.goal.startTime.toISOString(),
          deadline: status.goal.deadline.toISOString(),
          status: status.goal.status,
          milestones: status.goal.milestones,
          tradeCount: status.goal.trades.length,
        } : null,
        progress: status.progress,
        remainingGrowth: status.remainingGrowth,
        hoursRemaining: status.hoursRemaining,
        pnlToday: status.pnlToday,
        winRate: status.winRate,
        recommendation: status.recommendation,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[ERROR] Goal API error', error instanceof Error ? error : new Error(String(error)), {
      context: 'GoalAPI',
      action: 'GET'
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch goal status'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'reset') {
      const goal = goalTracker.resetToDefaultGoal();
      return NextResponse.json({
        success: true,
        data: { goal },
        message: 'Goal reset to $60 → $100'
      });
    }
    
    if (body.action === 'setGoal') {
      const { startBalance, targetBalance, durationHours, name } = body;
      const goal = goalTracker.setGoal({
        startBalance: startBalance || 60,
        targetBalance: targetBalance || 100,
        durationHours: durationHours || 24,
        name
      });
      return NextResponse.json({
        success: true,
        data: { goal }
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 });
  } catch (error) {
    logger.error('[ERROR] Goal API POST error', error instanceof Error ? error : new Error(String(error)), {
      context: 'GoalAPI',
      action: 'POST'
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to process goal action'
    }, { status: 500 });
  }
}


