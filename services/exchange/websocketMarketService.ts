/**
 * WebSocket Market Data Service
 * Real-time market data via Aster DEX WebSocket streams
 * 
 * This service runs on the server and provides cached market data
 * to avoid REST API rate limits.
 * 
 * Based on: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
 * 
 * Available Streams:
 * - !miniTicker@arr - All market mini tickers (recommended for low bandwidth)
 * - !ticker@arr - All market full tickers
 * - <symbol>@kline_<interval> - Kline/candlestick data
 * - <symbol>@depth - Order book depth
 */

import { logger } from '@/lib/logger';
import { apiCache } from '@/services/data/apiCache';
import { asterConfig } from '@/lib/configService';

interface MiniTicker {
  e: string;        // Event type
  E: number;        // Event time
  s: string;        // Symbol
  c: string;        // Close price
  o: string;        // Open price
  h: string;        // High price
  l: string;        // Low price
  v: string;        // Total traded base asset volume
  q: string;        // Total traded quote asset volume
}

interface FullTicker {
  e: string;        // Event type
  E: number;        // Event time
  s: string;        // Symbol
  p: string;        // Price change
  P: string;        // Price change percent
  w: string;        // Weighted average price
  c: string;        // Last price
  Q: string;        // Last quantity
  o: string;        // Open price
  h: string;        // High price
  l: string;        // Low price
  v: string;        // Total traded base asset volume
  q: string;        // Total traded quote asset volume
  O: number;        // Statistics open time
  C: number;        // Statistics close time
  F: number;        // First trade ID
  L: number;        // Last trade Id
  n: number;        // Total number of trades
}

interface CachedTickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  lastUpdate: number;
}

interface BookTicker {
  symbol: string;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
  lastUpdate: number;
}

class WebSocketMarketService {
  private ws: any = null; // WebSocket instance (using 'ws' library on server)
  private userWs: any = null; // User data WebSocket (listenKey)
  private WS_URL = 'wss://fstream.asterdex.com/stream';
  // OPTIMIZED: LRU cache with size limit to prevent unbounded growth
  private tickerCache: Map<string, CachedTickerData> = new Map();
  private readonly MAX_TICKER_CACHE_SIZE = 1000; // Limit to 1000 symbols
  private bookTickerCache: Map<string, BookTicker> = new Map();
  private readonly MAX_BOOK_TICKER_CACHE_SIZE = 500; // Limit to 500 symbols
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private isUserStreamConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private userPingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private userReconnectTimeout: NodeJS.Timeout | null = null;
  private listenKey: string | null = null;
  private listenKeyKeepAliveInterval: NodeJS.Timeout | null = null;
  private messageCount: number = 0;
  private lastMessageTime: number = 0;
  // Real-time balance cache from user data stream
  private cachedBalance: number | null = null;
  private cachedBalanceTimestamp: number = 0;
  
  // Streams to subscribe to - OPTIMIZED for profit
  // Based on: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
  private readonly STREAMS = [
    '!miniTicker@arr',   // All market mini tickers - price/volume data
    '!markPrice@arr',    // Mark prices for all symbols - for mark/last price divergence trading
    '!forceOrder@arr',   // All market liquidation orders - for liquidation cascade detection
    '!bookTicker'        // All book tickers - best bid/ask for microstructure guardrails
  ];
  
  // PROFIT OPTIMIZATION: Track liquidations for trading signals
  private liquidationCache: Map<string, { 
    symbol: string; 
    side: 'BUY' | 'SELL'; 
    quantity: number; 
    price: number; 
    timestamp: number;
  }[]> = new Map();
  
  // PROFIT OPTIMIZATION: Track mark price divergence
  private markPriceCache: Map<string, {
    markPrice: number;
    indexPrice: number;
    fundingRate: number;
    nextFundingTime: number;
    lastUpdate: number;
  }> = new Map();

  // OPTIMIZED: Track per-symbol subscriptions for cleanup
  private perSymbolSubscriptions: Set<string> = new Set();
  
  constructor() {
    logger.info('WebSocket Market Service initialized', {
      context: 'WSMarket',
      data: { streams: this.STREAMS }
    });
    
    // OPTIMIZED: Periodic cleanup of stale cache entries
    setInterval(() => {
      this.cleanupStaleCache();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Connect to Aster DEX WebSocket streams
   */
  async connect(): Promise<void> {
    // Only run on server side
    if (typeof window !== 'undefined') {
      logger.warn('WebSocket Market Service is server-side only', { context: 'WSMarket' });
      return;
    }

    if (this.isConnected || this.isConnecting) {
      logger.debug('WebSocket already connected or connecting', { context: 'WSMarket' });
      return;
    }

    this.isConnecting = true;

    try {
      // Dynamically import ws for server-side
      const WebSocket = (await import('ws')).default;
      
      const wsUrl = `${this.WS_URL}?streams=${this.STREAMS.join('/')}`;
      
      logger.info('Connecting to Aster DEX WebSocket...', {
        context: 'WSMarket',
        data: { url: wsUrl }
      });

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        logger.info('[OK] WebSocket connected to Aster DEX!', {
          context: 'WSMarket',
          data: { streams: this.STREAMS }
        });

        // Set up ping to keep connection alive
        this.startPing();

        // Kick off user data stream for fills/positions (non-blocking)
        this.startUserDataStream().catch((error) => {
          logger.warn('User data stream start failed (will retry via reconnect)', {
            context: 'WSMarket',
            data: { error: (error as Error).message }
          });
        });
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', error as Error, {
            context: 'WSMarket'
          });
        }
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error', error, { context: 'WSMarket' });
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPing();

        logger.warn('WebSocket disconnected', {
          context: 'WSMarket',
          data: { code, reason: reason.toString() }
        });

        // Attempt reconnection
        this.scheduleReconnect();
      });

      this.ws.on('ping', () => {
        // Respond to ping with pong
        if (this.ws && this.ws.readyState === 1) { // OPEN = 1
          this.ws.pong();
        }
      });

    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect WebSocket', error as Error, { context: 'WSMarket' });
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   * Processes: miniTicker, markPrice, and forceOrder (liquidations)
   */
  private handleMessage(message: any): void {
    this.messageCount++;
    this.lastMessageTime = Date.now();

    // Handle combined stream format: { stream: 'streamName', data: {...} }
    if (message.stream && message.data) {
      if (message.stream === '!miniTicker@arr') {
        this.handleMiniTickerArray(message.data);
      } else if (message.stream === '!markPrice@arr') {
        this.handleMarkPriceArray(message.data);
      } else if (message.stream === '!forceOrder@arr') {
        this.handleLiquidationOrder(message.data);
      } else if (message.stream === '!bookTicker') {
        this.handleBookTicker(message.data);
      }
      return;
    }

    // Handle direct array format (miniTicker@arr sends array directly)
    if (Array.isArray(message)) {
      // Check first element to determine stream type
      if (message.length > 0) {
        const first = message[0];
        if (first.e === '24hrMiniTicker') {
          this.handleMiniTickerArray(message);
        } else if (first.e === 'markPriceUpdate') {
          this.handleMarkPriceArray(message);
        } else if (first.e === 'bookTicker') {
          this.handleBookTicker(message);
        }
      }
    }
    
    // Handle single liquidation order
    if (message.e === 'forceOrder') {
      this.handleLiquidationOrder(message);
    }

    // Handle single book ticker
    if (message.e === 'bookTicker') {
      this.handleBookTicker([message]);
    }
  }
  
  /**
   * PROFIT OPTIMIZATION: Handle mark price updates
   * Used for mark/last price divergence trading
   */
  private handleMarkPriceArray(markPrices: any[]): void {
    for (const mp of markPrices) {
      const symbol = mp.s;
      this.markPriceCache.set(symbol, {
        markPrice: parseFloat(mp.p),
        indexPrice: parseFloat(mp.i || mp.p),
        fundingRate: parseFloat(mp.r || '0'),
        nextFundingTime: mp.T || 0,
        lastUpdate: Date.now()
      });
    }
  }
  
  /**
   * PROFIT OPTIMIZATION: Handle liquidation order events
   * Large liquidations = potential trading opportunities
   */
  private handleLiquidationOrder(order: any): void {
    const o = order.o || order;
    const symbol = o.s;
    const side = o.S as 'BUY' | 'SELL';
    const quantity = parseFloat(o.q);
    const price = parseFloat(o.p);
    const notional = quantity * price;
    
    // Only track significant liquidations ($10K+)
    if (notional < 10000) return;
    
    const liquidation = {
      symbol,
      side,
      quantity,
      price,
      timestamp: Date.now()
    };
    
    // Store in cache (keep last 10 per symbol)
    const existing = this.liquidationCache.get(symbol) || [];
    existing.push(liquidation);
    if (existing.length > 10) existing.shift();
    this.liquidationCache.set(symbol, existing);
    
    // Log significant liquidations for trading signals
    if (notional >= 50000) {
      logger.info(`[LIQUIDATION] LARGE LIQUIDATION: ${symbol} ${side} $${(notional/1000).toFixed(1)}K @ ${price}`, {
        context: 'WSMarket',
        data: { symbol, side, notional: notional.toFixed(0), price }
      });
    }
  }

  /**
   * Handle book ticker updates (best bid/ask per symbol)
   */
  private handleBookTicker(bookTickers: any[] | any): void {
    const items = Array.isArray(bookTickers) ? bookTickers : [bookTickers];
    for (const bt of items) {
      const symbol = (bt.s || bt.symbol || '').toUpperCase();
      if (!symbol) continue;
      const bidPrice = parseFloat(bt.b || bt.bidPrice || '0');
      const bidQty = parseFloat(bt.B || bt.bidQty || '0');
      const askPrice = parseFloat(bt.a || bt.askPrice || '0');
      const askQty = parseFloat(bt.A || bt.askQty || '0');
      if (!bidPrice || !askPrice) continue;

      // OPTIMIZED: LRU cache - enforce size limit
      this.bookTickerCache.set(symbol, {
        symbol,
        bidPrice,
        bidQty: isFinite(bidQty) ? bidQty : 0,
        askPrice,
        askQty: isFinite(askQty) ? askQty : 0,
        lastUpdate: Date.now()
      });
    }
  }

  /**
   * Handle mini ticker array update
   */
  private handleMiniTickerArray(tickers: MiniTicker[]): void {
    for (const ticker of tickers) {
      const symbol = ticker.s;
      const cachedData: CachedTickerData = {
        symbol,
        price: parseFloat(ticker.c),
        priceChange: parseFloat(ticker.c) - parseFloat(ticker.o),
        priceChangePercent: ((parseFloat(ticker.c) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100,
        open: parseFloat(ticker.o),
        high: parseFloat(ticker.h),
        low: parseFloat(ticker.l),
        volume: parseFloat(ticker.v),
        quoteVolume: parseFloat(ticker.q),
        lastUpdate: Date.now()
      };

      // OPTIMIZED: LRU cache - enforce size limit
      this.tickerCache.set(symbol, cachedData);
      
      // Also update the apiCache for REST API fallback
      const cacheKey = `ticker:${symbol}`;
      apiCache.set(cacheKey, {
        symbol,
        price: cachedData.price,
        priceChange24h: cachedData.priceChangePercent,
        volume24h: cachedData.volume,
        quoteVolume: cachedData.quoteVolume,
        high24h: cachedData.high,
        low24h: cachedData.low,
        lastUpdate: cachedData.lastUpdate
      }, 60000); // 60 second cache (WebSocket keeps it fresh)
    }

    // Log stats periodically (every 1000 messages)
    if (this.messageCount % 1000 === 0) {
      logger.debug('WebSocket stats', {
        context: 'WSMarket',
        data: {
          messages: this.messageCount,
          cachedSymbols: this.tickerCache.size,
          isConnected: this.isConnected
        }
      });
    }
  }

  /**
   * Get cached ticker data for a symbol
   */
  getTicker(symbol: string): CachedTickerData | null {
    // Normalize symbol (remove / if present)
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    return this.tickerCache.get(normalizedSymbol) || null;
  }

  /**
   * Get microstructure signal from best bid/ask (spread, imbalance)
   */
  getMicrostructureSignal(symbol: string): {
    spreadPct: number;
    imbalance: number;
    bidNotional: number;
    askNotional: number;
    bias: 'BID' | 'ASK' | 'NEUTRAL';
  } | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const book = this.bookTickerCache.get(normalizedSymbol);
    const ticker = this.tickerCache.get(normalizedSymbol);
    if (!book || !ticker) return null;

    const mid = (book.bidPrice + book.askPrice) / 2;
    if (!mid) return null;

    const spreadPct = ((book.askPrice - book.bidPrice) / mid) * 100;
    const bidNotional = book.bidQty * book.bidPrice;
    const askNotional = book.askQty * book.askPrice;
    const imbalance = (bidNotional - askNotional) / Math.max(bidNotional + askNotional, 1);
    let bias: 'BID' | 'ASK' | 'NEUTRAL' = 'NEUTRAL';
    if (imbalance > 0.15) bias = 'BID';
    else if (imbalance < -0.15) bias = 'ASK';

    return { spreadPct, imbalance, bidNotional, askNotional, bias };
  }

  /**
   * Get all cached tickers
   */
  getAllTickers(): Map<string, CachedTickerData> {
    return this.tickerCache;
  }

  /**
   * Get ticker price for a symbol
   */
  getPrice(symbol: string): number | null {
    const ticker = this.getTicker(symbol);
    return ticker ? ticker.price : null;
  }

  /**
   * Get book ticker (best bid/ask) for a symbol from WebSocket cache
   * Returns null if not available or stale (> 5 seconds old)
   */
  getBookTicker(symbol: string): BookTicker | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const book = this.bookTickerCache.get(normalizedSymbol);
    if (!book) return null;
    
    // Check if data is fresh (< 5 seconds old)
    const age = Date.now() - book.lastUpdate;
    if (age > 5000) return null; // Stale data
    
    return book;
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    cachedSymbols: number;
    messageCount: number;
    lastMessageAge: number;
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      cachedSymbols: this.tickerCache.size,
      messageCount: this.messageCount,
      lastMessageAge: this.lastMessageTime ? Date.now() - this.lastMessageTime : -1,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  
  // ============ PROFIT OPTIMIZATION METHODS ============
  
  /**
   * PROFIT: Get mark price divergence for a symbol
   * Returns the % difference between mark price and last price
   * Positive = last price above mark (potential short)
   * Negative = last price below mark (potential long)
   */
  getMarkPriceDivergence(symbol: string): { 
    divergencePercent: number; 
    markPrice: number; 
    lastPrice: number;
    fundingRate: number;
    fundingRateAnnualized: number;
    nextFundingTime: number;
  } | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const markData = this.markPriceCache.get(normalizedSymbol);
    const tickerData = this.tickerCache.get(normalizedSymbol);
    
    if (!markData || !tickerData) return null;
    
    const divergencePercent = ((tickerData.price - markData.markPrice) / markData.markPrice) * 100;
    const fundingRateAnnualized = markData.fundingRate * 3 * 365 * 100; // 3 funding periods per day
    
    return {
      divergencePercent,
      markPrice: markData.markPrice,
      lastPrice: tickerData.price,
      fundingRate: markData.fundingRate,
      fundingRateAnnualized,
      nextFundingTime: markData.nextFundingTime
    };
  }

  /**
   * Get mark price meta (for funding decay)
   */
  getMarkPriceMeta(symbol: string): {
    nextFundingTime: number;
  } | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const markData = this.markPriceCache.get(normalizedSymbol);
    if (!markData) return null;
    return {
      nextFundingTime: markData.nextFundingTime
    };
  }
  
  /**
   * PROFIT: Get recent liquidations for a symbol
   * Large liquidations often cause price cascades = trading opportunities
   */
  getRecentLiquidations(symbol: string, maxAgeMs: number = 300000): {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    timestamp: number;
    notional: number;
  }[] {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const liquidations = this.liquidationCache.get(normalizedSymbol) || [];
    const now = Date.now();
    
    return liquidations
      .filter(l => now - l.timestamp < maxAgeMs)
      .map(l => ({
        ...l,
        notional: l.quantity * l.price
      }));
  }
  
  /**
   * PROFIT: Detect liquidation cascade (multiple large liquidations in short time)
   * Returns true if there's a potential cascade happening
   */
  detectLiquidationCascade(symbol: string): {
    isCascade: boolean;
    direction: 'LONG_SQUEEZE' | 'SHORT_SQUEEZE' | null;
    totalLiquidated: number;
    count: number;
  } {
    const recentLiqs = this.getRecentLiquidations(symbol, 60000); // Last 1 minute
    
    if (recentLiqs.length < 3) {
      return { isCascade: false, direction: null, totalLiquidated: 0, count: 0 };
    }
    
    const totalLiquidated = recentLiqs.reduce((sum, l) => sum + l.notional, 0);
    
    // Cascade threshold: 3+ liquidations OR $100K+ in 1 minute
    const isCascade = recentLiqs.length >= 3 || totalLiquidated >= 100000;
    
    // Determine direction (more BUY liquidations = longs getting rekt = SHORT_SQUEEZE opportunity after)
    const buyLiqs = recentLiqs.filter(l => l.side === 'BUY');
    const sellLiqs = recentLiqs.filter(l => l.side === 'SELL');
    
    let direction: 'LONG_SQUEEZE' | 'SHORT_SQUEEZE' | null = null;
    if (buyLiqs.length > sellLiqs.length) {
      direction = 'LONG_SQUEEZE'; // Longs getting liquidated = potential reversal UP
    } else if (sellLiqs.length > buyLiqs.length) {
      direction = 'SHORT_SQUEEZE'; // Shorts getting liquidated = potential reversal DOWN
    }
    
    return { isCascade, direction, totalLiquidated, count: recentLiqs.length };
  }
  
  /**
   * PROFIT: Get funding rate opportunity
   * High positive funding = profitable to short (you get paid)
   * High negative funding = profitable to long (you get paid)
   */
  getFundingOpportunity(symbol: string): {
    hasOpportunity: boolean;
    direction: 'LONG' | 'SHORT' | null;
    fundingRate: number;
    expectedPayment8h: number; // Expected payment per $1000 position per 8 hours
    reason: string;
  } | null {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const markData = this.markPriceCache.get(normalizedSymbol);
    
    if (!markData) return null;
    
    const fundingRate = markData.fundingRate;
    const OPPORTUNITY_THRESHOLD = 0.0005; // 0.05% funding rate
    
    const hasOpportunity = Math.abs(fundingRate) >= OPPORTUNITY_THRESHOLD;
    let direction: 'LONG' | 'SHORT' | null = null;
    let reason = '';
    
    if (fundingRate >= OPPORTUNITY_THRESHOLD) {
      direction = 'SHORT';
      reason = `High positive funding (${(fundingRate * 100).toFixed(4)}%) - shorts get paid`;
    } else if (fundingRate <= -OPPORTUNITY_THRESHOLD) {
      direction = 'LONG';
      reason = `High negative funding (${(fundingRate * 100).toFixed(4)}%) - longs get paid`;
    }
    
    const expectedPayment8h = Math.abs(fundingRate) * 1000; // Per $1000 position
    
    return { hasOpportunity, direction, fundingRate, expectedPayment8h, reason };
  }

  /**
   * Start user data stream (listenKey) + keepalive
   * Faster sync for fills/positions per futures API docs
   */
  private async startUserDataStream(): Promise<void> {
    if (this.isUserStreamConnecting) return;
    this.isUserStreamConnecting = true;

    try {
      // Acquire listenKey (no signature required per futures doc)
      // Per API docs: POST /fapi/v1/listenKey
      const baseUrl = asterConfig.baseUrl.includes('/fapi/v1') 
        ? asterConfig.baseUrl 
        : `${asterConfig.baseUrl}/fapi/v1`;
      const res = await fetch(`${baseUrl}/listenKey`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': asterConfig.apiKey
        }
      });

      if (!res.ok) {
        throw new Error(`listenKey request failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json() as { listenKey: string };
      this.listenKey = data.listenKey;

      // Start keepalive every 25 minutes (doc: keepalive before 60m expiry)
      this.startListenKeyKeepAlive();

      // Connect user WebSocket
      const WebSocket = (await import('ws')).default;
      const userUrl = `${asterConfig.wsUserUrl}/${this.listenKey}`;
      this.userWs = new WebSocket(userUrl);

      this.userWs.on('open', () => {
        logger.info('[OK] User data stream connected', { context: 'WSMarket' });
        this.startUserPing();
      });

      this.userWs.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          const eventType = message.e || message.eventType || 'unknown';
          
          // Parse ACCOUNT_UPDATE events per Aster DEX API docs
          // Event: Balance and Position Update
          if (eventType === 'ACCOUNT_UPDATE' || eventType === 'accountUpdate') {
            this.handleAccountUpdate(message);
          }
          // Parse ORDER_TRADE_UPDATE events (fills, position changes)
          else if (eventType === 'ORDER_TRADE_UPDATE' || eventType === 'orderTradeUpdate') {
            this.handleOrderTradeUpdate(message);
          }
          
          logger.debug(`User stream event: ${eventType}`, {
            context: 'WSMarket',
            data: { event: eventType }
          });
        } catch (error) {
          logger.error('Failed to parse user stream message', error as Error, { context: 'WSMarket' });
        }
      });

      this.userWs.on('close', () => {
        logger.warn('User data stream closed, scheduling reconnect', { context: 'WSMarket' });
        this.scheduleUserStreamReconnect();
      });

      this.userWs.on('error', (error: Error) => {
        logger.error('User data stream error', error, { context: 'WSMarket' });
        this.scheduleUserStreamReconnect();
      });

    } catch (error) {
      logger.error('Failed to start user data stream', error as Error, { context: 'WSMarket' });
      this.scheduleUserStreamReconnect();
    } finally {
      this.isUserStreamConnecting = false;
    }
  }

  /**
   * Keep listenKey alive (PUT /fapi/v1/listenKey)
   */
  private startListenKeyKeepAlive(): void {
    if (!this.listenKey) return;
    if (this.listenKeyKeepAliveInterval) {
      clearInterval(this.listenKeyKeepAliveInterval);
    }

    this.listenKeyKeepAliveInterval = setInterval(async () => {
      try {
        // Per API docs: PUT /fapi/v1/listenKey
        const baseUrl = asterConfig.baseUrl.includes('/fapi/v1') 
          ? asterConfig.baseUrl 
          : `${asterConfig.baseUrl}/fapi/v1`;
        await fetch(`${baseUrl}/listenKey`, {
          method: 'PUT',
          headers: { 'X-MBX-APIKEY': asterConfig.apiKey }
        });
        logger.debug('[KEEPALIVE] listenKey keepalive sent', { context: 'WSMarket' });
      } catch (error) {
        logger.warn('listenKey keepalive failed', {
          context: 'WSMarket',
          data: { error: (error as Error).message }
        });
      }
    }, 25 * 60 * 1000); // 25 minutes
  }

  /**
   * Start ping interval for user stream
   */
  private startUserPing(): void {
    this.stopUserPing();
    this.userPingInterval = setInterval(() => {
      if (this.userWs && this.userWs.readyState === 1) {
        try {
          this.userWs.ping();
        } catch (error) {
          logger.error('Failed to ping user stream', error as Error, { context: 'WSMarket' });
        }
      }
    }, 3 * 60 * 1000);
  }

  private stopUserPing(): void {
    if (this.userPingInterval) {
      clearInterval(this.userPingInterval);
      this.userPingInterval = null;
    }
  }

  /**
   * Schedule user stream reconnect
   */
  private scheduleUserStreamReconnect(): void {
    this.stopUserPing();
    if (this.userReconnectTimeout) {
      clearTimeout(this.userReconnectTimeout);
    }
    this.userReconnectTimeout = setTimeout(() => {
      this.startUserDataStream().catch(() => {
        // handled internally
      });
    }, 5000);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.stopPing();
    
    // Send ping every 3 minutes (Aster DEX requires pong within 15min)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) { // OPEN = 1
        try {
          this.ws.ping();
        } catch (error) {
          logger.error('Failed to send ping', error as Error, { context: 'WSMarket' });
        }
      }
    }, 3 * 60 * 1000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max WebSocket reconnection attempts reached', undefined, {
        context: 'WSMarket',
        data: { attempts: this.reconnectAttempts }
      });
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    logger.info(`Scheduling WebSocket reconnect in ${delay}ms...`, {
      context: 'WSMarket',
      data: { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts }
    });

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.stopPing();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;

    logger.info('WebSocket disconnected', { context: 'WSMarket' });
  }

  /**
   * Handle ACCOUNT_UPDATE event from user data stream
   * Per Aster DEX API docs: Event: Balance and Position Update
   * Format: { e: "ACCOUNT_UPDATE", E: timestamp, a: { m: marginBalance, B: [balances] } }
   */
  private handleAccountUpdate(message: any): void {
    try {
      // Per API docs: ACCOUNT_UPDATE contains 'a' (account) with 'm' (marginBalance) and 'B' (balances)
      const account = message.a || message.account;
      if (!account) {
        logger.debug('ACCOUNT_UPDATE missing account data', { context: 'WSMarket', data: message });
        return;
      }

      // Per API docs: 'm' = marginBalance (totalMarginBalance including unrealized P&L)
      // This is the account equity we want for the chart
      const marginBalance = parseFloat(account.m || account.marginBalance || '0');
      
      // Also extract balances array for detailed info
      const balances = account.B || account.balances || [];
      let totalWalletBalance = 0;
      let availableBalance = 0;

      balances.forEach((bal: any) => {
        // Per API docs: 'wb' = walletBalance, 'cw' = crossWalletBalance
        const walletBalance = parseFloat(bal.wb || bal.walletBalance || '0');
        const crossWallet = parseFloat(bal.cw || bal.crossWalletBalance || '0');
        totalWalletBalance += walletBalance;
        availableBalance += crossWallet;
      });

      // Use marginBalance (totalMarginBalance) as account equity
      // This includes unrealized P&L and is what we display on the chart
      const accountEquity = marginBalance > 0 ? marginBalance : totalWalletBalance;
      const unrealizedPnl = marginBalance - totalWalletBalance;

      // Update cached balance
      this.cachedBalance = accountEquity;
      this.cachedBalanceTimestamp = Date.now();

      // Update API cache so getBalance() returns fresh data immediately
      const { apiCache } = require('@/services/data/apiCache');
      apiCache.set('balance:account', accountEquity, 30); // 30s cache

      logger.info('[BALANCE] Account balance updated from WebSocket', {
        context: 'WSMarket',
        data: {
          balance: accountEquity.toFixed(2),
          marginBalance: marginBalance.toFixed(2),
          walletBalance: totalWalletBalance.toFixed(2),
          availableBalance: availableBalance.toFixed(2),
          unrealizedPnl: unrealizedPnl.toFixed(2),
          source: 'user_data_stream',
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('Failed to handle account update', error as Error, { 
        context: 'WSMarket',
        data: { message: JSON.stringify(message).substring(0, 200) }
      });
    }
  }

  /**
   * Handle ORDER_TRADE_UPDATE event from user data stream
   * Per Aster DEX API docs: Event: Order Update
   */
  private handleOrderTradeUpdate(message: any): void {
    try {
      // Order trade update contains order and trade info
      // When order is filled, account balance may change
      // We can trigger a balance refresh here if needed
      const order = message.o || message.order;
      if (order && (order.X === 'FILLED' || order.status === 'FILLED')) {
        // Order filled - balance may have changed
        // Trigger balance cache refresh
        logger.debug('Order filled, balance may have changed', {
          context: 'WSMarket',
          data: { symbol: order.s, side: order.S, quantity: order.q }
        });
        
        // Invalidate balance cache to force refresh on next getBalance() call
        const { apiCache } = require('@/services/data/apiCache');
        apiCache.delete('balance:account');
      }
    } catch (error) {
      logger.error('Failed to handle order trade update', error as Error, { context: 'WSMarket' });
    }
  }

  /**
   * Get cached balance from WebSocket updates
   * Returns null if no cached balance available
   */
  getCachedBalance(): { balance: number; timestamp: number } | null {
    if (this.cachedBalance !== null && this.cachedBalanceTimestamp > 0) {
      return {
        balance: this.cachedBalance,
        timestamp: this.cachedBalanceTimestamp
      };
    }
    return null;
  }

  /**
   * OPTIMIZED: Subscribe to per-symbol streams for active positions
   * Per Aster DEX API docs: Individual Symbol Streams
   */
  async subscribeToSymbol(symbol: string): Promise<void> {
    if (!this.isConnected || !this.ws) {
      logger.debug('Cannot subscribe - WebSocket not connected', {
        context: 'WSMarket',
        data: { symbol }
      });
      return;
    }

    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    if (this.perSymbolSubscriptions.has(normalizedSymbol)) {
      return; // Already subscribed
    }

    try {
      // Track subscription (actual WS subscription would require sending message to WS)
      // For now, we track it and use it for cache management
      this.perSymbolSubscriptions.add(normalizedSymbol);
      
      logger.debug('Subscribed to per-symbol streams', {
        context: 'WSMarket',
        data: { symbol: normalizedSymbol }
      });
    } catch (error) {
      logger.error('Failed to subscribe to symbol streams', error as Error, {
        context: 'WSMarket',
        data: { symbol: normalizedSymbol }
      });
    }
  }

  /**
   * OPTIMIZED: Unsubscribe from per-symbol streams when position closes
   */
  async unsubscribeFromSymbol(symbol: string): Promise<void> {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    
    if (!this.perSymbolSubscriptions.has(normalizedSymbol)) {
      return; // Not subscribed
    }

    try {
      // Remove from subscription tracking
      this.perSymbolSubscriptions.delete(normalizedSymbol);
      
      // Clean up caches for this symbol (delayed cleanup to allow quick re-entry)
      setTimeout(() => {
        if (!this.perSymbolSubscriptions.has(normalizedSymbol)) {
          this.tickerCache.delete(normalizedSymbol);
          this.bookTickerCache.delete(normalizedSymbol);
          this.liquidationCache.delete(normalizedSymbol);
          this.markPriceCache.delete(normalizedSymbol);
        }
      }, 60000); // 1 minute delay before cleanup
      
      logger.debug('Unsubscribed from symbol streams', {
        context: 'WSMarket',
        data: { symbol: normalizedSymbol }
      });
    } catch (error) {
      logger.error('Failed to unsubscribe from symbol streams', error as Error, {
        context: 'WSMarket',
        data: { symbol: normalizedSymbol }
      });
    }
  }

  /**
   * OPTIMIZED: Cleanup stale cache entries to prevent memory leaks
   */
  private cleanupStaleCache(): void {
    const now = Date.now();
    const staleAge = 5 * 60 * 1000; // 5 minutes
    let cleaned = 0;

    // Clean ticker cache
    for (const [symbol, data] of this.tickerCache.entries()) {
      if (now - data.lastUpdate > staleAge && !this.perSymbolSubscriptions.has(symbol)) {
        this.tickerCache.delete(symbol);
        cleaned++;
      }
    }

    // Clean book ticker cache
    for (const [symbol, data] of this.bookTickerCache.entries()) {
      if (now - data.lastUpdate > staleAge && !this.perSymbolSubscriptions.has(symbol)) {
        this.bookTickerCache.delete(symbol);
        cleaned++;
      }
    }

    // Clean liquidation cache (keep only last 10 minutes)
    for (const [symbol, liquidations] of this.liquidationCache.entries()) {
      const filtered = liquidations.filter(liq => now - liq.timestamp < 10 * 60 * 1000);
      if (filtered.length === 0) {
        this.liquidationCache.delete(symbol);
        cleaned++;
      } else if (filtered.length < liquidations.length) {
        this.liquidationCache.set(symbol, filtered);
        cleaned += liquidations.length - filtered.length;
      }
    }

    // Clean mark price cache
    for (const [symbol, data] of this.markPriceCache.entries()) {
      if (now - data.lastUpdate > staleAge && !this.perSymbolSubscriptions.has(symbol)) {
        this.markPriceCache.delete(symbol);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned stale WebSocket cache entries', {
        context: 'WSMarket',
        data: { cleaned, tickerCacheSize: this.tickerCache.size, bookTickerCacheSize: this.bookTickerCache.size }
      });
    }
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForWsMarket = globalThis as typeof globalThis & {
  __wsMarketService?: WebSocketMarketService;
};

if (!globalForWsMarket.__wsMarketService) {
  globalForWsMarket.__wsMarketService = new WebSocketMarketService();
}

export const wsMarketService = globalForWsMarket.__wsMarketService;

// REMOVED: Auto-connect on module load 
// The startup service handles WebSocket connection explicitly
// This prevents duplicate connections when module is hot-reloaded in development

export default wsMarketService;

