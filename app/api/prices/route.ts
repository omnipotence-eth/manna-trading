import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/prices
 * Fetches current crypto prices from CoinGecko (no geo-restrictions)
 */
export async function GET() {
  try {
    // CoinGecko API - free, no restrictions, no auth needed
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,dogecoin,ripple&vs_currencies=usd&include_24hr_change=true';
    
    logger.debug('Fetching prices from CoinGecko', { context: 'PricesAPI', data: { url } });
    
    const response = await fetch(url, {
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Transform to our format
    const prices = {
      BTCUSDT: {
        symbol: 'BTC/USDT',
        price: data.bitcoin?.usd || 0,
        change: data.bitcoin?.usd_24h_change || 0,
      },
      ETHUSDT: {
        symbol: 'ETH/USDT',
        price: data.ethereum?.usd || 0,
        change: data.ethereum?.usd_24h_change || 0,
      },
      SOLUSDT: {
        symbol: 'SOL/USDT',
        price: data.solana?.usd || 0,
        change: data.solana?.usd_24h_change || 0,
      },
      BNBUSDT: {
        symbol: 'BNB/USDT',
        price: data.binancecoin?.usd || 0,
        change: data.binancecoin?.usd_24h_change || 0,
      },
      DOGEUSDT: {
        symbol: 'DOGE/USDT',
        price: data.dogecoin?.usd || 0,
        change: data.dogecoin?.usd_24h_change || 0,
      },
      XRPUSDT: {
        symbol: 'XRP/USDT',
        price: data.ripple?.usd || 0,
        change: data.ripple?.usd_24h_change || 0,
      },
    };

    logger.info('Successfully fetched prices from CoinGecko', {
      context: 'PricesAPI',
      data: { btc: prices.BTCUSDT.price, eth: prices.ETHUSDT.price },
    });

    return NextResponse.json(prices);
  } catch (error: any) {
    logger.error('Failed to fetch prices', error, { context: 'PricesAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}

