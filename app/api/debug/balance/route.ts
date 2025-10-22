import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

/**
 * GET /api/debug/balance
 * Debug endpoint to see raw Aster DEX account response
 */
export async function GET(req: NextRequest) {
  if (!API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: 'API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const queryString = await buildSignedQuery({}, API_SECRET);
    const url = `${ASTER_BASE_URL}/fapi/v1/account?${queryString}`;

    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Aster API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return formatted debug info
    return NextResponse.json({
      totalWalletBalance: data.totalWalletBalance,
      availableBalance: data.availableBalance,
      totalUnrealizedProfit: data.totalUnrealizedProfit,
      totalMarginBalance: data.totalMarginBalance,
      totalPositionInitialMargin: data.totalPositionInitialMargin,
      totalOpenOrderInitialMargin: data.totalOpenOrderInitialMargin,
      assets: data.assets?.map((asset: any) => ({
        asset: asset.asset,
        walletBalance: asset.walletBalance,
        availableBalance: asset.availableBalance,
        unrealizedProfit: asset.unrealizedProfit,
        marginBalance: asset.marginBalance,
      })),
      rawResponse: data,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch account data', details: error.message },
      { status: 500 }
    );
  }
}

