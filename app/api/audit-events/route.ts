/**
 * GET /api/audit-events?limit=50&type=no_opportunities|circuit_breaker_triggered|opportunities_found
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditEvents } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const type = searchParams.get('type') || undefined;

    const events = await getAuditEvents({ limit, type });
    return NextResponse.json({ success: true, events });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
