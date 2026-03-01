/**
 * Data Export API
 * Export trades and simulation stats as JSON or CSV for portfolio and analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTrades, initializeDatabase } from '@/lib/db';
import { dbConfig } from '@/lib/configService';
import { getTrades as getTradesMemory, initializeDatabase as initMemory } from '@/lib/tradeMemory';
import { simulationService } from '@/services/trading/simulationService';
import { asterConfig } from '@/lib/configService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export?format=json|csv|tax|audit&limit=500&days=30
 * - json: full trade list + optional stats
 * - csv: standard trade columns
 * - tax: CSV for tax reporting (date, symbol, side, costBasis, proceeds, pnl, notes)
 * - audit: CSV with entry/exit reasons ("why did we trade")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 2000);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const includeStats = searchParams.get('stats') !== 'false';

    let trades: Array<{
      id: string;
      timestamp: string;
      model: string;
      symbol: string;
      side: string;
      size: number;
      entryPrice: number;
      exitPrice: number;
      pnl: number;
      pnlPercent: number;
      leverage: number;
      entryReason: string;
      exitReason: string;
      duration: number;
    }> = [];

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (dbConfig.connectionString && dbConfig.connectionString !== 'postgresql://localhost:5432/manna_dev') {
      try {
        await initializeDatabase();
        const all = await getTrades({ limit: 1000 });
        trades = all
          .filter((t) => new Date(t.timestamp) >= cutoffDate)
          .slice(0, limit)
          .map((t) => ({
            id: t.id,
            timestamp: t.timestamp,
            model: t.model,
            symbol: t.symbol,
            side: t.side,
            size: t.size,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            pnl: t.pnl,
            pnlPercent: t.pnlPercent,
            leverage: t.leverage,
            entryReason: t.entryReason || '',
            exitReason: t.exitReason || '',
            duration: t.duration || 0,
          }));
      } catch {
        await initMemory();
        const all = await getTradesMemory({ limit: 1000 });
        trades = all
          .filter((t) => new Date(t.timestamp) >= cutoffDate)
          .slice(0, limit)
          .map((t) => ({
            id: t.id,
            timestamp: t.timestamp,
            model: t.model,
            symbol: t.symbol,
            side: t.side,
            size: t.size,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            pnl: t.pnl,
            pnlPercent: t.pnlPercent,
            leverage: t.leverage,
            entryReason: (t as { entryReason?: string }).entryReason || '',
            exitReason: (t as { exitReason?: string }).exitReason || '',
            duration: (t as { duration?: number }).duration || 0,
          }));
      }
    } else {
      await initMemory();
      const all = await getTradesMemory({ limit: 1000 });
      trades = all
        .filter((t) => new Date(t.timestamp) >= cutoffDate)
        .slice(0, limit)
        .map((t) => ({
          id: t.id,
          timestamp: t.timestamp,
          model: t.model || 'Simulation',
          symbol: t.symbol,
          side: t.side,
          size: t.size,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          leverage: t.leverage || 1,
          entryReason: (t as { entryReason?: string }).entryReason || '',
          exitReason: (t as { exitReason?: string }).exitReason || '',
          duration: (t as { duration?: number }).duration || 0,
        }));
    }

    let stats: Record<string, unknown> | null = null;
    if (includeStats && asterConfig.trading.simulationMode) {
      await simulationService.updatePositions();
      stats = simulationService.getStats();
    }

    if (format === 'csv') {
      const header =
        'id,timestamp,model,symbol,side,size,entryPrice,exitPrice,pnl,pnlPercent,leverage,entryReason,exitReason,duration';
      const rows = trades.map(
        (t) =>
          `${t.id},${t.timestamp},${escapeCsv(t.model)},${t.symbol},${t.side},${t.size},${t.entryPrice},${t.exitPrice},${t.pnl},${t.pnlPercent},${t.leverage},${escapeCsv(t.entryReason)},${escapeCsv(t.exitReason)},${t.duration}`
      );
      const body = [header, ...rows].join('\n');
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="manna-trades-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === 'tax') {
      const header = 'date,symbol,side,size,entryPrice,exitPrice,costBasis,proceeds,pnl,fees,notes';
      const rows = trades.map((t) => {
        const date = t.timestamp.slice(0, 10);
        const costBasis = t.size * t.entryPrice;
        const proceeds = t.size * (t.exitPrice || t.entryPrice);
        const notes = [t.entryReason, t.exitReason].filter(Boolean).join(' | ');
        return `${date},${t.symbol},${t.side},${t.size},${t.entryPrice},${t.exitPrice || ''},${costBasis},${proceeds},${t.pnl},0,${escapeCsv(notes)}`;
      });
      const body = [header, ...rows].join('\n');
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="manna-tax-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === 'audit') {
      const header = 'id,date,symbol,side,entryPrice,exitPrice,pnl,why_entry,why_exit';
      const rows = trades.map((t) =>
        `${t.id},${t.timestamp.slice(0, 10)},${t.symbol},${t.side},${t.entryPrice},${t.exitPrice || ''},${t.pnl},${escapeCsv(t.entryReason)},${escapeCsv(t.exitReason)}`
      );
      const body = [header, ...rows].join('\n');
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="manna-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        trades,
        stats: stats || undefined,
        meta: { count: trades.length, days, limit, exportedAt: new Date().toISOString() },
      },
    });
  } catch (error) {
    logger.error('Export API failed', error instanceof Error ? error : new Error(String(error)), {
      context: 'ExportAPI',
    });
    return NextResponse.json(
      { success: false, error: 'Export failed' },
      { status: 500 }
    );
  }
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
