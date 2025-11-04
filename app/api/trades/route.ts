import { NextRequest, NextResponse } from 'next/server';
import { getTrades, getTradeStats, addTrade, initializeDatabase, deleteTradesBySymbol as deleteTradesBySymbolDB, deleteModelMessagesBySymbol } from '@/lib/db';
import { getTrades as getTradesMemory, getTradeStats as getTradeStatsMemory, addTrade as addTradeMemory, initializeDatabase as initMemory, deleteTradesBySymbol as deleteTradesBySymbolMemory } from '@/lib/tradeMemory';
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
    // NEW: Filter out trades older than 30 days by default (prevents old test trades while keeping recent history)
    const daysBack = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 30;
    const cutoffDate = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000)).toISOString();

    // OPTIMIZED: Use configService instead of direct process.env access
    // Try database first if available
    if (dbConfig.connectionString && dbConfig.connectionString !== 'postgresql://localhost:5432/manna_dev') {
      try {
        // OPTIMIZED: initializeDatabase() is now cached - won't recreate tables on every request
        await initializeDatabase();
        const allTrades = await getTrades({ symbol, model, limit: 1000 }); // Get more to filter by date
        // Filter out old trades (older than cutoffDate)
        const recentTrades = allTrades.filter(trade => {
          const tradeDate = new Date(trade.timestamp);
          const cutoff = new Date(cutoffDate);
          return tradeDate >= cutoff;
        }).slice(0, limit); // Then apply limit
        
        // Recalculate stats for recent trades only
        const recentStats = {
          totalTrades: recentTrades.length,
          wins: recentTrades.filter(t => t.pnl > 0).length,
          losses: recentTrades.filter(t => t.pnl < 0).length,
          winRate: recentTrades.length > 0 
            ? (recentTrades.filter(t => t.pnl > 0).length / recentTrades.length) * 100 
            : 0,
          totalPnL: recentTrades.reduce((sum, t) => sum + t.pnl, 0),
          avgPnL: recentTrades.length > 0 
            ? recentTrades.reduce((sum, t) => sum + t.pnl, 0) / recentTrades.length 
            : 0,
          avgDuration: recentTrades.length > 0
            ? Math.floor(recentTrades.reduce((sum, t) => sum + t.duration, 0) / recentTrades.length / 60)
            : 0,
          bestTrade: recentTrades.length > 0 ? Math.max(...recentTrades.map(t => t.pnl), 0) : 0,
          worstTrade: recentTrades.length > 0 ? Math.min(...recentTrades.map(t => t.pnl), 0) : 0,
        };
        
        logger.info(`Fetched ${recentTrades.length} recent trades (last ${daysBack} days) from database`, { 
          context: 'TradesAPI',
          data: { totalTrades: allTrades.length, recentTrades: recentTrades.length, cutoffDate }
        });
        
        return NextResponse.json({
          success: true,
          trades: recentTrades,
          stats: recentStats,
          source: 'postgres',
          filtered: allTrades.length - recentTrades.length > 0,
          filteredCount: allTrades.length - recentTrades.length,
          timestamp: new Date().toISOString(),
        });
      } catch (dbError) {
        logger.debug('Using memory storage (database optional for MVP)', { 
          context: 'TradesAPI',
          note: 'Trading works perfectly without database'
        });
      }
    }

    // Fallback to memory storage
    await initMemory();
    const allTrades = await getTradesMemory({ symbol, model, limit: 1000 }); // Get more to filter by date
    // Filter out old trades (older than cutoffDate)
    const recentTrades = allTrades.filter(trade => {
      const tradeDate = new Date(trade.timestamp);
      const cutoff = new Date(cutoffDate);
      return tradeDate >= cutoff;
    }).slice(0, limit); // Then apply limit
    
    // Recalculate stats for recent trades only
    const recentStats = {
      totalTrades: recentTrades.length,
      wins: recentTrades.filter(t => t.pnl > 0).length,
      losses: recentTrades.filter(t => t.pnl < 0).length,
      winRate: recentTrades.length > 0 
        ? (recentTrades.filter(t => t.pnl > 0).length / recentTrades.length) * 100 
        : 0,
      totalPnL: recentTrades.reduce((sum, t) => sum + t.pnl, 0),
      avgPnL: recentTrades.length > 0 
        ? recentTrades.reduce((sum, t) => sum + t.pnl, 0) / recentTrades.length 
        : 0,
      avgDuration: recentTrades.length > 0
        ? Math.floor(recentTrades.reduce((sum, t) => sum + t.duration, 0) / recentTrades.length / 60)
        : 0,
      bestTrade: recentTrades.length > 0 ? Math.max(...recentTrades.map(t => t.pnl), 0) : 0,
      worstTrade: recentTrades.length > 0 ? Math.min(...recentTrades.map(t => t.pnl), 0) : 0,
    };

    logger.info(`Fetched ${recentTrades.length} recent trades (last ${daysBack} days) from memory`, { 
      context: 'TradesAPI',
      data: { totalTrades: allTrades.length, recentTrades: recentTrades.length, cutoffDate }
    });

    return NextResponse.json({
      success: true,
      trades: recentTrades,
      stats: recentStats,
      source: 'memory',
      filtered: allTrades.length - recentTrades.length > 0,
      filteredCount: allTrades.length - recentTrades.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Failed to fetch trades', error instanceof Error ? error : new Error(String(error)), { context: 'TradesAPI' });
    
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
        // MVP: Database is optional - memory storage works fine for trading
        logger.debug('Using memory storage (database optional for MVP)', { 
          context: 'TradesAPI',
          note: 'Trading works perfectly without database'
        });
      }
    }

    // Fallback to memory storage (normal for MVP)
    if (!saved) {
      await initMemory();
      saved = await addTradeMemory(trade);
      source = 'memory';
    }

    if (saved) {
      logger.info(`Trade saved to ${source}: ${trade.symbol} ${trade.side} | P&L: $${trade.pnl?.toFixed(2)}`, {
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
  } catch (error: unknown) {
    // HIGH PRIORITY FIX: Enhanced error messages with details
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorMessage = error instanceof Error 
      ? `Failed to save trade: ${error.message}` 
      : 'Failed to save trade: Unknown error';
    
    logger.error('Failed to save trade', errorObj, { 
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

/**
 * DELETE /api/trades - Delete trades and related messages by symbol
 * Query params:
 *   - symbol: Symbol to delete (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          error: 'Symbol parameter is required',
        },
        { status: 400 }
      );
    }

    const symbolUpper = symbol.toUpperCase();
    let deletedTradesCount = 0;
    let deletedMessagesCount = 0;

    // Try database first if available
    if (dbConfig.connectionString && dbConfig.connectionString !== 'postgresql://localhost:5432/manna_dev') {
      try {
        await initializeDatabase();
        deletedTradesCount = await deleteTradesBySymbolDB(symbolUpper);
        deletedMessagesCount = await deleteModelMessagesBySymbol(symbolUpper);
        logger.info(`Deleted SOL trades and messages from database`, {
          context: 'TradesAPI',
          data: { symbol: symbolUpper, deletedTradesCount, deletedMessagesCount }
        });
      } catch (dbError) {
        logger.debug('Using memory storage for deletion', { 
          context: 'TradesAPI',
          note: 'Database deletion failed, trying memory'
        });
      }
    }

    // Also delete from memory storage (if database not available or as backup)
    if (deletedTradesCount === 0) {
      await initMemory();
      deletedTradesCount = await deleteTradesBySymbolMemory(symbolUpper);
      logger.info(`Deleted ${symbolUpper} trades from memory`, {
        context: 'TradesAPI',
        data: { symbol: symbolUpper, deletedTradesCount }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedTradesCount} trades and ${deletedMessagesCount} messages for ${symbolUpper}`,
      deletedTrades: deletedTradesCount,
      deletedMessages: deletedMessagesCount,
      symbol: symbolUpper,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to delete trades', errorObj, { context: 'TradesAPI' });
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

