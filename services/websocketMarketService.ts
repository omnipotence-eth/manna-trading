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
import { apiCache } from './apiCache';

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

class WebSocketMarketService {
  private ws: any = null; // WebSocket instance (using 'ws' library on server)
  private WS_URL = 'wss://fstream.asterdex.com/stream';
  private tickerCache: Map<string, CachedTickerData> = new Map();
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageCount: number = 0;
  private lastMessageTime: number = 0;
  
  // Streams to subscribe to
  private readonly STREAMS = [
    '!miniTicker@arr'  // All market mini tickers - most efficient for price/volume data
  ];

  constructor() {
    logger.info('WebSocket Market Service initialized', {
      context: 'WSMarket',
      data: { streams: this.STREAMS }
    });
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
        
        logger.info('✅ WebSocket connected to Aster DEX!', {
          context: 'WSMarket',
          data: { streams: this.STREAMS }
        });

        // Set up ping to keep connection alive
        this.startPing();
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
   */
  private handleMessage(message: any): void {
    this.messageCount++;
    this.lastMessageTime = Date.now();

    // Handle combined stream format: { stream: 'streamName', data: {...} }
    if (message.stream && message.data) {
      if (message.stream === '!miniTicker@arr') {
        this.handleMiniTickerArray(message.data);
      }
      return;
    }

    // Handle direct array format (miniTicker@arr sends array directly)
    if (Array.isArray(message)) {
      this.handleMiniTickerArray(message);
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
}

// Export singleton instance
export const wsMarketService = new WebSocketMarketService();

// REMOVED: Auto-connect on module load 
// The startup service handles WebSocket connection explicitly
// This prevents duplicate connections when module is hot-reloaded in development

export default wsMarketService;

