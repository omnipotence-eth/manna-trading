import { NextRequest, NextResponse } from 'next/server';
import { getTrades, getTradeStats, addTrade, initializeDatabase } from '@/lib/db';
import { getTrades as getTradesMemory, getTradeStats as getTradeStatsMemory, addTrade as addTradeMemory, initializeDatabase as initMemory } from '@/lib/tradeMemory';
import { logger } from '@/lib/logger';
import { dbConfig } from '@/lib/configService'; // OPTIMIZED: Use configService instead of direct process.env

/**
 * GET /api/trades - Fetch trade history from Postgres database
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
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;

    // OPTIMIZED: Use configService instead of direct process.env access
    // Try database first if available
    if (dbConfig.connectionString && dbConfig.connectionString !== 'postgresql://localhost:5432/manna_dev') {
      try {
        // OPTIMIZED: initializeDatabase() is now cached - won't recreate tables on every request
        await initializeDatabase();
        const trades = await getTrades({ symbol, model, limit });
        const stats = await getTradeStats();
        
        logger.info(`📊 Fetched ${trades.length} trades from database`, { context: 'TradesAPI' });
        
        return NextResponse.json({
          success: true,
          trades,
          stats,
          source: 'postgres',
          timestamp: new Date().toISOString(),
        });
      } catch (dbError) {
        logger.warn('Database failed, falling back to memory storage', { context: 'TradesAPI' });
      }
    }

    // Fallback to memory storage
    await initMemory();
    const trades = await getTradesMemory({ symbol, model, limit });
    const stats = await getTradeStatsMemory();

    logger.info(`📊 Fetched ${trades.length} trades from memory`, { context: 'TradesAPI' });

    return NextResponse.json({
      success: true,
      trades,
      stats,
      source: 'memory',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to fetch trades', error, { context: 'TradesAPI' });
    
    // Return empty data instead of error to prevent UI crashes
    return NextResponse.json({
      success: true,
      trades: [],
      stats: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        avgDuration: 0,
        bestTrade: 0,
        worstTrade: 0,
      },
      source: 'fallback',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /api/trades - Add a new trade to Postgres database
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

    let saved = false;
    let source = '';

    // Try database first if available
    if (process.env.DATABASE_URL) {
      try {
        await initializeDatabase();
        saved = await addTrade(trade);
        source = 'database';
      } catch (dbError) {
        logger.warn('Database failed, falling back to memory storage', { context: 'TradesAPI' });
      }
    }

    // Fallback to memory storage
    if (!saved) {
      await initMemory();
      saved = await addTradeMemory(trade);
      source = 'memory';
    }

    if (saved) {
      logger.info(`📝 Trade saved to ${source}: ${trade.symbol} ${trade.side} | P&L: $${trade.pnl?.toFixed(2)}`, {
        context: 'TradesAPI',
        data: { symbol: trade.symbol, side: trade.side, pnl: trade.pnl, source },
      });
    }

    return NextResponse.json({
      success: saved,
      message: saved ? `Trade saved to ${source}` : 'Failed to save trade',
      source,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to save trade', error, { context: 'TradesAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

