import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

/**
 * GET /api/aster/account
 * Fetches account information from Aster DEX (authenticated)
 */
export async function GET(req: NextRequest) {
  if (!API_KEY || !API_SECRET) {
    logger.error('Aster API credentials not configured', undefined, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    // Build signed query
    const queryString = await buildSignedQuery({}, API_SECRET);
    const url = `${ASTER_BASE_URL}/fapi/v1/account?${queryString}`;

    logger.debug('Fetching Aster account info', { context: 'AsterAPI', data: { url } });

    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Aster API account fetch failed', undefined, {
        context: 'AsterAPI',
        data: { status: response.status, error: errorText },
      });
      return NextResponse.json(
        { error: `Aster API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.info('Successfully fetched Aster account data', {
      context: 'AsterAPI',
      data: { 
        totalWalletBalance: data.totalWalletBalance,
        availableBalance: data.availableBalance,
        totalUnrealizedProfit: data.totalUnrealizedProfit,
        assets: data.assets?.length || 0,
      },
    });
    
    // Log full response for debugging
    logger.debug('Full Aster account response', {
      context: 'AsterAPI',
      data: { fullData: JSON.stringify(data).substring(0, 500) },
    });

    return NextResponse.json(data);
  } catch (error: any) {
    logger.error('Failed to fetch Aster account', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch account data' },
      { status: 500 }
    );
  }
}

