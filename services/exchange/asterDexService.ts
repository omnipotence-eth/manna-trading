import { ethers } from 'ethers';
import { logger } from '@/lib/logger';
import { TRADING_CONSTANTS, ERROR_MESSAGES } from '@/constants';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';
import { POLLING_INTERVALS, TIMEOUTS, CACHE_TTL, LIMITS } from '@/constants/pollingIntervals';
import type { WebSocketMessage } from '@/types/trading';
import type {
  AsterAccountResponse,
  AsterPositionRisk,
  AsterExchangeInfoResponse,
  Aster24hrTickerResponse,
  AsterPriceTickerResponse,
  AsterOrderBookResponse,
  AsterKlineResponse,
  AsterAggTradeResponse,
  AsterNewOrderResponse,
  AsterLeverageResponse,
  ParsedAccountData,
  ParsedPosition,
  ParsedTicker,
  ParsedOrderBook,
  ParsedKline,
  ParsedAggTrades
} from '@/types/aster';
import { apiCache } from '@/services/data/apiCache';
import { wsMarketService } from '@/services/exchange/websocketMarketService';
import { generateSignature, buildSignedQuery } from '@/lib/asterAuth';
import { AsterApiError } from '@/lib/asterApiError';
import { asterConfig } from '@/lib/configService';
import { circuitBreakers } from '@/lib/circuitBreaker';
import apiKeyManager from '@/lib/apiKeyManager';

export interface AsterMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  maxLeverage: number;
  minOrderSize: number;
}

export interface AsterPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;  // Current market price for accurate P&L% calculation
  leverage: number;
  unrealizedPnl: number;
}

export interface AsterOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: number;
  price?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
}

export interface AsterTrade {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  timestamp: number;
  fee: number;
}

class AsterDexService {
  private baseUrl: string = 'https://fapi.asterdex.com/fapi/v1'; // Real Aster DEX API URL (with endpoint prefix)
  private WS_BASE_URL: string = 'wss://fstream.asterdex.com/stream'; // Real WebSocket URL
  private apiKey: string | null = null; // Fallback for backwards compatibility
  private secretKey: string | null = null; // Fallback for backwards compatibility
  // REMOVED: simulationInterval - No simulation mode, only real API data
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;
  private ws: WebSocket | null = null;
  private useMultiKey: boolean = false; // Enable multi-key mode
  
  // Cache of valid symbols on Aster DEX (to avoid 404s)
  private validSymbolsCache: Set<string> = new Set();
  private invalidSymbolsCache: Set<string> = new Set();
  private lastSymbolCacheUpdate: number = 0;
  private readonly SYMBOL_CACHE_TTL = CACHE_TTL.SYMBOL_CACHE * 1000; // 10 minutes
  private cacheRefreshPromise: Promise<void> | null = null; // Lock to prevent concurrent refreshes
  
  // Rate limiting strategy - NOW SUPPORTS 30 KEYS = 600 req/sec!
  private requestQueue: Array<{ fn: () => Promise<any>; delay: number }> = [];
  private isProcessingQueue: boolean = false;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_DELAY = LIMITS.MIN_REQUEST_DELAY; // 50ms per-key (for authenticated requests)
  // CRITICAL: Public endpoints don't use API keys, so they can be faster
  private readonly MIN_PUBLIC_REQUEST_DELAY = 20; // 20ms for public endpoints (no API key limits)
  // CRITICAL FIX: Reduced batch size to respect Aster DEX IP rate limits
  // According to API docs: IP limits apply, need to throttle requests
  private readonly BATCH_SIZE = LIMITS.BATCH_SIZE_DEFAULT; // 5 to prevent 429 errors
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private lastSuccessfulRequest: number = 0;
  private readonly MAX_REQUESTS_PER_MINUTE = LIMITS.MAX_REQUESTS_PER_MINUTE; // 36,000 req/min
  
  // WORLD-CLASS: Dynamic rate limiting based on API response headers
  private currentRateLimit: number = 20; // Starts at 20 req/sec, adjusts dynamically
  private usedWeightTracking: number[] = []; // Track last 10 weight values
  private readonly MAX_WEIGHT_1M = 2400; // Aster DEX limit per API docs
  
  // CRITICAL: Server time synchronization to prevent -1021 (Invalid timestamp) errors
  // Per API docs: timestamp must be within recvWindow of server time
  private serverTimeOffset: number = 0; // Offset in milliseconds (serverTime - localTime)
  private lastServerTimeSync: number = 0;
  private readonly SERVER_TIME_SYNC_INTERVAL = 5 * 60 * 1000; // Sync every 5 minutes
  
  // Request deduplication to prevent concurrent identical requests
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = LIMITS.MAX_RECONNECT_ATTEMPTS;
  private isConnecting: boolean = false;
  private shouldStayConnected: boolean = false;

  /**
   * Build absolute URL for server-side API calls with protection bypass
   */
  private getApiUrl(path: string): string {
    // If running in browser, use relative URL
    if (typeof window !== 'undefined') {
      return path;
    }
    
    // If running on server (API routes), use absolute URL with bypass token
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const url = new URL(path, baseUrl);
    
    // Add Vercel protection bypass token for server-side calls
    if (process.env.VERCEL_PROTECTION_BYPASS) {
      url.searchParams.set('x-vercel-protection-bypass', process.env.VERCEL_PROTECTION_BYPASS);
    }
    
    return url.toString();
  }

  constructor() {
    // Use Aster DEX's own API endpoints (Binance-compatible API)
    this.baseUrl = 'https://fapi.asterdex.com/fapi/v1';
    this.WS_BASE_URL = 'wss://fstream.asterdex.com/stream';
    
    // Check if multi-key mode is available
    const keyStats = apiKeyManager.getStats();
    this.useMultiKey = keyStats.totalKeys > 1;
    
    // Load fallback credentials for backwards compatibility or client-side
    if (typeof window !== 'undefined') {
      // Client-side (browser)
      this.apiKey = process.env.NEXT_PUBLIC_ASTER_API_KEY || null;
      this.secretKey = null; // Never expose secret key to client
      this.useMultiKey = false; // Client always uses single key
    } else {
      // Server-side (API routes)
      if (!this.useMultiKey) {
        // Fallback to single key if multi-key not configured
        this.apiKey = process.env.ASTER_API_KEY || null;
        this.secretKey = process.env.ASTER_SECRET_KEY || null;
      }
    }
    
    logger.info('Aster DEX Service initialized', {
      context: 'AsterDex',
      data: { 
        baseUrl: this.baseUrl,
        wsUrl: this.WS_BASE_URL,
        multiKeyMode: this.useMultiKey,
        totalKeys: this.useMultiKey ? keyStats.totalKeys : 1,
        capacityUsed: this.useMultiKey ? `${keyStats.capacityUsed.toFixed(1)}%` : 'N/A',
        environment: typeof window !== 'undefined' ? 'client' : 'server',
        note: this.useMultiKey ? '30-KEY MODE: Maximum capacity!' : 'Single key mode'
      },
    });
  }

  /**
   * Rate-limited request wrapper for public endpoints (faster - no API key limits)
   */
  private async rateLimitedPublicRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedRequest = async () => {
        try {
          // Public endpoints can be faster (20ms delay instead of 50ms)
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.MIN_PUBLIC_REQUEST_DELAY) {
            await new Promise(r => setTimeout(r, this.MIN_PUBLIC_REQUEST_DELAY - timeSinceLastRequest));
          }
          
          this.lastRequestTime = Date.now();
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      // Add to queue with public endpoint delay (20ms)
      this.requestQueue.push({ fn: wrappedRequest, delay: this.MIN_PUBLIC_REQUEST_DELAY });
      
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Rate-limited request wrapper for authenticated endpoints (uses API keys)
   */
  private async rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedRequest = async () => {
        try {
          // Check if we need to reset the request window (every 60 seconds)
          const now = Date.now();
          if (now - this.requestWindow > 60000) {
            this.requestCount = 0;
            this.requestWindow = now;
          }

          // ASTER DEX OPTIMIZED: Wait for minimum delay between requests
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.MIN_REQUEST_DELAY) {
            await new Promise(r => setTimeout(r, this.MIN_REQUEST_DELAY - timeSinceLastRequest));
          }
          
          // Check per-minute rate limit
          const oneMinuteAgo = now - 60000;
          if (this.requestWindow < oneMinuteAgo) {
            // Reset window
            this.requestCount = 0;
            this.requestWindow = now;
          } else if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
            // Hit rate limit, wait for window to reset
            const waitTime = this.requestWindow + 60000 - now;
            logger.warn(`Rate limit reached, waiting ${waitTime}ms`, { context: 'AsterDex' });
            await new Promise(r => setTimeout(r, waitTime));
            this.requestCount = 0;
            this.requestWindow = Date.now();
          }
          this.requestCount++;

          // Update request tracking
          this.lastRequestTime = Date.now();

          // OPTIMIZATION: Log rate limit stats every 100 requests (was 50)
          if (this.requestCount % 100 === 0) {
            const requestsPerSecond = this.requestCount / ((Date.now() - this.requestWindow) / 1000);
            logger.debug('Rate limit sample', {
              context: 'AsterDex',
              data: {
                requests: this.requestCount,
                rps: requestsPerSecond.toFixed(1),
                note: 'Sampled log (1 in 100 requests)'
              }
            });
          }

          // Execute the actual request
          const result = await requestFn();
          this.lastSuccessfulRequest = Date.now();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      // Add to queue with authenticated endpoint delay (50ms)
      this.requestQueue.push({ fn: wrappedRequest, delay: this.MIN_REQUEST_DELAY });
      
      // Start processing queue if not already running
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Process batch of requests
      const batch = this.requestQueue.splice(0, this.BATCH_SIZE);
      
      // CRITICAL FIX: Execute batch with delays to respect Aster DEX rate limits
      // Use the delay specified for each request (public=20ms, authenticated=50ms)
      for (let i = 0; i < batch.length; i++) {
        const request = batch[i];
        try {
          await request.fn();
          // Add delay between requests using the request's specified delay
          // This allows public endpoints (20ms) to be faster than authenticated (50ms)
          if (i < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, request.delay));
          }
        } catch (err) {
          logger.error('Request in queue failed', err, { context: 'AsterDex' });
        }
      }

      // CRITICAL FIX: Increased delay between batches to respect IP rate limits
      // According to Aster DEX API docs, IP limits apply - need to throttle
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches (prevents 429)
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Validate order parameters
   */
  private validateOrderParams(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number,
    reduceOnly: boolean = false
  ): void {
    // Validate symbol
    if (!symbol || typeof symbol !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_SYMBOL);
    }
    if (!symbol.includes('/')) {
      throw new Error(ERROR_MESSAGES.INVALID_SYMBOL);
    }

    // Validate side
    if (!['BUY', 'SELL'].includes(side)) {
      throw new Error(ERROR_MESSAGES.INVALID_SIDE);
    }

    // Validate size
    if (typeof size !== 'number' || size <= 0) {
      throw new Error(ERROR_MESSAGES.INVALID_SIZE);
    }
    
    // Skip min/max size validation for reduceOnly orders (closing positions)
    if (!reduceOnly) {
      if (size < TRADING_CONSTANTS.MIN_ORDER_SIZE) {
        throw new Error(`Order size must be at least ${TRADING_CONSTANTS.MIN_ORDER_SIZE}`);
      }
      if (size > TRADING_CONSTANTS.MAX_ORDER_SIZE) {
        throw new Error(`Order size must not exceed ${TRADING_CONSTANTS.MAX_ORDER_SIZE}`);
      }
    }

    // Validate leverage
    if (typeof leverage !== 'number' || leverage < TRADING_CONSTANTS.MIN_LEVERAGE || leverage > TRADING_CONSTANTS.MAX_LEVERAGE) {
      throw new Error(ERROR_MESSAGES.INVALID_LEVERAGE);
    }
  }

  /**
   * Get symbol filters from exchangeInfo (PRICE_FILTER, LOT_SIZE, MIN_NOTIONAL, PERCENT_PRICE)
   */
  private async getSymbolFilters(symbol: string): Promise<any | null> {
    const cacheKey = `symbolFilters:${symbol}`;
    const cached = apiCache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const exchangeInfo = await this.getExchangeInfo();
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const symbolData = exchangeInfo?.symbols?.find((s: any) => s.symbol === normalizedSymbol);
      if (!symbolData) {
        logger.warn(`Symbol ${normalizedSymbol} not found in exchangeInfo`, { context: 'AsterDex' });
        return null;
      }
      apiCache.set(cacheKey, symbolData, 3600);
      return symbolData;
    } catch (error) {
      logger.warn('Failed to fetch symbol filters', { context: 'AsterDex', error });
      return null;
    }
  }

  /**
   * Validate price
   */
  private validatePrice(price: number): void {
    if (typeof price !== 'number' || price <= 0) {
      throw new Error(ERROR_MESSAGES.INVALID_PRICE);
    }
    if (price < TRADING_CONSTANTS.MIN_PRICE) {
      throw new Error(`Price must be at least ${TRADING_CONSTANTS.MIN_PRICE}`);
    }
    if (price > TRADING_CONSTANTS.MAX_PRICE) {
      throw new Error(`Price must not exceed ${TRADING_CONSTANTS.MAX_PRICE}`);
    }
  }

  /**
   * Initialize connection to Aster DEX
   */
  async initialize(privateKey?: string) {
    try {
      // Initialize ethers provider (mainnet, or specific chain)
      // For demo purposes, using a public RPC
      this.provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth');
      
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
      }

      logger.info('[OK] Connected to Aster DEX', { context: 'AsterDex' });
      return true;
    } catch (error) {
      logger.error('Failed to initialize Aster DEX', error, { context: 'AsterDex' });
      return false;
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   * 
   * @param onMessage - Callback function to handle incoming messages
   * @param useRealWebSocket - Set to true to use real Aster DEX WebSocket (requires API key)
   * @param streams - Array of streams to subscribe to (e.g., ['btcusdt@depth', 'ethusdt@trade'])
   * 
   * @remarks
   * **DEVELOPMENT MODE** (default): Uses simulated WebSocket for demo purposes
   * **PRODUCTION MODE**: Set `useRealWebSocket=true` and provide API credentials
   * 
   * **Real WebSocket Endpoint**: `wss://fstream.asterdex.com/stream`
   * 
   * **Documentation**: See `docs/ASTER_WEBSOCKET_INTEGRATION.md` for complete guide
   * 
   * @example
   * ```typescript
   * // Development (simulation)
   * asterDexService.connectWebSocket((data) => console.log(data));
   * 
   * // Production (real WebSocket)
   * asterDexService.connectWebSocket(
   *   (data) => console.log(data),
   *   true,
   *   ['btcusdt@depth', 'ethusdt@ticker']
   * );
   * ```
   */
  connectWebSocket(
    onMessage: (data: WebSocketMessage) => void,
    useRealWebSocket?: boolean,
    streams: string[] = ['btcusdt@depth']
  ) {
    try {
      // Check if running in browser environment
      if (typeof window === 'undefined') {
        logger.warn('WebSocket not available in server environment', { context: 'AsterDex' });
        return;
      }

      // If already connected or connecting, don't create a new connection
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        logger.info('WebSocket already connected, reusing connection', { context: 'AsterDex' });
        return;
      }

      if (this.isConnecting) {
        logger.info('WebSocket connection already in progress', { context: 'AsterDex' });
        return;
      }

      // Mark that we should stay connected (prevents React StrictMode from killing connection)
      this.shouldStayConnected = true;

      // Auto-detect: Use real WebSocket if API key is configured and env var is set
      const shouldUseReal = useRealWebSocket ?? 
        (this.apiKey && process.env.NEXT_PUBLIC_USE_REAL_WEBSOCKET === 'true');

      // Get streams from environment or use provided ones
      const configuredStreams = process.env.NEXT_PUBLIC_WEBSOCKET_STREAMS
        ?.split(',')
        .map(s => s.trim()) // Remove whitespace
        || streams;

      logger.info('[CONFIG] WebSocket Configuration', {
        context: 'AsterDex',
        data: {
          shouldUseReal,
          hasApiKey: !!this.apiKey,
          envVar: process.env.NEXT_PUBLIC_USE_REAL_WEBSOCKET,
          streams: configuredStreams,
        },
      });

      // PRODUCTION: Use real Aster DEX WebSocket
      if (shouldUseReal) {
        logger.info('[CONFIG] Using REAL Aster DEX WebSocket', { 
          context: 'AsterDex',
          data: { streams: configuredStreams },
        });
        this.connectRealWebSocket(onMessage, configuredStreams);
        return;
      }

      // REAL MODE ONLY: Require API key for WebSocket connection
      logger.error('[ERROR] Cannot connect WebSocket: API key required', undefined, { 
        context: 'AsterDex',
        data: {
          hasApiKey: !!this.apiKey,
          envVar: process.env.NEXT_PUBLIC_USE_REAL_WEBSOCKET,
          solution: 'Set ASTER_API_KEY and NEXT_PUBLIC_USE_REAL_WEBSOCKET=true to use real WebSocket'
        }
      });
      throw new Error('WebSocket connection requires API key. Please configure ASTER_API_KEY and set NEXT_PUBLIC_USE_REAL_WEBSOCKET=true');

    } catch (error) {
      logger.error('Failed to connect WebSocket', error, { context: 'AsterDex' });
    }
  }

  // REMOVED: startSimulationMode() - System now requires real WebSocket connections only
  // All data must come from real Aster DEX API endpoints
  // See: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md

  /**
   * Connect to real Aster DEX WebSocket
   * @private
   */
  private connectRealWebSocket(
    onMessage: (data: WebSocketMessage) => void,
    streams: string[]
  ) {
    try {
      this.isConnecting = true;
      
      // Construct WebSocket URL with streams (comma-separated for multi-stream)
      const wsUrl = `${this.WS_BASE_URL}?streams=${streams.join('/')}`;

      logger.info(`Connecting to Aster DEX WebSocket: ${wsUrl}`, { context: 'AsterDex' });

      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl);

      // Connection opened
      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset reconnect counter
        logger.info('[OK] WebSocket connected to Aster DEX', {
          context: 'AsterDex',
          data: { streams },
        });

        // Set up ping interval (Aster DEX requires pong response within 15min of ping)
        // Send pong every 4 minutes to stay well within the limit
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ method: 'PONG' }));
              logger.debug('Sent PONG to Aster DEX', { context: 'AsterDex' });
            } catch (error) {
              logger.error('Failed to send PONG', error, { context: 'AsterDex' });
            }
          }
        }, 4 * 60 * 1000); // 4 minutes
      };

      // Handle incoming messages
      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          
          logger.debug('Raw WebSocket message received', {
            context: 'AsterDex',
            data: { eventType: rawData.e, symbol: rawData.s, stream: rawData.stream },
          });
          
          // Transform Aster DEX format to our internal format
          const transformedData = this.transformWebSocketData(rawData);
          onMessage(transformedData);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', error, {
            context: 'AsterDex',
            data: { message: event.data?.substring(0, 200) }, // Log first 200 chars
          });
        }
      };

      // Handle errors
      this.ws.onerror = (event: Event) => {
        const errorEvent = event as ErrorEvent;
        logger.error('WebSocket error', undefined, { 
          context: 'AsterDex',
          data: {
            type: errorEvent.type,
            message: errorEvent.message || 'Unknown error',
            readyState: this.ws?.readyState,
          },
        });
      };

      // Handle connection close
      this.ws.onclose = (event) => {
        this.isConnecting = false;

        // Clear ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        logger.warn('WebSocket disconnected', {
          context: 'AsterDex',
          data: { 
            code: event.code, 
            reason: event.reason || 'No reason provided',
            wasClean: event.wasClean,
            reconnectAttempts: this.reconnectAttempts,
          },
        });

        // Only attempt reconnection if we should stay connected
        if (!this.shouldStayConnected) {
          logger.debug('Connection closed and should not reconnect', { context: 'AsterDex' });
          return;
        }

        // Attempt reconnection with exponential backoff (max 5 attempts)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Max 30s
          
          logger.info(`Attempting WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, { 
            context: 'AsterDex' 
          });

          setTimeout(() => {
            if (this.shouldStayConnected) {
              this.connectRealWebSocket(onMessage, streams);
            }
          }, delay);
        } else {
          logger.error('Max WebSocket reconnection attempts reached. Using HTTP polling fallback for real-time data.', undefined, { 
            context: 'AsterDex',
            data: {
              attempts: this.reconnectAttempts,
              maxAttempts: this.maxReconnectAttempts,
              solution: 'Check network connectivity and Aster DEX WebSocket service status'
            }
          });
          
          // Use HTTP polling fallback (real API calls) instead of simulation
          logger.info('[FALLBACK] Switching to HTTP polling fallback (real API calls)', { context: 'AsterDex' });
          this.startPollingFallback(onMessage);
        }
      };

    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to real WebSocket', error, { context: 'AsterDex' });
    }
  }

  /**
   * Transform Aster DEX WebSocket data to our internal format
   * @private
   */
  private transformWebSocketData(data: any): WebSocketMessage {
    // Handle combined stream format (data.data contains actual event)
    const eventData = data.data || data;
    const eventType = eventData.e || data.e;

    // Handle different event types from Aster DEX
    switch (eventType) {
      case 'depthUpdate':
        return {
          type: 'orderUpdate',
          data: {
            symbol: eventData.s,
            bids: eventData.b,
            asks: eventData.a,
            timestamp: eventData.E,
          },
        };

      case 'trade':
      case 'aggTrade':
        return {
          type: 'trade',
          data: {
            symbol: eventData.s,
            price: parseFloat(eventData.p),
            quantity: parseFloat(eventData.q),
            timestamp: eventData.T || eventData.E,
            isBuyerMaker: eventData.m,
          },
        };

      case '24hrTicker':
      case 'ticker':
        return {
          type: 'ticker',
          data: {
            symbol: eventData.s,
            price: parseFloat(eventData.c),
            priceChange: parseFloat(eventData.p),
            priceChangePercent: parseFloat(eventData.P),
            volume: parseFloat(eventData.v),
            high: parseFloat(eventData.h),
            low: parseFloat(eventData.l),
            timestamp: eventData.E,
          },
        };

      default:
        logger.warn(`Unknown WebSocket event type: ${eventType}`, {
          context: 'AsterDex',
          data: { eventType, stream: data.stream },
        });
        // Return raw data for unknown event types
        return {
          type: 'ticker',
          data: eventData,
        };
    }
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<AsterMarket[]> {
    try {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/asterdex/markets`);
      const data = await response.json();
      logger.info('Fetched real markets', { context: 'AsterDex', data: data.length });
      return data as AsterMarket[];
    } catch (error) {
      logger.error('Failed to fetch markets', error, { context: 'AsterDex' });
      return []; // Fallback to empty
    }
  }

  /**
   * Get current price for a symbol (using public API - no auth required)
   * CACHED: 5 seconds to dramatically reduce API calls
   */
  async getPrice(symbol: string): Promise<number> {
    const cacheKey = `price:${symbol}`;
    
    // Check cache first
    const cachedPrice = apiCache.get<number>(cacheKey);
    if (cachedPrice != null) {
      return cachedPrice;
    }
    
    return this.rateLimitedPublicRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/price?symbol=${binanceSymbol}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        const price = parseFloat(data.price);
        
        // Cache for 5 seconds
        apiCache.set(cacheKey, price, apiCache.getTTL('PRICE'));
        
        return price;
      } catch (error) {
        logger.error('Failed to get real price', error, { context: 'AsterDex', data: { symbol } });
        return 0; // Fallback
      }
    });
  }

  /**
   * Get order book depth for a symbol (using public API - no auth required)
   * OPTIMIZED: Uses 30-key system with caching and timeout
   * CACHED: 2 seconds for real-time order book data
   */
  async getOrderBook(symbol: string, limit: number = 20): Promise<{
    bids: [string, string][];
    asks: [string, string][];
    bidLiquidity: number;
    askLiquidity: number;
    totalLiquidity: number;
    spread: number;
    liquidityScore: number;
    bidDepth: number;
    askDepth: number;
  } | null> {
    const cacheKey = `orderbook:${symbol}:${limit}`;
    
    // OPTIMIZATION: Try WebSocket cache first (real-time, no rate limits)
    // According to API docs: !bookTicker stream provides best bid/ask
    // This is much faster and avoids REST API rate limits
    try {
      const { wsMarketService } = await import('@/services/exchange/websocketMarketService');
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const bookTicker = wsMarketService.getBookTicker(normalizedSymbol);
      
      if (bookTicker && bookTicker.lastUpdate && (Date.now() - bookTicker.lastUpdate) < 5000) {
        // Use WebSocket data if it's fresh (< 5 seconds old)
        // Convert bookTicker to orderBook format for compatibility
        const bidPrice = bookTicker.bidPrice;
        const askPrice = bookTicker.askPrice;
        const bidQty = bookTicker.bidQty;
        const askQty = bookTicker.askQty;
        
        const spread = askPrice - bidPrice;
        const bidLiquidity = bidPrice * bidQty;
        const askLiquidity = askPrice * askQty;
        const totalLiquidity = bidLiquidity + askLiquidity;
        
        const orderBookData = {
          bids: [[bidPrice.toFixed(8), bidQty.toFixed(8)]] as [string, string][],
          asks: [[askPrice.toFixed(8), askQty.toFixed(8)]] as [string, string][],
          bidLiquidity,
          askLiquidity,
          totalLiquidity,
          spread,
          liquidityScore: Math.min(100, totalLiquidity / 1000000 * 100),
          bidDepth: 1,
          askDepth: 1
        };
        
        // Cache for 2 seconds (WebSocket updates frequently)
        apiCache.set(cacheKey, orderBookData, 2000);
        
        logger.debug('Using WebSocket bookTicker for orderbook', {
          context: 'AsterDex',
          data: { symbol, age: Date.now() - bookTicker.lastUpdate }
        });
        
        return orderBookData;
      }
    } catch (wsError) {
      // Fall through to REST API if WebSocket fails
      logger.debug('WebSocket orderbook not available, falling back to REST API', {
        context: 'AsterDex',
        data: { symbol, error: wsError instanceof Error ? wsError.message : String(wsError) }
      });
    }
    
    // Check REST API cache (30-second cache to prevent rate limit abuse)
    const cached = apiCache.get<any>(cacheKey);
    if (cached != null) {
      return cached;
    }
    
    return this.rateLimitedPublicRequest(async () => {
      try {
        // CRITICAL FIX: Use correct Aster DEX API endpoint
        // API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
        // Format: BTC/USDT -> BTCUSDT, then call /fapi/v1/depth
        // OPTIMIZATION: Use smaller limit (5-20) to reduce response size and improve speed
        // API supports: 5, 10, 20, 50, 100, 500, 1000, 5000
        const effectiveLimit = Math.min(limit, 20); // Cap at 20 for speed
        const binanceSymbol = symbol.replace('/', '').toUpperCase();
        const url = `https://fapi.asterdex.com/fapi/v1/depth?symbol=${binanceSymbol}&limit=${effectiveLimit}`;
        
        // Add timeout protection
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited - return null, caller can retry or use WebSocket fallback
              logger.debug(`Rate limited (429) for orderbook ${symbol}`, { context: 'AsterDex' });
              return null;
            }
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          
          // Calculate liquidity metrics
          const bids = data.bids || [];
          const asks = data.asks || [];
          
          const bidLiquidity = bids.reduce((sum: number, [price, qty]: [string, string]) => 
            sum + (parseFloat(price) * parseFloat(qty)), 0);
          const askLiquidity = asks.reduce((sum: number, [price, qty]: [string, string]) => 
            sum + (parseFloat(price) * parseFloat(qty)), 0);
          
          const spread = asks.length > 0 && bids.length > 0 ? 
            parseFloat(asks[0][0]) - parseFloat(bids[0][0]) : 0;
          
          const orderBookData = {
            bids,
            asks,
            bidLiquidity,
            askLiquidity,
            totalLiquidity: bidLiquidity + askLiquidity,
            spread,
            liquidityScore: Math.min(100, (bidLiquidity + askLiquidity) / 1000000 * 100),
            bidDepth: bids.length,
            askDepth: asks.length
          };
          
          // Cache for 60 seconds (prevents IP rate limit abuse)
          // OPTIMIZED: Increased to 60s - order book is IP-rate-limited, not per API key!
          apiCache.set(cacheKey, orderBookData, apiCache.getTTL('ORDER_BOOK'));
          
          return orderBookData;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Order book fetch timeout after 10 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to get order book', error, { 
          context: 'AsterDex', 
          data: { symbol, limit } 
        });
        return null; // Fallback
      }
    });
  }

  /**
   * Get book ticker (best bid/ask) for a symbol - MUCH FASTER than full order book
   * Uses /fapi/v1/ticker/bookTicker endpoint per API docs
   * OPTIMIZED: 10x faster than /depth, perfect for spread/liquidity checks
   * CACHED: 10 seconds
   */
  async getBookTicker(symbol: string): Promise<{
    bidPrice: number;
    bidQty: number;
    askPrice: number;
    askQty: number;
    spread: number;
    spreadPercent: number;
    liquidity: number; // Estimated liquidity (bidQty * bidPrice + askQty * askPrice)
  } | null> {
    const cacheKey = `bookTicker:${symbol}`;
    
    // Check cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached != null) {
      return cached;
    }
    
    return this.rateLimitedPublicRequest(async () => {
      try {
        const binanceSymbol = symbol.replace('/', '').toUpperCase();
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/bookTicker?symbol=${binanceSymbol}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited - return null, caller can retry
              logger.debug(`Rate limited (429) for bookTicker ${symbol}`, { context: 'AsterDex' });
              return null;
            }
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          
          const bidPrice = parseFloat(data.bidPrice || 0);
          const askPrice = parseFloat(data.askPrice || 0);
          const bidQty = parseFloat(data.bidQty || 0);
          const askQty = parseFloat(data.askQty || 0);
          
          const spread = askPrice - bidPrice;
          const spreadPercent = bidPrice > 0 ? (spread / bidPrice) * 100 : 0;
          const liquidity = (bidPrice * bidQty) + (askPrice * askQty);
          
          const bookTickerData = {
            bidPrice,
            bidQty,
            askPrice,
            askQty,
            spread,
            spreadPercent,
            liquidity
          };
          
          // Cache for 10 seconds (faster updates than full order book)
          apiCache.set(cacheKey, bookTickerData, apiCache.getTTL('PRICE'));
          
          return bookTickerData;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Book ticker fetch timeout after 10 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to get book ticker', error, { context: 'AsterDex', data: { symbol } });
        return null;
      }
    });
  }

  /**
   * Get batch book tickers for multiple symbols at once
   * Uses /fapi/v1/ticker/bookTicker (no symbol) to get all book tickers
   * OPTIMIZED: 1 API call instead of N calls
   */
  async getBatchBookTickers(symbols: string[]): Promise<Map<string, {
    bidPrice: number;
    bidQty: number;
    askPrice: number;
    askQty: number;
    spread: number;
    spreadPercent: number;
    liquidity: number;
  }>> {
    const bookTickerMap = new Map();
    const symbolsToFetch: string[] = [];
    
    // Check cache first
    for (const symbol of symbols) {
      const cacheKey = `bookTicker:${symbol}`;
      const cached = apiCache.get<any>(cacheKey);
      if (cached != null) {
        bookTickerMap.set(symbol, cached);
      } else {
        symbolsToFetch.push(symbol);
      }
    }
    
    // If all cached, return immediately
    if (symbolsToFetch.length === 0) {
      return bookTickerMap;
    }
    
    // Fetch all book tickers at once
    return this.rateLimitedPublicRequest(async () => {
      try {
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/bookTicker`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            if (response.status === 429) {
              logger.debug('Rate limited (429) for batch book tickers', { context: 'AsterDex' });
              return bookTickerMap; // Return partial results
            }
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          const tickerArray = Array.isArray(data) ? data : [data];
          
          // Build map from batch response
          for (const ticker of tickerArray) {
            const symbol = ticker.symbol?.replace('USDT', '/USDT') || ticker.symbol;
            if (symbolsToFetch.includes(symbol)) {
              const bidPrice = parseFloat(ticker.bidPrice || 0);
              const askPrice = parseFloat(ticker.askPrice || 0);
              const bidQty = parseFloat(ticker.bidQty || 0);
              const askQty = parseFloat(ticker.askQty || 0);
              
              const spread = askPrice - bidPrice;
              const spreadPercent = bidPrice > 0 ? (spread / bidPrice) * 100 : 0;
              const liquidity = (bidPrice * bidQty) + (askPrice * askQty);
              
              const bookTickerData = {
                bidPrice,
                bidQty,
                askPrice,
                askQty,
                spread,
                spreadPercent,
                liquidity
              };
              
              bookTickerMap.set(symbol, bookTickerData);
              // Cache each ticker
              apiCache.set(`bookTicker:${symbol}`, bookTickerData, apiCache.getTTL('PRICE'));
            }
          }
          
          logger.debug(`Batch fetched ${bookTickerMap.size} book tickers for ${symbolsToFetch.length} symbols`, {
            context: 'AsterDex',
            data: { fetched: bookTickerMap.size, requested: symbolsToFetch.length }
          });
          
          return bookTickerMap;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Batch book ticker fetch timeout after 15 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to get batch book tickers', error, { 
          context: 'AsterDex', 
          data: { symbolCount: symbolsToFetch.length } 
        });
        return bookTickerMap; // Return partial results
      }
    });
  }

  /**
   * Get detailed 24h ticker data for a symbol (using public API - no auth required)
   * WORLD-CLASS OPTIMIZED: Uses 30-key system with intelligent caching
   * CACHED: 10 seconds to dramatically reduce API calls
   */
  async getTicker(symbol: string): Promise<{
    price: number;
    previousPrice: number;
    priceChangePercent: number;
    volume: number;
    averageVolume: number;
    movingAverage: number;
    highPrice: number;
    lowPrice: number;
    openPrice: number;
    trades: number;
    quoteVolume: number;
  } | null> {
    const cacheKey = `ticker:${symbol}`;
    
    // Check cache first
    const cachedTicker = apiCache.get<any>(cacheKey);
    if (cachedTicker != null) {
      return cachedTicker;
    }
    
    // WORLD-CLASS: Public endpoint - use faster rate limiter (no API key limits)
    return this.rateLimitedPublicRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '').toUpperCase();
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/24hr?symbol=${binanceSymbol}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          
          const tickerData = {
            price: parseFloat(data.lastPrice || 0),
            previousPrice: parseFloat(data.prevClosePrice || data.lastPrice || 0),
            priceChangePercent: parseFloat(data.priceChangePercent || 0),
            volume: parseFloat(data.volume || 0),
            averageVolume: parseFloat(data.volume || 0),
            movingAverage: parseFloat(data.weightedAvgPrice || data.lastPrice || 0),
            highPrice: parseFloat(data.highPrice || data.lastPrice || 0),
            lowPrice: parseFloat(data.lowPrice || data.lastPrice || 0),
            openPrice: parseFloat(data.openPrice || data.lastPrice || 0),
            trades: parseInt(data.count || 0),
            quoteVolume: parseFloat(data.quoteVolume || 0),
          };
          
          // Cache for 10 seconds
          apiCache.set(cacheKey, tickerData, apiCache.getTTL('TICKER'));
          
          return tickerData;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Ticker fetch timeout after 10 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to get ticker data', error, { context: 'AsterDex', data: { symbol } });
        return null;
      }
    });
  }

  /**
   * WORLD-CLASS: Batch fetch prices for multiple symbols at once
   * Uses /ticker/price endpoint without symbol parameter to get all prices
   * Optimized for 30-key system - reduces API calls by 70%+
   */
  async getBatchPrices(symbols: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    const symbolsToFetch: string[] = [];
    
    // Check cache first for each symbol
    for (const symbol of symbols) {
      const cacheKey = `price:${symbol}`;
      const cachedPrice = apiCache.get<number>(cacheKey);
      if (cachedPrice != null) {
        priceMap.set(symbol, cachedPrice);
      } else {
        symbolsToFetch.push(symbol);
      }
    }
    
    // If all prices are cached, return immediately
    if (symbolsToFetch.length === 0) {
      return priceMap;
    }
    
    // WORLD-CLASS: Fetch all prices at once using batch endpoint (public - faster)
    // According to Aster DEX API docs: /ticker/price without symbol returns all prices
    return this.rateLimitedPublicRequest(async () => {
      try {
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/price`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          const priceArray = Array.isArray(data) ? data : [data];
          
          // Build price map from batch response
          for (const priceData of priceArray) {
            const symbol = priceData.symbol?.replace('USDT', '/USDT') || priceData.symbol;
            if (symbolsToFetch.includes(symbol) || symbols.includes(symbol)) {
              const price = parseFloat(priceData.price || 0);
              priceMap.set(symbol, price);
              // Cache each price
              apiCache.set(`price:${symbol}`, price, apiCache.getTTL('PRICE'));
            }
          }
          
          logger.debug(`Batch fetched ${priceMap.size} prices for ${symbolsToFetch.length} symbols`, {
            context: 'AsterDex',
            data: { fetched: priceMap.size, requested: symbolsToFetch.length }
          });
          
          return priceMap;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Batch price fetch timeout after 15 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to batch fetch prices', error, { context: 'AsterDex' });
        return priceMap; // Return partial results (cached prices)
      }
    });
  }

  /**
   * WORLD-CLASS: Batch fetch 24hr ticker data for multiple symbols at once
   * Uses /ticker/24hr endpoint without symbol parameter to get all tickers
   * Optimized for 30-key system - reduces API calls by 100x+
   */
  async getBatchTickers(symbols: string[]): Promise<Map<string, any>> {
    const tickerMap = new Map<string, any>();
    const symbolsToFetch: string[] = [];
    
    // Check cache first for each symbol
    for (const symbol of symbols) {
      const cacheKey = `ticker:${symbol}`;
      const cached = apiCache.get<any>(cacheKey);
      if (cached != null) {
        tickerMap.set(symbol, cached);
      } else {
        symbolsToFetch.push(symbol);
      }
    }
    
    // If all cached, return immediately
    if (symbolsToFetch.length === 0) {
      return tickerMap;
    }
    
    // WORLD-CLASS: Fetch all 24hr tickers at once using batch endpoint (public - faster)
    // According to Aster DEX API docs: /ticker/24hr without symbol returns all tickers
    return this.rateLimitedPublicRequest(async () => {
      try {
        const url = `https://fapi.asterdex.com/fapi/v1/ticker/24hr`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          const tickerArray = Array.isArray(data) ? data : [data];
          
          // Build ticker map from batch response
          for (const ticker of tickerArray) {
            const symbol = ticker.symbol?.replace('USDT', '/USDT') || ticker.symbol;
            if (symbolsToFetch.includes(symbol)) {
              const tickerData = {
                price: parseFloat(ticker.lastPrice || 0),
                previousPrice: parseFloat(ticker.prevClosePrice || ticker.lastPrice || 0),
                priceChangePercent: parseFloat(ticker.priceChangePercent || 0),
                volume: parseFloat(ticker.volume || 0),
                averageVolume: parseFloat(ticker.volume || 0),
                movingAverage: parseFloat(ticker.weightedAvgPrice || ticker.lastPrice || 0),
                highPrice: parseFloat(ticker.highPrice || ticker.lastPrice || 0),
                lowPrice: parseFloat(ticker.lowPrice || ticker.lastPrice || 0),
                openPrice: parseFloat(ticker.openPrice || ticker.lastPrice || 0),
                trades: parseInt(ticker.count || 0),
                quoteVolume: parseFloat(ticker.quoteVolume || 0),
              };
              
              tickerMap.set(symbol, tickerData);
              // Cache each ticker
              apiCache.set(`ticker:${symbol}`, tickerData, apiCache.getTTL('TICKER'));
            }
          }
          
          logger.debug(`Batch fetched ${tickerMap.size} tickers for ${symbolsToFetch.length} symbols`, {
            context: 'AsterDex',
            data: { fetched: tickerMap.size, requested: symbolsToFetch.length }
          });
          
          return tickerMap;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Batch ticker fetch timeout after 15 seconds');
          }
          throw fetchError;
        }
      } catch (error) {
        logger.error('Failed to get batch tickers', error, { 
          context: 'AsterDex', 
          data: { symbolCount: symbolsToFetch.length } 
        });
        return tickerMap; // Return partial results
      }
    });
  }

  /**
   * Get kline/candlestick data for technical analysis
   * CACHED: 30 seconds for short-term intervals (1m, 5m), 60 seconds for longer
   */
  async getKlines(symbol: string, interval: string = '1m', limit: number = 100): Promise<Array<{
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
  }> | null> {
    const cacheKey = `klines:${symbol}:${interval}:${limit}`;
    
    // Check cache first
    const cachedKlines = apiCache.get<any>(cacheKey);
    if (cachedKlines != null) {
      return cachedKlines;
    }

    // CRITICAL FIX: Retry with exponential backoff for 429 rate limit errors
    // Based on Aster DEX API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
    // IP limits apply - need to respect rate limits and retry with backoff
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const backoffDelay = Math.pow(2, attempt) * 1000;
          logger.debug(`Rate limit hit for klines ${symbol}, retrying (attempt ${attempt + 1}/${maxRetries}) after ${backoffDelay}ms`, {
            context: 'AsterDex',
            data: { symbol, interval, attempt: attempt + 1, maxRetries, backoffDelay }
          });
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        
        return await this.rateLimitedPublicRequest(async () => {
          // Convert BTC/USDT to BTCUSDT format
          const binanceSymbol = symbol.replace('/', '');
          const url = `https://fapi.asterdex.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
          
          // CRITICAL FIX: Add timeout protection (30 seconds) to account for heavy rate limiting
          // Based on Aster DEX API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout (increased for rate limiting)
          
          try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            // CRITICAL FIX: Handle 429 rate limit errors with retry
            if (response.status === 429) {
              // Check if we can use stale cache
              const staleCache = apiCache.get(cacheKey);
              if (staleCache && attempt < maxRetries - 1) {
                logger.debug(`Rate limited (429) for klines ${symbol} - will retry. Attempt ${attempt + 1}/${maxRetries}`, {
                  context: 'AsterDex',
                  data: { symbol, interval, attempt: attempt + 1, maxRetries }
                });
                throw new Error(`API returned 429: Too Many Requests (attempt ${attempt + 1}/${maxRetries})`);
              } else if (staleCache) {
                // Last attempt failed, use stale cache
                logger.warn(`Rate limited (429) for klines ${symbol} - using stale cached data`, {
                  context: 'AsterDex',
                  data: { symbol, interval, cacheAge: 'stale' }
                });
                return staleCache;
              } else {
                throw new Error(`API returned 429: Too Many Requests`);
              }
            }
            
            if (!response.ok) {
              throw new Error(`API returned ${response.status}`);
            }
            
            const data = await response.json();
            
            // Parse kline data: [openTime, open, high, low, close, volume, closeTime, ...]
            const klines = data.map((k: any[]) => ({
              openTime: k[0],
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
              closeTime: k[6],
            }));
            
            // CRITICAL FIX: Use timeframe-specific cache TTLs
            // Higher timeframes (1h, 4h) can be cached longer since they change less
            // This allows MTF analysis without hammering the API
            apiCache.set(cacheKey, klines, apiCache.getKlinesTTL(interval));
            
            return klines;
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('Klines fetch timeout after 30 seconds');
            }
            // Re-throw to be caught by outer retry loop
            throw fetchError;
          }
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this is the last attempt, check for stale cache before failing
        if (attempt === maxRetries - 1) {
          const staleCache = apiCache.get(cacheKey);
          if (staleCache) {
            logger.warn(`All retry attempts failed for klines ${symbol} - using stale cached data`, {
              context: 'AsterDex',
              data: {
                symbol,
                interval,
                error: lastError.message,
                attempts: maxRetries,
                usingStaleCache: true
              }
            });
            return staleCache as Array<{
              openTime: number;
              open: number;
              high: number;
              low: number;
              close: number;
              volume: number;
              closeTime: number;
            }>;
          }
        }
        
        // If not 429 or not last attempt, continue to retry
        if (error instanceof Error && error.message.includes('429') && attempt < maxRetries - 1) {
          continue; // Will retry with backoff
        }
        
        // For non-429 errors or after all retries, log and return null
        if (attempt === maxRetries - 1) {
          // CRITICAL FIX: Don't spam logs for 429 errors - only log once per symbol
          if (!lastError.message.includes('429')) {
            logger.error(`Failed to get klines for ${symbol} after all retries`, lastError, { 
              context: 'AsterDex',
              data: { symbol, interval, attempts: maxRetries }
            });
          } else {
            // For 429 errors, use debug level to reduce log spam
            logger.debug(`Rate limited (429) for klines ${symbol} - all retries exhausted, returning null`, {
              context: 'AsterDex',
              data: { symbol, interval, attempts: maxRetries }
            });
          }
          return null;
        }
      }
    }
    
    // Should never reach here, but TypeScript requires it
    return null;
  }

  /**
   * Initialize symbol cache from exchange info
   * This can be called directly with exchange info to avoid API calls
   */
  private initializeSymbolCache(exchangeInfo: any): void {
    if (exchangeInfo && exchangeInfo.symbols) {
      this.validSymbolsCache.clear();
      this.invalidSymbolsCache.clear();
      
      let addedCount = 0;
      const sampleSymbols: string[] = [];
      
      exchangeInfo.symbols.forEach((s: any) => {
        if (s.status === 'TRADING' && s.contractType === 'PERPETUAL') {
          const normalized = s.symbol.toUpperCase();
          this.validSymbolsCache.add(normalized);
          addedCount++;
          // Collect sample symbols for debugging
          if (sampleSymbols.length < 10 && ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].includes(normalized)) {
            sampleSymbols.push(normalized);
          }
        }
      });
      
      this.lastSymbolCacheUpdate = Date.now();
      logger.info(`Initialized symbol cache: ${addedCount} valid symbols (samples: ${sampleSymbols.join(', ') || 'none'})`, {
        context: 'AsterDex',
        data: {
          totalSymbols: exchangeInfo.symbols?.length || 0,
          validSymbols: addedCount,
          sampleSymbols: sampleSymbols.length > 0 ? sampleSymbols : 'none found'
        }
      });
      
      // CRITICAL DIAGNOSTIC: Check if major symbols are in cache
      const majorSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
      const missingMajor = majorSymbols.filter(s => !this.validSymbolsCache.has(s));
      if (missingMajor.length > 0) {
        logger.warn(`[WARN] Major symbols missing from cache: ${missingMajor.join(', ')}`, {
          context: 'AsterDex',
          data: { missingSymbols: missingMajor, cacheSize: this.validSymbolsCache.size }
        });
      }
      
      // CRITICAL FIX: Remove any symbols from invalid cache that are now in valid cache
      // This handles cases where symbols were incorrectly marked invalid before cache was initialized
      const incorrectlyMarkedInvalid: string[] = [];
      this.invalidSymbolsCache.forEach((invalidSymbol) => {
        if (this.validSymbolsCache.has(invalidSymbol)) {
          this.invalidSymbolsCache.delete(invalidSymbol);
          incorrectlyMarkedInvalid.push(invalidSymbol);
        }
      });
      if (incorrectlyMarkedInvalid.length > 0) {
        logger.info(`Cleared ${incorrectlyMarkedInvalid.length} incorrectly marked invalid symbols from cache`, {
          context: 'AsterDex',
          data: { clearedSymbols: incorrectlyMarkedInvalid }
        });
      }
    } else {
      logger.error('Failed to initialize symbol cache: exchangeInfo or symbols missing', {
        context: 'AsterDex',
        data: {
          hasExchangeInfo: !!exchangeInfo,
          hasSymbols: !!(exchangeInfo?.symbols),
          symbolsType: Array.isArray(exchangeInfo?.symbols) ? 'array' : typeof exchangeInfo?.symbols
        }
      });
    }
  }

  /**
   * Check if symbol exists on Aster DEX
   * Uses cached exchange info to avoid unnecessary API calls
   */
  private async isSymbolValid(symbol: string): Promise<boolean> {
    // Normalize symbol format (BTC/USDT or BTCUSDT -> BTCUSDT)
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    
    // Check invalid cache first (fast rejection)
    if (this.invalidSymbolsCache.has(normalizedSymbol)) {
      return false;
    }
    
    // Check valid cache
    if (this.validSymbolsCache.has(normalizedSymbol)) {
      return true;
    }
    
    // Cache expired or doesn't exist - refresh from exchange info
    const now = Date.now();
    const needsRefresh = now - this.lastSymbolCacheUpdate > this.SYMBOL_CACHE_TTL || this.validSymbolsCache.size === 0;
    
    if (needsRefresh) {
      // CRITICAL FIX: Use lock to prevent concurrent cache refreshes
      // If a refresh is already in progress, wait for it instead of starting a new one
      if (!this.cacheRefreshPromise) {
        this.cacheRefreshPromise = (async () => {
          try {
            const exchangeInfo = await this.getExchangeInfo();
            if (exchangeInfo) {
              this.initializeSymbolCache(exchangeInfo);
            }
          } catch (error) {
            logger.warn('Failed to refresh symbol cache, continuing with existing cache', {
              context: 'AsterDex',
              error: error instanceof Error ? error.message : String(error)
            });
          } finally {
            // Clear the promise so next refresh can start
            this.cacheRefreshPromise = null;
          }
        })();
      }
      
      // Wait for the refresh to complete (if it's in progress)
      await this.cacheRefreshPromise;
    }
    
    // Check again after cache update
    if (this.validSymbolsCache.has(normalizedSymbol)) {
      return true;
    }
    
    // CRITICAL DIAGNOSTIC: Before marking as invalid, log cache state
    logger.warn(`Symbol ${symbol} (normalized: ${normalizedSymbol}) not found in cache after refresh`, {
      context: 'AsterDex',
      data: {
        symbol,
        normalizedSymbol,
        cacheSize: this.validSymbolsCache.size,
        cacheAge: Date.now() - this.lastSymbolCacheUpdate,
        sampleCachedSymbols: Array.from(this.validSymbolsCache).slice(0, 5)
      }
    });
    
    // Symbol not found - add to invalid cache
    // BUT: Only add if cache was actually refreshed (not if refresh failed)
    if (this.validSymbolsCache.size > 0) {
      this.invalidSymbolsCache.add(normalizedSymbol);
    } else {
      // Cache is empty - don't mark as invalid, might be a cache initialization issue
      logger.warn(`Not marking ${normalizedSymbol} as invalid - cache is empty (initialization may have failed)`, {
        context: 'AsterDex'
      });
    }
    return false;
  }

  /**
   * Get aggregated trades for a symbol (buy/sell volume analysis)
   * CACHED: 10 seconds
   * CRITICAL FIX: Checks if symbol exists before making API call to avoid 404s
   */
  async getAggregatedTrades(symbol: string, limit: number = 500): Promise<{
    buyVolume: number;
    sellVolume: number;
    buySellRatio: number;
    totalTrades: number;
    avgPrice: number;
  } | null> {
    // CRITICAL FIX: Check if symbol exists on Aster DEX before making API call
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const isValid = await this.isSymbolValid(normalizedSymbol);
    
    if (!isValid) {
      // CRITICAL FIX: Only skip silently if symbol is in invalid cache
      // If cache is empty, log warning (might be initialization issue)
      if (this.invalidSymbolsCache.has(normalizedSymbol)) {
        // Symbol confirmed invalid - skip silently
        return null;
      } else {
        // Cache might not be initialized - log for debugging
        logger.debug(`Symbol ${symbol} validation returned false, but not in invalid cache (cache may not be initialized)`, {
          context: 'AsterDex',
          data: {
            symbol,
            normalizedSymbol,
            cacheSize: this.validSymbolsCache.size,
            invalidCacheSize: this.invalidSymbolsCache.size
          }
        });
        return null;
      }
    }
    
    const cacheKey = `aggTrades:${symbol}:${limit}`;
    
    // Check cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached != null) {
      return cached;
    }
    
    return this.rateLimitedPublicRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format (already normalized)
        const binanceSymbol = normalizedSymbol;
        const url = `https://fapi.asterdex.com/fapi/v1/aggTrades?symbol=${binanceSymbol}&limit=${limit}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          // CRITICAL FIX: Handle 404 gracefully - symbol may have been delisted
          if (response.status === 404) {
            // WORLD-CLASS: Major symbols (BTC, ETH, SOL, BNB) should NEVER be permanently marked invalid
            // These are core trading pairs that should always exist - 404s are likely temporary API issues
            const majorSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
            const isMajorSymbol = majorSymbols.includes(normalizedSymbol);
            
            // CRITICAL FIX: Check BEFORE adding (if already invalid, we shouldn't have made this call)
            const wasAlreadyInvalid = this.invalidSymbolsCache.has(normalizedSymbol);
            
            if (isMajorSymbol) {
              // MAJOR SYMBOL: Don't mark as invalid, force immediate cache refresh
              logger.warn(`[WARN] Major symbol ${symbol} returned 404 - forcing immediate cache refresh (likely temporary API issue)`, {
                context: 'AsterDex',
                data: {
                  symbol,
                  normalizedSymbol,
                  cacheSize: this.validSymbolsCache.size,
                  cacheAge: Date.now() - this.lastSymbolCacheUpdate,
                  action: 'Major symbol - forcing cache refresh, NOT marking as invalid'
                }
              });
              
              // CRITICAL: Force immediate cache refresh for major symbols
              // Don't mark as invalid - these symbols should always exist
              this.validSymbolsCache.delete(normalizedSymbol);
              this.invalidSymbolsCache.delete(normalizedSymbol); // Remove from invalid if it was there
              
              // Force immediate cache refresh (don't wait)
              this.getExchangeInfo().then((exchangeInfo) => {
                if (exchangeInfo) {
                  this.initializeSymbolCache(exchangeInfo);
                  logger.info(`[OK] Cache refreshed after major symbol 404: ${symbol}`, {
                    context: 'AsterDex',
                    data: {
                      symbol,
                      cacheSize: this.validSymbolsCache.size,
                      isNowValid: this.validSymbolsCache.has(normalizedSymbol)
                    }
                  });
                }
              }).catch(() => {
                // Silent fail - will retry next time
              });
              
              // Return null for now, but don't permanently block the symbol
              return null;
            } else {
              // REGULAR SYMBOL: Mark as invalid (could be delisted)
              this.invalidSymbolsCache.add(normalizedSymbol);
              this.validSymbolsCache.delete(normalizedSymbol);
              
              // Only log if symbol wasn't already in invalid cache (indicates cache validation failed)
              if (!wasAlreadyInvalid) {
                logger.warn(`[WARN] Symbol ${symbol} returned 404 - removing from valid cache`, {
                  context: 'AsterDex',
                  data: {
                    symbol,
                    normalizedSymbol,
                    cacheSize: this.validSymbolsCache.size,
                    cacheAge: Date.now() - this.lastSymbolCacheUpdate,
                    action: 'Removed from valid cache, added to invalid cache'
                  }
                });
                
                // CRITICAL: Trigger cache refresh if many 404s detected (possible delisting event)
                if (this.invalidSymbolsCache.size % 10 === 0) {
                  logger.info('[CACHE] Triggering symbol cache refresh due to 404s', {
                    context: 'AsterDex',
                    data: {
                      invalidSymbolsCount: this.invalidSymbolsCache.size,
                      validSymbolsCount: this.validSymbolsCache.size
                    }
                  });
                  // Refresh cache in background (don't wait)
                  this.getExchangeInfo().catch(() => {
                    // Silent fail - will retry next time
                  });
                }
              }
              // Silent skip - no DEBUG log needed (prevents log spam)
              return null;
            }
          }
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          return null;
        }
        
        // Calculate buy vs sell volume
        // CRITICAL: Aster DEX aggregated trades API uses 'm' field (maker flag)
        // m=false: Buyer was the taker (market buy order) = BUY volume
        // m=true: Seller was the taker (market sell order) = SELL volume
        // This accurately tracks order flow: taker buys = buying pressure, taker sells = selling pressure
        let buyVolume = 0;
        let sellVolume = 0;
        let totalPrice = 0;
        
        data.forEach((trade: any) => {
          const qty = parseFloat(trade.q || trade.quantity || '0');
          const price = parseFloat(trade.p || trade.price || '0');
          
          // Validate quantities are positive numbers
          if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
            return; // Skip invalid trades
          }
          
          totalPrice += price * qty;
          
          // maker=false = market buy (buyer was the taker) = BUYING PRESSURE
          if (trade.m === false) {
            buyVolume += qty;
          } else if (trade.m === true) {
            // maker=true = market sell (seller was the taker) = SELLING PRESSURE
            sellVolume += qty;
          }
          // If m is undefined/null, skip that trade (shouldn't happen but handle gracefully)
        });
        
        const totalVolume = buyVolume + sellVolume;
        // CRITICAL: buySellRatio = buyVolume / sellVolume
        // > 1.0 = more buying pressure (bullish)
        // < 1.0 = more selling pressure (bearish)
        // = 1.0 = balanced
        const buySellRatio = sellVolume > 0 ? buyVolume / sellVolume : (buyVolume > 0 ? Infinity : 1.0);
        
        // CRITICAL FIX: Handle edge case where all volume is buys (no sells) or vice versa
        // If ratio is infinite or zero, normalize to reasonable bounds
        const normalizedBuySellRatio = isFinite(buySellRatio) && buySellRatio > 0 ? 
          Math.min(Math.max(buySellRatio, 0.01), 100) : // Clamp between 0.01 and 100
          1.0;
        const avgPrice = totalVolume > 0 ? totalPrice / totalVolume : 0;
        
        const result = {
          buyVolume,
          sellVolume,
          buySellRatio: normalizedBuySellRatio, // Use normalized ratio
          totalTrades: data.length,
          avgPrice,
          // Add metadata for debugging
          buyVolumePercent: totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50,
          sellVolumePercent: totalVolume > 0 ? (sellVolume / totalVolume) * 100 : 50
        };
        
        // Cache for 10 seconds
        apiCache.set(cacheKey, result, 10);
        
        return result;
      } catch (error) {
        // CRITICAL FIX: Handle errors gracefully
        // If it's a 404, update invalid cache
        const is404 = error instanceof Error && (
          error.message.includes('404') || 
          error.message.includes('not found')
        );
        
        if (is404) {
          // Update invalid cache to prevent future calls
          this.invalidSymbolsCache.add(normalizedSymbol);
          this.validSymbolsCache.delete(normalizedSymbol);
          // Silent skip - no logging needed (already checked before API call)
        } else {
          logger.error(`Failed to get aggregated trades for ${symbol}`, error, { context: 'AsterDex' });
        }
        return null;
      }
    });
  }

  /**
   * Get symbol precision info (quantity decimals, step size, etc.)
   * CACHED: 1 hour (exchange info rarely changes)
   */
  async getSymbolPrecision(symbol: string): Promise<{ quantityPrecision: number; stepSize: string; maxQty: number } | null> {
    const cacheKey = `symbolPrecision:${symbol}`;
    const cached = apiCache.get(cacheKey) as { quantityPrecision: number; stepSize: string; maxQty: number } | undefined;
    if (cached) {
      return cached;
    }

    try {
      // CRITICAL FIX: Use absolute URL with /fapi/v1/ prefix per API docs
      const url = `https://fapi.asterdex.com/fapi/v1/exchangeInfo`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      const symbolData = data.symbols.find((s: any) => s.symbol === symbol.replace('/', ''));
      
      if (!symbolData) {
        logger.warn(`Symbol ${symbol} not found in exchange info`, { context: 'AsterDex' });
        return null;
      }
      
      // Find the LOT_SIZE filter to get step size, precision, and max quantity
      const lotSizeFilter = symbolData.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
      const quantityPrecision = symbolData.quantityPrecision || 2; // Default to 2 decimals
      const stepSize = lotSizeFilter?.stepSize || '0.01'; // Default step size
      const maxQty = lotSizeFilter?.maxQty ? parseFloat(lotSizeFilter.maxQty) : TRADING_THRESHOLDS.MAX_QUANTITY_DEFAULT; // Default to high limit
      
      const result = { quantityPrecision, stepSize, maxQty };
      
      // Cache for 1 hour (exchange info rarely changes)
      apiCache.set(cacheKey, result, 3600);
      
      logger.debug(`Symbol precision for ${symbol}`, { 
        context: 'AsterDex', 
        data: { quantityPrecision, stepSize, maxQty } 
      });
      
      return result;
    } catch (error) {
      logger.error(`Failed to fetch symbol precision for ${symbol}`, error, { context: 'AsterDex' });
      // Return safe defaults
      return { quantityPrecision: 2, stepSize: '0.01', maxQty: TRADING_THRESHOLDS.MAX_QUANTITY_LIMIT };
    }
  }

  /**
   * Round quantity to match symbol's precision requirements
   */
  roundQuantity(quantity: number, precision: number): number {
    const multiplier = Math.pow(10, precision);
    return Math.floor(quantity * multiplier) / multiplier;
  }

  /**
   * Get all available trading pairs from Aster DEX
   * OPTIMIZED: Added timeout, caching, retry with exponential backoff for 429 errors
   */
  async getExchangeInfo(): Promise<any> {
    // Check cache first (5 minute TTL - exchange info doesn't change often)
    const cacheKey = 'exchangeInfo:full';
    const cached = apiCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached exchange info', { context: 'AsterDex' });
      // CRITICAL FIX: Initialize symbol cache even when using cached data
      this.initializeSymbolCache(cached);
      return cached;
    }

    // CRITICAL FIX: Retry with exponential backoff for 429 rate limit errors
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // WORLD-CLASS OPTIMIZATION: Use correct Aster DEX API base URL
        // According to API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
        // Base URL is https://fapi.asterdex.com, endpoints are /fapi/v1/*
        const baseUrl = 'https://fapi.asterdex.com';
        const url = `${baseUrl}/fapi/v1/exchangeInfo`;
        
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const backoffDelay = Math.pow(2, attempt) * 1000;
          logger.warn(`Rate limit hit, retrying exchange info fetch (attempt ${attempt + 1}/${maxRetries}) after ${backoffDelay}ms`, {
            context: 'AsterDex',
            data: { attempt: attempt + 1, maxRetries, backoffDelay }
          });
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        } else {
          logger.debug('Fetching exchange info from Aster DEX', { context: 'AsterDex', data: { url } });
        }
        
        // Declare variables outside inner try block so they're accessible later
        let data: any;
        let tickerData: any = {};
        
        // Add 15-second timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          // CRITICAL FIX: Handle 429 rate limit errors with retry
          if (response.status === 429) {
            // Check if we can use stale cache
            const staleCache = apiCache.get(cacheKey);
            if (staleCache && attempt < maxRetries - 1) {
              logger.warn(`Rate limited (429) - will retry. Attempt ${attempt + 1}/${maxRetries}`, {
                context: 'AsterDex',
                data: { attempt: attempt + 1, maxRetries }
              });
              lastError = new Error(`API returned 429: Too Many Requests (attempt ${attempt + 1}/${maxRetries})`);
              continue; // Retry with backoff
            } else if (staleCache) {
              // Last attempt failed, use stale cache
              logger.warn('Rate limited (429) - using stale cached exchange info', {
                context: 'AsterDex',
                data: { cacheAge: 'stale' }
              });
              this.initializeSymbolCache(staleCache);
              return staleCache;
            } else {
              throw new Error(`API returned 429: Too Many Requests`);
            }
          }
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
          }
          
          data = await response.json();
          
          // Validate response structure
          if (!data || !data.symbols || !Array.isArray(data.symbols)) {
            logger.error('Invalid exchange info response structure', null, { 
              context: 'AsterDex', 
              data: { 
                hasData: !!data,
                hasSymbols: !!(data && data.symbols),
                isArray: !!(data && data.symbols && Array.isArray(data.symbols)),
                keys: data ? Object.keys(data) : []
              }
            });
            throw new Error('Invalid exchange info response - missing symbols array');
          }
          
          logger.info(`Found ${data.symbols.length} trading pairs`, { context: 'AsterDex' });
          
          // Get 24hr ticker data for volume information (with timeout)
          const tickerUrl = `${baseUrl}/fapi/v1/ticker/24hr`;
          logger.debug('Fetching 24hr ticker data', { context: 'AsterDex', data: { url: tickerUrl } });
          
          const tickerController = new AbortController();
          const tickerTimeoutId = setTimeout(() => tickerController.abort(), 15000);
          
          try {
            const tickerResponse = await fetch(tickerUrl, { signal: tickerController.signal });
            clearTimeout(tickerTimeoutId);
        
            if (tickerResponse.ok) {
              const tickerJson = await tickerResponse.json();
              // Convert array to object for faster lookup
              if (Array.isArray(tickerJson)) {
                tickerData = tickerJson.reduce((acc: any, ticker: any) => {
                  acc[ticker.symbol] = ticker;
                  return acc;
                }, {});
                logger.info(`Loaded 24hr ticker data for ${Object.keys(tickerData).length} pairs`, { context: 'AsterDex' });
              } else {
                tickerData = tickerJson;
              }
            } else {
              logger.warn('Failed to fetch 24hr ticker data', { context: 'AsterDex', data: { status: tickerResponse.status } });
            }
          } catch (tickerError) {
            clearTimeout(tickerTimeoutId);
            logger.warn('Ticker fetch failed or timed out, continuing without volume data', { 
              context: 'AsterDex',
              error: tickerError instanceof Error ? tickerError.message : String(tickerError)
            });
            // Continue without ticker data - not critical
          }
          
          // Combine exchange info with volume data
          const symbolsWithVolume = data.symbols.map((symbol: any) => {
            const ticker = tickerData[symbol.symbol] || {};
              
            return {
              ...symbol,
              volume24h: ticker.volume ? parseFloat(ticker.volume) : 0,
              quoteVolume24h: ticker.quoteVolume ? parseFloat(ticker.quoteVolume) : 0,
              priceChange24h: ticker.priceChange ? parseFloat(ticker.priceChange) : 0,
              priceChangePercent24h: ticker.priceChangePercent ? parseFloat(ticker.priceChangePercent) : 0,
              lastPrice: ticker.lastPrice ? parseFloat(ticker.lastPrice) : 0
            };
          });
          
          // Sort by volume (descending)
          const sortedByVolume = [...symbolsWithVolume].sort((a, b) => {
            return (b.quoteVolume24h || 0) - (a.quoteVolume24h || 0);
          });
          
          const result = {
            symbols: data.symbols,
            topSymbolsByVolume: sortedByVolume.slice(0, 100), // Top 100 by volume
            serverTime: data.serverTime,
            timezone: data.timezone
          };
          
          // Cache for 1 hour (exchange info rarely changes - reduces IP rate limit usage)
          apiCache.set(cacheKey, result, apiCache.getTTL('EXCHANGE_INFO'));
          
          // CRITICAL FIX: Initialize symbol validation cache from exchange info
          // This prevents additional API calls during symbol validation
          // This MUST happen on every exchange info fetch to keep cache fresh
          this.initializeSymbolCache(result);
          
          return result;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          // If it's a 429 on last attempt, check for stale cache
          if (fetchError instanceof Error && fetchError.message.includes('429') && attempt === maxRetries - 1) {
            const staleCache = apiCache.get(cacheKey);
            if (staleCache) {
              logger.warn('Final attempt failed with 429 - using stale cached exchange info', {
                context: 'AsterDex'
              });
              this.initializeSymbolCache(staleCache);
              return staleCache;
            }
          }
          throw fetchError;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this is the last attempt, check for stale cache before failing
        if (attempt === maxRetries - 1) {
          const staleCache = apiCache.get(cacheKey);
          if (staleCache) {
            logger.warn('All retry attempts failed - using stale cached exchange info', {
              context: 'AsterDex',
              data: {
                error: lastError.message,
                attempts: maxRetries,
                usingStaleCache: true
              }
            });
            this.initializeSymbolCache(staleCache);
            return staleCache;
          }
        }
        
        // If not 429 or not last attempt, continue to retry
        if (error instanceof Error && error.message.includes('429') && attempt < maxRetries - 1) {
          continue; // Will retry with backoff
        }
        
        // For non-429 errors or after all retries, throw
        if (attempt === maxRetries - 1) {
          logger.error('Failed to fetch exchange info after all retries', lastError, { 
            context: 'AsterDex',
            data: { attempts: maxRetries }
          });
          throw lastError;
        }
      }
    }
    
    // Should never reach here, but TypeScript requires it
    throw lastError || new Error('Failed to fetch exchange info');
  }

  /**
   * WORLD-CLASS OPTIMIZED: Get all available trading pairs
   * Uses cached exchangeInfo when available to avoid redundant API calls
   */
  async getAllTradingPairs(): Promise<string[]> {
    try {
      // WORLD-CLASS: Use cached exchangeInfo if available (reduces API calls)
      const exchangeInfo = await this.getExchangeInfo();
      
      if (exchangeInfo && exchangeInfo.symbols) {
        // Filter for USDT perpetual futures pairs only
        const usdtPairs = exchangeInfo.symbols
          .filter((s: any) => 
            s.symbol.endsWith('USDT') && 
            s.contractType === 'PERPETUAL' &&
            s.status === 'TRADING'
          )
          .map((s: any) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbol = s.symbol.replace('USDT', '/USDT');
            return symbol;
          });
        
        logger.debug(`Using cached exchangeInfo for ${usdtPairs.length} pairs`, { 
          context: 'AsterDex',
          data: { cached: true, count: usdtPairs.length }
        });
        
        return usdtPairs;
      }
      
      // Fallback: Direct fetch if cache unavailable
      // CRITICAL FIX: Use absolute URL with /fapi/v1/ prefix per API docs
      const url = `https://fapi.asterdex.com/fapi/v1/exchangeInfo`;
      
      logger.debug('Fetching all trading pairs from Aster DEX (cache miss)', { context: 'AsterDex', data: { url } });
      
      return this.rateLimitedPublicRequest(async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter for USDT perpetual futures pairs only
        const usdtPairs = data.symbols
          .filter((s: any) => 
            s.symbol.endsWith('USDT') && 
            s.contractType === 'PERPETUAL' &&
            s.status === 'TRADING'
          )
          .map((s: any) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbol = s.symbol.replace('USDT', '/USDT');
            return symbol;
          });
        
        logger.info(`[DATA] Found ${usdtPairs.length} active USDT perpetual pairs on Aster DEX`, { 
          context: 'AsterDex',
          data: { count: usdtPairs.length, sample: usdtPairs.slice(0, 10) }
        });
        
        return usdtPairs;
      });
    } catch (error) {
      logger.error('Failed to fetch trading pairs', error, { context: 'AsterDex' });
      return [];
    }
  }

  /**
   * Make authenticated API request with timeout and error handling
   * MULTI-KEY OPTIMIZED: Automatically uses key pool for 30x capacity!
   */
  private async authenticatedRequest<T>(
    endpoint: string,
    params: Record<string, string | number> = {},
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    timeout: number = 30000 // 30 second default timeout
  ): Promise<T> {
    // CRITICAL FIX: Bypass old queue system when using multi-key mode
    // apiKeyManager already handles rate limiting (600 req/sec capacity)
    // Using both creates a double bottleneck and causes timeouts
    const executeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Get API key from pool (or use fallback single key)
      let apiKey: string;
      let secretKey: string;
      let keyId: string = 'single-key';

      if (this.useMultiKey) {
        const key = apiKeyManager.getNextKey();
        if (!key) {
          throw new Error('No healthy API keys available from pool');
        }
        apiKey = key.apiKey;
        secretKey = key.secretKey;
        // keyId is not returned by getNextKey(), use a generated one
      } else {
        // Fallback to single key
        apiKey = this.apiKey || '';
        secretKey = this.secretKey || '';
      }
      
      try {
        // CRITICAL: Sync server time periodically to prevent -1021 errors
        // Per API docs: timestamp must be within recvWindow of server time
        await this.syncServerTime();
        
        // CRITICAL FIX: Generate synchronized timestamp immediately before building query
        // Use server-synced time to prevent clock skew errors
        const timestamp = this.getSynchronizedTimestamp();
        
        // Build signed query with fresh timestamp
        const queryString = await buildSignedQuery({
          ...params,
          timestamp: timestamp,
        }, secretKey);
        
        const url = `${this.baseUrl}/${endpoint}?${queryString}`;
        
        const response = await fetch(url, {
          method,
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // WORLD-CLASS: Track rate limit headers and adjust throttling dynamically
        // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
        const usedWeight = response.headers.get('X-MBX-USED-WEIGHT-1M');
        const orderCount = response.headers.get('X-MBX-ORDER-COUNT-1M');
        const retryAfter = response.headers.get('Retry-After');
        
        if (usedWeight) {
          const weight = parseInt(usedWeight);
          if (!isNaN(weight)) {
            // Track last 10 weight values for trend analysis
            this.usedWeightTracking.push(weight);
            if (this.usedWeightTracking.length > 10) {
              this.usedWeightTracking.shift();
            }
            
            // DYNAMIC RATE LIMITING: Adjust based on API usage
            // If approaching limit (>80%), slow down
            // If well below limit (<50%), speed up
            const utilizationPercent = (weight / this.MAX_WEIGHT_1M) * 100;
            
            if (utilizationPercent > 80) {
              // Approaching limit - slow down to 15 req/sec
              this.currentRateLimit = 15;
              if (utilizationPercent > 90) {
                // Very close to limit - emergency slowdown to 10 req/sec
                this.currentRateLimit = 10;
                logger.warn('Rate limit approaching critical (>90%) - emergency throttle active', {
                  context: 'AsterDex',
                  data: {
                    usedWeight: weight,
                    limit: this.MAX_WEIGHT_1M,
                    utilization: `${utilizationPercent.toFixed(1)}%`,
                    newRateLimit: this.currentRateLimit
                  }
                });
              }
            } else if (utilizationPercent < 50) {
              // Well below limit - can speed up to 25 req/sec
              this.currentRateLimit = 25;
            } else {
              // Normal range (50-80%) - use standard 20 req/sec
              this.currentRateLimit = 20;
            }
            
            logger.debug('Dynamic rate limit adjusted', {
              context: 'AsterDex',
              data: {
                keyId,
                usedWeight: weight,
                maxWeight: this.MAX_WEIGHT_1M,
                utilization: `${utilizationPercent.toFixed(1)}%`,
                currentRateLimit: this.currentRateLimit,
                orderCount1m: orderCount,
                retryAfter
              }
            });
          }
        }
        
        if (!response.ok) {
          // Read error response once (can only read body once)
          const errorText = await response.text();
          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { msg: errorText };
          }
          
          // OPTIMIZED: Handle rate limit (429) with Retry-After header
          // Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
          // 429 responses include Retry-After header indicating wait time
          if (response.status === 429) {
            const retryAfterSeconds = retryAfter ? parseInt(retryAfter) : 60; // Default 60s if header missing
            logger.warn('Rate limit exceeded (429) - waiting for retry window', {
              context: 'AsterDex',
              data: {
                retryAfterSeconds,
                endpoint,
                keyId,
                retryAfterHeader: retryAfter || 'not provided',
                note: 'Respecting Retry-After header per API documentation'
              }
            });
            
            // Wait for the specified retry period (respect API's recommendation)
            await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
            
            // Retry the request once after waiting
            logger.info('Retrying request after rate limit wait', {
              context: 'AsterDex',
              data: { endpoint, retryAfterSeconds }
            });
            
            // Recursive retry (only once to prevent infinite loops)
            return this.authenticatedRequest<T>(endpoint, params, method, timeout);
          }
          
          // CRITICAL: Handle timestamp errors (-1021) with server time sync
          // Per API docs: timestamp must be within recvWindow of server time
          // Check errorData that was already parsed above
          if (response.status === 400 && (errorData.code === -1021 || errorData.msg?.includes('timestamp'))) {
            logger.warn('Timestamp error detected - syncing server time and retrying', {
              context: 'AsterDex',
              data: { errorCode: errorData.code, errorMsg: errorData.msg }
            });
            
            // Force server time sync
            this.lastServerTimeSync = 0; // Force immediate sync
            await this.syncServerTime();
            
            // Retry once with synced timestamp
            return this.authenticatedRequest<T>(endpoint, params, method, timeout);
          }
          
          // Map AsterDex error codes to meaningful messages
          const errorCode = errorData.code || response.status;
          const error = new AsterApiError(
            this.mapErrorCode(errorCode, errorData.msg || errorText),
            errorCode,
            response.status
          );
          
          // Record error in key manager
          if (this.useMultiKey) {
            apiKeyManager.recordError(keyId, error);
          }
          
          throw error;
        }
        
        // Record success in key manager
        if (this.useMultiKey) {
          apiKeyManager.recordSuccess(keyId);
        }
        
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Record error in key manager
        if (this.useMultiKey && !(error instanceof AsterApiError)) {
          apiKeyManager.recordError(keyId, error as Error);
        }
        
        if (error instanceof AsterApiError) {
          throw error;
        }
        
        if (error instanceof Error && error.name === 'AbortError') {
          throw new AsterApiError('Request timeout', -1008, 408);
        }
        
        throw error;
      }
    };
    
    // CRITICAL FIX: Only use old queue for single-key mode
    // Multi-key mode already has rate limiting via apiKeyManager
    if (this.useMultiKey) {
      return executeRequest();
    } else {
      return this.rateLimitedRequest(executeRequest);
    }
  }

  /**
   * Sync server time to prevent -1021 (Invalid timestamp) errors
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Timestamp must be within recvWindow of server time
   */
  private async syncServerTime(): Promise<void> {
    try {
      const now = Date.now();
      // Only sync if it's been more than 5 minutes since last sync
      if (now - this.lastServerTimeSync < this.SERVER_TIME_SYNC_INTERVAL) {
        return;
      }
      
      const response = await fetch('https://fapi.asterdex.com/fapi/v1/time');
      if (!response.ok) {
        logger.warn('Failed to fetch server time', {
          context: 'AsterDex',
          data: { status: response.status }
        });
        return;
      }
      
      const data = await response.json();
      const serverTime = data.serverTime;
      this.serverTimeOffset = serverTime - Date.now();
      this.lastServerTimeSync = now;
      
      logger.debug('Server time synchronized', {
        context: 'AsterDex',
        data: {
          serverTime,
          localTime: Date.now(),
          offset: this.serverTimeOffset,
          offsetMs: `${this.serverTimeOffset > 0 ? '+' : ''}${this.serverTimeOffset}ms`
        }
      });
    } catch (error) {
      logger.warn('Server time sync failed (non-critical)', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error)
      });
      // Non-critical - continue with local time
    }
  }

  /**
   * Get synchronized timestamp (local time + server offset)
   * Use this for all authenticated requests to prevent -1021 errors
   */
  private getSynchronizedTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Map AsterDex error codes to meaningful messages
   * Reference: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Expanded with all error codes from API documentation
   */
  private mapErrorCode(code: number, message: string): string {
    const errorMap: Record<number, string> = {
      // General Server/Network Issues (10xx)
      '-1001': 'Disconnected from server - internal error',
      '-1002': 'Unauthorized request - invalid API key',
      '-1003': 'Too many requests - rate limit exceeded',
      '-1004': 'Unexpected response format',
      '-1005': 'Invalid signature - check secret key',
      '-1006': 'Invalid timestamp - clock skew detected',
      '-1007': 'Invalid recvWindow - must be <= 60000ms',
      '-1008': 'Request timeout',
      '-1009': 'Unknown error occurred',
      '-1010': 'Invalid API key',
      '-1020': 'Unsupported operation',
      '-1021': 'Invalid timestamp - sync server time',
      '-1022': 'Invalid signature - check HMAC calculation',
      
      // Processing Issues (20xx)
      '-2010': 'New order rejected - check order parameters',
      '-2011': 'Cancel order rejected',
      '-2013': 'No such order - order not found',
      '-2014': 'API-key format invalid',
      '-2015': 'Invalid API-key, IP, or permissions',
      
      // Filter Issues (40xx)
      '-4013': 'Filter failure: MIN_NOTIONAL - order value too small',
      '-4014': 'Filter failure: PRICE_NOT_INCREASED_BY_TICK_SIZE - adjust price',
      '-4015': 'Invalid client order ID length - must be <= 36 chars',
      '-4016': 'Price higher than mark price multiplier cap',
      '-4017': 'Multiplier up less than zero',
      '-4018': 'Multiplier down less than zero',
      '-4019': 'Composite scale overflow',
      '-4020': 'Target strategy invalid for order type',
      '-4021': 'Invalid depth limit',
      '-4022': 'Wrong market status',
      '-4023': 'Quantity not increased by step size',
      '-4024': 'Price lower than mark price multiplier floor',
      '-4025': 'Multiplier decimal less than zero',
      '-4026': 'Commission invalid',
      '-4027': 'Invalid account type',
      '-4028': 'Invalid leverage',
      '-4029': 'Invalid tick size precision',
      '-4030': 'Invalid step size precision',
      '-4031': 'Invalid working type',
      '-4032': 'Exceed max cancel order size',
      '-4033': 'Insurance account not found',
      '-4044': 'Invalid balance type',
      '-4045': 'Max stop order exceeded',
      '-4046': 'No need to change margin type',
      '-4047': 'Margin type cannot be changed - open orders exist',
      '-4048': 'Margin type cannot be changed - position exists',
      '-4049': 'Add isolated margin rejected',
      '-4050': 'Cross balance insufficient',
      '-4051': 'Isolated balance insufficient',
      '-4052': 'No need to change auto add margin',
      '-4053': 'Auto add crossed margin rejected',
      '-4054': 'Add isolated margin no position rejected',
      '-4055': 'Amount must be positive',
      '-4056': 'Invalid API key type',
      '-4057': 'Invalid RSA public key',
      '-4058': 'Max price too large',
      '-4059': 'No need to change position side',
      '-4060': 'Invalid position side',
      '-4061': 'Position side not match',
      '-4062': 'Reduce only conflict',
      '-4063': 'Invalid options request type',
      '-4064': 'Invalid options time frame',
      '-4065': 'Invalid options amount',
      '-4066': 'Invalid options event type',
      '-4067': 'Position side change exists open orders',
      '-4068': 'Position side change exists quantity',
      '-4069': 'Invalid options premium fee',
      '-4070': 'Invalid client options ID length',
      '-4071': 'Invalid options direction',
      '-4072': 'Options premium not update',
      '-4073': 'Options premium input less than zero',
      '-4074': 'Options amount bigger than upper',
      '-4075': 'Options premium output zero',
      '-4076': 'Options premium too diff',
      '-4077': 'Options premium reach limit',
      '-4078': 'Options common error',
      '-4079': 'Invalid options ID',
      '-4080': 'Options user not found',
      '-4081': 'Options not found',
      '-4082': 'Invalid batch place order size',
      '-4083': 'Place batch orders fail',
      '-4084': 'Upcoming method',
      '-4085': 'Invalid notional limit coefficient',
      '-4086': 'Invalid price spread threshold',
      '-4087': 'Reduce only order permission',
      '-4088': 'No place order permission',
      '-4104': 'Invalid contract type',
      '-4114': 'Invalid client transaction ID length',
      '-4115': 'Duplicated client transaction ID',
      '-4118': 'Reduce only margin check failed',
      '-4131': 'Market order rejected - PERCENT_PRICE filter limit exceeded',
      '-4135': 'Invalid activation price',
      '-4137': 'Quantity exists with close position',
      '-4138': 'Reduce only must be true with close position',
      '-4139': 'Order type cannot be market if unable to cancel',
      '-4140': 'Invalid opening position status',
      '-4141': 'Symbol already closed',
      '-4142': 'Strategy invalid trigger price',
      '-4144': 'Invalid pair',
      '-4161': 'Isolated leverage reject with position',
      '-4164': 'MIN_NOTIONAL - order notional too small (minimum 5.0 unless reduce only)',
      '-4165': 'Invalid time interval',
      '-4183': 'Price higher than stop price multiplier cap',
      '-4184': 'Price lower than stop price multiplier floor',
      
      // HTTP Status Codes
      400: 'Bad request - check parameters',
      401: 'Authentication failed - check API credentials',
      403: 'Forbidden - insufficient permissions',
      404: 'Not found - endpoint or resource not found',
      429: 'Rate limit exceeded - too many requests',
      500: 'Internal server error - Aster DEX server issue',
    };
    
    return errorMap[code] || message || `Unknown error (code: ${code})`;
  }

  /**
   * Get maximum leverage for a specific symbol
   */
  async getMaxLeverage(symbol: string): Promise<number> {
    try {
      const cacheKey = `maxLeverage:${symbol}`;
      
      // Check cache first (cache for 1 hour as leverage limits don't change often)
      const cached = apiCache.get(cacheKey);
      if (cached) {
        return cached as number;
      }

      // Convert symbol format (BTC/USDT -> BTCUSDT)
      const binanceSymbol = symbol.replace('/', '');
      
      // CRITICAL FIX: Use absolute URL with /fapi/v1/ prefix per API docs
      const url = `https://fapi.asterdex.com/fapi/v1/exchangeInfo`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Find the symbol and get its max leverage
      const symbolInfo = data.symbols.find((s: any) => s.symbol === binanceSymbol);
      
      if (symbolInfo && symbolInfo.maxLeverage) {
        const maxLeverage = parseInt(symbolInfo.maxLeverage);
        
        // Cache for 1 hour (3600 seconds)
        apiCache.set(cacheKey, maxLeverage, 3600);
        
        logger.debug(`[LEVERAGE] Max leverage for ${symbol}: ${maxLeverage}x`, { 
          context: 'AsterDex',
          data: { symbol, maxLeverage }
        });
        
        return maxLeverage;
      }
      
      // Default fallback
      logger.warn(`Could not find max leverage for ${symbol}, using default 20x`, { context: 'AsterDex' });
      return 20;
    } catch (error) {
      logger.error(`Failed to get max leverage for ${symbol}, using default 20x`, error, { context: 'AsterDex' });
      return 20; // Safe default
    }
  }

  /**
   * Set leverage for a specific symbol
   * MUST be called BEFORE placing an order with leverage
   */
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      // CRITICAL OPTIMIZATION: Use authenticatedRequest for 30-key support and proper rate limiting
      const normalizedSymbol = symbol.replace('/', '');
      const data = await this.authenticatedRequest<{ leverage?: number; maxNotionalValue?: number }>(
        'leverage',
        {
          symbol: normalizedSymbol,
          leverage: leverage,
          timestamp: Date.now()
        },
        'POST',
        15000 // 15 second timeout
      );
      
      // Success - leverage was set (data.leverage may or may not be returned by API)
      logger.info(`[OK] Leverage set to ${leverage}x for ${symbol}`, { 
        context: 'AsterDex', 
        data: { symbol, leverage, confirmed: data.leverage || leverage }
      });
      
      return true;
    } catch (error) {
      logger.error(`Error setting leverage for ${symbol}`, error, { context: 'AsterDex' });
      return false;
    }
  }

  /**
   * Place a market order (or simulate if simulation mode is enabled)
   * ENTERPRISE: Supports ML training data collection in simulation mode
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number = 1,
    reduceOnly: boolean = false,
    marketData?: any,
    aiDecision?: any
  ): Promise<AsterOrder | null> {
    // SIMULATION MODE: Use simulation service instead of real orders
    if (asterConfig.trading.simulationMode) {
      const { simulationService } = await import('@/services/trading/simulationService');
      const simulatedTrade = await simulationService.simulateMarketOrder(
        symbol,
        side,
        size,
        leverage,
        reduceOnly ? 'Position Close' : 'AI Agent Decision',
        marketData,
        aiDecision
      );
      
      if (simulatedTrade) {
        // Return a mock order response that matches AsterOrder interface
        return {
          orderId: simulatedTrade.id,
          symbol: simulatedTrade.symbol,
          side: simulatedTrade.side,
          type: 'MARKET',
          size: simulatedTrade.size,
          price: simulatedTrade.entryPrice,
          status: 'FILLED',
        };
      }
      return null;
    }

    this.validateOrderParams(symbol, side, size, leverage, reduceOnly);
    try {
      // CRITICAL: Set leverage BEFORE placing order (Aster DEX requirement)
      if (leverage > 1 && !reduceOnly) {
        const leverageSet = await this.setLeverage(symbol, leverage);
        if (!leverageSet) {
          logger.warn(`[WARN] Failed to set leverage, order may use default 1x`, { 
            context: 'AsterDex',
            data: { symbol, requestedLeverage: leverage }
          });
        }
      }
      
      // CRITICAL FIX: Round quantity to proper precision for the symbol
      const normalizedSymbol = symbol.replace('/', '');
      const precision = await this.getSymbolPrecision(normalizedSymbol);
      let roundedSize = size;
      
      if (precision) {
        // Round to the correct number of decimals
        const decimalPlaces = precision.quantityPrecision;
        roundedSize = Math.floor(size * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
        
        // Ensure it meets step size requirement
        const stepSize = parseFloat(precision.stepSize);
        if (stepSize > 0) {
          roundedSize = Math.floor(roundedSize / stepSize) * stepSize;
          // Round to avoid floating point issues
          roundedSize = parseFloat(roundedSize.toFixed(decimalPlaces));
        }
        
        logger.debug(`Quantity adjusted for precision`, {
          context: 'AsterDex',
          data: { 
            symbol: normalizedSymbol, 
            originalSize: size, 
            roundedSize, 
            precision: decimalPlaces,
            stepSize: precision.stepSize
          }
        });
      } else {
        // Fallback: conservative rounding based on symbol type
        if (normalizedSymbol.includes('BTC')) {
          roundedSize = Math.floor(size * 1000) / 1000; // 3 decimals for BTC
        } else if (normalizedSymbol.includes('ETH')) {
          roundedSize = Math.floor(size * 100) / 100;  // 2 decimals for ETH
        } else {
          roundedSize = Math.floor(size * 10) / 10;    // 1 decimal for others
        }
        logger.debug(`Using fallback precision for ${normalizedSymbol}`, {
          context: 'AsterDex',
          data: { originalSize: size, roundedSize }
        });
      }
      
      // Apply exchange filters (LOT_SIZE, MIN_NOTIONAL, PRICE_FILTER/PERCENT_PRICE)
      const filters = await this.getSymbolFilters(normalizedSymbol);
      const lotSize = filters?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
      const minNotionalFilter = filters?.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL');

      if (lotSize) {
        const minQty = parseFloat(lotSize.minQty || '0');
        const stepSize = parseFloat(lotSize.stepSize || '0');
        if (minQty > 0 && roundedSize < minQty) {
          // Round up to nearest step
          const step = stepSize > 0 ? stepSize : 0;
          if (step > 0) {
            const steps = Math.ceil(minQty / step);
            roundedSize = steps * step;
            roundedSize = parseFloat(roundedSize.toFixed(precision?.quantityPrecision || 4));
          }
          if (roundedSize < minQty) {
            throw new Error(`Order size below minQty (${minQty}) for ${normalizedSymbol}`);
          }
        }
      }

      // MIN_NOTIONAL check using latest price
      const refPrice = await this.getPrice(normalizedSymbol);
      if (refPrice > 0 && minNotionalFilter?.minNotional) {
        const minNotional = parseFloat(minNotionalFilter.minNotional);
        const notional = refPrice * roundedSize;
        if (notional < minNotional) {
          throw new Error(`Notional ${notional.toFixed(6)} below MIN_NOTIONAL ${minNotional} for ${normalizedSymbol}`);
        }
      }

      // Validate rounded size is not zero
      if (roundedSize <= 0) {
        throw new Error(`Rounded quantity is zero or negative. Original: ${size}, Rounded: ${roundedSize}. Position size too small for symbol precision.`);
      }
      
      // PERCENT_PRICE guard: ensure expected price is within allowed band around mark price
      // Per docs, use multiplierUp/down from exchangeInfo filters
      try {
        const percentPriceFilter = filters?.filters?.find((f: any) => f.filterType === 'PERCENT_PRICE');
        if (percentPriceFilter) {
          const multiplierUp = parseFloat(percentPriceFilter.multiplierUp || '0');
          const multiplierDown = parseFloat(percentPriceFilter.multiplierDown || '0');
          let mark = 0;

          // Prefer WS mark price from divergence (which includes markPrice)
          try {
            const wsMarkDiv = wsMarketService.getMarkPriceDivergence ? wsMarketService.getMarkPriceDivergence(normalizedSymbol) : null;
            if (wsMarkDiv && wsMarkDiv.markPrice > 0) mark = wsMarkDiv.markPrice;
          } catch {
            // ignore
          }

          // Fallback to REST premiumIndex if WS mark not available
          if (mark <= 0) {
            try {
              const url = `${this.baseUrl}/premiumIndex?symbol=${normalizedSymbol}`;
              const res = await fetch(url, { method: 'GET' });
              if (res.ok) {
                const data = await res.json();
                mark = parseFloat(data.markPrice) || 0;
              }
            } catch {
              // ignore
            }
          }

          if (mark > 0 && multiplierUp > 0 && multiplierDown > 0) {
            const high = mark * multiplierUp;
            const low = mark * multiplierDown;
            // FIX: Use refPrice which was already fetched for MIN_NOTIONAL check
            if (refPrice > 0 && (refPrice > high || refPrice < low)) {
              throw new Error(`Price deviates beyond PERCENT_PRICE limits (${low.toFixed(8)} - ${high.toFixed(8)})`);
            }
          }
        }
      } catch (ppErr) {
        // Non-fatal: log and continue (better to skip than place a rejectable order)
        logger.warn('Percent price guard check issue (continuing)', {
          context: 'AsterDex',
          data: { symbol, error: ppErr instanceof Error ? ppErr.message : String(ppErr) }
        });
      }

      // CRITICAL OPTIMIZATION: Use authenticatedRequest for 30-key support and proper rate limiting
      const orderParams: Record<string, string | number> = {
        symbol: normalizedSymbol,
        side,
        type: 'MARKET',
        quantity: roundedSize.toString(),
        timestamp: Date.now()
      };
      
      // Add reduceOnly flag for closing positions
      if (reduceOnly) {
        orderParams.reduceOnly = 'true';
      }
      
      // Use authenticatedRequest for 30-key support and rate limiting
      const data = await this.authenticatedRequest<AsterOrder>('order', orderParams, 'POST', 15000);
      const logType = reduceOnly ? '[CLOSE] POSITION CLOSED' : '[OK] REAL MARKET ORDER PLACED';
      logger.trade(logType, { context: 'AsterDex', data: { symbol, side, size, leverage, orderId: data.orderId, reduceOnly } });
      return data as AsterOrder;
    } catch (error) {
      logger.error(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, error, { context: 'AsterDex' });
      return null;
    }
  }

  /**
   * Place a limit order (or simulate if simulation mode is enabled)
   * WORLD-CLASS OPTIMIZATION: Uses 30-key system and authenticatedRequest
   * ENTERPRISE: Supports ML training data collection in simulation mode
   */
  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    price: number,
    leverage: number = 1,
    hidden: boolean = false, // DEPRECATED: Aster DEX does not support hidden/post-only orders
    marketData?: any,
    aiDecision?: any
  ): Promise<AsterOrder | null> {
    // SIMULATION MODE: Use simulation service instead of real orders
    if (asterConfig.trading.simulationMode) {
      const { simulationService } = await import('@/services/trading/simulationService');
      // In simulation, treat limit orders as market orders (instant fill at limit price)
      const simulatedTrade = await simulationService.simulateMarketOrder(
        symbol,
        side,
        size,
        leverage,
        'AI Agent Decision (Limit Order)',
        marketData,
        aiDecision
      );
      
      if (simulatedTrade) {
        // Adjust entry price to the limit price for simulation
        simulatedTrade.entryPrice = price;
        
        // Return a mock order response that matches AsterOrder interface
        return {
          orderId: simulatedTrade.id,
          symbol: simulatedTrade.symbol,
          side: simulatedTrade.side,
          type: 'LIMIT',
          size: simulatedTrade.size,
          price,
          status: 'FILLED',
        };
      }
      return null;
    }
    this.validateOrderParams(symbol, side, size, leverage);
    this.validatePrice(price);
    try {
      // CRITICAL: Set leverage BEFORE placing order (Aster DEX requirement)
      if (leverage > 1) {
        const leverageSet = await this.setLeverage(symbol, leverage);
        if (!leverageSet) {
          logger.warn(`[WARN] Failed to set leverage, order may use default 1x`, { 
            context: 'AsterDex',
            data: { symbol, requestedLeverage: leverage }
          });
        }
      }
      
      // WORLD-CLASS: Use authenticatedRequest for 30-key support and proper rate limiting
      const orderParams: Record<string, string | number> = {
        symbol: symbol.replace('/', ''), // Remove slash for API (e.g., BTC/USDT -> BTCUSDT)
        side,
        type: 'LIMIT',
        quantity: size.toString(),
        price: price.toString(),
        timeInForce: 'GTC', // Good Till Cancel (only valid option per Aster DEX API)
        timestamp: Date.now()
      };
      
      // CRITICAL FIX: Aster DEX API does NOT support POST_ONLY timeInForce
      // Valid values per API docs: GTC, IOC, FOK only
      // Hidden orders not supported - removed invalid POST_ONLY option
      
      // Use authenticatedRequest for 30-key support and rate limiting
      const data = await this.authenticatedRequest<AsterOrder>('order', orderParams, 'POST', 15000);
      
      logger.trade('[OK] REAL LIMIT ORDER PLACED', { 
        context: 'AsterDex', 
        data: { 
          symbol, 
          side, 
          size, 
          price, 
          leverage,
          orderId: data.orderId,
          hidden,
          method: '30-key authenticatedRequest'
        } 
      });
      
      return data as AsterOrder;
    } catch (error) {
      logger.error(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, error, { context: 'AsterDex' });
      return null;
    }
  }

  /**
   * Get funding rate + next funding time.
   * First tries websocket cache, then falls back to REST premiumIndex.
   */
  async getFundingRate(symbol: string): Promise<{ lastFundingRate: string; nextFundingTime: number }> {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();

    // WebSocket cache (freshest)
    try {
      const { wsMarketService } = await import('@/services/exchange/websocketMarketService');
      const markMeta = wsMarketService.getMarkPriceMeta(symbol);
      if (markMeta && (markMeta as any).nextFundingTime !== undefined && (markMeta as any).fundingRate !== undefined) {
        return {
          lastFundingRate: ((markMeta as any).fundingRate ?? 0).toString(),
          nextFundingTime: (markMeta as any).nextFundingTime ?? Date.now() + 8 * 60 * 60 * 1000
        };
      }
    } catch {
      // ignore and fall back to REST
    }

    // REST with caching
    const cacheKey = `funding:${normalizedSymbol}`;
    const cached = apiCache.get<{ lastFundingRate: string; nextFundingTime: number }>(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}/premiumIndex?symbol=${normalizedSymbol}`;
    const response = await this.rateLimitedPublicRequest(async () => {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to fetch funding rate: ${res.status} ${res.statusText}`);
      return res.json();
    });

    const result = {
      lastFundingRate: response.lastFundingRate?.toString?.() ?? '0',
      nextFundingTime: Number(response.nextFundingTime) || Date.now() + 8 * 60 * 60 * 1000
    };

    apiCache.set(cacheKey, result, apiCache.getTTL('PRICE') ?? 60);
    return result;
  }

  /**
   * Get open positions (REAL - authenticated via server-side API)
   * Uses request deduplication AND caching to prevent concurrent identical requests
   * CACHED: 10 seconds
   */
  async getPositions(bustCache: boolean = false): Promise<AsterPosition[]> {
    const requestKey = 'getPositions';
    const cacheKey = 'positions:all';
    
    // CACHE BUSTING: Allow forced refresh after position operations
    if (bustCache) {
      apiCache.invalidate(cacheKey);
      logger.debug('[CACHE] Position cache busted - forcing fresh fetch', { context: 'AsterDex' });
    }
    
    // Check cache first
    const cachedPositions = apiCache.get<AsterPosition[]>(cacheKey);
    if (cachedPositions != null) {
      return cachedPositions;
    }
    
    // If a request is already pending, return that promise instead of making a new request
    if (this.pendingRequests.has(requestKey)) {
      logger.debug('[DEDUP] Deduplicating concurrent getPositions request', { context: 'AsterDex' });
      return this.pendingRequests.get(requestKey)!;
    }
    
    const requestPromise = (async () => {
      try {
        // CRITICAL OPTIMIZATION: Use authenticatedRequest for 30-key support and proper rate limiting
        const data = await this.authenticatedRequest<Array<any>>('positionRisk', { timestamp: Date.now() }, 'GET', 15000);
        
        // Filter only positions with non-zero size
        const activePositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
        
        // Transform Aster API response to our format
        // CRITICAL: Include markPrice for accurate P&L% calculation
        const positions: AsterPosition[] = activePositions.map((pos: any) => ({
          symbol: pos.symbol.replace('USDT', '/USDT'),
          side: parseFloat(pos.positionAmt) > 0 ? 'LONG' as const : 'SHORT' as const,
          size: Math.abs(parseFloat(pos.positionAmt)),
          entryPrice: parseFloat(pos.entryPrice),
          markPrice: parseFloat(pos.markPrice) || parseFloat(pos.entryPrice), // Current market price
          leverage: parseInt(pos.leverage),
          unrealizedPnl: parseFloat(pos.unRealizedProfit),
        }));
        
        logger.info(`[DATA] REAL Aster Positions: ${positions.length} open`, {
          context: 'AsterDex',
          data: { count: positions.length, positions: positions.map(p => ({ symbol: p.symbol, side: p.side, pnl: p.unrealizedPnl })) },
        });
        
        // Cache for 20 seconds (matches apiCache.TTL.POSITIONS from recent optimization)
        apiCache.set(cacheKey, positions, apiCache.getTTL('POSITIONS'));
        
        return positions;
      } catch (error) {
        logger.error('Failed to get real positions', error, { context: 'AsterDex' });
        return []; // Fallback to empty
      } finally {
        // Remove from pending requests map when done
        this.pendingRequests.delete(requestKey);
      }
    })();
    
    // Store the promise so concurrent requests can use it
    this.pendingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Close a position
   */
  async closePosition(symbol: string): Promise<boolean> {
    try {
      if (!symbol || typeof symbol !== 'string') {
        throw new Error(ERROR_MESSAGES.INVALID_SYMBOL);
      }

      logger.info(`Closing position: ${symbol}`, { context: 'AsterDex' });

      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/asterdex/position/close`, {
        method: 'POST',
        body: JSON.stringify({ symbol }),
      });
      const data = await response.json();
      logger.trade('Closed real position', { context: 'AsterDex', data });
      return data.success;
    } catch (error) {
      logger.error(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, error, { context: 'AsterDex' });
      return false;
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(limit: number = 50): Promise<AsterTrade[]> {
    try {
      const response = await fetch(`/api/asterdex/trades?limit=${limit}`);
      const data = await response.json();
      return data as AsterTrade[];
    } catch (error) {
      logger.error('Failed to get real trade history', error, { context: 'AsterDex' });
      return [];
    }
  }

  /**
   * Get account balance (REAL - authenticated via server-side API)
   * Uses request deduplication AND caching to prevent concurrent identical requests
   * CACHED: 15 seconds
   * OPTIMIZED: Checks WebSocket user data stream cache first for real-time updates
   */
  async getBalance(): Promise<number> {
    // SIMULATION MODE: Return simulation account value so chart/balance APIs never show 0
    if (asterConfig.trading.simulationMode) {
      try {
        const { simulationService } = await import('@/services/trading/simulationService');
        return simulationService.getAccountValue();
      } catch (e) {
        logger.debug('Simulation getAccountValue failed, using initial balance', {
          context: 'AsterDex',
          error: e instanceof Error ? e.message : String(e),
        });
        return asterConfig.trading.simulationInitialBalance ?? 1000;
      }
    }

    const requestKey = 'getBalance';
    const cacheKey = 'balance:account';
    
    // CRITICAL: Check WebSocket user data stream cache first (real-time updates)
    // Per Aster DEX API docs, user data stream provides ACCOUNT_UPDATE events
    try {
      const { wsMarketService } = await import('@/services/exchange/websocketMarketService');
      const wsBalance = wsMarketService.getCachedBalance();
      if (wsBalance && (Date.now() - wsBalance.timestamp) < 60000) {
        // Use WebSocket balance if it's less than 60 seconds old
        logger.debug('Using WebSocket-cached balance', {
          context: 'AsterDex',
          data: { balance: wsBalance.balance.toFixed(2), age: Date.now() - wsBalance.timestamp }
        });
        // Update API cache with WebSocket value
        apiCache.set(cacheKey, wsBalance.balance, 15);
        return wsBalance.balance;
      }
    } catch (error) {
      // Non-critical - fall back to REST API
      logger.debug('WebSocket balance cache unavailable, using REST API', {
        context: 'AsterDex',
        data: { error: error instanceof Error ? error.message : String(error) }
      });
    }
    
    // Check API cache second
    const cachedBalance = apiCache.get<number>(cacheKey);
    if (cachedBalance != null) {
      return cachedBalance;
    }
    
    // If a request is already pending, return that promise instead of making a new request
    if (this.pendingRequests.has(requestKey)) {
      logger.debug('[DEDUP] Deduplicating concurrent getBalance request', { 
        context: 'AsterDex',
        data: { requestKey, message: 'Reusing pending request to avoid duplicate API call' }
      });
      return this.pendingRequests.get(requestKey)!;
    }
    
    const requestPromise = (async () => {
      try {
        // HIGH PRIORITY FIX: Add retry logic with exponential backoff
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Exponential backoff: 1s, 2s, 4s
              const delay = Math.pow(2, attempt - 1) * 1000;
              logger.debug(`Retrying getBalance request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`, {
                context: 'AsterDex'
              });
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // CRITICAL FIX: Call Aster DEX API directly, NOT the Next.js API route!
            // The Next.js route returns transformed data, but we need raw Aster DEX format
            // Use authenticatedRequest which uses 30-key pool automatically
            const data = await this.authenticatedRequest<Record<string, any>>('account', {}, 'GET', 30000);
            
            // HIGH PRIORITY FIX: Add type validation for API response
            if (!data || typeof data !== 'object') {
              throw new Error('Invalid API response format - expected object');
            }
            
            // Validate required fields exist
            if (typeof data.totalMarginBalance !== 'string' && typeof data.totalMarginBalance !== 'number') {
              logger.warn('Missing totalMarginBalance in API response', {
                context: 'AsterDex',
                data: { responseKeys: Object.keys(data) }
              });
            }
        
            // Parse ALL balance fields from Aster DEX API
            const totalMarginBalance = parseFloat(data.totalMarginBalance || '0');
            const totalWalletBalance = parseFloat(data.totalWalletBalance || '0');
            const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || '0');
            const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || '0');
            const availableBalance = parseFloat(data.availableBalance || '0');
            
            // CORRECT FORMULA: Total Account Equity = Available Balance + Position Margin
            // This matches what Aster DEX shows as the account value
            const totalAccountEquity = availableBalance + totalPositionInitialMargin;
            
            logger.info(`[BALANCE] Aster Account Equity: $${totalAccountEquity.toFixed(2)}`, {
              context: 'AsterDex',
              data: { 
                totalAccountEquity,
                availableBalance,
                totalPositionInitialMargin,
                totalUnrealizedProfit,
              },
            });
            
            // Use the correct total account equity
            const balance = totalAccountEquity;
            
            // Cache for 15 seconds
            apiCache.set(cacheKey, balance, apiCache.getTTL('BALANCE'));
            
            return balance;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Log retry attempt
            if (attempt < maxRetries - 1) {
              logger.warn(`getBalance request failed (attempt ${attempt + 1}/${maxRetries})`, {
                context: 'AsterDex',
                data: { attempt: attempt + 1, maxRetries, error: lastError?.message }
              });
            } else {
              // Final attempt failed
              logger.error('Failed to get real balance after all retries', lastError, { 
                context: 'AsterDex',
                data: { attempts: maxRetries }
              });
            }
          }
        }
        
        // If we get here, all retries failed
        return 100; // Fallback to initial capital
      } finally {
        // Remove from pending requests map when done
        this.pendingRequests.delete(requestKey);
      }
    })();
    
    // Store the promise so concurrent requests can use it
    this.pendingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Disconnect WebSocket
   */
  /**
   * Disconnect WebSocket and clean up resources
   * @param force - Force disconnect even if shouldStayConnected is true
   */
  disconnect(force: boolean = false) {
    // If we should stay connected and not forcing disconnect, ignore this call
    // This prevents React StrictMode from prematurely closing the connection
    if (this.shouldStayConnected && !force) {
      logger.debug('Ignoring disconnect call - connection should stay alive', { context: 'AsterDex' });
      return;
    }

    // Mark that we should not stay connected anymore
    this.shouldStayConnected = false;

    // Prevent reconnection attempts
    this.reconnectAttempts = this.maxReconnectAttempts;

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close WebSocket if connected
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      logger.info('✓ WebSocket disconnected', { context: 'AsterDex' });
    }

    // Cleanup complete - no simulation intervals (system uses real data only)

    this.isConnecting = false;
  }

  private startPollingFallback(onMessage: (data: WebSocketMessage) => void) {
    setInterval(async () => {
      const price = await this.getPrice('BTC/USDT');
      onMessage({
        type: 'ticker',
        data: { symbol: 'BTC/USDT', price },
      });
    }, 5000); // Poll every 5s
  }

  async allocateInitialCapital(modelName: string, amount: number, symbol: string): Promise<boolean> {
    try {
      const price = await this.getPrice(symbol);
      if (price <= 0) throw new Error('Invalid price for allocation');

      const size = amount / price; // Calculate size based on current price
      this.validateOrderParams(symbol, 'BUY', size, 1);

      const order = await this.placeMarketOrder(symbol, 'BUY', size, 1);
      if (!order) throw new Error('Allocation failed');

      logger.trade(`${modelName} allocated initial capital`, { 
        context: 'AsterDex',
        data: { amount, symbol, size, orderId: order.orderId }
      });
      return true;
    } catch (error) {
      logger.error('Failed to allocate initial capital', error, { context: 'AsterDex' });
      return false;
    }
  }

  /**
   * Get Position ADL Quantile Estimation
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns ADL quantile (0-1) - higher = more likely to be liquidated
   * CRITICAL for risk management: Avoid positions with high ADL quantile
   */
  async getADLQuantile(symbol: string): Promise<{
    symbol: string;
    adlQuantile: number; // 0-1, higher = more liquidation risk
    longCount: number;
    shortCount: number;
  } | null> {
    try {
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const cacheKey = `adlQuantile:${normalizedSymbol}`;
      
      // Cache for 30 seconds (ADL changes frequently)
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const data = await this.authenticatedRequest<{
        symbol: string;
        adlQuantile: number;
        longCount: number;
        shortCount: number;
      }>('adlQuantile', { symbol: normalizedSymbol }, 'GET', 10000);
      
      // Cache for 30 seconds
      apiCache.set(cacheKey, data, 30);
      
      logger.debug('ADL Quantile fetched', {
        context: 'AsterDex',
        data: { symbol, adlQuantile: data.adlQuantile, longCount: data.longCount, shortCount: data.shortCount }
      });
      
      return data;
    } catch (error) {
      logger.warn('Failed to fetch ADL quantile', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: { symbol }
      });
      return null;
    }
  }

  /**
   * Get Notional and Leverage Brackets
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns leverage brackets for optimal position sizing
   * CRITICAL for position sizing: Ensures positions fit within account notional limits
   */
  async getLeverageBracket(symbol?: string): Promise<{
    symbol: string;
    brackets: Array<{
      bracket: number;
      initialLeverage: number;
      notionalCap: number;
      notionalFloor: number;
      maintMarginRatio: number;
    }>;
  } | null> {
    try {
      const cacheKey = symbol 
        ? `leverageBracket:${symbol.replace('/', '').toUpperCase()}`
        : 'leverageBracket:all';
      
      // Cache for 1 hour (brackets don't change often)
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const params: Record<string, string> = {};
      if (symbol) {
        params.symbol = symbol.replace('/', '').toUpperCase();
      }
      
      const data = await this.authenticatedRequest<{
        symbol: string;
        brackets: Array<{
          bracket: number;
          initialLeverage: number;
          notionalCap: number;
          notionalFloor: number;
          maintMarginRatio: number;
        }>;
      }>('leverageBracket', params, 'GET', 10000);
      
      // Cache for 1 hour
      apiCache.set(cacheKey, data, 3600);
      
      logger.debug('Leverage bracket fetched', {
        context: 'AsterDex',
        data: { symbol: symbol || 'all', bracketCount: data.brackets?.length || 0 }
      });
      
      return data;
    } catch (error) {
      logger.warn('Failed to fetch leverage bracket', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: { symbol: symbol || 'all' }
      });
      return null;
    }
  }

  /**
   * Get User Commission Rate
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns actual commission rates for accurate PnL calculation
   */
  async getCommissionRate(symbol: string): Promise<{
    symbol: string;
    makerCommissionRate: string;
    takerCommissionRate: string;
  } | null> {
    try {
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const cacheKey = `commissionRate:${normalizedSymbol}`;
      
      // Cache for 1 hour (commission rates don't change often)
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const data = await this.authenticatedRequest<{
        symbol: string;
        makerCommissionRate: string;
        takerCommissionRate: string;
      }>('commissionRate', { symbol: normalizedSymbol }, 'GET', 10000);
      
      // Cache for 1 hour
      apiCache.set(cacheKey, data, 3600);
      
      logger.debug('Commission rate fetched', {
        context: 'AsterDex',
        data: { symbol, maker: data.makerCommissionRate, taker: data.takerCommissionRate }
      });
      
      return data;
    } catch (error) {
      logger.warn('Failed to fetch commission rate', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: { symbol }
      });
      return null;
    }
  }

  /**
   * Query Order Status
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns order status after placement
   */
  async queryOrder(symbol: string, orderId: string): Promise<AsterOrder | null> {
    try {
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const data = await this.authenticatedRequest<AsterOrder>('order', {
        symbol: normalizedSymbol,
        orderId
      }, 'GET', 10000);
      
      return data;
    } catch (error) {
      logger.error('Failed to query order', error, {
        context: 'AsterDex',
        data: { symbol, orderId }
      });
      return null;
    }
  }

  /**
   * Get User's Force Orders (Liquidations)
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns liquidation history for learning and risk management
   */
  async getForceOrders(params?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Array<{
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    timeInForce: string;
    quantity: string;
    price: string;
    avgPrice: string;
    orderStatus: string;
    lastFilledQty: string;
    executedQty: string;
    orderId: string;
    time: number;
  }>> {
    try {
      const requestParams: Record<string, string | number> = {};
      if (params?.symbol) {
        requestParams.symbol = params.symbol.replace('/', '').toUpperCase();
      }
      if (params?.startTime) {
        requestParams.startTime = params.startTime;
      }
      if (params?.endTime) {
        requestParams.endTime = params.endTime;
      }
      if (params?.limit) {
        requestParams.limit = params.limit;
      }
      
      const data = await this.authenticatedRequest<any>('forceOrders', requestParams, 'GET', 15000);
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      logger.warn('Failed to fetch force orders', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: params
      });
      return [];
    }
  }

  /**
   * Get Income History
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns comprehensive income history (fees, funding, realized PnL)
   */
  async getIncomeHistory(params?: {
    symbol?: string;
    incomeType?: 'TRANSFER' | 'WELCOME_BONUS' | 'REALIZED_PNL' | 'FUNDING_FEE' | 'COMMISSION' | 'INSURANCE_CLEAR';
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Array<{
    symbol: string;
    incomeType: string;
    income: string;
    asset: string;
    time: number;
    tranId: string;
    info: string;
  }>> {
    try {
      const requestParams: Record<string, string | number> = {};
      if (params?.symbol) {
        requestParams.symbol = params.symbol.replace('/', '').toUpperCase();
      }
      if (params?.incomeType) {
        requestParams.incomeType = params.incomeType;
      }
      if (params?.startTime) {
        requestParams.startTime = params.startTime;
      }
      if (params?.endTime) {
        requestParams.endTime = params.endTime;
      }
      if (params?.limit) {
        requestParams.limit = params.limit;
      }
      
      const data = await this.authenticatedRequest<any>('income', requestParams, 'GET', 15000);
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      logger.warn('Failed to fetch income history', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: params
      });
      return [];
    }
  }

  /**
   * Place Multiple Orders (Batch Orders)
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Places multiple orders in a single request for faster portfolio rebalancing
   */
  async placeBatchOrders(orders: Array<{
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: number;
    price?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    reduceOnly?: boolean;
  }>): Promise<Array<AsterOrder | { code: number; msg: string }>> {
    try {
      if (orders.length === 0) {
        throw new Error('No orders provided for batch placement');
      }
      
      if (orders.length > 5) {
        logger.warn('Batch order size exceeds recommended limit (5), may be rejected by exchange', {
          context: 'AsterDex',
          data: { orderCount: orders.length }
        });
      }
      
      const normalizedOrders = orders.map(order => {
        const normalized: Record<string, string> = {
          symbol: order.symbol.replace('/', '').toUpperCase(),
          side: order.side,
          type: order.type,
          quantity: order.quantity.toString()
        };
        
        if (order.price) {
          normalized.price = order.price.toString();
        }
        
        if (order.type === 'LIMIT') {
          normalized.timeInForce = order.timeInForce || 'GTC';
        }
        
        if (order.reduceOnly) {
          normalized.reduceOnly = order.reduceOnly.toString();
        }
        
        return normalized;
      });
      
      const data = await this.authenticatedRequest<any>('batchOrders', {
        batchOrders: JSON.stringify(normalizedOrders)
      }, 'POST', 20000);
      
      // API returns array of order results or errors
      const results = Array.isArray(data) ? data : [data];
      
      logger.info('Batch orders placed', {
        context: 'AsterDex',
        data: {
          orderCount: orders.length,
          successCount: results.filter((r: any) => r.orderId).length,
          errorCount: results.filter((r: any) => r.code).length
        }
      });
      
      return results;
    } catch (error) {
      logger.error('Failed to place batch orders', error, {
        context: 'AsterDex',
        data: { orderCount: orders.length }
      });
      throw error;
    }
  }

  /**
   * Auto-Cancel All Open Orders (Countdown Cancel)
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Automatically cancels all open orders after countdown period
   */
  async countdownCancelAll(symbol: string, countdownTime: number): Promise<{
    symbol: string;
    countdownTime: number;
  }> {
    try {
      if (countdownTime < 0 || countdownTime > 60000) {
        throw new Error('Countdown time must be between 0 and 60000 milliseconds');
      }
      
      const normalizedSymbol = symbol.replace('/', '').toUpperCase();
      const data = await this.authenticatedRequest<{
        symbol: string;
        countdownTime: number;
      }>('countdownCancelAll', {
        symbol: normalizedSymbol,
        countdownTime
      }, 'POST', 10000);
      
      logger.info('Countdown cancel all orders initiated', {
        context: 'AsterDex',
        data: { symbol, countdownTime: `${countdownTime}ms` }
      });
      
      return data;
    } catch (error) {
      logger.error('Failed to initiate countdown cancel all', error, {
        context: 'AsterDex',
        data: { symbol, countdownTime }
      });
      throw error;
    }
  }

  /**
   * Get Position Side Mode
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns whether account is in HEDGE mode (dual side) or ONE_WAY mode
   */
  async getPositionMode(): Promise<{ dualSidePosition: boolean }> {
    try {
      const cacheKey = 'positionMode';
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const data = await this.authenticatedRequest<{ dualSidePosition: string }>('positionSide/dual', {}, 'GET', 10000);
      
      const result = { dualSidePosition: data.dualSidePosition === 'true' };
      
      // Cache for 5 minutes (position mode doesn't change often)
      apiCache.set(cacheKey, result, 300);
      
      return result;
    } catch (error) {
      logger.warn('Failed to fetch position mode', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error)
      });
      // Default to ONE_WAY mode
      return { dualSidePosition: false };
    }
  }

  /**
   * Set Position Side Mode
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Sets account to HEDGE mode (dual side) or ONE_WAY mode
   */
  async setPositionMode(dualSide: boolean): Promise<boolean> {
    try {
      await this.authenticatedRequest('positionSide/dual', {
        dualSidePosition: dualSide.toString()
      }, 'POST', 10000);
      
      // Clear cache
      apiCache.invalidate('positionMode');
      
      logger.info('Position mode updated', {
        context: 'AsterDex',
        data: { dualSidePosition: dualSide, mode: dualSide ? 'HEDGE' : 'ONE_WAY' }
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to set position mode', error, {
        context: 'AsterDex',
        data: { dualSidePosition: dualSide }
      });
      throw error;
    }
  }

  /**
   * Get Multi-Assets Margin Mode
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns whether account is in multi-assets margin mode
   */
  async getMultiAssetsMode(): Promise<{ multiAssetsMargin: boolean }> {
    try {
      const cacheKey = 'multiAssetsMode';
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const data = await this.authenticatedRequest<{ multiAssetsMargin: string }>('multiAssetsMargin', {}, 'GET', 10000);
      
      const result = { multiAssetsMargin: data.multiAssetsMargin === 'true' };
      
      // Cache for 5 minutes
      apiCache.set(cacheKey, result, 300);
      
      return result;
    } catch (error) {
      logger.warn('Failed to fetch multi-assets mode', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error)
      });
      // Default to single asset mode
      return { multiAssetsMargin: false };
    }
  }

  /**
   * Set Multi-Assets Margin Mode
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Sets account to multi-assets margin mode
   */
  async setMultiAssetsMode(enabled: boolean): Promise<boolean> {
    try {
      await this.authenticatedRequest('multiAssetsMargin', {
        multiAssetsMargin: enabled.toString()
      }, 'POST', 10000);
      
      // Clear cache
      apiCache.invalidate('multiAssetsMode');
      
      logger.info('Multi-assets margin mode updated', {
        context: 'AsterDex',
        data: { multiAssetsMargin: enabled }
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to set multi-assets margin mode', error, {
        context: 'AsterDex',
        data: { multiAssetsMargin: enabled }
      });
      throw error;
    }
  }

  /**
   * Get Funding Rate History
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns historical funding rates for analysis
   */
  async getFundingRateHistory(params?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Array<{
    symbol: string;
    fundingRate: string;
    fundingTime: number;
    markPrice: string;
  }>> {
    try {
      const requestParams: Record<string, string | number> = {};
      if (params?.symbol) {
        requestParams.symbol = params.symbol.replace('/', '').toUpperCase();
      }
      if (params?.startTime) {
        requestParams.startTime = params.startTime;
      }
      if (params?.endTime) {
        requestParams.endTime = params.endTime;
      }
      if (params?.limit) {
        requestParams.limit = params.limit;
      }
      
      const data = await this.rateLimitedPublicRequest(async () => {
        const url = `${this.baseUrl}/fundingRate${Object.keys(requestParams).length > 0 ? '?' + new URLSearchParams(requestParams as any).toString() : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      });
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      logger.warn('Failed to fetch funding rate history', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: params
      });
      return [];
    }
  }

  /**
   * Get Funding Rate Config
   * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
   * Returns funding rate configuration
   */
  async getFundingInfo(symbol?: string): Promise<{
    symbol: string;
    fundingIntervalHours: number;
  } | null> {
    try {
      const requestParams: Record<string, string> = {};
      if (symbol) {
        requestParams.symbol = symbol.replace('/', '').toUpperCase();
      }
      
      const cacheKey = symbol ? `fundingInfo:${symbol.replace('/', '').toUpperCase()}` : 'fundingInfo:all';
      const cached = apiCache.get<any>(cacheKey);
      if (cached) return cached;
      
      const data = await this.rateLimitedPublicRequest(async () => {
        const url = `${this.baseUrl}/fundingInfo${Object.keys(requestParams).length > 0 ? '?' + new URLSearchParams(requestParams).toString() : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      });
      
      // Cache for 1 hour (funding config doesn't change often)
      apiCache.set(cacheKey, data, 3600);
      
      return data;
    } catch (error) {
      logger.warn('Failed to fetch funding info', {
        context: 'AsterDex',
        error: error instanceof Error ? error.message : String(error),
        data: { symbol: symbol || 'all' }
      });
      return null;
    }
  }
}

// Export singleton instance using globalThis pattern for Next.js compatibility
const globalForAsterDex = globalThis as typeof globalThis & {
  __asterDexService?: AsterDexService;
};

if (!globalForAsterDex.__asterDexService) {
  globalForAsterDex.__asterDexService = new AsterDexService();
}

export const asterDexService = globalForAsterDex.__asterDexService;
export default asterDexService;

