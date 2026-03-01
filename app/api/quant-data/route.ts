/**
 * Quant Data API
 * 
 * Returns comprehensive quantitative market data for trading decisions
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTCUSDT';
  
  try {
    const { quantDataService } = await import('@/services/data/quantDataService');
    const snapshot = await quantDataService.getMarketSnapshot(symbol);
    
    return NextResponse.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    logger.error('Failed to get quant data', error, { context: 'QuantDataAPI', symbol });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


