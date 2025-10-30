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
    // HIGH PRIORITY FIX: Add body size validation
    const contentLength = request.headers.get('content-length');
    const MAX_BODY_SIZE = 1024 * 10; // 10KB max
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Request body too large. Maximum size: ${MAX_BODY_SIZE} bytes`,
        },
        { status: 413 }
      );
    }

    const trade = await request.json();

    // HIGH PRIORITY FIX: Enhanced validation with type checking
    if (!trade.id || typeof trade.id !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid trade id field (must be string)',
        },
        { status: 400 }
      );
    }
    if (!trade.symbol || typeof trade.symbol !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid trade symbol field (must be string)',
        },
        { status: 400 }
      );
    }
    if (!trade.side || !['BUY', 'SELL'].includes(trade.side)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid trade side field (must be BUY or SELL)',
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
    // HIGH PRIORITY FIX: Enhanced error messages with details
    const errorMessage = error instanceof Error 
      ? `Failed to save trade: ${error.message}` 
      : 'Failed to save trade: Unknown error';
    
    logger.error('Failed to save trade', error, { 
      context: 'TradesAPI',
      data: {
        errorType: error?.constructor?.name || 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

