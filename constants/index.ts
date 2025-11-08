/**
 * Application-wide constants
 * Only operational constants used by the trading system
 */

// Order validation constants (used by asterDexService)
export const TRADING_CONSTANTS = {
  // Leverage validation
  MIN_LEVERAGE: 1,
  MAX_LEVERAGE: 1001,
  
  // Order size validation
  MIN_ORDER_SIZE: 0.001,
  MAX_ORDER_SIZE: 100,
  
  // Price validation
  MIN_PRICE: 0.0001,
  MAX_PRICE: 1000000,
} as const;

// Supported trading symbols (used by PriceTicker component)
export const SUPPORTED_SYMBOLS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'DOGE/USDT',
  'XRP/USDT',
] as const;

// Error messages (used by asterDexService)
export const ERROR_MESSAGES = {
  INVALID_SYMBOL: 'Invalid symbol format. Use BASE/QUOTE (e.g., BTC/USDT)',
  INVALID_SIZE: 'Order size must be positive',
  INVALID_LEVERAGE: 'Leverage must be between 1 and 1001',
  INVALID_PRICE: 'Price must be positive',
  INVALID_SIDE: 'Side must be BUY or SELL',
  CONNECTION_FAILED: 'Failed to connect to Aster DEX',
  ORDER_FAILED: 'Failed to place order',
  ORDER_EXECUTION_FAILED: 'Failed to execute order',
  POSITION_CLOSE_FAILED: 'Failed to close position',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  MARKET_CLOSED: 'Market is currently closed',
  API_FETCH_ERROR: 'Failed to fetch data from API',
} as const;

export type SupportedSymbol = typeof SUPPORTED_SYMBOLS[number];

