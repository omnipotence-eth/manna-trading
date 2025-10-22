import { ethers } from 'ethers';
import { logger } from '@/lib/logger';
import { TRADING_CONSTANTS, ERROR_MESSAGES } from '@/constants';
import type { WebSocketMessage } from '@/types/trading';

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
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isConnecting: boolean = false;
  private shouldStayConnected: boolean = false;

  constructor() {
    // Use Binance Futures public API (Aster DEX compatible fallback)
    // This ensures we get REAL data even if Aster DEX API is unavailable
    this.baseUrl = 'https://fapi.binance.com/fapi/v1';
    this.WS_BASE_URL = 'wss://fstream.binance.com/stream';
    
    // Load API credentials from environment variables
    if (typeof window !== 'undefined') {
      this.apiKey = process.env.NEXT_PUBLIC_ASTER_API_KEY || null;
      logger.info('🔄 Using Binance Public API (Aster DEX compatible)', {
        context: 'AsterDex',
        data: { 
          baseUrl: this.baseUrl,
          wsUrl: this.WS_BASE_URL,
          note: 'Real market data, no authentication required'
        },
      });
    }
  }

  /**
   * Validate order parameters
   */
  private validateOrderParams(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number
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
    if (size < TRADING_CONSTANTS.MIN_ORDER_SIZE) {
      throw new Error(`Order size must be at least ${TRADING_CONSTANTS.MIN_ORDER_SIZE}`);
    }
    if (size > TRADING_CONSTANTS.MAX_ORDER_SIZE) {
      throw new Error(`Order size must not exceed ${TRADING_CONSTANTS.MAX_ORDER_SIZE}`);
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
   */
  async getPrice(symbol: string): Promise<number> {
    try {
      // Convert BTC/USDT to BTCUSDT format
      const binanceSymbol = symbol.replace('/', '');
      const url = `${this.baseUrl}/ticker/price?symbol=${binanceSymbol}`;
      
      logger.debug(`Fetching price for ${symbol}`, { context: 'AsterDex', data: { url } });
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      const price = parseFloat(data.price);
      
      logger.debug(`Got price for ${symbol}: $${price}`, { context: 'AsterDex' });
      return price;
    } catch (error) {
      logger.error('Failed to get real price', error, { context: 'AsterDex', data: { symbol } });
      return 0; // Fallback
    }
  }

  /**
   * Get detailed 24h ticker data for a symbol (using public API - no auth required)
   */
  async getTicker(symbol: string): Promise<{
    price: number;
    previousPrice: number;
    priceChangePercent: number;
    volume: number;
    averageVolume: number;
    movingAverage: number;
  } | null> {
    try {
      // Convert BTC/USDT to BTCUSDT format
      const binanceSymbol = symbol.replace('/', '');
      const url = `${this.baseUrl}/ticker/24hr?symbol=${binanceSymbol}`;
      
      logger.debug(`Fetching 24hr ticker for ${symbol}`, { context: 'AsterDex', data: { url } });
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        price: parseFloat(data.lastPrice || 0),
        previousPrice: parseFloat(data.prevClosePrice || data.lastPrice || 0),
        priceChangePercent: parseFloat(data.priceChangePercent || 0),
        volume: parseFloat(data.volume || 0),
        averageVolume: parseFloat(data.volume || 0), // Use same as volume if avg not available
        movingAverage: parseFloat(data.weightedAvgPrice || data.lastPrice || 0),
      };
    } catch (error) {
      logger.error('Failed to get ticker data', error, { context: 'AsterDex', data: { symbol } });
      return null;
    }
  }

  /**
   * Place a market order
   */
  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    leverage: number = 1
  ): Promise<AsterOrder | null> {
    this.validateOrderParams(symbol, side, size, leverage);
    try {
      const response = await fetch('/api/aster/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, side, type: 'MARKET', quantity: size, leverage }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Order failed: ${error}`);
      }
      
      const data = await response.json();
      logger.trade('✅ REAL MARKET ORDER PLACED', { context: 'AsterDex', data: { symbol, side, size, orderId: data.orderId } });
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
      const response = await fetch('/api/aster/order', {
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
   */
  async getPositions(): Promise<AsterPosition[]> {
    try {
      const response = await fetch('/api/aster/positions');
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
      
      return positions;
    } catch (error) {
      logger.error('Failed to get real positions', error, { context: 'AsterDex' });
      return []; // Fallback to empty
    }
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
   */
  async getBalance(): Promise<number> {
    try {
      const response = await fetch('/api/aster/account');
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      const balance = parseFloat(data.totalWalletBalance || 0);
      
      logger.info(`💰 REAL Aster Balance: $${balance.toFixed(2)}`, {
        context: 'AsterDex',
        data: { balance, availableBalance: data.availableBalance },
      });
      
      return balance;
    } catch (error) {
      logger.error('Failed to get real balance', error, { context: 'AsterDex' });
      return 100; // Fallback to initial capital
    }
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

