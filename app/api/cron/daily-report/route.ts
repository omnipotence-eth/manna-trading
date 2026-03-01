/**
 * Cron: Daily Report
 * Invoked daily (e.g. Vercel Cron or cron-job.org) to send a summary to Telegram/Discord.
 * Set TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID and/or DISCORD_WEBHOOK_URL to receive reports.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTodayRealizedPnL, getTodayTradeCount } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/notificationService';
import { logger } from '@/lib/logger';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) return true;
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
    const [todayPnL, todayCount] = await Promise.all([
      getTodayRealizedPnL(),
      getTodayTradeCount(),
    ]);
    let balance: number | null = null;
    try {
      const { realBalanceService } = await import('@/services/trading/realBalanceService');
      const { simulationService } = await import('@/services/trading/simulationService');
      balance = realBalanceService.getBalanceConfig()?.availableBalance ?? simulationService.getAccountValue() ?? null;
    } catch {
      // ignore
    }

    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `📊 Manna Daily Report (${date})`,
      `Today's closed trades: ${todayCount}`,
      `Today's realized P&L: $${todayPnL.toFixed(2)}`,
      ...(balance != null ? [`Account value: $${balance.toFixed(2)}`] : []),
    ];
    const text = lines.join('\n');

    await sendTelegramMessage(text);

    const discordUrl = process.env.DISCORD_WEBHOOK_URL || '';
    if (discordUrl) {
      try {
        await fetch(discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
      } catch (e) {
        logger.warn('Daily report Discord webhook failed', { context: 'CronDailyReport', error: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Daily report sent',
      timestamp: new Date().toISOString(),
      todayTrades: todayCount,
      todayPnL,
      balance,
    });
  } catch (error) {
    logger.error('Daily report failed', error instanceof Error ? error : new Error(String(error)), { context: 'CronDailyReport' });
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
