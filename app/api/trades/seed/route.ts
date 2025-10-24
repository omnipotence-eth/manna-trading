import { NextRequest, NextResponse } from 'next/server';
import { tradeHistoryStore } from '@/lib/tradeHistory';
import { logger } from '@/lib/logger';

/**
 * SEED your closed SOL trade manually (since it closed before logging was fixed)
 * GET /api/trades/seed - Add the missing SOL trade
 */
export async function GET(request: NextRequest) {
  try {
    // Your SOL/USDT trade that closed manually
    const solTrade = {
      id: `trade-manual-sol-${Date.now()}`,
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      model: 'DeepSeek R1',
      symbol: 'SOL/USDT',
      side: 'LONG' as const,
      size: 0.2,
      entryPrice: 193.02,
      exitPrice: 193.78, // Last known price from logs
      pnl: 0.11, // From logs
      pnlPercent: 5.72, // From logs: ROE
      leverage: 20,
      entryReason: '🟢 BULLISH [Score:4/4, Conf:45.0%, RANGING]: 📊 Uptrend: +0.86% above MA. 🟢 Strong bullish candle (63% body). 💧 High liquidity (113637 trades)',
      entryConfidence: 45,
      entrySignals: ['Trend', 'Volume', 'Price Action'],
      entryMarketRegime: 'RANGING',
      entryScore: '4/4',
      exitReason: 'Position closed manually before automated logging was implemented',
      exitTimestamp: new Date().toISOString(),
      duration: 3600, // Estimate: 1 hour (60 minutes)
    };

    tradeHistoryStore.addTrade(solTrade);

    logger.info(`✅ Manually seeded SOL trade: ${solTrade.symbol}`, {
      context: 'TradeSeed',
      data: { pnl: solTrade.pnl, pnlPercent: solTrade.pnlPercent },
    });

    return NextResponse.json({
      success: true,
      message: 'SOL trade seeded successfully',
      trade: solTrade,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to seed trade', error, { context: 'TradeSeed' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

