import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';
import { asterConfig } from '@/lib/configService';
import { circuitBreakers } from '@/lib/circuitBreaker';

// Use centralized config service instead of direct env var access
const ASTER_BASE_URL = asterConfig.baseUrl;
const API_KEY = asterConfig.apiKey;
const API_SECRET = asterConfig.secretKey;

/**
 * GET /api/aster/positions
 * Fetches open positions from Aster DEX (authenticated)
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
    // CRITICAL OPTIMIZATION: Use asterDexService.getPositions() for 30-key support and caching
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        logger.debug('Fetching Aster positions via 30-key system', { context: 'AsterAPI' });

        // Import asterDexService dynamically to avoid circular dependencies
        const { asterDexService } = await import('@/services/exchange/asterDexService');
        
        // Use optimized service method (30-key pool, caching, deduplication)
        const positions = await asterDexService.getPositions(false);
        
        logger.info('Successfully fetched Aster positions via optimized service', {
          context: 'AsterAPI',
          data: { activePositions: positions.length },
        });

        // Return in Aster DEX API format for compatibility
        const asterFormatPositions = positions.map(pos => ({
          symbol: pos.symbol.replace('/', ''),
          positionAmt: pos.side === 'LONG' ? pos.size.toString() : `-${pos.size.toString()}`,
          entryPrice: pos.entryPrice.toString(),
          leverage: pos.leverage.toString(),
          unRealizedProfit: pos.unrealizedPnl.toString()
        }));

        return NextResponse.json(asterFormatPositions);
      });
    });
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to fetch Aster positions', errorObj, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}


