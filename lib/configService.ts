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
  
  // Trading Configuration - QUALITY FOCUSED
  trading: {
    // SIMULATION MODE - For portfolio demonstration without real funds
    simulationMode: getBooleanEnvVar('TRADING_SIMULATION_MODE', true), // Default to simulation for portfolio
    simulationInitialBalance: getNumberEnvVar('SIMULATION_INITIAL_BALANCE', 1000), // Starting balance for simulation
    
    maxSymbolsPerCycle: getNumberEnvVar('TRADING_MAX_SYMBOLS', 25), // Reduced from 20 for deeper analysis
    batchSize: getNumberEnvVar('TRADING_BATCH_SIZE', 5),
    maxExecutionTime: getNumberEnvVar('TRADING_MAX_EXECUTION_TIME', 25000),
    confidenceThreshold: getNumberEnvVar('TRADING_CONFIDENCE_THRESHOLD', 0.70), // TIGHTENED: 70% threshold for quality trades only
    /** Minimum opportunity score (0–100) to start a workflow. Lower = more trades (e.g. 50 for simulation). */
    minOpportunityScore: getNumberEnvVar('TRADING_MIN_OPPORTUNITY_SCORE', 50),
    stopLossPercent: getNumberEnvVar('TRADING_STOP_LOSS', 3.0), // Tighter stops for quality trades
    takeProfitPercent: getNumberEnvVar('TRADING_TAKE_PROFIT', 7.5), // 2.5:1 R:R target
    minBalanceForTrade: getNumberEnvVar('TRADING_MIN_BALANCE', 5), // Dynamic: 5% of available balance (minimum $5)
    safetyBufferPercent: getNumberEnvVar('TRADING_SAFETY_BUFFER', 10),
    initialCapital: getNumberEnvVar('INITIAL_CAPITAL', 100),
    aiModelSymbol: getEnvVar('AI_MODEL_SYMBOL', 'BTC/USDT'),
    forceTradeTest: getBooleanEnvVar('NEXT_PUBLIC_FORCE_TRADE_TEST', true),
    enable24_7Agents: getBooleanEnvVar('ENABLE_24_7_AGENTS', true),
    agentRunnerInterval: getNumberEnvVar('AGENT_RUNNER_INTERVAL', 2), // QUALITY: 2 minutes for better analysis (was 1min)
    maxConcurrentWorkflows: getNumberEnvVar('MAX_CONCURRENT_WORKFLOWS', 2), // QUALITY: Fewer concurrent for better focus
    maxConcurrentPositions: getNumberEnvVar('MAX_CONCURRENT_POSITIONS', 2), // Two-slot model: 1 micro + 1 macro
    maxPortfolioRiskPercent: getNumberEnvVar('MAX_PORTFOLIO_RISK', 5), // QUALITY: Lower risk (5% max)
    /** Circuit breaker: stop opening new trades if today's realized loss exceeds this % of balance (0 = disabled) */
    maxDailyLossPercent: getNumberEnvVar('MAX_DAILY_LOSS_PERCENT', 10),
    /** Circuit breaker: stop if today's realized loss exceeds this absolute amount in USD (0 = disabled) */
    maxDailyLossUsd: getNumberEnvVar('MAX_DAILY_LOSS_USD', 0),
    // NEW: Quality thresholds
    minExpectedValue: getNumberEnvVar('TRADING_MIN_EV', 1.5), // Minimum 1.5% expected value per trade
    minRiskReward: getNumberEnvVar('TRADING_MIN_RR', 2.5), // Minimum 2.5:1 R:R
    minWinProbability: getNumberEnvVar('TRADING_MIN_WIN_PROB', 0.55), // Minimum 55% win probability
    tradeCooldownMs: getNumberEnvVar('TRADING_COOLDOWN_MS', 300000), // 5 minute cooldown between trades
    
    // MICRO TRADE SETTINGS - Quick scalps for small frequent gains
    microTrading: {
      enabled: getBooleanEnvVar('TRADING_MICRO_ENABLED', true), // ENABLED by default
      profitTargetPercent: getNumberEnvVar('TRADING_MICRO_PROFIT_TARGET', 0.5), // 0.5% target
      stopLossPercent: getNumberEnvVar('TRADING_MICRO_STOP_LOSS', 0.75), // 0.75% stop
      maxHoldMinutes: getNumberEnvVar('TRADING_MICRO_MAX_HOLD', 30), // 30 min max
      minConfidence: getNumberEnvVar('TRADING_MICRO_MIN_CONFIDENCE', 0.55), // 55% confidence
      minRiskReward: getNumberEnvVar('TRADING_MICRO_MIN_RR', 1.5), // 1.5:1 R:R
      positionSizePercent: getNumberEnvVar('TRADING_MICRO_POSITION_SIZE', 1.5), // 1.5% position
      trailingActivation: getNumberEnvVar('TRADING_MICRO_TRAILING_ACTIVATION', 0.3), // 0.3% to activate
      trailingDistance: getNumberEnvVar('TRADING_MICRO_TRAILING_DISTANCE', 0.15), // 0.15% trail
    },
    
    // MACRO TRADE SETTINGS - Larger swing trades
    macroTrading: {
      enabled: getBooleanEnvVar('TRADING_MACRO_ENABLED', true),
      profitTargetPercent: getNumberEnvVar('TRADING_MACRO_PROFIT_TARGET', 5.0), // 5% target
      partialExitPercent: getNumberEnvVar('TRADING_MACRO_PARTIAL_EXIT', 2.5), // 2.5% partial
      stopLossPercent: getNumberEnvVar('TRADING_MACRO_STOP_LOSS', 2.0), // 2% stop
      minHoldHours: getNumberEnvVar('TRADING_MACRO_MIN_HOLD', 2), // 2 hour min
      maxHoldHours: getNumberEnvVar('TRADING_MACRO_MAX_HOLD', 48), // 48 hour max
      minConfidence: getNumberEnvVar('TRADING_MACRO_MIN_CONFIDENCE', 0.70), // 70% confidence
      minRiskReward: getNumberEnvVar('TRADING_MACRO_MIN_RR', 2.5), // 2.5:1 R:R
      positionSizePercent: getNumberEnvVar('TRADING_MACRO_POSITION_SIZE', 2.5), // 2.5% position
      trailingActivation: getNumberEnvVar('TRADING_MACRO_TRAILING_ACTIVATION', 3.0), // 3% to activate
      trailingDistance: getNumberEnvVar('TRADING_MACRO_TRAILING_DISTANCE', 1.0), // 1% trail
    },
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
        // ASTER - USER FEEDBACK: Position not profitable, avoid for now
        // Low volume, potential spread/slippage issues similar to others
        'ASTERUSDT',
        'ASTER/USDT',
        'ASTERUSD',
        'ASTER',
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

/** Paper trading presets (apply when TRADING_SIMULATION_MODE=true and PAPER_PRESET is set) */
const PAPER_PRESET = (getEnvVar('PAPER_PRESET', '')).toLowerCase();
type TradingConfig = typeof asterConfig.trading;
const PRESET_OVERRIDES: Record<string, Partial<TradingConfig>> = {
  conservative: {
    confidenceThreshold: 0.80,
    minOpportunityScore: 65,
    stopLossPercent: 2.0,
    maxConcurrentPositions: 1,
    maxConcurrentWorkflows: 1,
    maxDailyLossPercent: 5,
    takeProfitPercent: 5.0,
  },
  balanced: {}, // use env/defaults
  aggressive: {
    confidenceThreshold: 0.60,
    minOpportunityScore: 40,
    stopLossPercent: 4.0,
    maxConcurrentPositions: 3,
    maxConcurrentWorkflows: 3,
    maxDailyLossPercent: 15,
    takeProfitPercent: 10.0,
  },
};

/**
 * Effective trading config: when in simulation mode and PAPER_PRESET is set (conservative|balanced|aggressive),
 * returns merged config with preset overrides; otherwise returns asterConfig.trading.
 */
export const effectiveTradingConfig: TradingConfig =
  asterConfig.trading.simulationMode &&
  PAPER_PRESET &&
  PRESET_OVERRIDES[PAPER_PRESET] != null
    ? { ...asterConfig.trading, ...PRESET_OVERRIDES[PAPER_PRESET] }
    : asterConfig.trading;

export const paperPreset = PAPER_PRESET && PRESET_OVERRIDES[PAPER_PRESET] != null ? PAPER_PRESET : null;

/**
 * AI Model Configuration (DeepSeek R1)
 */
export const aiConfig = {
  // LLM Provider: 'groq' for cloud API (works on Vercel), 'ollama' for local GPU
  provider: getEnvVar('LLM_PROVIDER', 'groq') as 'groq' | 'ollama',

  // Groq Configuration (free cloud LLM)
  groqApiKey: getEnvVar('GROQ_API_KEY', ''),
  groqBaseUrl: 'https://api.groq.com/openai/v1',
  groqModel: getEnvVar('GROQ_MODEL', 'deepseek-r1-distill-llama-70b'),

  // Ollama Configuration (local GPU)
  ollamaBaseUrl: getEnvVar('OLLAMA_BASE_URL', 'http://localhost:11434'),
  ollamaModel: getEnvVar('DEEPSEEK_MODEL', 'deepseek-r1:14b'),

  // Resolved model name based on provider
  get defaultModel(): string {
    return this.provider === 'groq' ? this.groqModel : this.ollamaModel;
  },

  // Model Parameters
  temperature: getNumberEnvVar('DEEPSEEK_TEMPERATURE', 0.6),
  maxTokens: getNumberEnvVar('DEEPSEEK_MAX_TOKENS', 2000),
  enableThinking: getBooleanEnvVar('DEEPSEEK_ENABLE_THINKING', true),

  get isConfigured(): boolean {
    if (this.provider === 'groq') return !!this.groqApiKey;
    return !!this.ollamaBaseUrl;
  },
};

/**
 * Database Configuration
 */
export const dbConfig = {
  connectionString: getEnvVar('DATABASE_URL', '') || getEnvVar('POSTGRES_URL', ''),
  get ssl(): boolean {
    const explicit = process.env['DATABASE_SSL'];
    if (explicit) return explicit.toLowerCase() === 'true';
    const conn = this.connectionString;
    return conn.includes('.neon.') || conn.includes('.supabase.') || conn.includes('sslmode=require');
  },
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
