import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await aiTradingService.start();
    
    logger.info('✅ Godspeed trading started via API', { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: true,
      message: 'Godspeed trading started successfully',
      system: 'Godspeed AI',
        features: [
          '100% margin utilization',
          'Maximum leverage per coin (20x-50x)',
          'High confidence filtering (50%+)',
          'Real-time market analysis (132 coins)',
          'Balanced risk management (3% stop-loss, 5% take-profit)'
        ]
    });
    
  } catch (error) {
    logger.error('Failed to start trading via API', error, { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to start trading'
    }, { status: 500 });
  }
}
