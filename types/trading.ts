/**
 * Shared TypeScript types and interfaces for the trading platform
 */

export interface MarketData {
  currentPrice: number;
  previousPrice: number;
  movingAverage: number;
  volume: number;
  averageVolume: number;
  priceChange: number; // Short-term price change (5min)
  priceChange24h?: number; // 24h price change for comparison
  // Enhanced data for advanced analysis
  highPrice?: number;
  lowPrice?: number;
  openPrice?: number;
  trades?: number;
  quoteVolume?: number;
  volatility?: number;
}

export interface WebSocketMessage {
  type: 'price' | 'trade' | 'position' | 'order' | 'error' | 'ticker' | 'orderUpdate';
  data?: any;
  timestamp?: number;
  symbol?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  model: string;
  leverage?: number;
  timestamp?: number;
}

export interface Trade {
  id: string;
  timestamp: string;
  model: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage?: number;
  fee?: number;
}

export interface ModelStats {
  name: string;
  pnl: number;
  trades: number;
  winRate: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  avgTradeSize?: number;
}

export interface CryptoPrice {
  symbol: string;
  price: number;
  change: number;
  volume?: number;
  high24h?: number;
  low24h?: number;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  size: number;
  price?: number;
  leverage?: number;
  hidden?: boolean;
}

export interface ChartDataPoint {
  time: string;
  value: number;
  volume?: number;
}

export interface TradingSignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  size: number;
  reasoning: string;
}

export interface AITradingModel {
  analyze(symbol: string, marketData: MarketData): Promise<TradingSignal>;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type PositionSide = 'LONG' | 'SHORT';
export type OrderSide = 'BUY' | 'SELL';

