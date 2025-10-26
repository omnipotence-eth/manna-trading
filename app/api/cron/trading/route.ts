import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

// This API route is called by Vercel Cron every minute
// It runs DeepSeek R1 server-side 24/7

let isInitialized = false;

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron request (optional but recommended for security)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // Only check auth if CRON_SECRET is set
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('⚠️ Unauthorized cron request', { 
        context: 'CronAPI',
        data: { hasAuth: !!authHeader, hasSecret: !!cronSecret }
      });
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.info('⏰ Cron job triggered', { 
      context: 'CronAPI',
      data: { hasAuth: !!authHeader, hasSecret: !!cronSecret }
    });
    
    // Initialize the trading service once
    if (!isInitialized) {
      logger.info('🔄 Initializing AI trading service for cron...', { context: 'CronAPI' });
      await aiTradingService.start();
      isInitialized = true;
      logger.info('✅ AI trading service initialized for cron', { context: 'CronAPI' });
    }

    // Run a single trading cycle
    logger.info('🔍 Running DeepSeek R1 analysis cycle (CRON)...', { context: 'CronAPI' });
    const result = await aiTradingService.runSingleCycle();
    logger.info('✅ Cron analysis cycle completed', { context: 'CronAPI' });

    return NextResponse.json({
      success: true,
      message: 'Cron trading cycle completed',
      signals: result.signals.map(s => ({
        symbol: s.symbol,
        action: s.action,
        confidence: s.confidence,
        reasoning: s.reasoning,
        size: s.size,
      })),
      bestSignal: result.bestSignal ? {
        symbol: result.bestSignal.symbol,
        action: result.bestSignal.action,
        confidence: result.bestSignal.confidence,
        reasoning: result.bestSignal.reasoning,
        size: result.bestSignal.size,
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('❌ Failed to run cron trading cycle', error, { context: 'CronAPI' });
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

