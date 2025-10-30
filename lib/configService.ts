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
  const parsed = parseInt(value, 10);
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
    confidenceThreshold: getNumberEnvVar('TRADING_CONFIDENCE_THRESHOLD', 0.65), // OPTIMIZED: Raised to 65% for profitability (was 0.45)
    stopLossPercent: getNumberEnvVar('TRADING_STOP_LOSS', 4.0), // OPTIMIZED: Increased to 4% for small accounts (was 3.0) - prevents premature stops
    takeProfitPercent: getNumberEnvVar('TRADING_TAKE_PROFIT', 12.0), // OPTIMIZED: Increased to 12% for 3:1 R:R (was 5.0)
    minBalanceForTrade: getNumberEnvVar('TRADING_MIN_BALANCE', 5), // Dynamic: 5% of available balance (minimum $5)
    safetyBufferPercent: getNumberEnvVar('TRADING_SAFETY_BUFFER', 10),
    initialCapital: getNumberEnvVar('INITIAL_CAPITAL', 100),
      aiModelSymbol: getEnvVar('AI_MODEL_SYMBOL', 'BTC/USDT'),
      forceTradeTest: getBooleanEnvVar('NEXT_PUBLIC_FORCE_TRADE_TEST', true), // Enable real trading by default
      enable24_7Agents: getBooleanEnvVar('ENABLE_24_7_AGENTS', true),
      agentRunnerInterval: getNumberEnvVar('AGENT_RUNNER_INTERVAL', 2), // minutes - OPTIMIZED: 2min for faster opportunity capture
      maxConcurrentWorkflows: getNumberEnvVar('MAX_CONCURRENT_WORKFLOWS', 2), // OPTIMIZED: Max 2 concurrent workflows (was 3)
      maxConcurrentPositions: getNumberEnvVar('MAX_CONCURRENT_POSITIONS', 2), // OPTIMIZED: Max 2 positions open simultaneously (1 for accounts <$100)
      maxPortfolioRiskPercent: getNumberEnvVar('MAX_PORTFOLIO_RISK', 10), // OPTIMIZED: Max 10% total risk across all positions (5% for accounts <$100)
      // Symbol Blacklist - Never trade these symbols
      blacklistedSymbols: [
        'APEUSDT',
        'APE/USDT',
        'ATOMUSDT',
        'ATOM/USDT',
        'COSMOUSDT',
        'COSMO/USDT',
        'COSMO' // Added due to consistent losses on every trade
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
  defaultModel: getEnvVar('DEEPSEEK_MODEL', 'deepseek-r1:32b'), // Optimized for RTX 5070 Ti
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
  connectionString: getEnvVar('DATABASE_URL', 'postgresql://localhost:5432/manna_dev', false),
  ssl: getBooleanEnvVar('DATABASE_SSL', true), // Default to true for Neon
  maxConnections: getNumberEnvVar('DATABASE_MAX_CONNECTIONS', 10), // Reduced for Neon
  idleTimeout: getNumberEnvVar('DATABASE_IDLE_TIMEOUT', 30000),
  connectionTimeout: getNumberEnvVar('DATABASE_CONNECTION_TIMEOUT', 10000), // Increased timeout for Neon
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
    baseUrl: getEnvVar('VERCEL_URL') ? `https://${getEnvVar('VERCEL_URL')}` : 'http://localhost:3000',
    timeout: getNumberEnvVar('API_TIMEOUT', 30000),
    retryAttempts: getNumberEnvVar('API_RETRY_ATTEMPTS', 3),
  },
  
  // Frontend Configuration
  frontend: {
    pollingInterval: getNumberEnvVar('FRONTEND_POLLING_INTERVAL', 500),
    priceUpdateInterval: getNumberEnvVar('FRONTEND_PRICE_INTERVAL', 3000),
    cacheTimeout: getNumberEnvVar('FRONTEND_CACHE_TIMEOUT', 250),
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
