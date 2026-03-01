/**
 * Trade notifications via Discord webhook or generic webhook
 * Set DISCORD_WEBHOOK_URL or NOTIFICATION_WEBHOOK_URL in env to enable
 */

import { logger } from '@/lib/logger';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';
const GENERIC_WEBHOOK = process.env.NOTIFICATION_WEBHOOK_URL || '';
const WEBHOOK = DISCORD_WEBHOOK || GENERIC_WEBHOOK;

export type TradeEvent = 'opened' | 'closed';

export interface TradeNotificationPayload {
  event: TradeEvent;
  symbol: string;
  side: string;
  size?: number;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  orderId?: string;
  simulation?: boolean;
  message?: string;
}

function isConfigured(): boolean {
  return !!WEBHOOK;
}

/**
 * Send trade-opened or trade-closed notification (Discord or generic POST)
 */
export async function sendTradeNotification(payload: TradeNotificationPayload): Promise<void> {
  if (!isConfigured()) return;

  const sim = payload.simulation !== false;
  const emoji = payload.event === 'opened' ? '📈' : (payload.pnl && payload.pnl >= 0 ? '✅' : '❌');
  const msg =
    payload.message ||
    (payload.event === 'opened'
      ? `${emoji} Position opened: ${payload.symbol} ${payload.side} @ ${payload.entryPrice} (simulation: ${sim})`
      : `${emoji} Position closed: ${payload.symbol} ${payload.side} | P&L: ${payload.pnl?.toFixed(2) ?? '—'} (${payload.pnlPercent?.toFixed(2) ?? '—'}%) | ${payload.exitReason ?? ''} (simulation: ${sim})`);

  if (DISCORD_WEBHOOK) {
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: msg,
          embeds: [
            {
              title: payload.event === 'opened' ? 'Trade opened' : 'Trade closed',
              color: payload.event === 'closed' && payload.pnl != null ? (payload.pnl >= 0 ? 0x00ff88 : 0xff4444) : 0x6366f1,
              fields: [
                { name: 'Symbol', value: payload.symbol, inline: true },
                { name: 'Side', value: payload.side, inline: true },
                ...(payload.entryPrice != null ? [{ name: 'Entry', value: String(payload.entryPrice), inline: true }] : []),
                ...(payload.exitPrice != null ? [{ name: 'Exit', value: String(payload.exitPrice), inline: true }] : []),
                ...(payload.pnl != null ? [{ name: 'P&L', value: `${payload.pnl.toFixed(2)} (${payload.pnlPercent?.toFixed(2)}%)`, inline: true }] : []),
                ...(payload.exitReason ? [{ name: 'Exit reason', value: payload.exitReason, inline: false }] : []),
                { name: 'Simulation', value: sim ? 'Yes' : 'No', inline: true },
              ].filter(Boolean),
            },
          ],
        }),
      });
    } catch (e) {
      logger.warn('Discord webhook failed', { context: 'NotificationService', error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (GENERIC_WEBHOOK) {
    try {
      await fetch(GENERIC_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, ...payload }),
      });
    } catch (e) {
      logger.warn('Notification webhook failed', { context: 'NotificationService', error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export const notificationService = { sendTradeNotification, isConfigured };
