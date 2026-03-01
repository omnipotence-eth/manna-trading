import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';
import { asterConfig } from '@/lib/configService';
import { handleAsterApiError, createSuccessResponse } from '@/lib/errorHandler';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { PerformanceMonitor } from '@/lib/performanceMonitor';
import { caches, cacheKeys } from '@/lib/requestCache';

// Force dynamic rendering to suppress Next.js static generation warnings
export const dynamic = 'force-dynamic';

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
    // ENTERPRISE: Check for cache-bypass header for live data
    const cacheControl = req.headers.get('cache-control');
    const bypassCache = cacheControl === 'no-cache' || cacheControl === 'no-store';
    
    // Check cache first (unless bypassing)
    const cacheKey = cacheKeys.account();
    const cached = caches.account.get(cacheKey);
    if (cached && !bypassCache) {
      timer.end();
      PerformanceMonitor.recordCounter('api:aster:account:cache_hit');
      const cachedResponse = createSuccessResponse(cached);
      // Add cache headers even for cached responses
      cachedResponse.headers.set('Cache-Control', 'public, max-age=1, must-revalidate');
      return cachedResponse;
    }

    // OPTIMIZED: Use asterDexService which has 30-key support, rate limiting, and circuit breakers
    // This replaces direct fetch() and enables full 600 req/sec capacity
    return await withRateLimit(async () => {
      return await circuitBreakers.asterApi.execute(async () => {
        logger.debug('Fetching Aster account info via 30-key system', { context: 'AsterAPI' });

        // Import asterDexService dynamically to avoid circular dependencies
        const { asterDexService } = await import('@/services/exchange/asterDexService');
        
        // CRITICAL FIX: Don't call getBalance() - it creates infinite recursion!
        // getBalance() internally calls this same /api/aster/account endpoint
        // Instead, call Aster DEX API directly using authenticatedRequest
        
        // Make authenticated request to Aster DEX (uses 30-key system automatically)
        // FIXED: Use 'account' not 'fapi/v1/account' since baseUrl already includes /fapi/v1
        const data = await (asterDexService as any).authenticatedRequest('account', {}, 'GET', 30000);
        
        // Log raw API response for debugging (development only)
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Aster API response received via 30-key system', {
            context: 'AsterAPI',
            data: {
              keys: Object.keys(data),
              totalWalletBalance: data.totalWalletBalance,
              availableBalance: data.availableBalance,
              totalMarginBalance: data.totalMarginBalance,
              totalUnrealizedProfit: data.totalUnrealizedProfit
            }
          });
        }
        
        // Parse balance fields from Aster DEX
        const availableBalance = parseFloat(data.availableBalance || 0);
        const totalWalletBalance = parseFloat(data.totalWalletBalance || 0);
        const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || 0);
        const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || 0);
        const totalMarginBalance = parseFloat(data.totalMarginBalance || 0);
        
        // Calculate account equity
        // CRITICAL FIX: Use the first non-zero balance field
        // Priority: availableBalance → totalWalletBalance → totalMarginBalance
        let accountEquity = 0;
        let balanceSource = 'none';
        
        if (availableBalance > 0 && !isNaN(availableBalance)) {
          accountEquity = availableBalance;
          balanceSource = 'availableBalance';
        } else if (totalWalletBalance > 0 && !isNaN(totalWalletBalance)) {
          accountEquity = totalWalletBalance;
          balanceSource = 'totalWalletBalance';
        } else if (totalMarginBalance > 0 && !isNaN(totalMarginBalance)) {
          accountEquity = totalMarginBalance;
          balanceSource = 'totalMarginBalance';
        } else {
          // Try max withdraw as last resort
          const maxWithdraw = parseFloat(data.maxWithdrawAmount || 0);
          if (maxWithdraw > 0 && !isNaN(maxWithdraw)) {
            accountEquity = maxWithdraw;
            balanceSource = 'maxWithdrawAmount';
          }
        }
        
        const calculatedAccountValue = accountEquity; // Account equity is the displayed balance
        
        // Log balance calculation for debugging
        logger.debug('Balance calculation', {
          context: 'AsterAPI',
          data: {
            source: balanceSource,
            value: accountEquity,
            availableBalance,
            totalWalletBalance,
            totalMarginBalance
          }
        });
        
        logger.info(`[BALANCE] Account Balance: $${calculatedAccountValue.toFixed(2)} (source: ${balanceSource})`, {
          context: 'AsterAPI',
          data: { 
            balanceSource,
            calculatedBalance: calculatedAccountValue.toFixed(2),
            availableBalance: availableBalance.toFixed(2),
            totalWalletBalance: totalWalletBalance.toFixed(2),
            totalMarginBalance: totalMarginBalance.toFixed(2),
            unrealizedPnL: totalUnrealizedProfit.toFixed(2),
            positionMargin: totalPositionInitialMargin.toFixed(2)
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
        
        // CRITICAL FIX: Add balance to top level for frontend compatibility
        // Frontend expects: response.balance
        // createSuccessResponse wraps in: response.data.balance
        // Solution: Include both
        const responseData = {
          success: true,
          data: result,
          balance: calculatedAccountValue, // Top-level for frontend
          accountEquity: accountEquity, // Top-level for convenience
          timestamp: new Date().toISOString()
        };
        
        const apiResponse = NextResponse.json(responseData);
        // ENTERPRISE: Add cache headers for live data (1 second max-age)
        apiResponse.headers.set('Cache-Control', 'public, max-age=1, must-revalidate');
        apiResponse.headers.set('X-Data-Source', 'live');
        apiResponse.headers.set('X-Timestamp', Date.now().toString());
        
        return apiResponse;
      });
    });
  } catch (error: unknown) {
    timer.end();
    PerformanceMonitor.recordCounter('api:aster:account:error');
    
    // Enhanced error logging with detailed information
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Check for specific error types
    let statusCode = 500;
    let errorDetail = 'Failed to fetch account data';
    
    if (errorMessage.includes('No healthy API keys available')) {
      statusCode = 503;
      errorDetail = 'No healthy API keys available - all keys may be rate limited or invalid';
      logger.error('CRITICAL: No healthy API keys in pool', error instanceof Error ? error : new Error(String(error)), {
        context: 'AsterAPI',
        data: {
          error: errorMessage,
          solution: 'Check API key pool configuration and rate limiting status'
        }
      });
    } else if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      statusCode = 504;
      errorDetail = 'Request timeout - Aster DEX API did not respond in time';
      logger.error('Request timeout fetching account', error instanceof Error ? error : new Error(String(error)), {
        context: 'AsterAPI',
        data: { error: errorMessage, timeout: '30 seconds' }
      });
    } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Invalid API-key')) {
      statusCode = 401;
      errorDetail = 'Authentication failed - check API credentials';
      logger.error('CRITICAL: Authentication failed', error instanceof Error ? error : new Error(String(error)), {
        context: 'AsterAPI',
        data: {
          error: errorMessage,
          solution: 'Verify ASTER_API_KEY and ASTER_SECRET_KEY in .env.local'
        }
      });
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      statusCode = 429;
      errorDetail = 'Rate limit exceeded - too many requests';
      logger.error('Rate limit exceeded', error instanceof Error ? error : new Error(String(error)), {
        context: 'AsterAPI',
        data: { error: errorMessage, solution: 'Wait before retrying' }
      });
    } else {
      // Generic error - log full details
      logger.error('Failed to fetch Aster account', error instanceof Error ? error : new Error(String(error)), {
        context: 'AsterAPI',
        data: {
          error: errorMessage,
          stack: errorStack,
          type: error instanceof Error ? error.constructor.name : typeof error
        }
      });
    }
    
    return NextResponse.json(
      { 
        error: errorDetail,
        message: errorMessage,
        status: statusCode
      },
      { status: statusCode }
    );
  }
}

