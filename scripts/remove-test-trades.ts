/**
 * Script to remove test trades from database
 * Run with: npx tsx scripts/remove-test-trades.ts
 */

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

async function removeTestTrades() {
  try {
    logger.info('🧹 Starting test trade removal...', { context: 'RemoveTestTrades' });

    // Remove trades with test-related identifiers
    const result = await sql`
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
    `;

    const deletedCount = result.length || 0;

    logger.info(`✅ Removed ${deletedCount} test trades from database`, {
      context: 'RemoveTestTrades',
      data: { deletedCount, trades: result }
    });

    console.log(`\n✅ Successfully removed ${deletedCount} test trades:\n`);
    result.forEach((trade: any) => {
      console.log(`  - ${trade.id} | ${trade.symbol} | ${trade.model} | ${trade.timestamp}`);
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to remove test trades', error, { context: 'RemoveTestTrades' });
    throw error;
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

