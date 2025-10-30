import { NextResponse } from 'next/server';
import { addTrade, initializeDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Test trade insertion with detailed error reporting
 * GET /api/trades/test-insert
 */
export async function GET() {
  try {
    logger.info('🧪 Testing direct trade insertion...', { context: 'TradesTestInsert' });

    // Initialize database
    await initializeDatabase();

    // Create a test trade
    const testTrade = {
      id: `test-insert-${Date.now()}`,
      timestamp: new Date().toISOString(),
      model: 'Test Model',
      symbol: 'TEST/USDT',
      side: 'LONG' as 'LONG' | 'SHORT',
      size: 1,
      entryPrice: 100,
      exitPrice: 0,
      pnl: 0,
      pnlPercent: 0,
      leverage: 20,
      entryReason: 'Direct test insertion',
      entryConfidence: 50,
      entrySignals: {
        primary: 'Test',
        confirming: [],
        contradicting: []
      },
      entryMarketRegime: 'test',
      entryScore: 0,
      exitReason: '',
      exitTimestamp: null,
      duration: 0
    };

    logger.info('Test trade payload:', { context: 'TradesTestInsert', data: testTrade });

    // Attempt to insert
    const success = await addTrade(testTrade);

    logger.info(`Test trade insertion result: ${success ? 'SUCCESS' : 'FAILED'}`, { 
      context: 'TradesTestInsert',
      data: { success }
    });

    return NextResponse.json({
      success,
      message: success ? 'Trade inserted successfully' : 'Trade insertion failed',
      tradeId: testTrade.id
    });

  } catch (error) {
    logger.error('Test trade insertion error', error, { context: 'TradesTestInsert' });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

