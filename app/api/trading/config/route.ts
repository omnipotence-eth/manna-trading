import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();
    aiTradingService.updateConfig(config);
    
    logger.info('✅ Godspeed configuration updated via API', { context: 'TradingAPI', data: config });
    
    return NextResponse.json({
      success: true,
      message: 'Godspeed configuration updated successfully',
      system: 'Godspeed AI'
    });
    
  } catch (error) {
    logger.error('Failed to update trading configuration via API', error, { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to update configuration'
    }, { status: 500 });
  }
}
