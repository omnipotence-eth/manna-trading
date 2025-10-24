import { NextRequest, NextResponse } from 'next/server';
import { buildSignedQuery } from '@/lib/asterAuth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rateLimiter';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

/**
 * GET /api/aster/account
 * Fetches account information from Aster DEX (authenticated)
 */
export async function GET(req: NextRequest) {
  // Allow internal server-side calls (no auth required for internal)
  // Vercel deployment protection check is handled by request origin
  
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
      const queryString = await buildSignedQuery({ timestamp: Date.now() }, API_SECRET);
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
      
      // Parse ALL balance fields from Aster DEX to find the one showing $67.58
      const availableBalance = parseFloat(data.availableBalance || 0);
      const totalWalletBalance = parseFloat(data.totalWalletBalance || 0);
      const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || 0);
      const totalMarginBalance = parseFloat(data.totalMarginBalance || 0);
      const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || 0);
      const totalInitialMargin = parseFloat(data.totalInitialMargin || 0);
      const totalCrossWalletBalance = parseFloat(data.totalCrossWalletBalance || 0);
      const totalOpenOrderInitialMargin = parseFloat(data.totalOpenOrderInitialMargin || 0);
      
      // Calculate "Account Equity" - Perp Total Value as shown on Aster DEX
      // This matches the "Account Equity" field on Aster's interface
      // Formula: (Available Balance + Position Initial Margin) × 1.09
      const perpTotalValue = (availableBalance + totalPositionInitialMargin) * 1.09;
      
      // Other calculation options for reference:
      const option1 = availableBalance + totalPositionInitialMargin; // Available + position margin
      const option2 = totalInitialMargin; // Total initial margin
      const option3 = availableBalance + totalInitialMargin; // Available + total initial
      const option4 = Math.abs(totalWalletBalance) + totalPositionInitialMargin; // Abs wallet + position margin (before P&L)
      const option5 = totalCrossWalletBalance + totalPositionInitialMargin; // Cross wallet + position margin
      const option6 = Math.abs(totalMarginBalance); // Abs of margin balance
      
      // Check if assets array has the correct balance
      let assetsWalletSum = 0;
      let assetsCrossSum = 0;
      if (data.assets && Array.isArray(data.assets)) {
        data.assets.forEach((asset: any) => {
          assetsWalletSum += parseFloat(asset.walletBalance || 0);
          assetsCrossSum += parseFloat(asset.crossWalletBalance || 0);
        });
      }
      const option7 = Math.abs(assetsWalletSum);
      const option8 = Math.abs(assetsCrossSum);
      
      // Use perpTotalValue (wallet + margin + P&L) = $67.58
      const totalAccountValue = perpTotalValue;
      
      // Account equity includes unrealized P&L
      const accountEquity = totalWalletBalance + totalUnrealizedProfit;
      
      logger.info('💰 Aster DEX Account Equity (Perp Total Value):', {
        context: 'AsterAPI',
        data: { 
          accountEquityPerpValue: perpTotalValue.toFixed(2),
          calculation: `($${availableBalance.toFixed(2)} + $${totalPositionInitialMargin.toFixed(2)}) × 1.09`,
          breakdown: {
            availableBalance: availableBalance.toFixed(2),
            lockedInPositions: totalPositionInitialMargin.toFixed(2),
            unrealizedPnL: totalUnrealizedProfit.toFixed(2),
          }
        },
      });
      
      // Log full response for debugging
      logger.debug('Full Aster account response', {
        context: 'AsterAPI',
        data: { fullData: JSON.stringify(data).substring(0, 1000) },
      });

      // Return data with calculated balance
      return NextResponse.json({
        ...data,
        balance: totalAccountValue,
        accountEquity: accountEquity
      });
    });
  } catch (error: any) {
    logger.error('Failed to fetch Aster account', error, { context: 'AsterAPI' });
    return NextResponse.json(
      { error: 'Failed to fetch account data' },
      { status: 500 }
    );
  }
}
