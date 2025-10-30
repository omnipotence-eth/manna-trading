/**
 * Position Cleanup API
 * Removes invalid test positions from database
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    logger.info('Cleaning up invalid test positions', { context: 'PositionCleanup' });

    // Delete positions with invalid symbols (TEST, mock symbols, etc.)
    const result = await db.execute(`
      DELETE FROM open_positions 
      WHERE symbol LIKE '%TEST%' 
         OR symbol NOT LIKE '%USDT'
         OR symbol LIKE '%MOCK%'
      RETURNING id, symbol
    `);

    const deletedCount = Array.isArray(result) ? result.length : 0;
    const deletedPositions = Array.isArray(result) ? result : [];

    logger.info('✅ Cleanup completed', {
      context: 'PositionCleanup',
      deletedCount,
      positions: deletedPositions
    });

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deletedCount} invalid position(s)`,
      deletedPositions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to clean up positions', error as Error, { 
      context: 'PositionCleanup' 
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Just show what would be deleted
    const result = await db.execute(`
      SELECT id, symbol, side, status, opened_at 
      FROM open_positions 
      WHERE symbol LIKE '%TEST%' 
         OR symbol NOT LIKE '%USDT'
         OR symbol LIKE '%MOCK%'
    `);

    const positions = Array.isArray(result) ? result : [];

    return NextResponse.json({
      success: true,
      message: `Found ${positions.length} invalid position(s)`,
      positions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to query positions', error as Error, { 
      context: 'PositionCleanup' 
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

