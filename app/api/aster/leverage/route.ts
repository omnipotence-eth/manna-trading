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

    // CRITICAL OPTIMIZATION: Use asterDexService.setLeverage() for 30-key support
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        logger.info('Setting leverage on Aster DEX via 30-key system', {
          context: 'AsterAPI',
          data: { symbol: body.symbol, leverage },
        });

        // Import asterDexService dynamically to avoid circular dependencies
        const { asterDexService } = await import('@/services/exchange/asterDexService');
        
        // Use optimized service method (30-key pool, proper error handling)
        const success = await asterDexService.setLeverage(body.symbol, leverage);
        
        if (!success) {
          logger.error('Failed to set leverage via service', undefined, {
            context: 'AsterAPI',
            data: { symbol: body.symbol, leverage }
          });
          return NextResponse.json(
            { error: 'Failed to set leverage on Aster DEX' },
            { status: 500 }
          );
        }

        logger.info('Successfully set leverage on Aster DEX via optimized service', {
          context: 'AsterAPI',
          data: { symbol: body.symbol, leverage },
        });

        return createSuccessResponse({
          success: true,
          symbol: body.symbol,
          leverage: leverage
        });
      });
    });
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to set leverage', errorObj, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to set leverage', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


