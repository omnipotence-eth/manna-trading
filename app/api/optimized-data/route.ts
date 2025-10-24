/**
 * Optimized Data API Endpoint
 * Provides fast, cached access to account value, positions, and P&L data
 */

import { NextRequest, NextResponse } from 'next/server';
import { optimizedDataService } from '@/services/optimizedDataService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Get all account data in one optimized call
    const accountData = await optimizedDataService.getAllAccountData();
    
    const responseTime = Date.now() - startTime;
    
    logger.info('📊 Optimized data API response', {
      context: 'OptimizedDataAPI',
      data: {
        responseTime: `${responseTime}ms`,
        cacheHit: accountData.cacheHit,
        accountValue: accountData.accountValue,
        positions: accountData.positions.length
      }
    });
    
    return NextResponse.json({
      success: true,
      data: accountData,
      responseTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Optimized data API failed', error, { context: 'OptimizedDataAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch optimized data',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action === 'force-refresh') {
      const data = await optimizedDataService.forceRefresh();
      
      return NextResponse.json({
        success: true,
        message: 'Data refreshed successfully',
        data,
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'start-auto-updates') {
      const { interval = 3000 } = await request.json();
      optimizedDataService.startAutoUpdates(interval);
      
      return NextResponse.json({
        success: true,
        message: 'Auto-updates started',
        interval,
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'stop-auto-updates') {
      optimizedDataService.stopAutoUpdates();
      
      return NextResponse.json({
        success: true,
        message: 'Auto-updates stopped',
        timestamp: new Date().toISOString()
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action',
      timestamp: new Date().toISOString()
    }, { status: 400 });
    
  } catch (error) {
    logger.error('Optimized data API POST failed', error, { context: 'OptimizedDataAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Invalid request',
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
}
