import { NextResponse } from 'next/server';
import { alpacaService } from '@/services/exchange/alpacaService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const positions = await alpacaService.getUnifiedPositions();
    return NextResponse.json({ success: true, positions, count: positions.length });
  } catch (error) {
    logger.error('Alpaca positions fetch failed', error as Error, { context: 'AlpacaPositionsRoute' });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch positions' },
      { status: 503 }
    );
  }
}
