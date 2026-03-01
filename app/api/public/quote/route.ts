/**
 * Public API: minimal quote/status (optional X-API-Key + rate limit when PUBLIC_API_KEY is set)
 * GET /api/public/quote
 */

import { NextResponse } from 'next/server';
import { requirePublicApiKey } from '@/lib/publicApiRateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requirePublicApiKey(request);
  if (auth) return auth;

  return NextResponse.json({
    ok: true,
    service: 'Manna',
    timestamp: new Date().toISOString(),
    message: 'Use authenticated endpoints for trading data.',
  });
}
