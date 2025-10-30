import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';
import { asterConfig } from '@/lib/configService';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { handleAsterApiError, createSuccessResponse } from '@/lib/errorHandler';

/**
 * POST /api/aster/leverage
 * Sets leverage for a specific symbol on Aster DEX (authenticated)
 * MUST be called BEFORE placing leveraged orders
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

    // Apply rate limiting and circuit breaker protection
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        // Build leverage parameters
        const leverageParams: Record<string, string | number> = {
          symbol: body.symbol.replace('/', ''), // Convert BTC/USDT to BTCUSDT
          leverage: leverage,
          timestamp: Date.now()
        };

        // Build signed query
        const queryString = await buildSignedQuery(leverageParams, asterConfig.secretKey);
        const url = `${asterConfig.baseUrl}/fapi/v1/leverage?${queryString}`;

        logger.info('Setting leverage on Aster DEX', {
          context: 'AsterAPI',
          data: { symbol: body.symbol, leverage },
        });

        // Add timeout to prevent hanging requests
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
            return handleAsterApiError(response, 'AsterAPI');
          }

          const data = await response.json();
          logger.info('Successfully set leverage on Aster DEX', {
            context: 'AsterAPI',
            data: { symbol: body.symbol, leverage: data.leverage || leverage },
          });

          return createSuccessResponse({
            success: true,
            symbol: body.symbol,
            leverage: data.leverage || leverage,
            maxNotionalValue: data.maxNotionalValue,
            ...data
          });
        } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            logger.error('Leverage setting timeout', error, { context: 'AsterAPI' });
            return NextResponse.json(
              { error: 'Request timeout - leverage setting took too long' },
              { status: 408 }
            );
          }
          throw error;
        }
      });
    });
  } catch (error: any) {
    logger.error('Failed to set leverage', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to set leverage', details: error.message },
      { status: 500 }
    );
  }
}

