import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { PerformanceMonitor } from '@/lib/performanceMonitor';

// This API route runs DeepSeek R1 on the server
// It will be called by Vercel Cron Jobs every 10 seconds

let isInitialized = false;

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('api:trading:get');
  
  try {
    logger.info('Trading API called', { context: 'TradingAPI' });
    
    // Initialize the trading service once
    if (!isInitialized) {
      logger.info('Initializing AI trading service', { context: 'TradingAPI' });
      await aiTradingService.start();
      isInitialized = true;
      logger.info('AI trading service initialized', { context: 'TradingAPI' });
    }

    // Run a single trading cycle with circuit breaker protection
    logger.info('Running analysis cycle', { context: 'TradingAPI' });
    const result = await circuitBreakers.asterApi.execute(async () => {
      return await aiTradingService.runSingleCycle();
    });
    
    logger.info('Analysis cycle completed', { context: 'TradingAPI' });

    const duration = timer.end();
    PerformanceMonitor.recordCounter('api:trading:success');
    PerformanceMonitor.recordGauge('api:trading:response_time', duration);

    return createSuccessResponse({
      message: 'Trading cycle completed',
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
    });
  } catch (error: any) {
    timer.end();
    PerformanceMonitor.recordCounter('api:trading:error');
    return handleApiError(error, 'TradingAPI');
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

