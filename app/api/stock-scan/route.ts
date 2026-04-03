import { NextResponse } from 'next/server';
import { stockScannerService } from '@/services/trading/stockScannerService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await stockScannerService.scan();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Stock scan failed', error as Error, { context: 'StockScanRoute' });
    return NextResponse.json(
      { success: false, error: 'Stock scan failed' },
      { status: 503 }
    );
  }
}
