/**
 * Stock Scanner Service — US Equities & ETFs via Alpaca Markets
 *
 * Scans a curated watchlist for trading opportunities using:
 * - Relative volume (today vs 5-day average)
 * - Momentum (price vs VWAP, gap from open)
 * - Technical position (approximate RSI, day range location)
 * - Spread quality
 * - 5-day trend
 *
 * Only runs during regular US market hours by default.
 */

import { logger } from '@/lib/logger';
import { alpacaService } from '@/services/exchange/alpacaService';
import { getMarketStatus } from '@/lib/marketHours';
import type { MarketOpportunity, UnifiedMarketData } from '@/types/market';
import type { AlpacaSnapshot, AlpacaBar } from '@/services/exchange/alpacaService';

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/** Curated watchlist of highly liquid US equities and ETFs */
const WATCHLIST: readonly string[] = [
  // Broad market ETFs
  'SPY', 'QQQ', 'IWM', 'DIA',
  // Sector ETFs
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY',
  // Commodities / bonds
  'GLD', 'TLT',
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'META', 'AMZN', 'TSLA', 'AMD', 'AVGO', 'ORCL',
  // Finance
  'JPM', 'BAC', 'GS', 'MS', 'V', 'MA',
  // Healthcare
  'UNH', 'JNJ', 'ABBV', 'MRK', 'PFE',
  // Consumer / retail
  'WMT', 'COST', 'HD', 'SBUX', 'MCD',
  // Energy
  'XOM', 'CVX', 'COP',
] as const;

/** ETF symbols for classification */
const ETF_SET = new Set<string>([
  'SPY', 'QQQ', 'IWM', 'DIA',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY',
  'GLD', 'TLT',
]);

/** Rough sector map for display */
const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology',
  GOOGL: 'Technology', GOOG: 'Technology', META: 'Technology',
  AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  AMD: 'Technology', AVGO: 'Technology', ORCL: 'Technology',
  JPM: 'Financials', BAC: 'Financials', GS: 'Financials',
  MS: 'Financials', V: 'Financials', MA: 'Financials',
  UNH: 'Healthcare', JNJ: 'Healthcare', ABBV: 'Healthcare',
  MRK: 'Healthcare', PFE: 'Healthcare',
  WMT: 'Consumer Staples', COST: 'Consumer Staples', MCD: 'Consumer Staples',
  HD: 'Consumer Discretionary', SBUX: 'Consumer Discretionary',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy',
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StockOpportunity extends MarketOpportunity {
  sector?: string;
  isEtf: boolean;
  /** Today's open vs yesterday's close (gap %) */
  adpgapPct?: number;
  /** Today's volume / 5-day average volume */
  relativeVolume: number;
}

export interface StockScanResult {
  timestamp: number;
  opportunities: StockOpportunity[];
  marketStatus: {
    isOpen: boolean;
    sessionType: string;
    currentTimeET: string;
    nextOpenMs: number;
  };
  scannedCount: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Approximate RSI(14) from an array of closing prices.
 * Returns 50 (neutral) if fewer than 2 bars available.
 */
function approximateRsi(closes: number[]): number {
  if (closes.length < 2) return 50;
  const period = Math.min(14, closes.length - 1);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Score a symbol 0–100 based on snapshot + historical bars. */
function scoreSymbol(
  symbol: string,
  snap: AlpacaSnapshot,
  bars: AlpacaBar[],
): {
  score: number;
  signals: string[];
  relativeVolume: number;
  adpgapPct: number | undefined;
} {
  const signals: string[] = [];
  let score = 0;

  // --- Relative volume (0–30 pts) ---
  const todayVol = snap.dailyBar?.v ?? 0;
  const avgVol =
    bars.length > 0 ? bars.reduce((s, b) => s + b.v, 0) / bars.length : 0;
  const relativeVolume = avgVol > 0 ? todayVol / avgVol : 1;

  if (relativeVolume >= 3.0) {
    score += 30;
    signals.push(`Extreme volume spike: ${relativeVolume.toFixed(1)}x avg`);
  } else if (relativeVolume >= 2.0) {
    score += 25;
    signals.push(`High volume: ${relativeVolume.toFixed(1)}x avg`);
  } else if (relativeVolume >= 1.5) {
    score += 15;
    signals.push(`Above-avg volume: ${relativeVolume.toFixed(1)}x avg`);
  } else if (relativeVolume >= 1.2) {
    score += 8;
    signals.push(`Slightly elevated volume: ${relativeVolume.toFixed(1)}x avg`);
  }

  // --- Momentum (0–25 pts) ---
  const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
  const vwap = snap.dailyBar?.vw ?? 0;
  const open = snap.dailyBar?.o ?? 0;
  const prevClose = snap.prevDailyBar?.c ?? 0;

  // Price vs VWAP
  if (price > 0 && vwap > 0) {
    const vwapDiffPct = ((price - vwap) / vwap) * 100;
    if (vwapDiffPct > 1.0) {
      score += 15;
      signals.push(`Above VWAP +${vwapDiffPct.toFixed(2)}%`);
    } else if (vwapDiffPct > 0.3) {
      score += 8;
      signals.push(`Holding above VWAP`);
    } else if (vwapDiffPct < -1.0) {
      score += 5; // Short opportunity
      signals.push(`Below VWAP ${vwapDiffPct.toFixed(2)}% (short bias)`);
    }
  }

  // Gap from prev close
  let adpgapPct: number | undefined;
  if (prevClose > 0 && open > 0) {
    adpgapPct = ((open - prevClose) / prevClose) * 100;
    if (Math.abs(adpgapPct) >= 2.0) {
      score += 10;
      const dir = adpgapPct > 0 ? 'gap up' : 'gap down';
      signals.push(`${dir} ${Math.abs(adpgapPct).toFixed(2)}%`);
    } else if (Math.abs(adpgapPct) >= 0.5) {
      score += 4;
    }
  }

  // --- Technical score (0–25 pts) ---
  const closes = bars.map((b) => b.c);
  if (price > 0) closes.push(price); // include today's price
  const rsi = approximateRsi(closes);

  // RSI in actionable range (not overbought/oversold)
  if (rsi >= 45 && rsi <= 65) {
    score += 15;
    signals.push(`RSI ${rsi.toFixed(0)} (neutral momentum)`);
  } else if (rsi >= 30 && rsi < 45) {
    score += 10;
    signals.push(`RSI ${rsi.toFixed(0)} (oversold bounce candidate)`);
  } else if (rsi > 65 && rsi <= 75) {
    score += 8;
    signals.push(`RSI ${rsi.toFixed(0)} (bullish momentum)`);
  } else if (rsi > 75) {
    score += 3;
    signals.push(`RSI ${rsi.toFixed(0)} (overbought — caution)`);
  }

  // Price position within day range
  const high = snap.dailyBar?.h ?? price;
  const low = snap.dailyBar?.l ?? price;
  const dayRange = high - low;
  if (dayRange > 0 && price > 0) {
    const posInRange = (price - low) / dayRange; // 0 = at low, 1 = at high
    if (posInRange >= 0.6) {
      score += 10;
      signals.push(`Near day high (${(posInRange * 100).toFixed(0)}% of range)`);
    } else if (posInRange >= 0.4) {
      score += 5;
    }
  }

  // --- Spread quality (0–10 pts) ---
  const bid = snap.latestQuote?.bp ?? 0;
  const ask = snap.latestQuote?.ap ?? 0;
  if (bid > 0 && ask > 0) {
    const spreadPct = ((ask - bid) / ask) * 100;
    if (spreadPct < 0.05) {
      score += 10;
      signals.push(`Tight spread ${spreadPct.toFixed(3)}%`);
    } else if (spreadPct < 0.1) {
      score += 7;
    } else if (spreadPct < 0.2) {
      score += 4;
    } else {
      signals.push(`Wide spread ${spreadPct.toFixed(2)}%`);
    }
  }

  // --- Trend score (0–10 pts): price vs 5-day MA ---
  if (bars.length >= 5 && price > 0) {
    const ma5 = bars.slice(-5).reduce((s, b) => s + b.c, 0) / 5;
    const diffPct = ((price - ma5) / ma5) * 100;
    if (diffPct > 1.0) {
      score += 10;
      signals.push(`Above 5-day MA +${diffPct.toFixed(2)}%`);
    } else if (diffPct > 0.2) {
      score += 6;
      signals.push(`Holding above 5-day MA`);
    } else if (diffPct < -1.0) {
      score += 4; // Bounce setup
      signals.push(`Below 5-day MA ${diffPct.toFixed(2)}% (reversal watch)`);
    }
  }

  return { score: Math.min(100, Math.round(score)), signals, relativeVolume, adpgapPct };
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

const TOP_N = 10;
const MIN_SCORE = 50;
const BARS_LOOKBACK = 5;

class StockScannerService {
  async scan(): Promise<StockScanResult> {
    const startMs = Date.now();
    const marketStatus = getMarketStatus();

    const statusSummary = {
      isOpen: marketStatus.isOpen,
      sessionType: marketStatus.sessionType,
      currentTimeET: marketStatus.currentTimeET,
      nextOpenMs: marketStatus.nextOpenMs,
    };

    if (!marketStatus.isOpen) {
      logger.info('Stock scan skipped — market closed', {
        context: 'StockScannerService',
        data: { sessionType: marketStatus.sessionType, currentTimeET: marketStatus.currentTimeET },
      });
      return {
        timestamp: Date.now(),
        opportunities: [],
        marketStatus: statusSummary,
        scannedCount: 0,
        durationMs: Date.now() - startMs,
      };
    }

    logger.info('Starting stock scan', {
      context: 'StockScannerService',
      data: { watchlistSize: WATCHLIST.length },
    });

    try {
      const symbols = WATCHLIST as unknown as string[];

      // Fetch snapshots + historical bars in parallel
      const [snapshots, barsMap] = await Promise.all([
        alpacaService.getSnapshots(symbols),
        alpacaService.getBars(symbols, '1Day', BARS_LOOKBACK).catch((err) => {
          logger.warn('Failed to fetch historical bars for scan', {
            context: 'StockScannerService',
            data: { error: (err as Error).message },
          });
          return {} as Record<string, AlpacaBar[]>;
        }),
      ]);

      const opportunities: StockOpportunity[] = [];

      for (const symbol of symbols) {
        const snap = snapshots[symbol];
        if (!snap) continue;

        const bars = barsMap[symbol] ?? [];
        const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
        if (price <= 0) continue;

        const { score, signals, relativeVolume, adpgapPct } = scoreSymbol(symbol, snap, bars);
        if (score < MIN_SCORE) continue;

        const daily = snap.dailyBar;
        const prev = snap.prevDailyBar;
        const priceChange = prev?.c ? price - prev.c : 0;
        const priceChangePct = prev?.c && prev.c !== 0 ? (priceChange / prev.c) * 100 : 0;
        const avgVolume = bars.length > 0
          ? bars.reduce((s, b) => s + b.v, 0) / bars.length
          : undefined;

        const bid = snap.latestQuote?.bp ?? 0;
        const ask = snap.latestQuote?.ap ?? 0;
        const spreadPct = bid > 0 && ask > 0
          ? ((ask - bid) / ask) * 100
          : undefined;

        const marketData: UnifiedMarketData = {
          symbol,
          assetClass: 'equity',
          exchange: 'alpaca',
          price,
          open: daily?.o ?? 0,
          high: daily?.h ?? 0,
          low: daily?.l ?? 0,
          close: daily?.c ?? 0,
          volume: daily?.v ?? 0,
          vwap: daily?.vw,
          priceChange,
          priceChangePct,
          avgVolume,
          volumeRatio: relativeVolume,
          spread: spreadPct,
          timestamp: Date.now(),
        };

        opportunities.push({
          symbol,
          assetClass: 'equity',
          exchange: 'alpaca',
          score,
          confidence: Math.min(1, score / 100),
          direction: 'LONG',
          price,
          marketData,
          signals,
          sector: SECTOR_MAP[symbol],
          isEtf: ETF_SET.has(symbol),
          adpgapPct,
          relativeVolume,
        });
      }

      // Sort by score descending, return top N
      opportunities.sort((a, b) => b.score - a.score);
      const top = opportunities.slice(0, TOP_N);

      const durationMs = Date.now() - startMs;
      logger.info('Stock scan complete', {
        context: 'StockScannerService',
        data: {
          scanned: symbols.length,
          opportunities: opportunities.length,
          topScore: top[0]?.score ?? 0,
          durationMs,
        },
      });

      return {
        timestamp: Date.now(),
        opportunities: top,
        marketStatus: statusSummary,
        scannedCount: symbols.length,
        durationMs,
      };
    } catch (error) {
      logger.error('Stock scan failed', error as Error, { context: 'StockScannerService' });
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — globalThis pattern for Next.js hot-reload safety
// ---------------------------------------------------------------------------

const globalForStockScanner = globalThis as typeof globalThis & {
  __stockScannerService?: StockScannerService;
};

if (!globalForStockScanner.__stockScannerService) {
  globalForStockScanner.__stockScannerService = new StockScannerService();
  logger.info('StockScannerService initialized', { context: 'StockScannerService' });
}

export const stockScannerService = globalForStockScanner.__stockScannerService;
export { StockScannerService };
export default stockScannerService;
