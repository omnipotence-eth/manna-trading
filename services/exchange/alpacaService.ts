/**
 * Alpaca Markets Service — US Equities & ETFs
 *
 * Supports both paper and live trading accounts.
 * Paper mode is the default; set ALPACA_PAPER=false for live.
 *
 * Docs: https://docs.alpaca.markets/reference/getallassets
 */

import { logger } from '@/lib/logger';
import type {
  UnifiedMarketData,
  UnifiedPosition,
  AccountSummary,
  ExchangeName,
} from '@/types/market';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IS_PAPER = process.env.ALPACA_PAPER !== 'false';
const TRADING_BASE_URL = IS_PAPER
  ? 'https://paper-api.alpaca.markets'
  : 'https://api.alpaca.markets';
const DATA_BASE_URL = 'https://data.alpaca.markets';

const EXCHANGE_NAME: ExchangeName = 'alpaca';

// ---------------------------------------------------------------------------
// Alpaca API shape interfaces
// ---------------------------------------------------------------------------

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  buying_power: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  shorting_enabled: boolean;
  long_market_value: string;
  short_market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  realized_pl: string;
  realized_plpc: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  qty_available: string;
  avg_entry_price: string;
  side: 'long' | 'short';
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  order_class: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
  legs: AlpacaOrder[] | null;
  trail_percent: string | null;
  trail_price: string | null;
  hwm: string | null;
}

export interface AlpacaBar {
  t: string;  // RFC-3339 timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  vw: number; // vwap
  n?: number; // number of trades
}

export interface AlpacaLatestTrade {
  t: string;
  x: string;  // exchange
  p: number;  // price
  s: number;  // size
  c: string[]; // conditions
  i: number;  // trade id
  z: string;  // tape
}

export interface AlpacaLatestQuote {
  t: string;
  ax: string; // ask exchange
  ap: number; // ask price
  as: number; // ask size
  bx: string; // bid exchange
  bp: number; // bid price
  bs: number; // bid size
  c: string[];
  z: string;
}

export interface AlpacaSnapshot {
  symbol: string;
  latestTrade: AlpacaLatestTrade;
  latestQuote: AlpacaLatestQuote;
  minuteBar: AlpacaBar;
  dailyBar: AlpacaBar;
  prevDailyBar: AlpacaBar;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface PlaceOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  qty: number;
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class AlpacaService {
  private readonly tradingUrl = TRADING_BASE_URL;
  private readonly dataUrl = DATA_BASE_URL;

  private get apiKey(): string {
    const key = process.env.ALPACA_API_KEY;
    if (!key) throw new Error('ALPACA_API_KEY is not set');
    return key;
  }

  private get secretKey(): string {
    const secret = process.env.ALPACA_SECRET_KEY;
    if (!secret) throw new Error('ALPACA_SECRET_KEY is not set');
    return secret;
  }

  private authHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.secretKey,
      'Content-Type': 'application/json',
    };
  }

  // -------------------------------------------------------------------------
  // Core fetch wrapper
  // -------------------------------------------------------------------------

  private async request<T>(
    baseUrl: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...this.authHeaders(),
          ...(options.headers as Record<string, string> | undefined),
        },
      });

      const duration = Date.now() - start;

      if (!res.ok) {
        const body = await res.text().catch(() => '(no body)');
        logger.warn('Alpaca API error response', {
          context: 'AlpacaService',
          data: { path, status: res.status, body, durationMs: duration },
        });
        throw new Error(`Alpaca API ${res.status}: ${body}`);
      }

      // 204 No Content — DELETE endpoints return empty body
      if (res.status === 204) {
        return undefined as unknown as T;
      }

      const data = (await res.json()) as T;
      logger.debug('Alpaca API request ok', {
        context: 'AlpacaService',
        data: { path, status: res.status, durationMs: duration },
      });
      return data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Alpaca API')) {
        throw error;
      }
      logger.error('Alpaca API fetch failed', error as Error, {
        context: 'AlpacaService',
        data: { path },
      });
      throw error;
    }
  }

  private get<T>(baseUrl: string, path: string): Promise<T> {
    return this.request<T>(baseUrl, path, { method: 'GET' });
  }

  private post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
    return this.request<T>(baseUrl, path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private delete<T>(baseUrl: string, path: string): Promise<T> {
    return this.request<T>(baseUrl, path, { method: 'DELETE' });
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  async getAccount(): Promise<AlpacaAccount> {
    logger.info('Fetching Alpaca account', { context: 'AlpacaService' });
    return this.get<AlpacaAccount>(this.tradingUrl, '/v2/account');
  }

  async getUnifiedAccount(): Promise<AccountSummary> {
    const acc = await this.getAccount();
    return {
      exchange: EXCHANGE_NAME,
      assetClass: 'equity',
      balance: parseFloat(acc.cash),
      equity: parseFloat(acc.equity),
      buyingPower: parseFloat(acc.buying_power),
      unrealizedPnl: parseFloat(acc.unrealized_pl),
      currency: acc.currency,
      isSimulation: IS_PAPER,
    };
  }

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------

  async getPositions(): Promise<AlpacaPosition[]> {
    logger.info('Fetching Alpaca positions', { context: 'AlpacaService' });
    return this.get<AlpacaPosition[]>(this.tradingUrl, '/v2/positions');
  }

  async getPosition(symbol: string): Promise<AlpacaPosition | null> {
    try {
      return await this.get<AlpacaPosition>(
        this.tradingUrl,
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async closePosition(symbol: string): Promise<AlpacaOrder> {
    logger.info('Closing Alpaca position', {
      context: 'AlpacaService',
      data: { symbol },
    });
    return this.delete<AlpacaOrder>(
      this.tradingUrl,
      `/v2/positions/${encodeURIComponent(symbol)}`,
    );
  }

  async closeAllPositions(): Promise<void> {
    logger.info('Closing all Alpaca positions', { context: 'AlpacaService' });
    await this.delete<unknown>(this.tradingUrl, '/v2/positions');
  }

  async getUnifiedPositions(): Promise<UnifiedPosition[]> {
    const positions = await this.getPositions();
    const now = Date.now();
    return positions.map((p): UnifiedPosition => ({
      id: p.asset_id,
      symbol: p.symbol,
      assetClass: 'equity',
      exchange: EXCHANGE_NAME,
      side: p.side === 'long' ? 'LONG' : 'SHORT',
      qty: parseFloat(p.qty),
      entryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      pnl: parseFloat(p.unrealized_pl),
      pnlPct: parseFloat(p.unrealized_plpc) * 100,
      timestamp: now,
    }));
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async placeOrder(params: PlaceOrderParams): Promise<AlpacaOrder> {
    logger.info('Placing Alpaca order', {
      context: 'AlpacaService',
      data: {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        qty: params.qty,
      },
    });

    const body: Record<string, unknown> = {
      symbol: params.symbol,
      qty: String(params.qty),
      side: params.side,
      type: params.type,
      time_in_force: params.time_in_force,
    };

    if (params.limit_price !== undefined) {
      body['limit_price'] = String(params.limit_price);
    }
    if (params.stop_price !== undefined) {
      body['stop_price'] = String(params.stop_price);
    }
    if (params.extended_hours !== undefined) {
      body['extended_hours'] = params.extended_hours;
    }

    return this.post<AlpacaOrder>(this.tradingUrl, '/v2/orders', body);
  }

  async cancelOrder(orderId: string): Promise<void> {
    logger.info('Cancelling Alpaca order', {
      context: 'AlpacaService',
      data: { orderId },
    });
    await this.delete<void>(this.tradingUrl, `/v2/orders/${encodeURIComponent(orderId)}`);
  }

  // -------------------------------------------------------------------------
  // Market Data — bars, snapshots, latest bars
  // -------------------------------------------------------------------------

  async getBars(
    symbols: string[],
    timeframe: string,
    limit: number,
    start?: string,
    end?: string,
  ): Promise<Record<string, AlpacaBar[]>> {
    const params = new URLSearchParams({
      symbols: symbols.join(','),
      timeframe,
      limit: String(limit),
      feed: 'iex',
    });
    if (start) params.set('start', start);
    if (end) params.set('end', end);

    logger.info('Fetching Alpaca bars', {
      context: 'AlpacaService',
      data: { symbols, timeframe, limit },
    });

    const res = await this.get<{ bars: Record<string, AlpacaBar[]> }>(
      this.dataUrl,
      `/v2/stocks/bars?${params.toString()}`,
    );
    return res.bars ?? {};
  }

  async getLatestBars(symbols: string[]): Promise<Record<string, AlpacaBar>> {
    const params = new URLSearchParams({
      symbols: symbols.join(','),
      feed: 'iex',
    });

    logger.info('Fetching Alpaca latest bars', {
      context: 'AlpacaService',
      data: { symbols },
    });

    const res = await this.get<{ bars: Record<string, AlpacaBar> }>(
      this.dataUrl,
      `/v2/stocks/bars/latest?${params.toString()}`,
    );
    return res.bars ?? {};
  }

  async getSnapshots(symbols: string[]): Promise<Record<string, AlpacaSnapshot>> {
    const params = new URLSearchParams({
      symbols: symbols.join(','),
      feed: 'iex',
    });

    logger.info('Fetching Alpaca snapshots', {
      context: 'AlpacaService',
      data: { symbolCount: symbols.length },
    });

    const res = await this.get<Record<string, AlpacaSnapshot>>(
      this.dataUrl,
      `/v2/stocks/snapshots?${params.toString()}`,
    );
    return res ?? {};
  }

  // -------------------------------------------------------------------------
  // Market Clock
  // -------------------------------------------------------------------------

  async getClock(): Promise<AlpacaClock> {
    return this.get<AlpacaClock>(this.tradingUrl, '/v2/clock');
  }

  // -------------------------------------------------------------------------
  // Unified market data
  // -------------------------------------------------------------------------

  async getUnifiedMarketData(symbols: string[]): Promise<UnifiedMarketData[]> {
    const [snapshots, barsMap] = await Promise.all([
      this.getSnapshots(symbols),
      this.getBars(symbols, '1Day', 5).catch((err) => {
        logger.warn('Failed to fetch daily bars for unified market data', {
          context: 'AlpacaService',
          data: { error: (err as Error).message },
        });
        return {} as Record<string, AlpacaBar[]>;
      }),
    ]);

    const results: UnifiedMarketData[] = [];

    for (const symbol of symbols) {
      const snap = snapshots[symbol];
      if (!snap) continue;

      const bars = barsMap[symbol] ?? [];
      const avgVolume = bars.length > 0
        ? bars.reduce((sum, b) => sum + b.v, 0) / bars.length
        : undefined;

      const daily = snap.dailyBar;
      const prev = snap.prevDailyBar;
      const price = snap.latestTrade?.p ?? daily?.c ?? 0;
      const priceChange = prev?.c ? price - prev.c : 0;
      const priceChangePct = prev?.c && prev.c !== 0 ? (priceChange / prev.c) * 100 : 0;

      const bid = snap.latestQuote?.bp ?? 0;
      const ask = snap.latestQuote?.ap ?? 0;
      const spread = ask > 0 && bid > 0 ? ((ask - bid) / ask) * 100 : undefined;

      const volumeRatio =
        avgVolume && avgVolume > 0 && daily?.v ? daily.v / avgVolume : undefined;

      results.push({
        symbol,
        assetClass: 'equity',
        exchange: EXCHANGE_NAME,
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
        volumeRatio,
        spread,
        timestamp: Date.now(),
      });
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Singleton — globalThis pattern for Next.js hot-reload safety
// ---------------------------------------------------------------------------

const globalForAlpaca = globalThis as typeof globalThis & {
  __alpacaService?: AlpacaService;
};

if (!globalForAlpaca.__alpacaService) {
  globalForAlpaca.__alpacaService = new AlpacaService();
  logger.info('AlpacaService initialized', {
    context: 'AlpacaService',
    data: { mode: IS_PAPER ? 'paper' : 'live', tradingUrl: TRADING_BASE_URL },
  });
}

export const alpacaService = globalForAlpaca.__alpacaService;
export { AlpacaService };
export default alpacaService;
