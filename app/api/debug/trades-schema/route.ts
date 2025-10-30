import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { logger } from '@/lib/logger';

/**
 * Debug endpoint to check trades table schema
 * GET /api/debug/trades-schema
 */
export async function GET() {
  try {
    // Get column info for trades table
    const result = await sql`
      SELECT 
        column_name, 
        data_type, 
        numeric_precision,
        numeric_scale,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'trades'
      ORDER BY ordinal_position;
    `;

    logger.info('Trades table schema:', { context: 'Debug', data: result.rows });

    return NextResponse.json({
      success: true,
      schema: result.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch schema', error, { context: 'Debug' });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

