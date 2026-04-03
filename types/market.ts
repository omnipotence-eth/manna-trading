/**
 * Unified market types shared across asset classes.
 * Both Aster DEX (crypto) and Alpaca (equities) map to these interfaces.
 */

export type AssetClass = 'crypto' | 'equity';

export type ExchangeName = 'aster' | 'alpaca';

export interface UnifiedMarketData {
  symbol: string;
  assetClass: AssetClass;
  exchange: ExchangeName;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  priceChange: number;
  priceChangePct: number;
  avgVolume?: number;
  volumeRatio?: number;
  rsi?: number;
  atr?: number;
  spread?: number;
  timestamp: number;
}

export interface UnifiedPosition {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  exchange: ExchangeName;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  timestamp: number;
}

export interface UnifiedOrderRequest {
  symbol: string;
  assetClass: AssetClass;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  qty: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  extendedHours?: boolean;
}

export interface UnifiedOrder extends UnifiedOrderRequest {
  id: string;
  clientOrderId?: string;
  exchange: ExchangeName;
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQty?: number;
  filledAvgPrice?: number;
  submittedAt: number;
  filledAt?: number;
}

export interface UnifiedTrade {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  exchange: ExchangeName;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  entryAt: number;
  exitAt: number;
  exitReason: string;
}

export interface MarketOpportunity {
  symbol: string;
  assetClass: AssetClass;
  exchange: ExchangeName;
  score: number;        // 0–100
  confidence: number;  // 0–1
  direction: 'LONG' | 'SHORT';
  price: number;
  marketData: UnifiedMarketData;
  signals: string[];
}

export interface AccountSummary {
  exchange: ExchangeName;
  assetClass: AssetClass;
  balance: number;
  equity: number;
  buyingPower: number;
  unrealizedPnl: number;
  currency: string;
  isSimulation: boolean;
}
