import { NextRequest, NextResponse } from 'next/server';
import { tradeHistoryStore } from '@/lib/tradeHistory';
import { logger } from '@/lib/logger';

/**
 * GET /api/trades - Fetch trade history
 * Query params:
 *   - symbol: Filter by symbol (optional)
 *   - model: Filter by model (optional)
 *   - limit: Limit number of results (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || undefined;
    const model = searchParams.get('model') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    const trades = tradeHistoryStore.getFilteredTrades({
      symbol,
      model,
      limit,
    });

    const stats = tradeHistoryStore.getStats();

    return NextResponse.json({
      success: true,
      trades,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to fetch trades', error, { context: 'TradesAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trades - Add a new trade to history
 * Body: Trade object
 */
export async function POST(request: NextRequest) {
  try {
    const trade = await request.json();

    // Validate required fields
    if (!trade.id || !trade.symbol || !trade.side) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required trade fields',
        },
        { status: 400 }
      );
    }

    tradeHistoryStore.addTrade(trade);

    logger.info(`📝 Trade logged: ${trade.symbol} ${trade.side} | P&L: $${trade.pnl?.toFixed(2)}`, {
      context: 'TradesAPI',
      data: { symbol: trade.symbol, side: trade.side, pnl: trade.pnl },
    });

    return NextResponse.json({
      success: true,
      message: 'Trade added to history',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to add trade', error, { context: 'TradesAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

