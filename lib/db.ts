/**
 * Database connection and schema for Vercel Postgres
 * Stores trade history permanently
 */

import { sql } from '@vercel/postgres';
import { logger } from './logger';

export interface Trade {
  id: string;
  timestamp: string;
  model: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  entryReason: string;
  entryConfidence: number;
  entrySignals: string[];
  entryMarketRegime: string;
  entryScore: string;
  exitReason: string;
  exitTimestamp: string;
  duration: number;
  createdAt?: Date;
}

/**
 * Initialize database - create trades table if it doesn't exist
 */
export async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR(255) PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        model VARCHAR(100) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        size DECIMAL(20, 8) NOT NULL,
        entry_price DECIMAL(20, 2) NOT NULL,
        exit_price DECIMAL(20, 2) NOT NULL,
        pnl DECIMAL(20, 2) NOT NULL,
        pnl_percent DECIMAL(10, 2) NOT NULL,
        leverage INTEGER NOT NULL,
        entry_reason TEXT,
        entry_confidence DECIMAL(5, 2),
        entry_signals JSONB,
        entry_market_regime VARCHAR(50),
        entry_score VARCHAR(20),
        exit_reason TEXT,
        exit_timestamp TIMESTAMP NOT NULL,
        duration INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create indexes for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_trades_model ON trades(model);
    `;

    logger.info('✅ Database initialized successfully', { context: 'Database' });
    return true;
  } catch (error) {
    logger.error('Failed to initialize database', error, { context: 'Database' });
    throw error;
  }
}

/**
 * Add a trade to the database
 */
export async function addTrade(trade: Trade): Promise<boolean> {
  try {
    await sql`
      INSERT INTO trades (
        id, timestamp, model, symbol, side, size,
        entry_price, exit_price, pnl, pnl_percent, leverage,
        entry_reason, entry_confidence, entry_signals,
        entry_market_regime, entry_score, exit_reason,
        exit_timestamp, duration
      ) VALUES (
        ${trade.id},
        ${trade.timestamp},
        ${trade.model},
        ${trade.symbol},
        ${trade.side},
        ${trade.size},
        ${trade.entryPrice},
        ${trade.exitPrice},
        ${trade.pnl},
        ${trade.pnlPercent},
        ${trade.leverage},
        ${trade.entryReason},
        ${trade.entryConfidence},
        ${JSON.stringify(trade.entrySignals)},
        ${trade.entryMarketRegime},
        ${trade.entryScore},
        ${trade.exitReason},
        ${trade.exitTimestamp},
        ${trade.duration}
      )
      ON CONFLICT (id) DO NOTHING;
    `;

    logger.info(`✅ Trade saved to database: ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)}`, {
      context: 'Database',
      data: { symbol: trade.symbol, pnl: trade.pnl },
    });

    return true;
  } catch (error) {
    logger.error('Failed to save trade to database', error, { 
      context: 'Database',
      data: { tradeId: trade.id, symbol: trade.symbol }
    });
    return false;
  }
}

/**
 * Get all trades with optional filters
 */
export async function getTrades(filters?: {
  symbol?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  try {
    let query = sql`
      SELECT 
        id,
        timestamp,
        model,
        symbol,
        side,
        size,
        entry_price as "entryPrice",
        exit_price as "exitPrice",
        pnl,
        pnl_percent as "pnlPercent",
        leverage,
        entry_reason as "entryReason",
        entry_confidence as "entryConfidence",
        entry_signals as "entrySignals",
        entry_market_regime as "entryMarketRegime",
        entry_score as "entryScore",
        exit_reason as "exitReason",
        exit_timestamp as "exitTimestamp",
        duration,
        created_at as "createdAt"
      FROM trades
      WHERE 1=1
    `;

    // Apply filters
    if (filters?.symbol) {
      query = sql`${query} AND symbol = ${filters.symbol}`;
    }
    if (filters?.model) {
      query = sql`${query} AND model = ${filters.model}`;
    }

    // Order by timestamp descending (newest first)
    query = sql`${query} ORDER BY timestamp DESC`;

    // Apply limit and offset
    if (filters?.limit) {
      query = sql`${query} LIMIT ${filters.limit}`;
    }
    if (filters?.offset) {
      query = sql`${query} OFFSET ${filters.offset}`;
    }

    const result = await query;
    
    // Transform rows to Trade objects
    const trades: Trade[] = result.rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      symbol: row.symbol,
      side: row.side,
      size: parseFloat(row.size),
      entryPrice: parseFloat(row.entryPrice),
      exitPrice: parseFloat(row.exitPrice),
      pnl: parseFloat(row.pnl),
      pnlPercent: parseFloat(row.pnlPercent),
      leverage: parseInt(row.leverage),
      entryReason: row.entryReason,
      entryConfidence: parseFloat(row.entryConfidence),
      entrySignals: row.entrySignals,
      entryMarketRegime: row.entryMarketRegime,
      entryScore: row.entryScore,
      exitReason: row.exitReason,
      exitTimestamp: row.exitTimestamp,
      duration: parseInt(row.duration),
      createdAt: row.createdAt,
    }));

    return trades;
  } catch (error) {
    logger.error('Failed to fetch trades from database', error, { context: 'Database' });
    return [];
  }
}

/**
 * Get trade statistics
 */
export async function getTradeStats() {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        AVG(duration) as avg_duration,
        MAX(pnl) as best_trade,
        MIN(pnl) as worst_trade
      FROM trades;
    `;

    const row = result.rows[0];
    const totalTrades = parseInt(row.total_trades) || 0;
    const wins = parseInt(row.wins) || 0;
    const losses = parseInt(row.losses) || 0;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    return {
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnL: parseFloat(row.total_pnl) || 0,
      avgPnL: parseFloat(row.avg_pnl) || 0,
      avgDuration: Math.floor((parseFloat(row.avg_duration) || 0) / 60), // Convert to minutes
      bestTrade: parseFloat(row.best_trade) || 0,
      worstTrade: parseFloat(row.worst_trade) || 0,
    };
  } catch (error) {
    logger.error('Failed to fetch trade stats', error, { context: 'Database' });
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
    };
  }
}

/**
 * Delete old trades (optional cleanup)
 */
export async function deleteOldTrades(daysOld: number = 90) {
  try {
    const result = await sql`
      DELETE FROM trades
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      RETURNING id;
    `;

    logger.info(`🗑️ Deleted ${result.rowCount} trades older than ${daysOld} days`, {
      context: 'Database',
    });

    return result.rowCount || 0;
  } catch (error) {
    logger.error('Failed to delete old trades', error, { context: 'Database' });
    return 0;
  }
}

