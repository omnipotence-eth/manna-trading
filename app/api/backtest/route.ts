/**
 * Backtest API: fetch historical klines and run scoring over them.
 * GET /api/backtest?symbol=BTCUSDT&interval=1h&limit=100
 */

import { NextRequest, NextResponse } from 'next/server';
import { asterDexService } from '@/services/exchange/asterDexService';

export const dynamic = 'force-dynamic';

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(-period - 1).map((c, i) => (i === 0 ? 0 : c - closes[closes.length - period - 1 + i - 1]));
  const gains = changes.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = (-1 * changes.filter((c) => c < 0).reduce((a, b) => a + b, 0)) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function scoreBar(klines: Array<{ open: number; high: number; low: number; close: number; volume: number; openTime: number }>, endIndex: number): { score: number; trend: string; rsi: number } {
  if (endIndex < 20) return { score: 50, trend: 'NEUTRAL', rsi: 50 };
  const slice = klines.slice(0, endIndex + 1);
  const closes = slice.map((k) => k.close);
  const rsi = calculateRSI(closes, 14);
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : sma20;
  const current = closes[closes.length - 1];
  let trend = 'NEUTRAL';
  if (current > sma20 && sma20 > sma50) trend = 'BULLISH';
  else if (current < sma20 && sma20 < sma50) trend = 'BEARISH';
  let score = 50;
  if (trend === 'BULLISH') score += 15;
  else if (trend === 'BEARISH') score -= 15;
  if (rsi < 30) score += 10;
  else if (rsi > 70) score -= 10;
  return { score, trend, rsi };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const interval = searchParams.get('interval') || '1h';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    const klines = await asterDexService.getKlines(symbol, interval, limit);
    if (!klines || klines.length < 20) {
      return NextResponse.json(
        { success: false, error: 'Insufficient kline data (need at least 20 bars)' },
        { status: 400 }
      );
    }

    const results: Array<{ time: number; score: number; trend: string; rsi: number }> = [];
    for (let i = 20; i < klines.length; i++) {
      const { score, trend, rsi } = scoreBar(klines, i);
      results.push({
        time: klines[i].openTime,
        score,
        trend,
        rsi: Math.round(rsi * 100) / 100,
      });
    }

    const scores = results.map((r) => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const bullishBars = results.filter((r) => r.trend === 'BULLISH').length;
    const bearishBars = results.filter((r) => r.trend === 'BEARISH').length;

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      bars: results.length,
      summary: {
        avgScore: Math.round(avgScore * 100) / 100,
        maxScore,
        minScore,
        bullishBars,
        bearishBars,
      },
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
