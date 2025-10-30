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
    // HIGH PRIORITY FIX: Add body size validation
    const contentLength = req.headers.get('content-length');
    const MAX_BODY_SIZE = 1024 * 5; // 5KB max for order requests
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: `Request body too large. Maximum size: ${MAX_BODY_SIZE} bytes` },
        { status: 413 }
      );
    }

    const body = await req.json();
    
    // HIGH PRIORITY FIX: Enhanced validation with type checking and sanitization
    if (!body.symbol || typeof body.symbol !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing symbol field' },
        { status: 400 }
      );
    }
    if (!body.side || !['BUY', 'SELL'].includes(body.side)) {
      return NextResponse.json(
        { error: 'Invalid or missing side field - must be BUY or SELL' },
        { status: 400 }
      );
    }
    if (!body.type || !['MARKET', 'LIMIT'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid or missing type field - must be MARKET or LIMIT' },
        { status: 400 }
      );
    }
    if (!body.quantity || typeof body.quantity !== 'number' || body.quantity <= 0) {
      return NextResponse.json(
        { error: 'Invalid or missing quantity field - must be a positive number' },
        { status: 400 }
      );
    }
    
    // HIGH PRIORITY FIX: Validate symbol format (e.g., BTCUSDT, ETHUSDT)
    const symbolRegex = /^[A-Z]{2,10}USDT$/;
    const normalizedSymbol = body.symbol.replace('/', '');
    if (!symbolRegex.test(normalizedSymbol)) {
      return NextResponse.json(
        { error: 'Invalid symbol format - must be format like BTCUSDT or BTC/USDT' },
        { status: 400 }
      );
    }

    // Apply rate limiting and circuit breaker protection
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        // Build order parameters (symbol already validated and normalized)
        const orderParams: Record<string, string | number> = {
          symbol: normalizedSymbol, // Already validated above
          side: body.side, // BUY or SELL (already validated)
          type: body.type, // MARKET or LIMIT (already validated)
          quantity: body.quantity, // Already validated as positive number
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

