import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

// This API route runs DeepSeek R1 on the server
// It will be called by Vercel Cron Jobs every 10 seconds

let isInitialized = false;

export async function GET(request: NextRequest) {
  try {
    logger.info('📡 Trading API called', { context: 'TradingAPI' });
    
    // Initialize the trading service once
    if (!isInitialized) {
      logger.info('🔄 Initializing AI trading service...', { context: 'TradingAPI' });
      await aiTradingService.start();
      isInitialized = true;
      logger.info('✅ AI trading service initialized', { context: 'TradingAPI' });
    }

    // Run a single trading cycle
    logger.info('🔍 Running DeepSeek R1 analysis cycle...', { context: 'TradingAPI' });
    const analysis = await aiTradingService.runSingleCycle();
    logger.info('✅ Analysis cycle completed', { context: 'TradingAPI' });

    return NextResponse.json({
      success: true,
      message: 'Trading cycle completed',
      analysis: analysis ? {
        symbol: analysis.symbol,
        action: analysis.action,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        size: analysis.size,
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('❌ Failed to run trading cycle', error, { context: 'TradingAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (body.action === 'status') {
    return NextResponse.json({
      success: true,
      isInitialized,
      timestamp: new Date().toISOString(),
    });
  }

  if (body.action === 'start') {
    if (!isInitialized) {
      await aiTradingService.start();
      isInitialized = true;
    }
    return NextResponse.json({
      success: true,
      message: 'Trading service started',
      timestamp: new Date().toISOString(),
    });
  }

  if (body.action === 'stop') {
    if (isInitialized) {
      await aiTradingService.stop();
      isInitialized = false;
    }
    return NextResponse.json({
      success: true,
      message: 'Trading service stopped',
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(
    { success: false, error: 'Invalid action' },
    { status: 400 }
  );
}

