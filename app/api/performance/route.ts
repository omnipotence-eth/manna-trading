/**
 * Performance API
 * Get trading performance metrics and analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { performanceTracker } from '@/services/performanceTracker';
import { logger } from '@/lib/logger';

/**
 * GET /api/performance
 * Get performance metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const days = parseInt(searchParams.get('days') || '30');

    // Validate days parameter
    if (days < 1 || days > 365) {
      return NextResponse.json({
        success: false,
        error: 'Days parameter must be between 1 and 365'
      }, { status: 400 });
    }

    switch (action) {
      case 'summary':
        // Get complete performance summary
        const summary = await performanceTracker.getPerformanceSummary(days);
        
        logger.debug('Performance summary fetched', {
          context: 'PerformanceAPI',
          data: {
            days,
            totalTrades: summary.metrics.totalTrades,
            winRate: summary.metrics.winRate.toFixed(2)
          }
        });

        return NextResponse.json({
          success: true,
          data: summary,
          period: `${days} days`
        });

      case 'metrics':
        // Get just the metrics
        const metrics = await performanceTracker.getPerformanceMetrics(days);
        
        return NextResponse.json({
          success: true,
          data: metrics,
          period: `${days} days`
        });

      case 'by-symbol':
        // Get performance by symbol
        const symbolPerformance = await performanceTracker.getSymbolPerformance(days);
        
        return NextResponse.json({
          success: true,
          data: symbolPerformance,
          period: `${days} days`
        });

      case 'daily':
        // Get daily performance
        const dailyPerformance = await performanceTracker.getDailyPerformance(days);
        
        return NextResponse.json({
          success: true,
          data: dailyPerformance,
          period: `${days} days`
        });

      case 'recent-trades':
        // Get recent trades
        const limit = parseInt(searchParams.get('limit') || '20');
        const recentTrades = await performanceTracker.getRecentTrades(limit);
        
        return NextResponse.json({
          success: true,
          data: recentTrades,
          count: recentTrades.length
        });

      case 'is-profitable':
        // Check if system is profitable
        const minWinRate = parseFloat(searchParams.get('minWinRate') || '55');
        const minTrades = parseInt(searchParams.get('minTrades') || '10');
        
        const profitability = await performanceTracker.isProfitable(minWinRate, minTrades);
        
        return NextResponse.json({
          success: true,
          data: profitability
        });

      default:
        // Default: return summary
        const defaultSummary = await performanceTracker.getPerformanceSummary(days);
        
        return NextResponse.json({
          success: true,
          data: defaultSummary,
          period: `${days} days`
        });
    }

  } catch (error) {
    logger.error('Failed to fetch performance data', error, { context: 'PerformanceAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch performance data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

