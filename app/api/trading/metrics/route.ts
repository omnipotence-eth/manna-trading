import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const metrics = aiTradingService.getPerformanceMetrics();
    
    return NextResponse.json({
      success: true,
      data: {
        ...metrics,
        system: 'Godspeed AI'
      }
    });
    
  } catch (error) {
    logger.error('Failed to get trading metrics via API', error, { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get trading metrics'
    }, { status: 500 });
  }
}
