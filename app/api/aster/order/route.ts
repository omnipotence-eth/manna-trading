import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';
import { asterConfig } from '@/lib/configService';
import { circuitBreakers } from '@/lib/circuitBreaker';

/**
 * POST /api/aster/order
 * Places an order on Aster DEX (authenticated)
 */
export async function POST(req: NextRequest) {
  if (!asterConfig.apiKey || !asterConfig.secretKey) {
    logger.error('Aster API credentials not configured', undefined, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.symbol || !body.side || !body.type || !body.quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, side, type, quantity' },
        { status: 400 }
      );
    }

    // Apply rate limiting and circuit breaker protection
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        // Build order parameters
        const orderParams: Record<string, string | number> = {
          symbol: body.symbol.replace('/', ''), // Convert BTC/USDT to BTCUSDT
          side: body.side, // BUY or SELL
          type: body.type, // MARKET or LIMIT
          quantity: body.quantity,
        };

        // Add price for LIMIT orders
        if (body.type === 'LIMIT' && body.price) {
          orderParams.price = body.price;
          orderParams.timeInForce = body.timeInForce || 'GTC';
        }

        // Add leverage if specified
        if (body.leverage) {
          orderParams.leverage = body.leverage;
        }

        // Build signed query with fresh timestamp FIRST
        orderParams.timestamp = Date.now();
        
        // Add reduceOnly flag AFTER timestamp but BEFORE signing (Aster DEX API param)
        if (body.reduceOnly === true) {
          orderParams.reduceOnly = 'true';
        }
        
        const queryString = await buildSignedQuery(orderParams, asterConfig.secretKey);
        const url = `${asterConfig.baseUrl}/fapi/v1/order?${queryString}`;

        logger.info('Placing Aster order', {
          context: 'AsterAPI',
          data: { symbol: body.symbol, side: body.side, type: body.type, quantity: body.quantity },
        });

        // OPTIMIZED: Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'X-MBX-APIKEY': asterConfig.apiKey,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            logger.error('Aster API order placement failed', undefined, {
              context: 'AsterAPI',
              data: { 
                status: response.status, 
                error: errorText, 
                params: orderParams,
                url: url.substring(0, 100) + '...' 
              },
            });
            return NextResponse.json(
              { 
                error: `Aster API error: ${errorText}`,
                status: response.status,
                params: orderParams,
                details: errorText
              },
              { status: response.status }
            );
          }

          const data = await response.json();
          logger.info('Successfully placed Aster order', {
            context: 'AsterAPI',
            data: { orderId: data.orderId, status: data.status },
          });

          return NextResponse.json(data);
        } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            logger.error('Order placement timeout', error, { context: 'AsterAPI' });
            return NextResponse.json(
              { error: 'Request timeout - order placement took too long' },
              { status: 408 }
            );
          }
          throw error;
        }
      });
    });
  } catch (error: any) {
    logger.error('Failed to place Aster order', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to place order' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/aster/order
 * Cancels an order on Aster DEX (authenticated)
 */
export async function DELETE(req: NextRequest) {
  if (!asterConfig.apiKey || !asterConfig.secretKey) {
    logger.error('Aster API credentials not configured', undefined, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const orderId = searchParams.get('orderId');

    if (!symbol || !orderId) {
      return NextResponse.json(
        { error: 'Missing required parameters: symbol, orderId' },
        { status: 400 }
      );
    }

    // Build cancel parameters
    const cancelParams: any = {
      symbol: symbol.replace('/', ''),
      orderId: orderId,
    };

    // Build signed query with fresh timestamp
    cancelParams.timestamp = Date.now();
    const queryString = await buildSignedQuery(cancelParams, asterConfig.secretKey);
    const url = `${asterConfig.baseUrl}/fapi/v1/order?${queryString}`;

    logger.info('Canceling Aster order', {
      context: 'AsterAPI',
      data: { symbol, orderId },
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': asterConfig.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Aster API order cancellation failed', undefined, {
        context: 'AsterAPI',
        data: { status: response.status, error: errorText },
      });
      return NextResponse.json(
        { error: `Aster API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.info('Successfully canceled Aster order', {
      context: 'AsterAPI',
      data: { orderId: data.orderId },
    });

    return NextResponse.json(data);
  } catch (error: any) {
    logger.error('Failed to cancel Aster order', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}

