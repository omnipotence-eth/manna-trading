import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

/**
 * POST /api/aster/order
 * Places an order on Aster DEX (authenticated)
 */
export async function POST(req: NextRequest) {
  if (!API_KEY || !API_SECRET) {
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

    // Add reduceOnly flag for closing positions (Aster DEX API param)
    if (body.reduceOnly === true) {
      orderParams.reduceOnly = 'true';
    }

    // Build signed query with fresh timestamp
    orderParams.timestamp = Date.now();
    const queryString = await buildSignedQuery(orderParams, API_SECRET);
    const url = `${ASTER_BASE_URL}/fapi/v1/order?${queryString}`;

    logger.info('Placing Aster order', {
      context: 'AsterAPI',
      data: { symbol: body.symbol, side: body.side, type: body.type, quantity: body.quantity },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Aster API order placement failed', undefined, {
        context: 'AsterAPI',
        data: { status: response.status, error: errorText, params: orderParams },
      });
      return NextResponse.json(
        { error: `Aster API error: ${errorText}` },
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
  if (!API_KEY || !API_SECRET) {
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
    const cancelParams = {
      symbol: symbol.replace('/', ''),
      orderId: orderId,
    };

    // Build signed query with fresh timestamp
    cancelParams.timestamp = Date.now();
    const queryString = await buildSignedQuery(cancelParams, API_SECRET);
    const url = `${ASTER_BASE_URL}/fapi/v1/order?${queryString}`;

    logger.info('Canceling Aster order', {
      context: 'AsterAPI',
      data: { symbol, orderId },
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': API_KEY,
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

