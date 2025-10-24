import { NextRequest, NextResponse } from 'next/server';
import { getTrades, getTradeStats, addTrade, initializeDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/trades - Fetch trade history from Postgres database
 * Query params:
 *   - symbol: Filter by symbol (optional)
 *   - model: Filter by model (optional)
 *   - limit: Limit number of results (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // Ensure database is initialized
    await initializeDatabase();

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || undefined;
    const model = searchParams.get('model') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;

    const trades = await getTrades({
      symbol,
      model,
      limit,
    });

    const stats = await getTradeStats();

    logger.info(`📊 Fetched ${trades.length} trades from database`, { context: 'TradesAPI' });

    return NextResponse.json({
      success: true,
      trades,
      stats,
      source: 'postgres', // Indicate this is from database
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to fetch trades from database', error, { context: 'TradesAPI' });
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
 * POST /api/trades - Add a new trade to Postgres database
 * Body: Trade object
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure database is initialized
    await initializeDatabase();

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

    const saved = await addTrade(trade);

    if (saved) {
      logger.info(`📝 Trade saved to database: ${trade.symbol} ${trade.side} | P&L: $${trade.pnl?.toFixed(2)}`, {
        context: 'TradesAPI',
        data: { symbol: trade.symbol, side: trade.side, pnl: trade.pnl },
      });
    }

    return NextResponse.json({
      success: saved,
      message: saved ? 'Trade saved to database' : 'Failed to save trade',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to save trade to database', error, { context: 'TradesAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

