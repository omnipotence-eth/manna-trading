/**
 * WebSocket Status API
 * Returns the status of the WebSocket market data connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { wsMarketService } from '@/services/exchange/websocketMarketService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const status = wsMarketService.getStatus();
    
    // Get sample of cached data
    const allTickers = wsMarketService.getAllTickers();
    const sampleTickers: any[] = [];
    let count = 0;
    for (const [symbol, data] of allTickers) {
      if (count >= 5) break;
      sampleTickers.push({
        symbol,
        price: data.price,
        change: data.priceChangePercent.toFixed(2) + '%',
        volume: data.quoteVolume.toFixed(0),
        age: Math.round((Date.now() - data.lastUpdate) / 1000) + 's'
      });
      count++;
    }

    return NextResponse.json({
      success: true,
      data: {
        websocket: {
          connected: status.connected,
          cachedSymbols: status.cachedSymbols,
          messageCount: status.messageCount,
          lastMessageAge: status.lastMessageAge > 0 ? `${Math.round(status.lastMessageAge / 1000)}s ago` : 'never',
          reconnectAttempts: status.reconnectAttempts
        },
        sample: sampleTickers,
        benefits: [
          'Real-time price updates (no REST API calls)',
          'Reduced rate limiting issues',
          'Lower latency for trading decisions',
          'All market tickers in one stream'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get WebSocket status', error as Error, {
      context: 'API:WebSocketStatus'
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to get WebSocket status',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// POST to manually reconnect WebSocket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'reconnect';

    if (action === 'reconnect') {
      wsMarketService.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await wsMarketService.connect();
      
      return NextResponse.json({
        success: true,
        message: 'WebSocket reconnection initiated',
        status: wsMarketService.getStatus(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'disconnect') {
      wsMarketService.disconnect();
      
      return NextResponse.json({
        success: true,
        message: 'WebSocket disconnected',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Unknown action. Use "reconnect" or "disconnect"',
      timestamp: new Date().toISOString()
    }, { status: 400 });

  } catch (error) {
    logger.error('Failed to handle WebSocket action', error as Error, {
      context: 'API:WebSocketStatus'
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to handle WebSocket action',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}


