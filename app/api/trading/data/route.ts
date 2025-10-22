import { NextRequest, NextResponse } from 'next/server';
import { asterDexService } from '@/services/asterDexService';
import { logger } from '@/lib/logger';

// This endpoint provides trading data to the frontend
export async function GET(request: NextRequest) {
  try {
    // Get real-time data from Aster DEX
    const [positions, balance] = await Promise.all([
      asterDexService.getPositions(),
      asterDexService.getBalance(),
    ]);

    // Calculate total account value
    const unrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
    const totalValue = balance + unrealizedPnL;

    return NextResponse.json({
      success: true,
      data: {
        balance,
        positions,
        totalValue,
        unrealizedPnL,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch trading data', error, { context: 'TradingDataAPI' });
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

