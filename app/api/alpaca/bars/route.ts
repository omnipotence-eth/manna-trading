import { NextRequest, NextResponse } from 'next/server';
import { alpacaService } from '@/services/exchange/alpacaService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbolsParam = searchParams.get('symbols');
    const timeframe = searchParams.get('timeframe') ?? '1Day';
    const limit = parseInt(searchParams.get('limit') ?? '30', 10);

    if (!symbolsParam) {
      return NextResponse.json(
        { success: false, error: 'symbols query param required (comma-separated)' },
        { status: 422 }
      );
    }

    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const bars = await alpacaService.getBars(symbols, timeframe, limit);
    return NextResponse.json({ success: true, bars, symbols, timeframe, limit });
  } catch (error) {
    logger.error('Alpaca bars fetch failed', error as Error, { context: 'AlpacaBarsRoute' });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bars' },
      { status: 503 }
    );
  }
}
