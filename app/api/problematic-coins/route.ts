import { NextResponse } from 'next/server';
import { problematicCoinDetector } from '@/services/trading/problematicCoinDetector';
import { logger } from '@/lib/logger';

/**
 * API endpoint to scan for and manage problematic coins
 * GET /api/problematic-coins - Get list of detected problematic coins
 * POST /api/problematic-coins/scan - Scan all symbols for problematic coins
 */
export async function GET() {
  try {
    const problematicCoins = problematicCoinDetector.getProblematicCoins();
    
    return NextResponse.json({
      success: true,
      count: problematicCoins.length,
      coins: problematicCoins,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get problematic coins', error as Error, {
      context: 'ProblematicCoinsAPI'
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    logger.info('[SCAN] Starting problematic coin scan...', {
      context: 'ProblematicCoinsAPI'
    });

    const problematicCoins = await problematicCoinDetector.scanAllSymbols();
    
    logger.info(`[OK] Problematic coin scan complete: Found ${problematicCoins.length} problematic coins`, {
      context: 'ProblematicCoinsAPI',
      data: {
        count: problematicCoins.length,
        symbols: problematicCoins.map(c => c.symbol)
      }
    });

    return NextResponse.json({
      success: true,
      count: problematicCoins.length,
      coins: problematicCoins,
      message: `Found ${problematicCoins.length} problematic coins`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to scan for problematic coins', error as Error, {
      context: 'ProblematicCoinsAPI'
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


