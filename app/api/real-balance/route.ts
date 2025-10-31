/**
 * Balance Chart Data API Route
 * Provides historical balance data for interactive chart
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
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
        return await getChartData(timeRange, request);
      case 'current-balance':
        return await getCurrentBalance(request);
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

async function getChartData(timeRange: string, request: NextRequest) {
  try {
    logger.info('Fetching balance chart data', { 
      context: 'BalanceChartAPI',
      data: { timeRange }
    });

    // Fetch account equity directly from asterDexService
    const { asterDexService } = await import('@/services/asterDexService');
    const balance = await asterDexService.getBalance();
    
    if (!balance || balance === 0) {
      logger.warn('No balance data from Aster API, using fallback', {
        context: 'BalanceChartAPI'
      });
    }
    
    // Use account equity (balance already returns totalMarginBalance which includes unrealized P&L)
    const currentBalance = balance;

    // Calculate time range in milliseconds
    const now = Date.now();
    const timeRangeMs = getTimeRangeMs(timeRange);
    const startTime = now - timeRangeMs;

    // Fetch all trades from database to calculate equity progression
    const { getTrades } = await import('@/lib/db');
    const allTrades = await getTrades({ limit: 1000 });
    
    // Filter trades within time range
    const tradesInRange = allTrades.filter(trade => {
      const tradeTime = new Date(trade.timestamp).getTime();
      return tradeTime >= startTime && tradeTime <= now;
    });

    // Sort trades by timestamp
    tradesInRange.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate equity progression from trades
    const chartData = [];
    
    // CRITICAL FIX: Fetch initial deposit from config or database instead of hardcoding
    const { asterConfig } = await import('@/lib/configService');
    const INITIAL_DEPOSIT = asterConfig.trading.initialCapital || 100; // Use config value, fallback to 100
    
    // Calculate total P&L from ALL trades (to show full progression)
    const totalHistoricalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    // Add starting point at the earliest trade time OR 24h ago (whichever is earlier)
    const earliestTradeTime = allTrades.length > 0 
      ? Math.min(...allTrades.map(t => new Date(t.timestamp).getTime()))
      : startTime;
    const chartStartTime = Math.min(earliestTradeTime, startTime);
    
    chartData.push({
      timestamp: chartStartTime,
      balance: INITIAL_DEPOSIT,
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalPnL: 0
    });

    // Add point for each trade chronologically
    let cumulativePnL = 0;
    allTrades.forEach((trade) => {
      const tradeTime = new Date(trade.timestamp).getTime();
      // Only include trades after our start point
      if (tradeTime >= chartStartTime) {
        cumulativePnL += trade.pnl || 0;
        const balanceAtTrade = INITIAL_DEPOSIT + cumulativePnL;
        
        chartData.push({
          timestamp: tradeTime,
          balance: balanceAtTrade,
          unrealizedPnl: 0,
          realizedPnl: cumulativePnL,
          totalPnL: cumulativePnL
        });
      }
    });

    // Add current point with unrealized P&L
    chartData.push({
      timestamp: now,
      balance: currentBalance,
      unrealizedPnl: accountInfo.unrealizedPnL || 0,
      realizedPnl: cumulativePnL,
      totalPnL: (accountInfo.unrealizedPnL || 0) + cumulativePnL
    });

    // If no trades, create a simple flat line for visualization
    if (chartData.length <= 2) {
      chartData.length = 0;
      const intervalMs = timeRangeMs / 20;
      for (let i = 0; i <= 20; i++) {
        chartData.push({
          timestamp: startTime + (i * intervalMs),
          balance: currentBalance,
          unrealizedPnl: 0,
          realizedPnl: 0,
          totalPnL: 0
        });
      }
    }

    logger.info('Balance chart data created successfully', {
      context: 'BalanceChartAPI',
      data: {
        timeRange,
        dataPoints: chartData.length,
        currentBalance,
        initialDeposit: 100,
        totalPnL: currentBalance - 100,
        tradesIncluded: allTrades.length,
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

async function getCurrentBalance(request: NextRequest) {
  try {
    // Fetch account equity directly from asterDexService
    const { asterDexService } = await import('@/services/asterDexService');
    const balance = await asterDexService.getBalance();
    
    if (!balance || balance === 0) {
      logger.warn('No balance data from Aster API', {
        context: 'BalanceChartAPI'
      });
    }
      
    logger.info('Real account equity fetched from Aster API', {
      context: 'BalanceChartAPI',
      data: { 
        accountEquity: balance
      }
    });

    return createSuccessResponse({
      message: 'Current balance retrieved successfully',
      data: {
        balance,
        timestamp: Date.now(),
        source: 'aster_api'
      }
    });
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