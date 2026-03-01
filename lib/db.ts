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
  /** 'simulation' | 'live' - paper vs live trade */
  source?: 'simulation' | 'live';
}

export interface TradeRejection {
  id: string;
  timestamp: number;
  symbol: string;
  reason: string;
  confidence?: number;
  expectedValue?: number;
  spreadPct?: number;
  depth?: number;
  style?: string;
}

function genId(prefix: string) {
  // Simple UUID fallback without crypto to remain edge/SSR compatible
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Record trade entry rationale
 */
export async function recordTradeEntry(entry: {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  leverage: number;
  entryReason?: string;
  entryConfidence?: number;
  entrySignals?: any;
  entryMarketRegime?: string;
  entryScore?: number;
  takeProfit?: number;
  stopLoss?: number;
  style?: string;
  source?: 'simulation' | 'live';
}) {
  if (!dbConfig.isConfigured) return;
  await initializeDatabase();
  const { asterConfig } = await import('@/lib/configService');
  const source = entry.source ?? (asterConfig.trading.simulationMode ? 'simulation' : 'live');
  await sql(
    `
    INSERT INTO trades (
      id, timestamp, model, symbol, side, size, entry_price, leverage,
      entry_reason, entry_confidence, entry_signals, entry_market_regime, entry_score, source
    ) VALUES ($1, to_timestamp($2/1000.0), 'auto', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO NOTHING;
    `,
    [
      entry.id,
      entry.timestamp,
      entry.symbol,
      entry.side,
      entry.size,
      entry.entryPrice,
      entry.leverage,
      entry.entryReason || null,
      entry.entryConfidence ?? null,
      entry.entrySignals ? JSON.stringify(entry.entrySignals) : null,
      entry.entryMarketRegime || null,
      entry.entryScore || null,
      source,
    ]
  );
}

/**
 * Record an audit event (runner, execution, circuit breaker, etc.)
 */
export async function recordAuditEvent(event: {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!dbConfig.isConfigured) return;
  await initializeDatabase();
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await sql(
    `INSERT INTO audit_events (id, type, source, payload) VALUES ($1, $2, $3, $4);`,
    [
      id,
      event.type,
      event.source,
      event.payload ? JSON.stringify(event.payload) : null,
    ]
  );
}

/**
 * Get recent audit events (for status/audit UI)
 */
export async function getAuditEvents(filters?: { limit?: number; type?: string }): Promise<Array<{ id: string; at: string; type: string; source: string; payload: Record<string, unknown> | null }>> {
  if (!dbConfig.isConfigured) return [];
  try {
    const limit = filters?.limit ?? 50;
    const type = filters?.type ?? null;
    const result = await sql(
      `SELECT id, at, type, source, payload FROM audit_events
       WHERE ($1::text IS NULL OR type = $1)
       ORDER BY at DESC LIMIT $2`,
      [type, limit]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      at: row.at,
      type: row.type,
      source: row.source,
      payload: row.payload,
    }));
  } catch {
    return [];
  }
}

/**
 * Record trade rejection for audit
 */
export async function recordTradeRejection(rej: {
  symbol: string;
  reason: string;
  confidence?: number;
  expectedValue?: number;
  spreadPct?: number;
  depth?: number;
  style?: string;
}) {
  if (!dbConfig.isConfigured) return;
  await initializeDatabase();
  const id = genId('rej');
  const ts = Date.now();
  await sql(
    `
    INSERT INTO trade_rejections (
      id, timestamp, symbol, reason, confidence, expected_value, spread_pct, depth, style
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `,
    [
      id,
      ts,
      rej.symbol,
      rej.reason,
      rej.confidence ?? null,
      rej.expectedValue ?? null,
      rej.spreadPct ?? null,
      rej.depth ?? null,
      rej.style || null
    ]
  );
}

/**
 * Record trade exit details back to trades table
 */
export async function recordTradeExit(exit: {
  id: string;
  symbol: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  exitReason: string;
  exitTimestamp: number;
  durationMs?: number;
}) {
  if (!dbConfig.isConfigured) return;
  await initializeDatabase();
  await sql(
    `
    UPDATE trades
    SET exit_price = $2,
        pnl = $3,
        pnl_percent = $4,
        exit_reason = $5,
        exit_timestamp = to_timestamp($6/1000.0),
        duration = COALESCE($7, duration)
    WHERE id = $1;
    `,
    [
      exit.id,
      exit.exitPrice,
      exit.pnl,
      exit.pnlPercent,
      exit.exitReason,
      exit.exitTimestamp,
      exit.durationMs ? Math.floor(exit.durationMs / 1000) : null
    ]
  );
  
  // OPTIMIZED: Invalidate trade stats cache when trade is closed
  invalidateTradeStatsCache();
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
    // CRITICAL FIX: exit_price, exit_timestamp, duration are nullable for OPEN trades
    await sql(`
      CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR(255) PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        model VARCHAR(100) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        size DECIMAL(20, 8) NOT NULL,
        entry_price DECIMAL(20, 2) NOT NULL,
        exit_price DECIMAL(20, 2),
        pnl DECIMAL(20, 2) DEFAULT 0,
        pnl_percent DECIMAL(10, 2) DEFAULT 0,
        leverage INTEGER NOT NULL,
        entry_reason TEXT,
        entry_confidence DECIMAL(5, 2),
        entry_signals JSONB,
        entry_market_regime VARCHAR(50),
        entry_score VARCHAR(20),
        exit_reason TEXT,
        exit_timestamp TIMESTAMP,
        duration INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Alter existing table to allow NULL for exit fields (for open trades)
    try {
      await sql(`ALTER TABLE trades ALTER COLUMN exit_price DROP NOT NULL;`);
      await sql(`ALTER TABLE trades ALTER COLUMN exit_timestamp DROP NOT NULL;`);
      await sql(`ALTER TABLE trades ALTER COLUMN duration DROP NOT NULL;`);
      await sql(`ALTER TABLE trades ALTER COLUMN pnl DROP NOT NULL;`);
      await sql(`ALTER TABLE trades ALTER COLUMN pnl_percent DROP NOT NULL;`);
    } catch {
      // Columns may already be nullable, ignore error
    }

    // Paper vs live: source column for trades (simulation vs live)
    try {
      await sql(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'simulation';`);
    } catch {
      // ignore
    }

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

    // Create trade_rejections table for audit
    await sql(`
      CREATE TABLE IF NOT EXISTS trade_rejections (
        id VARCHAR(255) PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        reason TEXT,
        confidence DECIMAL(6,4),
        expected_value DECIMAL(10,4),
        spread_pct DECIMAL(10,4),
        depth DECIMAL(20,4),
        style VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Audit trail: agent/runner/execution events
    await sql(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id VARCHAR(255) PRIMARY KEY,
        at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(64) NOT NULL,
        source VARCHAR(64) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      await sql(`CREATE INDEX IF NOT EXISTS idx_audit_events_at ON audit_events(at DESC);`);
      await sql(`CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(type);`);
    } catch { /* ignore */ }

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

    // Create trade_outcomes table for ML training data
    await sql(`
      CREATE TABLE IF NOT EXISTS trade_outcomes (
        trade_id VARCHAR(255) PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        exit_price DECIMAL(20, 8) NOT NULL,
        entry_time TIMESTAMP NOT NULL,
        exit_time TIMESTAMP NOT NULL,
        exit_reason VARCHAR(50) NOT NULL,
        realized_pnl DECIMAL(20, 8) NOT NULL,
        realized_pnl_percent DECIMAL(10, 4) NOT NULL,
        leverage INTEGER NOT NULL,
        max_favorable_excursion DECIMAL(20, 8),
        max_adverse_excursion DECIMAL(20, 8),
        exit_efficiency DECIMAL(5, 4),
        hold_duration_minutes INTEGER,
        entry_hour_utc INTEGER,
        entry_day_of_week INTEGER,
        technical_confidence DECIMAL(5, 4),
        chief_confidence DECIMAL(5, 4),
        was_force_approved BOOLEAN DEFAULT FALSE,
        market_regime VARCHAR(20),
        btc_price_at_entry DECIMAL(20, 8),
        outcome VARCHAR(20),
        learning_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for faster queries
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_trades_model ON trades(model);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON trade_outcomes(symbol);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON trade_outcomes(outcome);`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_outcomes_regime ON trade_outcomes(market_regime);`);
    
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
 * OPTIMIZED: Invalidates trade stats cache when new trade is added
 */
export async function addTrade(trade: Trade): Promise<boolean> {
  // OPTIMIZED: Invalidate trade stats cache when new trade is added
  invalidateTradeStatsCache();
  
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
        exit_timestamp, duration, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
      trade.duration,
      trade.source ?? (await import('@/lib/configService')).asterConfig.trading.simulationMode ? 'simulation' : 'live',
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
  source?: 'simulation' | 'live';
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  try {
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    
    const result = await sql(`
      SELECT * FROM trades 
      WHERE ($1::text IS NULL OR symbol = $1)
        AND ($2::text IS NULL OR model = $2)
        AND ($3::text IS NULL OR COALESCE(source, 'simulation') = $3)
      ORDER BY timestamp DESC 
      LIMIT $4
      OFFSET $5
    `, [
      filters?.symbol || null,
      filters?.model || null,
      filters?.source || null,
      limit,
      offset
    ]);
    
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
      entryConfidence: parseFloat(row.entry_confidence) * 100,
      entrySignals: row.entry_signals,
      entryMarketRegime: row.entry_market_regime,
      entryScore: row.entry_score,
      exitReason: row.exit_reason,
      exitTimestamp: row.exit_timestamp,
      duration: parseInt(row.duration),
      createdAt: row.created_at,
      source: row.source === 'live' ? 'live' : 'simulation',
    }));

    return trades;
  } catch (error) {
    logger.error('Failed to fetch trades from database', error, { context: 'Database' });
    return [];
  }
}

// OPTIMIZED: Cache for trade stats to reduce database load
let tradeStatsCache: { data: any; expires: number } | null = null;
const TRADE_STATS_CACHE_TTL = 30000; // 30 seconds

/**
 * Get trade statistics
 * OPTIMIZED: Cached for 30 seconds to reduce database queries
 */
export async function getTradeStats() {
  // Check cache first
  if (tradeStatsCache && tradeStatsCache.expires > Date.now()) {
    logger.debug('Returning cached trade stats', { context: 'Database' });
    return tradeStatsCache.data;
  }
  
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

    const stats = {
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
    
    // Cache the result
    tradeStatsCache = {
      data: stats,
      expires: Date.now() + TRADE_STATS_CACHE_TTL
    };
    
    return stats;
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
 * Invalidate trade stats cache (call after adding/closing trades)
 */
export function invalidateTradeStatsCache(): void {
  tradeStatsCache = null;
  logger.debug('Trade stats cache invalidated', { context: 'Database' });
}

/**
 * Sum of realized P&L for trades closed today (for circuit breaker)
 */
export async function getTodayRealizedPnL(): Promise<number> {
  if (!dbConfig.isConfigured) return 0;
  try {
    const result = await sql(`
      SELECT COALESCE(SUM(pnl), 0) as total
      FROM trades
      WHERE exit_timestamp IS NOT NULL
        AND (exit_timestamp AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    `);
    const total = result.rows[0]?.total;
    return typeof total === 'number' ? total : parseFloat(total as string) || 0;
  } catch {
    return 0;
  }
}

/**
 * Number of trades closed today (for daily report)
 */
export async function getTodayTradeCount(): Promise<number> {
  if (!dbConfig.isConfigured) return 0;
  try {
    const result = await sql(`
      SELECT COUNT(*) as cnt
      FROM trades
      WHERE exit_timestamp IS NOT NULL
        AND (exit_timestamp AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    `);
    const cnt = result.rows[0]?.cnt;
    return typeof cnt === 'number' ? cnt : parseInt(String(cnt), 10) || 0;
  } catch {
    return 0;
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

