import { NextResponse } from 'next/server';
import { alpacaService } from '@/services/exchange/alpacaService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const account = await alpacaService.getUnifiedAccount();
    return NextResponse.json({ success: true, account });
  } catch (error) {
    logger.error('Alpaca account fetch failed', error as Error, { context: 'AlpacaAccountRoute' });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Alpaca account' },
      { status: 503 }
    );
  }
}
