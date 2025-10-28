import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

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
    // Apply rate limiting
    return await withRateLimit(async () => {
      // Build signed query with fresh timestamp (AFTER rate limiter)
      // Subtract 1000ms to account for server time difference
      const queryString = await buildSignedQuery({ timestamp: Date.now() - 1000 }, API_SECRET);
      const url = `${ASTER_BASE_URL}/fapi/v1/position?${queryString}`;

      logger.debug('Fetching Aster positions', { context: 'AsterAPI', data: { url } });

      const response = await fetch(url, {
        headers: {
          'X-MBX-APIKEY': API_KEY,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle specific Aster DEX error codes
        if (response.status === 429) {
          logger.warn('Aster API rate limit exceeded', undefined, {
            context: 'AsterAPI',
            data: { status: response.status, error: errorText }
          });
          return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again later.' },
            { status: 429 }
          );
        }
        
        if (response.status === 401) {
          logger.error('Aster API authentication failed', undefined, {
            context: 'AsterAPI',
            data: { status: response.status, error: errorText }
          });
          return NextResponse.json(
            { error: 'Authentication failed. Please check API credentials.' },
            { status: 401 }
          );
        }
        
        // For 400 errors, return empty positions instead of failing
        if (response.status === 400) {
          logger.warn('Aster API returned 400, returning empty positions', undefined, {
            context: 'AsterAPI',
            data: { status: response.status, error: errorText }
          });
          return NextResponse.json([]);
        }
        
        logger.error('Aster API positions fetch failed', undefined, {
          context: 'AsterAPI',
          data: { 
            status: response.status, 
            error: errorText,
            url: url.substring(0, 100) + '...',
            timestamp: Date.now()
          },
        });
        return NextResponse.json(
          { error: `Aster API error: ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      // Filter only positions with non-zero size
      const activePositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
      
      logger.info('Successfully fetched Aster positions', {
        context: 'AsterAPI',
        data: { totalPositions: data.length, activePositions: activePositions.length },
      });

      return NextResponse.json(activePositions);
    });
  } catch (error: any) {
    logger.error('Failed to fetch Aster positions', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

