import { ethers } from 'ethers';
import { logger } from '@/lib/logger';
import { TRADING_CONSTANTS, ERROR_MESSAGES } from '@/constants';
import { TRADING_THRESHOLDS } from '@/constants/tradingConstants';
import type { WebSocketMessage } from '@/types/trading';
import { apiCache } from './apiCache';
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
  private baseUrl: string = 'https://fapi.asterdex.com'; // Real Aster DEX API URL
  private WS_BASE_URL: string = 'wss://fstream.asterdex.com/stream'; // Real WebSocket URL
  private apiKey: string | null = null; // Fallback for backwards compatibility
  private secretKey: string | null = null; // Fallback for backwards compatibility
  // REMOVED: simulationInterval - No simulation mode, only real API data
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;
  private ws: WebSocket | null = null;
  private useMultiKey: boolean = false; // Enable multi-key mode
  
  // Rate limiting strategy - NOW SUPPORTS 30 KEYS = 600 req/sec!
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_DELAY = 50; // Still applies per-key
  private readonly BATCH_SIZE = 30; // Increased from 5 to 30 (one per key!)
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private lastSuccessfulRequest: number = 0;
  private readonly MAX_REQUESTS_PER_MINUTE = 36000; // 30 keys × 1200 = 36,000 req/min!
  
  // Request deduplication to prevent concurrent identical requests
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
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
        totalCapacity: this.useMultiKey ? `${keyStats.totalCapacityRPS} req/sec` : '20 req/sec',
        environment: typeof window !== 'undefined' ? 'client' : 'server',
        note: this.useMultiKey ? '30-KEY MODE: 600 req/sec capacity!' : 'Single key mode'
      },
    });
  }

  /**
   * Rate-limited request wrapper
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

      // Add to queue
      this.requestQueue.push(wrappedRequest);
      
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
      
      // Execute batch in parallel (they already have internal delays)
      await Promise.all(batch.map(fn => fn().catch(err => {
        logger.error('Request in queue failed', err, { context: 'AsterDex' });
      })));

        // Small delay between batches
        if (this.requestQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms between batches (safe and responsive)
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

      logger.info('✓ Connected to Aster DEX', { context: 'AsterDex' });
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

      logger.info('🔗 WebSocket Configuration', {
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
        logger.info('🔗 Using REAL Aster DEX WebSocket', { 
          context: 'AsterDex',
          data: { streams: configuredStreams },
        });
        this.connectRealWebSocket(onMessage, configuredStreams);
        return;
      }

      // REAL MODE ONLY: Require API key for WebSocket connection
      logger.error('❌ Cannot connect WebSocket: API key required', undefined, { 
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
        logger.info('✓ WebSocket connected to Aster DEX', {
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
          logger.info('🔄 Switching to HTTP polling fallback (real API calls)', { context: 'AsterDex' });
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
    if (cachedPrice !== null) {
      return cachedPrice;
    }
    
    return this.rateLimitedRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `${this.baseUrl}/ticker/price?symbol=${binanceSymbol}`;
        
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
    
    // Check cache first (30-second cache to prevent rate limit abuse)
    // OPTIMIZED: Increased from 2s to 30s to reduce 429 errors
    const cached = apiCache.get<any>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    return this.rateLimitedRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `${this.baseUrl}/depth?symbol=${binanceSymbol}&limit=${limit}`;
        
        // Add timeout protection
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
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
          
          // Cache for 30 seconds (prevents rate limit abuse)
          // OPTIMIZED: Increased from 2s to 30s to reduce 429 errors
          apiCache.set(cacheKey, orderBookData, 30000);
          
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
   * Get detailed 24h ticker data for a symbol (using public API - no auth required)
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
    if (cachedTicker !== null) {
      return cachedTicker;
    }
    
    return this.rateLimitedRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `${this.baseUrl}/ticker/24hr?symbol=${binanceSymbol}`;
        
        const response = await fetch(url);
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
      } catch (error) {
        logger.error('Failed to get ticker data', error, { context: 'AsterDex', data: { symbol } });
        return null;
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
    if (cachedKlines !== null) {
      return cachedKlines;
    }
    
    return this.rateLimitedRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `${this.baseUrl}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
        
        const response = await fetch(url);
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
        
        // Cache for 5-15 seconds depending on interval (ultra-fast for 1m)
        // CRITICAL FIX: Increase cache time to prevent 429 errors
        // Klines data doesn't need to be super fresh - 60-120 seconds is fine for trading decisions
        const cacheTTL = interval === '1m' ? 60 : (['3m', '5m'].includes(interval) ? 90 : 120);
        apiCache.set(cacheKey, klines, cacheTTL * 1000); // Convert to milliseconds
        
        return klines;
      } catch (error) {
        logger.error(`Failed to get klines for ${symbol}`, error, { context: 'AsterDex' });
        return null;
      }
    });
  }

  /**
   * Get aggregated trades for a symbol (buy/sell volume analysis)
   * CACHED: 10 seconds
   */
  async getAggregatedTrades(symbol: string, limit: number = 500): Promise<{
    buyVolume: number;
    sellVolume: number;
    buySellRatio: number;
    totalTrades: number;
    avgPrice: number;
  } | null> {
    const cacheKey = `aggTrades:${symbol}:${limit}`;
    
    // Check cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    return this.rateLimitedRequest(async () => {
      try {
        // Convert BTC/USDT to BTCUSDT format
        const binanceSymbol = symbol.replace('/', '');
        const url = `${this.baseUrl}/fapi/v1/aggTrades?symbol=${binanceSymbol}&limit=${limit}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          // CRITICAL FIX: Handle 404 gracefully - symbol may not exist on Aster DEX
          // This is expected for some symbols and should not be logged as ERROR
          if (response.status === 404) {
            logger.debug(`Symbol ${symbol} not found on Aster DEX (404) - skipping aggregated trades`, {
              context: 'AsterDex',
              symbol
            });
            return null;
          }
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          return null;
        }
        
        // Calculate buy vs sell volume
        // maker=false means market buy (taker buy), maker=true means market sell (taker sell)
        let buyVolume = 0;
        let sellVolume = 0;
        let totalPrice = 0;
        
        data.forEach((trade: any) => {
          const qty = parseFloat(trade.q || trade.quantity || '0');
          const price = parseFloat(trade.p || trade.price || '0');
          
          totalPrice += price * qty;
          
          // maker=false = market buy (buyer was the taker)
          if (trade.m === false) {
            buyVolume += qty;
          } else {
            sellVolume += qty;
          }
        });
        
        const totalVolume = buyVolume + sellVolume;
        const buySellRatio = sellVolume > 0 ? buyVolume / sellVolume : 1.0;
        const avgPrice = totalVolume > 0 ? totalPrice / totalVolume : 0;
        
        const result = {
          buyVolume,
          sellVolume,
          buySellRatio,
          totalTrades: data.length,
          avgPrice
        };
        
        // Cache for 10 seconds
        apiCache.set(cacheKey, result, 10);
        
        return result;
      } catch (error) {
        // CRITICAL FIX: Only log as error if it's not a 404 (symbol not found)
        // 404 errors are expected for symbols that don't exist on Aster DEX
        const is404 = error instanceof Error && error.message.includes('404');
        if (is404) {
          logger.debug(`Symbol ${symbol} not found on Aster DEX - skipping aggregated trades`, {
            context: 'AsterDex',
            symbol
          });
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
      const url = `${this.baseUrl}/exchangeInfo`;
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
   * OPTIMIZED: Added timeout, caching, and proper error handling
   */
  async getExchangeInfo(): Promise<any> {
    // Check cache first (5 minute TTL - exchange info doesn't change often)
    const cacheKey = 'exchangeInfo:full';
    const cached = apiCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached exchange info', { context: 'AsterDex' });
      return cached;
    }

    try {
      // CRITICAL FIX: Use correct Aster DEX API base URL (without /fapi/v1 for public endpoints)
      const baseUrl = 'https://fapi.asterdex.com';
      const url = `${baseUrl}/fapi/v1/exchangeInfo`;
      
      logger.debug('Fetching exchange info from Aster DEX', { context: 'AsterDex', data: { url } });
      
      // Declare variables outside inner try block so they're accessible later
      let data: any;
      let tickerData: any = {};
      
      // Add 15-second timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
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
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
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
      
      // Cache for 5 minutes (exchange info doesn't change often)
      apiCache.set(cacheKey, result, 300000);
      
      return result;
    } catch (error) {
      logger.error('Failed to fetch exchange info', error, { context: 'AsterDex' });
      throw error;
    }
  }

  async getAllTradingPairs(): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/exchangeInfo`;
      
      logger.debug('Fetching all trading pairs from Aster DEX', { context: 'AsterDex', data: { url } });
      
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
      
      logger.info(`📊 Found ${usdtPairs.length} active USDT perpetual pairs on Aster DEX`, { 
        context: 'AsterDex',
        data: { count: usdtPairs.length, sample: usdtPairs.slice(0, 10) }
      });
      
      return usdtPairs;
    } catch (error) {
      logger.error('Failed to fetch trading pairs', error, { context: 'AsterDex' });
      throw error; // Re-throw to fail the operation
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
        keyId = key.id;
      } else {
        // Fallback to single key
        apiKey = this.apiKey || '';
        secretKey = this.secretKey || '';
      }
      
      try {
        // Build signed query
        const queryString = await buildSignedQuery({
          ...params,
          timestamp: Date.now(),
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
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { msg: errorText };
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
   * Map AsterDex error codes to meaningful messages
   * Reference: Binance Futures API error codes (AsterDex compatible)
   */
  private mapErrorCode(code: number, message: string): string {
    const errorMap: Record<number, string> = {
      '-1001': 'Disconnected from server',
      '-1002': 'Unauthorized request',
      '-1003': 'Too many requests',
      '-1004': 'Unexpected response format',
      '-1005': 'Invalid signature',
      '-1006': 'Invalid timestamp',
      '-1007': 'Invalid recvWindow',
      '-1008': 'Request timeout',
      '-1009': 'Unknown error occurred',
      '-1010': 'Invalid API key',
      '-1020': 'Unsupported operation',
      '-1021': 'Invalid timestamp',
      '-1022': 'Invalid signature',
      '-2010': 'New order rejected',
      '-2011': 'Cancel order rejected',
      '-2013': 'No such order',
      '-2014': 'API-key format invalid',
      '-2015': 'Invalid API-key, IP, or permissions',
      400: 'Bad request',
      401: 'Authentication failed',
      403: 'Forbidden',
      404: 'Not found',
      429: 'Rate limit exceeded',
      500: 'Internal server error',
    };
    
    return errorMap[code] || message || 'Unknown error';
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
      
      const url = `${this.baseUrl}/exchangeInfo`;
      
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
        
        logger.debug(`📊 Max leverage for ${symbol}: ${maxLeverage}x`, { 
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
      logger.info(`✅ Leverage set to ${leverage}x for ${symbol}`, { 
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
   * Place a market order
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number = 1,
    reduceOnly: boolean = false
  ): Promise<AsterOrder | null> {
    this.validateOrderParams(symbol, side, size, leverage, reduceOnly);
    try {
      // CRITICAL: Set leverage BEFORE placing order (Aster DEX requirement)
      if (leverage > 1 && !reduceOnly) {
        const leverageSet = await this.setLeverage(symbol, leverage);
        if (!leverageSet) {
          logger.warn(`⚠️ Failed to set leverage, order may use default 1x`, { 
            context: 'AsterDex',
            data: { symbol, requestedLeverage: leverage }
          });
        }
      }
      
      // CRITICAL OPTIMIZATION: Use authenticatedRequest for 30-key support and proper rate limiting
      const orderParams: Record<string, string | number> = {
        symbol: symbol.replace('/', ''), // Remove slash for API (e.g., BTC/USDT -> BTCUSDT)
        side,
        type: 'MARKET',
        quantity: size.toString(),
        timestamp: Date.now()
      };
      
      // Add reduceOnly flag for closing positions
      if (reduceOnly) {
        orderParams.reduceOnly = 'true';
      }
      
      // Use authenticatedRequest for 30-key support and rate limiting
      const data = await this.authenticatedRequest<AsterOrder>('order', orderParams, 'POST', 15000);
      const logType = reduceOnly ? '🔄 POSITION CLOSED' : '✅ REAL MARKET ORDER PLACED';
      logger.trade(logType, { context: 'AsterDex', data: { symbol, side, size, leverage, orderId: data.orderId, reduceOnly } });
      return data as AsterOrder;
    } catch (error) {
      logger.error(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, error, { context: 'AsterDex' });
      return null;
    }
  }

  /**
   * Place a limit order (including hidden orders)
   */
  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    price: number,
    leverage: number = 1,
    hidden: boolean = false
  ): Promise<AsterOrder | null> {
    this.validateOrderParams(symbol, side, size, leverage);
    this.validatePrice(price);
    try {
      const response = await fetch(this.getApiUrl('/api/aster/order'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, side, type: 'LIMIT', quantity: size, price, leverage, hidden }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Order failed: ${error}`);
      }
      
      const data = await response.json();
      logger.trade('✅ REAL LIMIT ORDER PLACED', { context: 'AsterDex', data: { symbol, side, size, price, orderId: data.orderId } });
      return data as AsterOrder;
    } catch (error) {
      logger.error(ERROR_MESSAGES.ORDER_EXECUTION_FAILED, error, { context: 'AsterDex' });
      return null;
    }
  }

  /**
   * Get open positions (REAL - authenticated via server-side API)
   * Uses request deduplication AND caching to prevent concurrent identical requests
   * CACHED: 10 seconds
   */
  async getPositions(bustCache: boolean = false): Promise<AsterPosition[]> {
    const requestKey = 'getPositions';
    const cacheKey = 'positions:all';
    
    // 🔥 CACHE BUSTING: Allow forced refresh after position operations
    if (bustCache) {
      apiCache.invalidate(cacheKey);
      logger.debug('💥 Position cache busted - forcing fresh fetch', { context: 'AsterDex' });
    }
    
    // Check cache first
    const cachedPositions = apiCache.get<AsterPosition[]>(cacheKey);
    if (cachedPositions !== null) {
      return cachedPositions;
    }
    
    // If a request is already pending, return that promise instead of making a new request
    if (this.pendingRequests.has(requestKey)) {
      logger.debug('⚠️ Deduplicating concurrent getPositions request', { context: 'AsterDex' });
      return this.pendingRequests.get(requestKey)!;
    }
    
    const requestPromise = (async () => {
      try {
        // CRITICAL OPTIMIZATION: Use authenticatedRequest for 30-key support and proper rate limiting
        const data = await this.authenticatedRequest<Array<any>>('positionRisk', { timestamp: Date.now() }, 'GET', 15000);
        
        // Filter only positions with non-zero size
        const activePositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
        
        // Transform Aster API response to our format
        const positions: AsterPosition[] = activePositions.map((pos: any) => ({
          symbol: pos.symbol.replace('USDT', '/USDT'),
          side: parseFloat(pos.positionAmt) > 0 ? 'LONG' as const : 'SHORT' as const,
          size: Math.abs(parseFloat(pos.positionAmt)),
          entryPrice: parseFloat(pos.entryPrice),
          leverage: parseInt(pos.leverage),
          unrealizedPnl: parseFloat(pos.unRealizedProfit),
        }));
        
        logger.info(`📊 REAL Aster Positions: ${positions.length} open`, {
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
   */
  async getBalance(): Promise<number> {
    const requestKey = 'getBalance';
    const cacheKey = 'balance:account';
    
    // Check cache first
    const cachedBalance = apiCache.get<number>(cacheKey);
    if (cachedBalance !== null) {
      return cachedBalance;
    }
    
    // If a request is already pending, return that promise instead of making a new request
    if (this.pendingRequests.has(requestKey)) {
      logger.debug('⚠️ Deduplicating concurrent getBalance request', { 
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
            const data = await this.authenticatedRequest('account', {}, 'GET', 30000);
            
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
        
            // Calculate TRUE account value using correct Aster DEX formula:
            // Total Account Equity = totalMarginBalance (this already includes unrealized P&L)
            const totalMarginBalance = parseFloat(data.totalMarginBalance || 0);
            const totalWalletBalance = parseFloat(data.totalWalletBalance || 0);
            const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || 0);
            const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || 0);
            
            // Account equity calculation:
            // If totalMarginBalance is negative/invalid, use availableBalance (actual trading balance)
            // Otherwise use totalMarginBalance (includes unrealized P&L)
            let balance = totalMarginBalance;
            
            // CRITICAL FIX: If margin balance is negative or invalid, use availableBalance
            if (balance <= 0 || isNaN(balance)) {
              const availableBalance = parseFloat(data.availableBalance || 0);
              if (availableBalance > 0 && !isNaN(availableBalance)) {
                balance = availableBalance; // Use available balance as account equity
                logger.info('Using availableBalance as account equity (totalMarginBalance was invalid)', {
                  context: 'AsterDex',
                  data: { availableBalance, totalMarginBalance }
                });
              } else {
                // Fallback: try wallet balance + unrealized P&L
                balance = totalWalletBalance + totalUnrealizedProfit;
                if (isNaN(balance) || balance <= 0) {
                  throw new Error('Invalid balance data from Aster API - all values are invalid');
                }
              }
            }
            
            logger.info(`💰 REAL Aster Account Value: $${balance.toFixed(2)}`, {
              context: 'AsterDex',
              data: { 
                totalAccountValue: balance,
                positionValue: totalPositionInitialMargin,
                unrealizedPnL: totalUnrealizedProfit,
                totalMarginBalance: totalMarginBalance,
                rawMarginBalance: data.totalMarginBalance,
              },
            });
            
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
}

// Export singleton instance
export const asterDexService = new AsterDexService();
export default asterDexService;

