import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { rlParameterOptimizer } = await import('@/services/ml/rlParameterOptimizer');
    const rl = rlParameterOptimizer.getDiagnostics();
    return NextResponse.json({ ok: true, rl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

