import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';
import { asterConfig } from '@/lib/configService';
import { handleAsterApiError, createSuccessResponse } from '@/lib/errorHandler';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { caches, cacheKeys } from '@/lib/requestCache';

/**
 * GET /api/aster/account
 * Fetches account information from Aster DEX (authenticated)
 */
export async function GET(req: NextRequest) {
  const timer = PerformanceMonitor.startTimer('api:aster:account');
  
  if (!asterConfig.apiKey || !asterConfig.secretKey) {
    logger.error('Aster API credentials not configured', undefined, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'API credentials not configured' },
      { status: 500 }
    );
  }

  try {
    // Check cache first
    const cacheKey = cacheKeys.account();
    const cached = caches.account.get(cacheKey);
    if (cached) {
      timer.end();
      PerformanceMonitor.recordCounter('api:aster:account:cache_hit');
      return createSuccessResponse(cached);
    }

    // Apply rate limiting and circuit breaker protection
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        // Build signed query with fresh timestamp
        const queryString = await buildSignedQuery({ timestamp: Date.now() - 1000 }, asterConfig.secretKey);
        const url = `${asterConfig.baseUrl}/fapi/v1/account?${queryString}`;

        logger.debug('Fetching Aster account info', { context: 'AsterAPI', data: { url } });

        const response = await fetch(url, {
          headers: {
            'X-MBX-APIKEY': asterConfig.apiKey,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          // CRITICAL FIX: Remove hardcoded fallback data - only use in development
          const fallbackData = process.env.NODE_ENV === 'development' ? {
            balance: 0,
            accountEquity: 0,
            availableBalance: 0,
            totalPositionInitialMargin: 0,
            totalUnrealizedProfit: 0,
            totalWalletBalance: 0,
            totalMarginBalance: 0,
            totalInitialMargin: 0,
            totalCrossWalletBalance: 0,
            totalOpenOrderInitialMargin: 0,
            assets: [],
            fallback: true,
            timestamp: new Date().toISOString()
          } : undefined;
          return handleAsterApiError(response, 'AsterAPI', fallbackData);
        }

        const data = await response.json();
        
        // Parse balance fields from Aster DEX
        const availableBalance = parseFloat(data.availableBalance || 0);
        const totalWalletBalance = parseFloat(data.totalWalletBalance || 0);
        const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || 0);
        const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || 0);
        
        // Calculate account value
        // FIXED: Use totalMarginBalance which includes unrealized P&L (correct account equity)
        const calculatedAccountValue = totalMarginBalance; // Total account equity including unrealized P&L
        const accountEquity = totalMarginBalance; // Same as calculatedAccountValue (includes unrealized P&L)
        
        logger.info('Account value calculated', {
          context: 'AsterAPI',
          data: { 
            availableBalance: availableBalance.toFixed(2),
            positionMargin: totalPositionInitialMargin.toFixed(2),
            unrealizedPnL: totalUnrealizedProfit.toFixed(2),
            totalWalletBalance: totalWalletBalance.toFixed(2),
            accountEquity: accountEquity.toFixed(2),
            balance: calculatedAccountValue.toFixed(2)
          }
        });
        
        const result = {
          ...data,
          balance: calculatedAccountValue, // Available balance for trading
          accountEquity: accountEquity,
          availableBalance: availableBalance,
          totalWalletBalance: totalWalletBalance
        };

        // Cache the result
        caches.account.set(cacheKey, result);
        
        const duration = timer.end();
        PerformanceMonitor.recordCounter('api:aster:account:success');
        PerformanceMonitor.recordGauge('api:aster:account:response_time', duration);
        
        return createSuccessResponse(result);
      });
    });
  } catch (error: any) {
    timer.end();
    PerformanceMonitor.recordCounter('api:aster:account:error');
    logger.error('Failed to fetch Aster account', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch account data' },
      { status: 500 }
    );
  }
}
