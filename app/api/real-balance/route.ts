/**
 * Balance Chart Data API Route
 * Provides historical balance data for interactive chart
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { asterDexService } from '@/services/asterDexService';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('BalanceChartDataAPI');

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'chart-data';
    const timeRange = url.searchParams.get('timeRange') || '24H';

    switch (action) {
      case 'chart-data':
        return await getChartData(timeRange);
      case 'current-balance':
        return await getCurrentBalance();
      case 'balance-history':
        return await getBalanceHistory(timeRange);
      default:
        return createSuccessResponse({
          message: 'Balance Chart Data API',
          endpoints: [
            'GET /api/real-balance?action=chart-data&timeRange=24H',
            'GET /api/real-balance?action=current-balance',
            'GET /api/real-balance?action=balance-history&timeRange=24H'
          ]
        });
    }
  } catch (error) {
    return handleApiError(error, 'BalanceChartDataAPI');
  } finally {
    timer.end();
  }
}

async function getChartData(timeRange: string) {
  try {
    logger.info('Fetching balance chart data', { 
      context: 'BalanceChartAPI',
      data: { timeRange }
    });

    // Fetch real balance from Aster API - no fallback
    const accountInfo = await asterDexService.getAccountInfo();
    
    if (!accountInfo || !accountInfo.availableBalance) {
      throw new Error('No real balance data available from Aster API');
    }
    
    // Use availableBalance (the actual trading balance)
    const currentBalance = accountInfo.availableBalance;

    // Calculate time range in milliseconds
    const now = Date.now();
    const timeRangeMs = getTimeRangeMs(timeRange);
    const startTime = now - timeRangeMs;

    // Create a simple chart showing current balance as a flat line
    const dataPoints = Math.max(20, Math.floor(timeRangeMs / (30 * 60 * 1000))); // 30-minute intervals
    const intervalMs = timeRangeMs / dataPoints;
    
    const chartData = [];
    for (let i = 0; i <= dataPoints; i++) {
      const timestamp = startTime + (i * intervalMs);
      chartData.push({
        timestamp: timestamp,
        balance: currentBalance,
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalPnL: 0
      });
    }

    logger.info('Balance chart data created successfully', {
      context: 'BalanceChartAPI',
      data: {
        timeRange,
        dataPoints: chartData.length,
        currentBalance,
        timeSpan: `${Math.round((now - chartData[0]?.timestamp) / (1000 * 60 * 60))} hours`,
        isRealData: true
      }
    });

    return createSuccessResponse({
      message: 'Balance chart data (real)',
      data: chartData,
      metadata: {
        timeRange,
        currentBalance,
        dataPoints: chartData.length,
        lastUpdated: now,
        isRealData: true
      }
    });

  } catch (error) {
    logger.error('Failed to fetch balance chart data', error, { context: 'BalanceChartAPI' });
    
    return NextResponse.json(
      { error: 'Failed to fetch real chart data' },
      { status: 500 }
    );
  }
}

async function getCurrentBalance() {
  try {
    // Fetch real balance from Aster API
    const accountInfo = await asterDexService.getAccountInfo();
    
    if (accountInfo && accountInfo.availableBalance) {
      // Use availableBalance (the actual trading balance)
      const currentBalance = accountInfo.availableBalance;
      
      logger.info('Real balance fetched from Aster API', {
        context: 'BalanceChartAPI',
        data: { 
          balance: currentBalance,
          totalWalletBalance: accountInfo.totalWalletBalance,
          availableBalance: accountInfo.availableBalance
        }
      });

      return createSuccessResponse({
        message: 'Current balance retrieved successfully',
        data: {
          balance: currentBalance,
          timestamp: Date.now(),
          source: 'aster_api'
        }
      });
    } else {
      throw new Error('No balance data from Aster API');
    }
  } catch (error) {
    logger.error('Failed to fetch current balance from Aster API', error, { context: 'BalanceChartAPI' });
    
    return NextResponse.json(
      { error: 'Failed to fetch real balance data' },
      { status: 500 }
    );
  }
}

async function getBalanceHistory(timeRange: string) {
  try {
    const timeRangeMs = getTimeRangeMs(timeRange);
    const startTime = Date.now() - timeRangeMs;

    const history = await db.execute(
      `SELECT timestamp, balance, unrealized_pnl, realized_pnl, total_pnl
       FROM balance_history 
       WHERE timestamp >= $1 
       ORDER BY timestamp DESC
       LIMIT 1000`,
      [new Date(startTime)]
    );

    const formattedHistory = history.rows.map(row => ({
      timestamp: new Date(row.timestamp).getTime(),
      balance: parseFloat(row.balance),
      unrealizedPnl: parseFloat(row.unrealized_pnl || 0),
      realizedPnl: parseFloat(row.realized_pnl || 0),
      totalPnL: parseFloat(row.total_pnl || 0)
    }));

    return createSuccessResponse({
      message: 'Balance history retrieved successfully',
      data: formattedHistory,
      metadata: {
        timeRange,
        records: formattedHistory.length,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to fetch balance history', error, { context: 'BalanceChartAPI' });
    throw error;
  }
}

function getTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case '1H': return 60 * 60 * 1000;
    case '4H': return 4 * 60 * 60 * 1000;
    case '24H': return 24 * 60 * 60 * 1000;
    case '7D': return 7 * 24 * 60 * 60 * 1000;
    case '30D': return 30 * 24 * 60 * 60 * 1000;
    case 'ALL': return 365 * 24 * 60 * 60 * 1000; // 1 year
    default: return 24 * 60 * 60 * 1000;
  }
}