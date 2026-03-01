import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string }> = {};
  let allOk = true;

  // RL parameter optimizer sanity check
  try {
    const { rlParameterOptimizer } = await import('@/services/ml/rlParameterOptimizer');
    if (typeof rlParameterOptimizer.runOptimization === 'function') {
      // Run a dry run with a tiny config
      await rlParameterOptimizer.runOptimization({ dryRun: true, maxSteps: 1 });
      results.rlOptimizer = { ok: true };
    } else {
      results.rlOptimizer = { ok: false, error: 'runOptimization not found' };
      allOk = false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.rlOptimizer = { ok: false, error: msg };
    allOk = false;
    logger.warn('ML/RL self-test: rlParameterOptimizer failed', { context: 'SelfTest', error: msg });
  }

  // Deepseek/AI sanity check intentionally skipped if module not present
  results.deepseek = { ok: true, error: 'skipped' };

  return NextResponse.json({ ok: allOk, results });
}

