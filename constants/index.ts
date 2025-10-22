/**
 * Application-wide constants
 */

export const TRADING_CONSTANTS = {
  // Balance
  INITIAL_BALANCE: 50000,
  
  // Leverage
  MIN_LEVERAGE: 1,
  MAX_LEVERAGE: 1001,
  DEFAULT_LEVERAGE: 1,
  
  // Update intervals (milliseconds)
  PRICE_UPDATE_INTERVAL: 2000,
  ACCOUNT_UPDATE_INTERVAL: 3000,
  CHART_UPDATE_INTERVAL: 3000,
  CHAT_UPDATE_INTERVAL: 8000,
  POSITION_UPDATE_INTERVAL: 2000,
  TRADE_UPDATE_INTERVAL: 10000,
  LATENCY_UPDATE_INTERVAL: 5000,
  
  // Delays
  CONNECTION_TIMEOUT: 2000,
  LOADING_TIMEOUT: 1000,
  
  // Limits
  MAX_MESSAGES: 100,
  MAX_TRADES_HISTORY: 100,
  MAX_POSITIONS: 10,
  MAX_CHART_DATA_POINTS: 100,
  
  // Risk Management
  DEFAULT_STOP_LOSS: 0.02,        // 2%
  DEFAULT_TAKE_PROFIT: 0.05,      // 5%
  MAX_RISK_PER_TRADE: 0.02,       // 2%
  MAX_PORTFOLIO_RISK: 0.10,       // 10%
  
  // Order sizes
  MIN_ORDER_SIZE: 0.001,
  MAX_ORDER_SIZE: 100,
  
  // Validation
  MIN_PRICE: 0.0001,
  MAX_PRICE: 1000000,
  
  // Display
  DEFAULT_LATENCY: 15,            // ms
  PRICE_DECIMAL_PLACES: 2,
  PNL_DECIMAL_PLACES: 2,
} as const;

export const SUPPORTED_SYMBOLS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'DOGE/USDT',
  'XRP/USDT',
] as const;

export const MODEL_NAMES = [
  'AlphaTrader',
  'QuantumAI',
  'NeuralNet-V2',
  'DeepMarket',
  'CryptoSage',
] as const;

export const CHART_COLORS = {
  PRIMARY: '#00ff41',
  SECONDARY: '#00d4ff',
  GRID: '#00ff4120',
  BACKGROUND: '#000000',
  TEXT: '#00ff4160',
} as const;

export const ERROR_MESSAGES = {
  INVALID_SYMBOL: 'Invalid symbol format. Use BASE/QUOTE (e.g., BTC/USDT)',
  INVALID_SIZE: 'Order size must be positive',
  INVALID_LEVERAGE: 'Leverage must be between 1 and 1001',
  INVALID_PRICE: 'Price must be positive',
  INVALID_SIDE: 'Side must be BUY or SELL',
  CONNECTION_FAILED: 'Failed to connect to Aster DEX',
  ORDER_FAILED: 'Failed to place order',
  POSITION_CLOSE_FAILED: 'Failed to close position',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  MARKET_CLOSED: 'Market is currently closed',
} as const;

export const API_ENDPOINTS = {
  MARKETS: '/markets',
  TICKER: '/ticker',
  ORDER: '/order',
  POSITIONS: '/positions',
  TRADES: '/trades',
  BALANCE: '/account/balance',
} as const;

export type SupportedSymbol = typeof SUPPORTED_SYMBOLS[number];
export type ModelName = typeof MODEL_NAMES[number];

