/**
 * Database Setup API
 * Creates necessary tables for position monitoring and performance tracking
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    logger.info('Setting up database tables', { context: 'DatabaseSetup' });

    // Create open_positions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS open_positions (
        id VARCHAR(255) PRIMARY KEY,
        symbol VARCHAR(50) NOT NULL,
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
        unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
        unrealized_pnl_percent DECIMAL(10, 4) DEFAULT 0,
        opened_at BIGINT NOT NULL,
        last_checked BIGINT NOT NULL,
        order_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create closed_positions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS closed_positions (
        id VARCHAR(255) PRIMARY KEY,
        symbol VARCHAR(50) NOT NULL,
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
      )
    `);

    // Create trade_performance table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trade_performance (
        id SERIAL PRIMARY KEY,
        trade_id VARCHAR(255) UNIQUE NOT NULL,
        symbol VARCHAR(50) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        exit_price DECIMAL(20, 8) NOT NULL,
        size DECIMAL(20, 8) NOT NULL,
        leverage INTEGER NOT NULL,
        realized_pnl DECIMAL(20, 8) NOT NULL,
        realized_pnl_percent DECIMAL(10, 4) NOT NULL,
        duration BIGINT NOT NULL,
        exit_reason VARCHAR(50) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trades table for trade journal/chat
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR(255) PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        model VARCHAR(100) NOT NULL,
        symbol VARCHAR(50) NOT NULL,
        side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
        size DECIMAL(20, 8) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        exit_price DECIMAL(20, 8) DEFAULT 0,
        pnl DECIMAL(20, 8) DEFAULT 0,
        pnl_percent DECIMAL(10, 4) DEFAULT 0,
        leverage INTEGER NOT NULL DEFAULT 1,
        entry_reason TEXT,
        entry_confidence DECIMAL(5, 2),
        entry_signals JSONB,
        entry_market_regime VARCHAR(50),
        entry_score INTEGER,
        exit_reason TEXT,
        exit_timestamp TIMESTAMPTZ,
        duration INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Migrate existing trades table to fix entry_confidence column
    await db.execute(`
      DO $$ 
      BEGIN
        -- Check if column needs migration (is DECIMAL(5,4) instead of DECIMAL(5,2))
        ALTER TABLE trades 
        ALTER COLUMN entry_confidence TYPE DECIMAL(5, 2);
      EXCEPTION
        WHEN OTHERS THEN
          -- Column might already be correct or table might not exist yet
          NULL;
      END $$;
    `);

    // Create indexes
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_open_positions_symbol ON open_positions(symbol)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_open_positions_status ON open_positions(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_closed_positions_symbol ON closed_positions(symbol)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_closed_positions_closed_at ON closed_positions(closed_at)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_trade_performance_symbol ON trade_performance(symbol)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_trade_performance_timestamp ON trade_performance(timestamp)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl)`);

    logger.info('✅ Database tables created successfully', { context: 'DatabaseSetup' });

    return NextResponse.json({
      success: true,
      message: 'Database tables created successfully',
      tables: ['open_positions', 'closed_positions', 'trade_performance', 'trades'],
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Failed to create database tables', error, { context: 'DatabaseSetup' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to create database tables',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Check if tables exist
    const tablesCheck = await Promise.all([
      db.execute(`SELECT to_regclass('public.open_positions') as exists`),
      db.execute(`SELECT to_regclass('public.closed_positions') as exists`),
      db.execute(`SELECT to_regclass('public.trade_performance') as exists`),
      db.execute(`SELECT to_regclass('public.trades') as exists`)
    ]);

    const [openPos, closedPos, tradePerf, trades] = tablesCheck.map(result => result.rows[0]?.exists !== null);

    // Get counts if tables exist
    let counts = { openPositions: 0, closedPositions: 0, tradePerformance: 0, trades: 0 };
    
    if (openPos) {
      const result = await db.execute(`SELECT COUNT(*) as count FROM open_positions`);
      counts.openPositions = parseInt(result.rows[0]?.count as string || '0');
    }
    
    if (closedPos) {
      const result = await db.execute(`SELECT COUNT(*) as count FROM closed_positions`);
      counts.closedPositions = parseInt(result.rows[0]?.count as string || '0');
    }
    
    if (tradePerf) {
      const result = await db.execute(`SELECT COUNT(*) as count FROM trade_performance`);
      counts.tradePerformance = parseInt(result.rows[0]?.count as string || '0');
    }
    
    if (trades) {
      const result = await db.execute(`SELECT COUNT(*) as count FROM trades`);
      counts.trades = parseInt(result.rows[0]?.count as string || '0');
    }

    return NextResponse.json({
      success: true,
      tables: {
        open_positions: { exists: openPos, count: counts.openPositions },
        closed_positions: { exists: closedPos, count: counts.closedPositions },
        trade_performance: { exists: tradePerf, count: counts.tradePerformance },
        trades: { exists: trades, count: counts.trades }
      },
      allTablesExist: openPos && closedPos && tradePerf && trades
    });

  } catch (error) {
    logger.error('Failed to check database tables', error, { context: 'DatabaseSetup' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check database tables'
    }, { status: 500 });
  }
}

