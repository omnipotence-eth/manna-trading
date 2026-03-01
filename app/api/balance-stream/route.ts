/**
 * Server-Sent Events (SSE) endpoint for real-time balance updates
 * Uses WebSocket user data stream cache for instant updates
 * Per Aster DEX API docs: User Data Streams provide ACCOUNT_UPDATE events
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          logger.error('Failed to send SSE message', error as Error, { context: 'BalanceStream' });
        }
      };

      send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

      // Poll for balance updates every 2 seconds (industry standard for financial data)
      // Bloomberg Terminal typically updates every 1-3 seconds for live balance data
      const interval = setInterval(async () => {
        try {
          const { wsMarketService } = await import('@/services/exchange/websocketMarketService');
          const { asterDexService } = await import('@/services/exchange/asterDexService');
          
          // Try WebSocket cache first (real-time)
          const wsBalance = wsMarketService.getCachedBalance();
          if (wsBalance && (Date.now() - wsBalance.timestamp) < 60000) {
            send(JSON.stringify({
              type: 'balance',
              balance: wsBalance.balance,
              timestamp: wsBalance.timestamp,
              source: 'websocket'
            }));
            return;
          }

          // Fallback to REST API if WebSocket cache is stale
          try {
            const balance = await asterDexService.getBalance();
            send(JSON.stringify({
              type: 'balance',
              balance,
              timestamp: Date.now(),
              source: 'rest'
            }));
          } catch (error) {
            // Silent fail - will retry on next interval
            logger.debug('Balance fetch failed in SSE stream', {
              context: 'BalanceStream',
              data: { error: error instanceof Error ? error.message : String(error) }
            });
          }
        } catch (error) {
          logger.error('Error in balance stream', error as Error, { context: 'BalanceStream' });
        }
      }, 2000); // 2 seconds = industry standard update frequency for balance data

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch (error) {
          // Ignore - stream may already be closed
        }
        logger.debug('Balance stream closed', { context: 'BalanceStream' });
      });
    }
  });

  return new Response(stream, { headers });
}

