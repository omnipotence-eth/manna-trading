/**
 * Cron: Trading Cycle
 * Invoked by Vercel Cron (or external cron) so trading runs when nobody is on the app.
 * Uses runOneCycleForCron() so each cold serverless invocation runs one full cycle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
import { logger } from '@/lib/logger';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) return true; // no secret set = allow (e.g. dev or Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return bearer === secret || headerSecret === secret;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await agentRunnerService.runOneCycleForCron();
    return NextResponse.json({
      success: true,
      message: 'Trading cycle completed (cron)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Cron trading cycle failed', error instanceof Error ? error : new Error(String(error)), {
      context: 'CronTradingCycle',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
