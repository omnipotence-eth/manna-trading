/**
 * Database connection and schema for Neon/Supabase PostgreSQL
 * Stores trade history permanently with optimized connection pooling
 * 
 * CRITICAL: Uses lazy import of pg to prevent Next.js from analyzing the import chain during build
 */

import { logger } from './logger';
import { dbConfig } from './configService';
import { circuitBreakers } from './circuitBreaker';
import { PerformanceMonitor } from './performanceMonitor';

// CRITICAL FIX: Lazy import pg to prevent Next.js from analyzing import chain during build
// This prevents the "Can't resolve 'stream'" error by only importing pg at runtime
let Pool: any;
let pool: any;
let poolInitialized = false;

async function initializePool() {
  if (poolInitialized) {
    return pool;
  }
  
  // Check if database is configured
  if (!dbConfig.isConfigured) {
    logger.warn('Database not configured - running without persistent storage', { context: 'Database' });
    return null;
  }
  
  // Only import pg on server-side and at runtime (not during build)
  if (typeof window === 'undefined') {
    try {
      const pg = await import('pg');
      Pool = pg.Pool;
      
      pool = new Pool({
        connectionString: dbConfig.connectionString,
        ssl: dbConfig.ssl ? { 
          rejectUnauthorized: false
        } : false,
        max: dbConfig.maxConnections, // Maximum number of clients in the pool
        idleTimeoutMillis: dbConfig.idleTimeout, // Close idle clients after 30 seconds
        connectionTimeoutMillis: dbConfig.connectionTimeout, // Return an error after 10 seconds if connection could not be established
        allowExitOnIdle: true, // Allow the pool to close all connections and exit
        // Additional Neon-specific options
        keepAlive: true,
        keepAliveInitialDelayMillis: 0,
      });
      
      poolInitialized = true;
      logger.info('Database pool initialized', { context: 'Database' });
    } catch (error) {
      logger.error('Failed to initialize database pool', error as Error, { context: 'Database' });
      throw error;
    }
  } else {
    throw new Error('Database is not available on the client side');
  }
  
  return pool;
}

// Enhanced SQL execution with circuit breaker protection and performance monitoring
async function sql(query: string, params: any[] = []) {
  const timer = PerformanceMonitor.startTimer('database:query');
  
  try {
    // CRITICAL: Initialize pool if not already initialized (lazy loading)
    const dbPool = await initializePool();
    
    // If no database configured, return empty result
    if (!dbPool) {
      logger.debug('Database not configured, returning empty result', { context: 'Database' });
      return { rows: [], rowCount: 0 };
    }
    
    return await circuitBreakers.database.execute(async () => {
      const client = await dbPool.connect();
      try {
        const result = await client.query(query, params);
        PerformanceMonitor.recordCounter('database:query:success');
        return { rows: result.rows, rowCount: result.rowCount };
      } finally {
        client.release();
      }
    });
  } catch (error) {
    PerformanceMonitor.recordCounter('database:query:error');
    throw error;
  } finally {
    timer.end();
  }
}

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
  entrySignals: any; // JSON object with trade entry signals
  entryMarketRegime: string;
  entryScore: number;
  exitReason: string;
  exitTimestamp: string | null;
  duration: number;
  createdAt?: Date;
}

// Cache for database initialization status
let dbInitialized = false;

/**
 * Initialize database - create tables if they don't exist
 * OPTIMIZED: Cached initialization status to prevent repeated calls
 */
export async function initializeDatabase() {
  // Return immediately if already initialized
  if (dbInitialized) {
    return true;
  }

  try {
    // Create trades table
    await sql(`
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
    `);

    // Create model_messages table for chat/analysis messages
    await sql(`
      CREATE TABLE IF NOT EXISTS model_messages (
        id VARCHAR(255) PRIMARY KEY,
        model VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create open_positions table for active position monitoring
    await sql(`
      CREATE TABLE IF NOT EXISTS open_positions (
        id VARCHAR(255) PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        current_price DECIMAL(20, 8) NOT NULL,
        size DECIMAL(20, 8) NOT NULL,
        leverage INTEGER NOT NULL,
        stop_loss DECIMAL(20, 8) NOT NULL,
        take_profit DECIMAL(20, 8) NOT NULL,
        trailing_stop_percent DECIMAL(5, 2) DEFAULT 0,
        highest_price DECIMAL(20, 8) NOT NULL,
        lowest_price DECIMAL(20, 8) NOT NULL,
        unrealized_pnl DECIMAL(20, 8) NOT NULL,
        unrealized_pnl_percent DECIMAL(10, 4) NOT NULL,
        opened_at BIGINT NOT NULL,
        last_checked BIGINT NOT NULL,
        order_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create closed_positions table for trade history
    await sql(`
      CREATE TABLE IF NOT EXISTS closed_positions (
        id VARCHAR(255) PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        exit_price DECIMAL(20, 8) NOT NULL,
        size DECIMAL(20, 8) NOT NULL,
        leverage INTEGER NOT NULL,
        stop_loss DECIMAL(20, 8),
        take_profit DECIMAL(20, 8),
        realized_pnl DECIMAL(20, 8) NOT NULL,
        realized_pnl_percent DECIMAL(10, 4) NOT NULL,
        opened_at BIGINT NOT NULL,
        closed_at BIGINT NOT NULL,
        exit_reason VARCHAR(50) NOT NULL,
        order_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for faster queries
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_model ON trades(model);`);
    
    // OPTIMIZED: Add composite index for common query patterns (symbol + model + timestamp)
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_symbol_model_timestamp ON trades(symbol, model, timestamp DESC);`);
    
    // OPTIMIZED: Add index for P&L filtering and sorting
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl);`);
    
    // OPTIMIZED: Add partial index for recent trades (last 30 days) - improves query performance for recent data
    // CRITICAL FIX: Use CURRENT_TIMESTAMP instead of NOW() for IMMUTABLE requirement, or remove function from predicate
    // For MVP: Skip partial index with function predicate to avoid IMMUTABLE error
    // await sql(`CREATE INDEX IF NOT EXISTS idx_trades_recent ON trades(timestamp DESC) WHERE timestamp > NOW() - INTERVAL '30 days';`);
    // Instead, we'll use the timestamp index for recent queries (already created above)
    
    await sql(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON model_messages(timestamp DESC);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_messages_model ON model_messages(model);`);

    // Indexes for open_positions table
    await sql(`CREATE INDEX IF NOT EXISTS idx_open_positions_symbol ON open_positions(symbol);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_open_positions_status ON open_positions(status);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_open_positions_opened_at ON open_positions(opened_at DESC);`);

    // Indexes for closed_positions table
    await sql(`CREATE INDEX IF NOT EXISTS idx_closed_positions_symbol ON closed_positions(symbol);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_closed_positions_closed_at ON closed_positions(closed_at DESC);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_closed_positions_pnl ON closed_positions(realized_pnl);`);

    logger.info('Database initialized successfully', { context: 'Database' });
    dbInitialized = true; // Mark as initialized
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
    logger.info('Attempting to insert trade', {
      context: 'Database',
      data: {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        entryConfidence: trade.entryConfidence,
        entrySignals: trade.entrySignals
      }
    });

    await sql(`
      INSERT INTO trades (
        id, timestamp, model, symbol, side, size,
        entry_price, exit_price, pnl, pnl_percent, leverage,
        entry_reason, entry_confidence, entry_signals,
        entry_market_regime, entry_score, exit_reason,
        exit_timestamp, duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO NOTHING;
    `, [
      trade.id,
      trade.timestamp,
      trade.model,
      trade.symbol,
      trade.side,
      trade.size,
      trade.entryPrice,
      trade.exitPrice,
      trade.pnl,
      trade.pnlPercent,
      trade.leverage,
      trade.entryReason,
      trade.entryConfidence ? trade.entryConfidence / 100 : 0, // Convert percentage to decimal (50 -> 0.50)
      JSON.stringify(trade.entrySignals),
      trade.entryMarketRegime,
      trade.entryScore,
      trade.exitReason,
      trade.exitTimestamp,
      trade.duration
    ]);

    logger.info(`Trade saved to database: ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)}`, {
      context: 'Database',
      data: { symbol: trade.symbol, pnl: trade.pnl },
    });

    return true;
  } catch (error) {
    logger.error('Failed to save trade to database', error, { 
      context: 'Database',
      data: { 
        tradeId: trade.id, 
        symbol: trade.symbol,
        fullError: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }
    });
    return false;
  }
}

/**
 * Get all trades with optional filters
 * OPTIMIZED: Single parameterized query instead of multiple branches
 */
export async function getTrades(filters?: {
  symbol?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  try {
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    
    // OPTIMIZED: Single parameterized query with optional WHERE clauses
    const result = await sql(`
      SELECT * FROM trades 
      WHERE ($1::text IS NULL OR symbol = $1)
        AND ($2::text IS NULL OR model = $2)
      ORDER BY timestamp DESC 
      LIMIT $3
      OFFSET $4
    `, [
      filters?.symbol || null,
      filters?.model || null,
      limit,
      offset
    ]);
    
    // Transform rows to Trade objects
    const trades: Trade[] = result.rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      symbol: row.symbol,
      side: row.side,
      size: parseFloat(row.size),
      entryPrice: parseFloat(row.entry_price),
      exitPrice: parseFloat(row.exit_price),
      pnl: parseFloat(row.pnl),
      pnlPercent: parseFloat(row.pnl_percent),
      leverage: parseInt(row.leverage),
      entryReason: row.entry_reason,
      entryConfidence: parseFloat(row.entry_confidence) * 100, // Convert decimal back to percentage (0.50 -> 50)
      entrySignals: row.entry_signals,
      entryMarketRegime: row.entry_market_regime,
      entryScore: row.entry_score,
      exitReason: row.exit_reason,
      exitTimestamp: row.exit_timestamp,
      duration: parseInt(row.duration),
      createdAt: row.created_at,
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
    const result = await sql(`
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
    `);

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
    // FIXED: Use parameterized query to prevent SQL injection
    const result = await sql(`
      DELETE FROM trades
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id;
    `, [daysOld]);

    logger.info(`Deleted ${result.rowCount} trades older than ${daysOld} days`, {
      context: 'Database',
    });

    return result.rowCount || 0;
  } catch (error) {
    logger.error('Failed to delete old trades', error, { context: 'Database' });
    return 0;
  }
}

/**
 * Delete trades by symbol
 */
export async function deleteTradesBySymbol(symbol: string): Promise<number> {
  try {
    const result = await sql(`
      DELETE FROM trades
      WHERE symbol = $1
      RETURNING id;
    `, [symbol.toUpperCase()]);

    const deletedCount = result.rowCount || 0;
    logger.info(`Deleted ${deletedCount} trades for symbol ${symbol}`, {
      context: 'Database',
      data: { symbol, deletedCount }
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to delete trades by symbol', error, { 
      context: 'Database',
      data: { symbol }
    });
    return 0;
  }
}

/**
 * Delete model messages containing a specific symbol in the message text
 */
export async function deleteModelMessagesBySymbol(symbol: string): Promise<number> {
  try {
    // Delete messages that contain the symbol (case-insensitive)
    const result = await sql(`
      DELETE FROM model_messages
      WHERE LOWER(message) LIKE LOWER($1)
      RETURNING id;
    `, [`%${symbol.toUpperCase()}%`]);

    const deletedCount = result.rowCount || 0;
    logger.info(`Deleted ${deletedCount} model messages containing ${symbol}`, {
      context: 'Database',
      data: { symbol, deletedCount }
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to delete model messages by symbol', error, { 
      context: 'Database',
      data: { symbol }
    });
    return 0;
  }
}

// Export the database helper for direct queries
export const db = {
  execute: sql,
  get pool() {
    // Lazy getter - will initialize pool on first access
    if (!poolInitialized) {
      // Initialize synchronously if possible, otherwise return null
      // In practice, callers should use db.execute() which handles initialization
      return null;
    }
    return pool;
  },
  // Helper to get pool (async)
  async getPool() {
    return await initializePool();
  }
};

