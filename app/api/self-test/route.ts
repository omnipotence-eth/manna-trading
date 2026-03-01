import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { optimizedDataService } from '@/services/data/optimizedDataService';
import { quantDataService } from '@/services/data/quantDataService';

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string }> = {};

  // Optimized account data
  try {
    const account = await optimizedDataService.getAllAccountData();
    results.optimizedData = {
      ok: account.accountValue !== undefined && account.positions !== undefined
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.optimizedData = { ok: false, error: msg };
    logger.warn('Self-test: optimized data failed', { context: 'SelfTest', error: msg });
  }

  // Quant snapshot for BTCUSDT
  try {
    const snapshot = await quantDataService.getMarketSnapshot('BTCUSDT');
    const hasFunding = snapshot.derivatives?.fundingRate !== undefined;
    const hasPrice = snapshot.price?.close !== undefined;
    results.quantData = { ok: hasFunding && hasPrice };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.quantData = { ok: false, error: msg };
    logger.warn('Self-test: quant data failed', { context: 'SelfTest', error: msg });
  }

  const allOk = Object.values(results).every(r => r.ok);
  return NextResponse.json({ ok: allOk, results });
}

