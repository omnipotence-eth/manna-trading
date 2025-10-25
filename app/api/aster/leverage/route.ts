import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

/**
 * POST /api/aster/leverage
 * Sets leverage for a specific symbol on Aster DEX (authenticated)
 * MUST be called BEFORE placing leveraged orders
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
    if (!body.symbol || !body.leverage) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, leverage' },
        { status: 400 }
      );
    }

    // Validate leverage is a positive number
    const leverage = parseInt(body.leverage);
    if (isNaN(leverage) || leverage < 1 || leverage > 125) {
      return NextResponse.json(
        { error: 'Invalid leverage: must be between 1 and 125' },
        { status: 400 }
      );
    }

    // Build leverage parameters
    const leverageParams: Record<string, string | number> = {
      symbol: body.symbol.replace('/', ''), // Convert BTC/USDT to BTCUSDT
      leverage: leverage,
      timestamp: Date.now()
    };

    // Build signed query
    const queryString = await buildSignedQuery(leverageParams, API_SECRET);
    const url = `${ASTER_BASE_URL}/fapi/v1/leverage?${queryString}`;

    logger.info('Setting leverage on Aster DEX', {
      context: 'AsterAPI',
      data: { symbol: body.symbol, leverage },
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
      logger.error('Aster API leverage setting failed', undefined, {
        context: 'AsterAPI',
        data: { status: response.status, error: errorText, params: leverageParams },
      });
      return NextResponse.json(
        { error: `Aster API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.info('Successfully set leverage on Aster DEX', {
      context: 'AsterAPI',
      data: { symbol: body.symbol, leverage: data.leverage || leverage },
    });

    return NextResponse.json({
      success: true,
      symbol: body.symbol,
      leverage: data.leverage || leverage,
      maxNotionalValue: data.maxNotionalValue,
      ...data
    });
  } catch (error: any) {
    logger.error('Failed to set leverage', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to set leverage', details: error.message },
      { status: 500 }
    );
  }
}

