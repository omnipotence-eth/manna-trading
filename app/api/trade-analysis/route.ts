/**
 * Trade Analysis API Route
 * Analyzes recent trades to identify why they're not profitable
 */

import { NextRequest, NextResponse } from 'next/server';
import { tradeAnalyzer } from '@/services/monitoring/tradeAnalyzer';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    
    const analysis = await tradeAnalyzer.analyzeRecentTrades(days);
    
    return NextResponse.json({
      success: true,
      analysis,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Failed to analyze trades', error, { context: 'TradeAnalysisAPI' });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

