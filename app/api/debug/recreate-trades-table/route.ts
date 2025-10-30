import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { logger } from '@/lib/logger';

/**
 * Drop and recreate trades table with correct schema
 * POST /api/debug/recreate-trades-table
 */
export async function POST() {
  try {
    logger.info('🔄 Dropping and recreating trades table...', { context: 'Debug' });

    // Drop the table
    await sql`DROP TABLE IF EXISTS trades CASCADE;`;
    
    // Recreate with correct schema
    await sql`
      CREATE TABLE trades (
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
        entry_confidence DECIMAL(5, 4),
        entry_signals JSONB,
        entry_market_regime VARCHAR(50),
        entry_score INTEGER,
        exit_reason TEXT,
        exit_timestamp TIMESTAMPTZ,
        duration INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Create indexes
    await sql`CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);`;
    await sql`CREATE INDEX idx_trades_symbol ON trades(symbol);`;
    await sql`CREATE INDEX idx_trades_pnl ON trades(pnl);`;
    await sql`CREATE INDEX idx_trades_exit_timestamp ON trades(exit_timestamp);`;

    logger.info('✅ Trades table recreated successfully', { context: 'Debug' });

    return NextResponse.json({
      success: true,
      message: 'Trades table recreated with correct schema',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to recreate trades table', error, { context: 'Debug' });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

