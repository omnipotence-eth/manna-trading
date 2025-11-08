/**
 * Polling Intervals Configuration
 * Centralized timing constants for all polling operations
 */

export const POLLING_INTERVALS = {
  // Frontend Chart Updates
  CHART_BALANCE_UPDATE: 2000,           // 2 seconds - tick-by-tick balance updates
  CHART_HISTORICAL_LOAD: 300000,        // 5 minutes - refresh historical data
  
  // Frontend Chat/Dashboard
  CHAT_AI_INSIGHTS: 20000,              // 20 seconds - agent insights
  DASHBOARD_ACCOUNT: 5000,              // 5 seconds - account data
  DASHBOARD_TRADES: 10000,              // 10 seconds - trade history
  DASHBOARD_TRADING_CYCLE: 30000,       // 30 seconds - trigger trading cycle
  
  // Frontend Components
  PRICE_TICKER: 3000,                   // 3 seconds - price ticker
  HEADER_SCAN_STATUS: 10000,            // 10 seconds - scan status check
  AGENTS_SYSTEM_STATS: 60000,           // 60 seconds - agent statistics
  
  // Backend Services
  AGENT_RUNNER_CYCLE: 60000,            // 60 seconds - trading cycle
  AGENT_RUNNER_KEEP_ALIVE: 30000,       // 30 seconds - keep-alive check
  POSITION_MONITOR: 10000,              // 10 seconds - position monitoring
  REAL_BALANCE_SERVICE: 30000,          // 30 seconds - balance updates
  HEALTH_MONITOR: 10000,                // 10 seconds - health checks
  MARKET_SCANNER_CACHE: 60000,          // 60 seconds - market scan cache
  
  // WebSocket Ping
  WEBSOCKET_PING: 240000,               // 240 seconds (4 minutes) - Aster DEX WebSocket ping
  
  // Symbol Update
  SYMBOL_UPDATE: 86400000,              // 24 hours - refresh trading symbols
  
  // API Key Health Checks
  API_KEY_HEALTH_CHECK: 60000,          // 60 seconds - health check all API keys
} as const;

export const TIMEOUTS = {
  // API Request Timeouts
  API_FETCH_SHORT: 5000,                // 5 seconds - simple requests
  API_FETCH_STANDARD: 10000,            // 10 seconds - standard requests
  API_FETCH_LONG: 15000,                // 15 seconds - complex requests
  API_FETCH_VERY_LONG: 30000,           // 30 seconds - authenticated requests
  API_FETCH_EXCHANGE_INFO: 15000,       // 15 seconds - exchange info
  
  // Chart Timeouts
  CHART_BALANCE_FETCH: 15000,           // 15 seconds - balance fetch
  CHART_HISTORICAL_FETCH: 30000,        // 30 seconds - historical data
  
  // Agent Timeouts
  DEEPSEEK_CHAT: 60000,                 // 60 seconds - DeepSeek R1 response
  DEEPSEEK_VERIFICATION: 420000,        // 420 seconds (7 minutes) - first model load
  WORKFLOW_STEP: 60000,                 // 60 seconds - workflow step
  
  // Circuit Breaker
  CIRCUIT_BREAKER_RESET: 30000,         // 30 seconds - circuit breaker cooldown
  
  // Retry Delays
  RETRY_BASE_DELAY: 1000,               // 1 second - base retry delay
  RETRY_MAX_DELAY: 30000,               // 30 seconds - maximum retry delay
} as const;

export const CACHE_TTL = {
  // API Cache (seconds)
  PRICE: 5,                             // 5 seconds - current price
  TICKER: 10,                           // 10 seconds - 24hr ticker
  ORDER_BOOK: 30,                       // 30 seconds - order book depth
  KLINES_SHORT: 60,                     // 60 seconds - 1m/3m/5m klines
  KLINES_LONG: 120,                     // 120 seconds - 15m+ klines
  EXCHANGE_INFO: 1800,                  // 30 minutes - exchange configuration
  SYMBOL_PRECISION: 3600,               // 1 hour - symbol precision
  MAX_LEVERAGE: 3600,                   // 1 hour - max leverage per symbol
  AGGREGATED_TRADES: 10,                // 10 seconds - trade volume analysis
  
  // Account Data (seconds)
  BALANCE: 15,                          // 15 seconds - account balance
  POSITIONS: 15,                        // 15 seconds - open positions
  
  // Frontend Cache (milliseconds)
  OPTIMIZED_DATA: 1000,                 // 1 second - optimized data endpoint
  
  // Symbol Validation
  SYMBOL_CACHE: 600,                    // 10 minutes - valid/invalid symbols
} as const;

export const LIMITS = {
  // Batch Processing
  BATCH_SIZE_DEFAULT: 5,                // 5 items per batch
  MARKET_SCANNER_BATCH_SIZE: 5,         // 5 symbols per batch
  MARKET_SCANNER_BATCH_DELAY: 5000,     // 5 seconds between batches
  MARKET_SCANNER_MAX_SYMBOLS: 50,       // 50 symbols max to analyze
  
  // Concurrent Operations
  MAX_CONCURRENT_WORKFLOWS: 3,          // 3 simultaneous workflows
  MAX_CONCURRENT_POSITIONS: 2,          // 2 open positions max
  
  // Circuit Breaker
  MAX_CONSECUTIVE_ERRORS: 5,            // 5 errors before circuit opens
  
  // Retry Limits
  MAX_RETRIES: 3,                       // 3 retry attempts standard
  
  // Rate Limiting
  MAX_REQUESTS_PER_MINUTE: 36000,       // 30 keys × 1200 req/min
  MIN_REQUEST_DELAY: 50,                // 50ms minimum between requests
  
  // Chart Data
  MAX_CHART_POINTS: 5000,               // 5000 data points maximum
  
  // WebSocket
  MAX_RECONNECT_ATTEMPTS: 5,            // 5 WebSocket reconnection attempts
} as const;

/**
 * Get polling interval by name (with type safety)
 */
export function getPollingInterval(name: keyof typeof POLLING_INTERVALS): number {
  return POLLING_INTERVALS[name];
}

/**
 * Get timeout by name (with type safety)
 */
export function getTimeout(name: keyof typeof TIMEOUTS): number {
  return TIMEOUTS[name];
}

/**
 * Get cache TTL by name (with type safety)
 */
export function getCacheTTL(name: keyof typeof CACHE_TTL): number {
  return CACHE_TTL[name];
}

/**
 * Get limit by name (with type safety)
 */
export function getLimit(name: keyof typeof LIMITS): number {
  return LIMITS[name];
}

