/**
 * Centralized Configuration Service
 * Single source of truth for all environment variables and configuration
 */

import { logger } from './logger';

/**
 * Get environment variable with fallback and validation
 */
function getEnvVar(key: string, defaultValue: string = '', required: boolean = false): string {
  const value = process.env[key] || defaultValue;
  
  if (required && !value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return value;
}

/**
 * Get boolean environment variable
 */
function getBooleanEnvVar(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Get number environment variable
 */
function getNumberEnvVar(key: string, defaultValue: number = 0): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value); // CRITICAL FIX: Use parseFloat instead of parseInt to handle decimals
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Aster DEX Configuration
 */
export const asterConfig = {
  // API Credentials
  apiKey: getEnvVar('ASTER_API_KEY', '', true),
  secretKey: getEnvVar('ASTER_SECRET_KEY', '', true),
  // CRITICAL FIX: Never expose secret API key - use separate public key or empty string
  publicApiKey: getEnvVar('NEXT_PUBLIC_ASTER_API_KEY', ''), // Removed fallback to secret key
  
  // API Endpoints
  baseUrl: getEnvVar('ASTER_BASE_URL', 'https://fapi.asterdex.com'),
  wsBaseUrl: getEnvVar('ASTER_WS_BASE_URL', 'wss://fstream.asterdex.com/stream'),
  wsUserUrl: getEnvVar('ASTER_WS_USER_URL', 'wss://fstream.asterdex.com/ws'),
  
  // API Limits (optimized for Aster DEX)
  rateLimit: {
    requestsPerMinute: getNumberEnvVar('ASTER_RATE_LIMIT_RPM', 1200),
    requestsPerSecond: getNumberEnvVar('ASTER_RATE_LIMIT_RPS', 20),
    orderRequestsPerSecond: getNumberEnvVar('ASTER_ORDER_RPS', 10),
  },
  
  // WebSocket Configuration
  useRealWebSocket: getBooleanEnvVar('NEXT_PUBLIC_USE_REAL_WEBSOCKET', false),
  websocketStreams: getEnvVar('NEXT_PUBLIC_WEBSOCKET_STREAMS', 'btcusdt@depth').split(','),
  
  // Trading Configuration
  trading: {
    maxSymbolsPerCycle: getNumberEnvVar('TRADING_MAX_SYMBOLS', 20),
    batchSize: getNumberEnvVar('TRADING_BATCH_SIZE', 5),
    maxExecutionTime: getNumberEnvVar('TRADING_MAX_EXECUTION_TIME', 25000),
    confidenceThreshold: getNumberEnvVar('TRADING_CONFIDENCE_THRESHOLD', 0.35), // MVP: 35% threshold - lower for testing, still safe with other filters (was 45%)
    stopLossPercent: getNumberEnvVar('TRADING_STOP_LOSS', 4.0), // OPTIMIZED: Increased to 4% for small accounts (was 3.0) - prevents premature stops
    takeProfitPercent: getNumberEnvVar('TRADING_TAKE_PROFIT', 12.0), // OPTIMIZED: Increased to 12% for 3:1 R:R (was 5.0)
    minBalanceForTrade: getNumberEnvVar('TRADING_MIN_BALANCE', 5), // Dynamic: 5% of available balance (minimum $5)
    safetyBufferPercent: getNumberEnvVar('TRADING_SAFETY_BUFFER', 10),
    initialCapital: getNumberEnvVar('INITIAL_CAPITAL', 100),
      aiModelSymbol: getEnvVar('AI_MODEL_SYMBOL', 'BTC/USDT'),
      forceTradeTest: getBooleanEnvVar('NEXT_PUBLIC_FORCE_TRADE_TEST', true), // Enable real trading by default
      enable24_7Agents: getBooleanEnvVar('ENABLE_24_7_AGENTS', true),
      agentRunnerInterval: getNumberEnvVar('AGENT_RUNNER_INTERVAL', 1), // MVP: 1 minute for faster opportunity capture (was 2min)
      maxConcurrentWorkflows: getNumberEnvVar('MAX_CONCURRENT_WORKFLOWS', 3), // MVP: Max 3 concurrent workflows for more trades (was 2)
      maxConcurrentPositions: getNumberEnvVar('MAX_CONCURRENT_POSITIONS', 2), // OPTIMIZED: Max 2 positions open simultaneously (1 for accounts <$100)
      maxPortfolioRiskPercent: getNumberEnvVar('MAX_PORTFOLIO_RISK', 10), // OPTIMIZED: Max 10% total risk across all positions (5% for accounts <$100)
      // Symbol Blacklist - Never trade these symbols (execution issues, immediate losses)
      // These coins have low liquidity, wide spreads, and cause immediate losses on position open
      // USER CONFIRMED: ATOM caused $4 losses multiple times without price movement (spread/slippage issue)
      blacklistedSymbols: [
        // APE - Execution problems, wide spreads
        'APEUSDT',
        'APE/USDT',
        'APEUSD',
        'APE',
        // ATOM - USER CONFIRMED: Lost $4 multiple times, wide spread/slippage
        'ATOMUSDT',
        'ATOM/USDT',
        'ATOMUSD',
        'ATOM',
        'ATOM-PERP', // Perpetual format
        'ATOMUSD-PERP',
        // COSMO - Similar execution issues to APE/ATOM
        'COSMOUSDT',
        'COSMO/USDT',
        'COSMOUSD',
        'COSMO',
        // Add any symbol containing these strings (catch all variants)
      ],
    },
  
  // Monitoring Configuration
  monitoring: {
    positionCheckInterval: getNumberEnvVar('MONITORING_POSITION_INTERVAL', 10000),
    tradingCycleInterval: getNumberEnvVar('MONITORING_TRADING_INTERVAL', 30000),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  }
};

/**
 * AI Model Configuration (DeepSeek R1)
 */
export const aiConfig = {
  // Ollama Configuration
  ollamaBaseUrl: getEnvVar('OLLAMA_BASE_URL', 'http://localhost:11434'),
  
  // DeepSeek R1 Models (in order of preference)
  defaultModel: getEnvVar('DEEPSEEK_MODEL', 'deepseek-r1:14b'), // Optimized for local GPU
  fallbackModels: getEnvVar('DEEPSEEK_FALLBACK_MODELS', 'deepseek-r1:14b,deepseek-r1:8b,deepseek-r1:7b').split(','),
  
  // Model Parameters
  temperature: getNumberEnvVar('DEEPSEEK_TEMPERATURE', 0.6), // Lower for trading (more deterministic)
  maxTokens: getNumberEnvVar('DEEPSEEK_MAX_TOKENS', 2000), // R1 needs more tokens for reasoning
  enableThinking: getBooleanEnvVar('DEEPSEEK_ENABLE_THINKING', true), // Enable Chain-of-Thought reasoning
};

/**
 * Database Configuration
 */
export const dbConfig = {
  connectionString: getEnvVar('DATABASE_URL', '') || getEnvVar('POSTGRES_URL', ''),
  // FIXED: Default to false for local development - set DATABASE_SSL=true for cloud DBs (Neon, Supabase)
  ssl: getBooleanEnvVar('DATABASE_SSL', false),
  maxConnections: getNumberEnvVar('DATABASE_MAX_CONNECTIONS', 30), // CRITICAL FIX: Increased from 10 to 30 for parallel operations
  idleTimeout: getNumberEnvVar('DATABASE_IDLE_TIMEOUT', 30000),
  connectionTimeout: getNumberEnvVar('DATABASE_CONNECTION_TIMEOUT', 10000), // Increased timeout for Neon
  // Helper to check if database is configured
  get isConfigured(): boolean {
    const connString = this.connectionString;
    return !!(connString && connString !== 'your_postgres_connection_string_here');
  }
};

/**
 * Application Configuration
 */
export const appConfig = {
  environment: getEnvVar('NODE_ENV', 'development'),
  isProduction: getEnvVar('NODE_ENV', 'development') === 'production',
  isDevelopment: getEnvVar('NODE_ENV', 'development') === 'development',
  
  // API Configuration
  api: {
    // Vercel provides VERCEL_URL automatically, use it if available
    baseUrl: process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL 
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'http://localhost:3000',
    timeout: getNumberEnvVar('API_TIMEOUT', 30000),
    retryAttempts: getNumberEnvVar('API_RETRY_ATTEMPTS', 3),
  },
  
  // Frontend Configuration - OPTIMIZED: Reduced polling for better performance
  frontend: {
    pollingInterval: getNumberEnvVar('FRONTEND_POLLING_INTERVAL', 2000), // Was 500ms, now 2s (75% reduction)
    priceUpdateInterval: getNumberEnvVar('FRONTEND_PRICE_INTERVAL', 5000), // Was 3s, now 5s
    cacheTimeout: getNumberEnvVar('FRONTEND_CACHE_TIMEOUT', 1000), // Was 250ms, now 1s
  }
};

/**
 * Validate all configuration
 */
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate Aster DEX configuration
  if (!asterConfig.apiKey) {
    errors.push('ASTER_API_KEY is required');
  }
  if (!asterConfig.secretKey) {
    errors.push('ASTER_SECRET_KEY is required');
  }
  if (!asterConfig.baseUrl) {
    errors.push('ASTER_BASE_URL is required');
  }
  // NEXT_PUBLIC_ASTER_API_KEY is optional - will fallback to ASTER_API_KEY

  // Validate database configuration (optional in development)
  if (appConfig.isProduction && !dbConfig.connectionString) {
    errors.push('DATABASE_URL is required in production');
  }

  // Validate trading configuration
  if (asterConfig.trading.confidenceThreshold < 0 || asterConfig.trading.confidenceThreshold > 1) {
    errors.push('TRADING_CONFIDENCE_THRESHOLD must be between 0 and 1');
  }
  if (asterConfig.trading.stopLossPercent < 0) {
    errors.push('TRADING_STOP_LOSS must be positive');
  }
  if (asterConfig.trading.takeProfitPercent < 0) {
    errors.push('TRADING_TAKE_PROFIT must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get safe configuration for client-side logging (hides sensitive data)
 */
export function getSafeConfig() {
  return {
    hasApiKey: !!asterConfig.apiKey,
    hasSecretKey: !!asterConfig.secretKey,
    hasPublicApiKey: !!asterConfig.publicApiKey,
    useRealWebSocket: asterConfig.useRealWebSocket,
    websocketStreams: asterConfig.websocketStreams,
    baseUrl: asterConfig.baseUrl,
    wsBaseUrl: asterConfig.wsBaseUrl,
    trading: {
      maxSymbolsPerCycle: asterConfig.trading.maxSymbolsPerCycle,
      batchSize: asterConfig.trading.batchSize,
      confidenceThreshold: asterConfig.trading.confidenceThreshold,
      stopLossPercent: asterConfig.trading.stopLossPercent,
      takeProfitPercent: asterConfig.trading.takeProfitPercent,
      minBalanceForTrade: asterConfig.trading.minBalanceForTrade,
      safetyBufferPercent: asterConfig.trading.safetyBufferPercent,
      initialCapital: asterConfig.trading.initialCapital,
      aiModelSymbol: asterConfig.trading.aiModelSymbol,
      forceTradeTest: asterConfig.trading.forceTradeTest,
    },
    monitoring: {
      positionCheckInterval: asterConfig.monitoring.positionCheckInterval,
      tradingCycleInterval: asterConfig.monitoring.tradingCycleInterval,
      logLevel: asterConfig.monitoring.logLevel,
    },
    frontend: {
      pollingInterval: appConfig.frontend.pollingInterval,
      priceUpdateInterval: appConfig.frontend.priceUpdateInterval,
      cacheTimeout: appConfig.frontend.cacheTimeout,
    }
  };
}

/**
 * Initialize configuration and validate
 */
export function initializeConfig(): void {
  const validation = validateConfig();
  
  if (!validation.isValid) {
    logger.error('Configuration validation failed', undefined, {
      context: 'ConfigService',
      data: { errors: validation.errors }
    });
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }
  
  logger.info('Configuration initialized successfully', {
    context: 'ConfigService',
    data: {
      environment: appConfig.environment,
      hasApiKey: !!asterConfig.apiKey,
      hasSecretKey: !!asterConfig.secretKey,
      baseUrl: asterConfig.baseUrl,
      tradingConfig: {
        maxSymbols: asterConfig.trading.maxSymbolsPerCycle,
        batchSize: asterConfig.trading.batchSize,
        confidenceThreshold: asterConfig.trading.confidenceThreshold,
        stopLoss: asterConfig.trading.stopLossPercent,
        takeProfit: asterConfig.trading.takeProfitPercent,
        minBalance: asterConfig.trading.minBalanceForTrade,
        safetyBuffer: asterConfig.trading.safetyBufferPercent,
        initialCapital: asterConfig.trading.initialCapital,
        aiModelSymbol: asterConfig.trading.aiModelSymbol,
        forceTradeTest: asterConfig.trading.forceTradeTest,
      }
    }
  });
}

// Initialize configuration on import
initializeConfig();
