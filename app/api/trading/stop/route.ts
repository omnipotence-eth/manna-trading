import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await aiTradingService.stop();
    
    logger.info('⏸️ Godspeed trading stopped via API', { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: true,
      message: 'Godspeed trading stopped successfully'
    });
    
  } catch (error) {
    logger.error('Failed to stop trading via API', error, { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to stop trading'
    }, { status: 500 });
  }
}
