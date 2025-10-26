import { ethers } from 'ethers';
import { logger } from '@/lib/logger';
import { TRADING_CONSTANTS, ERROR_MESSAGES } from '@/constants';
import type { WebSocketMessage } from '@/types/trading';
import { apiCache } from './apiCache';

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
  private baseUrl: string = 'https://api.asterdex.com'; // Placeholder URL
  private WS_BASE_URL: string = 'wss://fstream.asterdex.com/stream'; // Real WebSocket URL
  private apiKey: string | null = null;
  private secretKey: string | null = null;
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;
  private ws: WebSocket | null = null;
  
  // Rate limiting strategy (ASTER DEX OPTIMIZED - realistic limits)
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_DELAY = 50; // 50ms between requests = max 20 req/sec (aggressive but safe)
  private readonly BATCH_SIZE = 5; // Process 5 requests concurrently for faster parallel fetching
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private lastSuccessfulRequest: number = 0;
  private readonly MAX_REQUESTS_PER_MINUTE = 600; // Increased limit for faster throughput (still safe for most exchanges)
  
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
    
    // Load API credentials from environment variables
    if (typeof window !== 'undefined') {
      this.apiKey = process.env.NEXT_PUBLIC_ASTER_API_KEY || null;
      logger.info('🔄 Using Aster DEX API directly', {
        context: 'AsterDex',
        data: { 
          baseUrl: this.baseUrl,
          wsUrl: this.WS_BASE_URL,
          note: 'Real Aster DEX market data - no geo-restrictions'
        },
      });
    }
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

          // Log rate limit stats every 50 requests
          if (this.requestCount % 50 === 0) {
            const requestsPerSecond = this.requestCount / ((Date.now() - this.requestWindow) / 1000);
            logger.debug(`📊 Rate limit: ${this.requestCount} requests, ${requestsPerSecond.toFixed(1)} req/s`, {
              context: 'AsterDex'
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

      // DEVELOPMENT: Simulate WebSocket for demo purposes (with real-looking data)
      logger.info('🔗 Using SIMULATED WebSocket (no API key or env var not set)', { context: 'AsterDex' });
      this.startSimulationMode(onMessage);

    } catch (error) {
      logger.error('Failed to connect WebSocket', error, { context: 'AsterDex' });
    }
  }

  /**
   * Start WebSocket simulation mode (fallback)
   * @private
   */
  private startSimulationMode(onMessage: (data: WebSocketMessage) => void) {
    logger.info('✓ WebSocket simulation started (FALLBACK MODE - REALISTIC DATA)', { context: 'AsterDex' });
    
    // Realistic starting prices
    const basePrices: Record<string, number> = {
      'BTCUSDT': 67234.50,
      'ETHUSDT': 3456.78,
      'SOLUSDT': 182.45,
      'BNBUSDT': 412.33,
      'DOGEUSDT': 0.0842,
      'XRPUSDT': 0.5623,
    };
    
    // Simulate periodic price updates for ALL symbols
    const simulationInterval = setInterval(() => {
      if (typeof window === 'undefined') {
        clearInterval(simulationInterval);
        return;
      }

      // Simulate trades for all symbols
      Object.entries(basePrices).forEach(([symbol, basePrice]) => {
        // Random price fluctuation (-0.5% to +0.5%)
        const priceChange = (Math.random() - 0.5) * 0.01 * basePrice;
        const currentPrice = basePrice + priceChange;
        basePrices[symbol] = currentPrice; // Update base price
        
        const mockTradeData: WebSocketMessage = {
          type: 'trade',
          data: {
            symbol: symbol,
            price: currentPrice,
            quantity: Math.random() * 0.5,
            timestamp: Date.now(),
          },
        };
        
        onMessage(mockTradeData);
        
        // Also send ticker update every other cycle
        if (Math.random() > 0.5) {
          const mockTickerData: WebSocketMessage = {
            type: 'ticker',
            data: {
              symbol: symbol,
              price: currentPrice,
              priceChangePercent: (priceChange / basePrice) * 100,
              volume: Math.random() * 1000000,
              timestamp: Date.now(),
            },
          };
          
          onMessage(mockTickerData);
        }
      });

      logger.debug('📊 Simulated price update sent for all symbols', { context: 'AsterDex' });
    }, 3000); // Update every 3 seconds for smooth UI

    // Store interval for cleanup
    (this as any).simulationInterval = simulationInterval;
  }

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
          logger.error('Max WebSocket reconnection attempts reached. Falling back to simulation mode.', undefined, { 
            context: 'AsterDex' 
          });
          
          // Fall back to simulation mode
          logger.info('🔄 Switching to WebSocket simulation mode', { context: 'AsterDex' });
          this.startSimulationMode(onMessage);
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
      const response = await fetch('/api/asterdex/markets');
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
        const cacheTTL = interval === '1m' ? 5 : (['3m', '5m'].includes(interval) ? 10 : 15);
        apiCache.set(cacheKey, klines, cacheTTL);
        
        return klines;
      } catch (error) {
        logger.error(`Failed to get klines for ${symbol}`, error, { context: 'AsterDex' });
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
      const maxQty = lotSizeFilter?.maxQty ? parseFloat(lotSizeFilter.maxQty) : 1000000; // Default to high limit
      
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
      return { quantityPrecision: 2, stepSize: '0.01', maxQty: 1000000 };
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
   */
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
      logger.error('Failed to fetch trading pairs, using fallback list', error, { context: 'AsterDex' });
      // Fallback to a known list of major pairs
      return [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
        'ADA/USDT', 'DOGE/USDT', 'MATIC/USDT', 'DOT/USDT', 'AVAX/USDT',
        'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'BCH/USDT',
        'NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'SUI/USDT',
        'ASTER/USDT', 'ZEC/USDT'
      ];
    }
  }

  /**
   * Get account information including available balance
   * CACHED: 3 seconds to reduce redundant account fetches during trade execution
   */
  async getAccountInfo(): Promise<{ totalWalletBalance: number; availableBalance: number } | null> {
    const cacheKey = 'accountInfo';
    
    // Check cache first (3 second TTL)
    const cached = apiCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached account info', { context: 'AsterDex' });
      return cached as { totalWalletBalance: number; availableBalance: number };
    }
    
    try {
      const response = await fetch(this.getApiUrl('/api/aster/account'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Prioritize totalWalletBalance if available
      const totalWalletBalance = parseFloat(data.totalWalletBalance || data.totalCrossWalletBalance || data.availableBalance || '0');
      const availableBalance = parseFloat(data.availableBalance || data.totalCrossWalletBalance || data.totalWalletBalance || '0');

      const accountInfo = {
        totalWalletBalance: Math.abs(totalWalletBalance),
        availableBalance: Math.abs(availableBalance),
      };

      // Cache for 100ms for ultra real-time updates (10x per second max)
      apiCache.set(cacheKey, accountInfo, 0.1);
      
      logger.debug('Fetched and cached account info', { context: 'AsterDex', data: accountInfo });
      return accountInfo;
    } catch (error) {
      logger.error('Failed to get account info', error, { context: 'AsterDex' });
      return null;
    }
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
      const response = await fetch(this.getApiUrl('/api/aster/leverage'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          leverage
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        logger.error(`Failed to set leverage for ${symbol}`, undefined, { 
          context: 'AsterDex', 
          data: { symbol, leverage, error } 
        });
        return false;
      }
      
      logger.info(`✅ Leverage set: ${symbol} @ ${leverage}x`, { 
        context: 'AsterDex',
        data: { symbol, leverage }
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
      
      const orderPayload: any = { 
        symbol, 
        side, 
        type: 'MARKET', 
        quantity: size
      };
      
      // Add reduceOnly flag for closing positions
      if (reduceOnly) {
        orderPayload.reduceOnly = true;
      }
      
      const response = await fetch(this.getApiUrl('/api/aster/order'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Order failed: ${error}`);
      }
      
      const data = await response.json();
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
        const response = await fetch(this.getApiUrl('/api/aster/positions'));
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Transform Aster API response to our format
        const positions: AsterPosition[] = data.map((pos: any) => ({
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
        
        // Cache for only 2 seconds (aggressive refresh to prevent stale position data)
        apiCache.set(cacheKey, positions, 2);
        
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

      const response = await fetch('/api/asterdex/position/close', {
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
      logger.debug('⚠️ Deduplicating concurrent getBalance request', { context: 'AsterDex' });
      return this.pendingRequests.get(requestKey)!;
    }
    
    const requestPromise = (async () => {
      try {
        const response = await fetch(this.getApiUrl('/api/aster/account'));
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
      
      // Calculate TRUE account value using correct Aster DEX formula:
      // Total Account Equity = totalMarginBalance (this already includes unrealized P&L)
      const totalMarginBalance = parseFloat(data.totalMarginBalance || 0);
      const totalWalletBalance = parseFloat(data.totalWalletBalance || 0);
      const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || 0);
      const totalPositionInitialMargin = parseFloat(data.totalPositionInitialMargin || 0);
      
      // totalMarginBalance = totalWalletBalance + totalUnrealizedProfit
      // This is the REAL account value including unrealized P&L
      let balance = totalMarginBalance;
      
      // If balance is negative (losses), show it as is (don't hide losses)
      // If you want to show absolute value instead, uncomment:
      // balance = Math.abs(balance);
      
      // Final fallback: if still negative or invalid, use position margin + unrealized P&L
      if (balance <= 0 || isNaN(balance)) {
        balance = totalPositionInitialMargin + (totalUnrealizedProfit || 0);
        if (balance <= 0) {
          balance = 100; // Ultimate fallback
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
        logger.error('Failed to get real balance', error, { context: 'AsterDex' });
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

    // Clean up simulation interval (development mode)
    if ((this as any).simulationInterval) {
      clearInterval((this as any).simulationInterval);
      (this as any).simulationInterval = null;
      logger.debug('WebSocket simulation stopped', { context: 'AsterDex' });
    }

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

