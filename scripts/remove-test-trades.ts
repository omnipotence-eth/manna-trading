/**
 * Script to remove test trades from database
 * Run with: npx tsx scripts/remove-test-trades.ts
 */

import { logger } from '@/lib/logger';

// Import database connection
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function removeTestTrades() {
  try {
    logger.info('🧹 Starting test trade removal...', { context: 'RemoveTestTrades' });

    // Remove trades with test-related identifiers
    const result = await pool.query(`
      DELETE FROM trades
      WHERE 
        symbol = 'TEST/USDT' OR
        model = 'Test Model' OR
        id LIKE 'test-%' OR
        id LIKE 'test-insert-%' OR
        entry_reason LIKE '%test%' OR
        entry_reason LIKE '%Test%' OR
        entry_market_regime = 'test'
      RETURNING id, symbol, model, timestamp;
    `);

    const deletedCount = result.rows?.length || 0;

    logger.info(`✅ Removed ${deletedCount} test trades from database`, {
      context: 'RemoveTestTrades',
      data: { deletedCount, trades: result.rows }
    });

    console.log(`\n✅ Successfully removed ${deletedCount} test trades:\n`);
    result.rows?.forEach((trade: any) => {
      console.log(`  - ${trade.id} | ${trade.symbol} | ${trade.model} | ${trade.timestamp}`);
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to remove test trades', error, { context: 'RemoveTestTrades' });
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  removeTestTrades()
    .then((count) => {
      console.log(`\n✅ Process complete. Removed ${count} test trades.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error removing test trades:', error);
      process.exit(1);
    });
}

export { removeTestTrades };

