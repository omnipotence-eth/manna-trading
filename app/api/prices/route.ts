import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';

/**
 * GET /api/prices
 * Fetches current crypto prices from Aster DEX (ACTUAL trading prices)
 * Uses 30-key pool for high performance and reliability
 */
export async function GET() {
  try {
    // FIXED: Use Aster DEX API directly (actual exchange prices, not CoinGecko)
    // This ensures prices match what we're actually trading at
    // Uses our 30-key pool for 600 req/sec capacity
    
    logger.debug('Fetching prices from Aster DEX (30-key system)', { context: 'PricesAPI' });
    
    // Fetch exchange info which includes ticker data for all symbols
    const exchangeInfo = await asterDexService.getExchangeInfo();
    
    // Extract the symbols we want to display
    const symbolMap: Record<string, string> = {
      'BTCUSDT': 'BTC/USDT',
      'ETHUSDT': 'ETH/USDT',
      'SOLUSDT': 'SOL/USDT',
      'BNBUSDT': 'BNB/USDT',
      'DOGEUSDT': 'DOGE/USDT',
      'XRPUSDT': 'XRP/USDT',
    };
    
    // Build prices object from exchange info
    const prices: Record<string, { symbol: string; price: number; change: number }> = {};
    
    for (const [key, displaySymbol] of Object.entries(symbolMap)) {
      // Find the symbol in topSymbolsByVolume (which has ticker data)
      const symbolData = exchangeInfo.topSymbolsByVolume.find(
        (s: any) => s.symbol === key
      );
      
      if (symbolData) {
        // CRITICAL FIX: Use correct field names from Aster DEX ticker/24hr API
        // According to API docs: priceChangePercent is the 24h change percentage
        const lastPrice = parseFloat(symbolData.lastPrice || symbolData.markPrice || '0');
        const priceChangePercent = parseFloat(symbolData.priceChangePercent || symbolData.priceChangePercent24h || '0');
        
        prices[key] = {
          symbol: displaySymbol,
          price: lastPrice,
          change: priceChangePercent, // This is the 24h percentage change from Aster DEX
        };
        
        // Debug log to verify data (can remove after confirming fix)
        if (key === 'BTCUSDT') {
          logger.debug('BTC price data from Aster DEX', {
            context: 'PricesAPI',
            data: {
              lastPrice,
              priceChangePercent,
              rawSymbolData: symbolData
            }
          });
        }
      } else {
        // Fallback if symbol not found in top symbols
        prices[key] = {
          symbol: displaySymbol,
          price: 0,
          change: 0,
        };
        
        logger.warn(`Symbol ${key} not found in Aster DEX data`, {
          context: 'PricesAPI'
        });
      }
    }

    logger.info('Successfully fetched prices from Aster DEX', {
      context: 'PricesAPI',
      data: { 
        btc: prices.BTCUSDT?.price || 0, 
        eth: prices.ETHUSDT?.price || 0,
        source: 'Aster DEX (actual trading prices)',
        keysUsed: '30-key pool'
      },
    });

    return NextResponse.json(prices, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'
      }
    });
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to fetch prices from Aster DEX', errorObj, { 
      context: 'PricesAPI',
      data: {
        message: 'Using Aster DEX API for actual trading prices',
        keysAvailable: '30-key pool'
      }
    });
    return NextResponse.json(
      { error: 'Failed to fetch prices from Aster DEX' },
      { status: 500 }
    );
  }
}


