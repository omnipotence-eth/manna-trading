import { NextRequest, NextResponse } from 'next/server';
import { aiTradingService } from '@/services/aiTradingService';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const status = aiTradingService.getStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        ...status,
        system: 'Godspeed AI',
        features: [
          '100% margin utilization',
          'Maximum leverage per coin',
          'High confidence filtering (60%+)',
          'Real-time market analysis (132 coins)'
        ]
      }
    });
    
  } catch (error) {
    logger.error('Failed to get trading status via API', error, { context: 'TradingAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get trading status'
    }, { status: 500 });
  }
}
