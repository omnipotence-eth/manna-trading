import { NextResponse } from 'next/server';
import { getMarketStatus, marketStatusLabel } from '@/lib/marketHours';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getMarketStatus();
  return NextResponse.json({
    success: true,
    market: {
      ...status,
      label: marketStatusLabel(),
    },
  });
}
