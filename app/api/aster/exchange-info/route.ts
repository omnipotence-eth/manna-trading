import { NextRequest, NextResponse } from 'next/server';
import { asterDexService } from '@/services/exchange/asterDexService';
import { handleApiError, createSuccessResponse } from '@/lib/errorHandler';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const timer = PerformanceMonitor.startTimer('ExchangeInfoAPI');
  
  try {
    const exchangeInfo = await circuitBreakers.asterApi.execute(async () => {
      return await asterDexService.getExchangeInfo();
    });

    return createSuccessResponse({
      message: 'Exchange info retrieved successfully',
      data: exchangeInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return handleApiError(error, 'ExchangeInfoAPI');
  } finally {
    timer.end();
  }
}

