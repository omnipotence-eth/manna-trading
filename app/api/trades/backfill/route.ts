import { NextResponse } from 'next/server';
import { addTrade } from '@/lib/db';
import { asterDexService } from '@/services/asterDexService';
import { logger } from '@/lib/logger';

/**
 * Backfill trades for currently open positions that weren't logged
 * GET /api/trades/backfill
 */
export async function GET() {
  try {
    logger.info('🔄 Starting trade backfill for open positions...', { context: 'TradesBackfill' });

    // Get all open positions from Aster
    const positions = await asterDexService.getPositions();
    
    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open positions to backfill',
        backfilled: 0
      });
    }

    let backfilledCount = 0;
    const errors: string[] = [];

    for (const position of positions) {
      try {
        // Skip positions with 0 amount (already closed)
        if (position.size === 0) {
          continue;
        }

        // Normalize symbol format (ASTERUSDT -> ASTER/USDT)
        const normalizedSymbol = position.symbol.replace('USDT', '/USDT');

        // Create trade entry for this position
        const tradeEntry = {
          id: `backfill-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toISOString(),
          model: 'Multi-Agent AI',
          symbol: normalizedSymbol,
          side: (position.size > 0 ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
          size: Math.abs(position.size),
          entryPrice: position.entryPrice,
          exitPrice: 0, // Still open
          pnl: position.unrealizedPnl,
          pnlPercent: 0,
          leverage: position.leverage,
          entryReason: `Backfilled open position (opened before logging was implemented)`,
          entryConfidence: 50,
          entrySignals: {
            primary: 'Backfilled',
            confirming: [],
            contradicting: []
          },
          entryMarketRegime: 'unknown',
          entryScore: 0,
          exitReason: '', // Still open
          exitTimestamp: null,
          duration: 0 // Will be calculated when position closes
        };

        logger.info(`Attempting to backfill ${normalizedSymbol}`, { 
          context: 'TradesBackfill',
          data: tradeEntry
        });

        const success = await addTrade(tradeEntry);
        
        if (success) {
          backfilledCount++;
          logger.info(`✅ Backfilled trade for ${position.symbol}`, { context: 'TradesBackfill' });
        } else {
          errors.push(`Failed to backfill ${position.symbol}`);
        }
      } catch (error) {
        const errorMsg = `Error backfilling ${position.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg, error, { context: 'TradesBackfill' });
      }
    }

    logger.info(`🎯 Trade backfill complete: ${backfilledCount} trades backfilled`, { 
      context: 'TradesBackfill',
      data: { backfilledCount, errors: errors.length }
    });

    return NextResponse.json({
      success: true,
      message: `Backfilled ${backfilledCount} trades`,
      backfilled: backfilledCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    logger.error('Trade backfill failed', error, { context: 'TradesBackfill' });
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

