/**
 * TypeScript Type Definitions for Aster DEX API
 * Based on: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
 */

/**
 * Account Information Response
 * GET /fapi/v1/account
 */
export interface AsterAccountResponse {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  updateTime: number;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: AsterAsset[];
  positions: AsterPositionRisk[];
}

export interface AsterAsset {
  asset: string;
  walletBalance: string;
  unrealizedProfit: string;
  marginBalance: string;
  maintMargin: string;
  initialMargin: string;
  positionInitialMargin: string;
  openOrderInitialMargin: string;
  maxWithdrawAmount: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
}

/**
 * Position Information Response  
 * GET /fapi/v1/positionRisk
 */
export interface AsterPositionRisk {
  entryPrice: string;
  marginType: 'isolated' | 'cross';
  isAutoAddMargin: string;
  isolatedMargin: string;
  leverage: string;
  liquidationPrice: string;
  markPrice: string;
  maxNotionalValue: string;
  positionAmt: string;
  symbol: string;
  unRealizedProfit: string;
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  updateTime: number;
}

/**
 * Exchange Information Response
 * GET /fapi/v1/exchangeInfo
 */
export interface AsterExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  rateLimits: AsterRateLimit[];
  exchangeFilters: any[];
  symbols: AsterSymbolInfo[];
}

export interface AsterRateLimit {
  rateLimitType: 'REQUEST_WEIGHT' | 'ORDERS';
  interval: 'MINUTE';
  intervalNum: number;
  limit: number;
}

export interface AsterSymbolInfo {
  symbol: string;
  pair: string;
  contractType: 'PERPETUAL';
  deliveryDate: number;
  onboardDate: number;
  status: 'TRADING' | 'CLOSED';
  maintMarginPercent: string;
  requiredMarginPercent: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  underlyingSubType: string[];
  settlePlan: number;
  triggerProtect: string;
  filters: AsterSymbolFilter[];
  orderTypes: string[];
  timeInForce: string[];
  liquidationFee: string;
  marketTakeBound: string;
}

export interface AsterSymbolFilter {
  filterType: 'PRICE_FILTER' | 'LOT_SIZE' | 'MARKET_LOT_SIZE' | 'MAX_NUM_ORDERS' | 'PERCENT_PRICE' | 'MIN_NOTIONAL';
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  stepSize?: string;
  maxQty?: string;
  minQty?: string;
  limit?: number;
  notional?: string;
  multiplierUp?: string;
  multiplierDown?: string;
  multiplierDecimal?: string;
}

/**
 * 24hr Ticker Response
 * GET /fapi/v1/ticker/24hr
 */
export interface Aster24hrTickerResponse {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/**
 * Price Ticker Response
 * GET /fapi/v1/ticker/price
 */
export interface AsterPriceTickerResponse {
  symbol: string;
  price: string;
  time: number;
}

/**
 * Book Ticker Response
 * GET /fapi/v1/ticker/bookTicker
 */
export interface AsterBookTickerResponse {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  time: number;
}

/**
 * Order Book Response
 * GET /fapi/v1/depth
 */
export interface AsterOrderBookResponse {
  lastUpdateId: number;
  E: number; // Message output time
  T: number; // Transaction time
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
}

/**
 * Kline/Candlestick Response
 * GET /fapi/v1/klines
 */
export type AsterKlineResponse = [
  number,  // Open time
  string,  // Open
  string,  // High
  string,  // Low
  string,  // Close
  string,  // Volume
  number,  // Close time
  string,  // Quote asset volume
  number,  // Number of trades
  string,  // Taker buy base asset volume
  string,  // Taker buy quote asset volume
  string   // Ignore
][];

/**
 * Aggregated Trades Response
 * GET /fapi/v1/aggTrades
 */
export interface AsterAggTradeResponse {
  a: number;    // Aggregate trade ID
  p: string;    // Price
  q: string;    // Quantity
  f: number;    // First trade ID
  l: number;    // Last trade ID
  T: number;    // Timestamp
  m: boolean;   // Was the buyer the maker?
}

/**
 * New Order Response
 * POST /fapi/v1/order
 */
export interface AsterNewOrderResponse {
  clientOrderId: string;
  cumQty: string;
  cumQuote: string;
  executedQty: string;
  orderId: number;
  avgPrice: string;
  origQty: string;
  price: string;
  reduceOnly: boolean;
  side: 'BUY' | 'SELL';
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
  stopPrice: string;
  closePosition: boolean;
  symbol: string;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  type: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_MARKET' | 'TAKE_PROFIT' | 'TAKE_PROFIT_MARKET' | 'TRAILING_STOP_MARKET';
  origType: string;
  activatePrice: string;
  priceRate: string;
  updateTime: number;
  workingType: 'MARK_PRICE' | 'CONTRACT_PRICE';
  priceProtect: boolean;
}

/**
 * Leverage Change Response
 * POST /fapi/v1/leverage
 */
export interface AsterLeverageResponse {
  leverage: number;
  maxNotionalValue: string;
  symbol: string;
}

/**
 * Internal Enhanced Types (for our system)
 */
export interface ParsedAccountData {
  balance: number;
  availableBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  totalPositionInitialMargin: number;
  accountEquity: number;
  balanceSource: 'availableBalance' | 'totalWalletBalance' | 'totalMarginBalance' | 'maxWithdrawAmount';
}

export interface ParsedPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  markPrice: number;
  marginType: 'isolated' | 'cross';
}

export interface ParsedTicker {
  symbol: string;
  price: number;
  previousPrice: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  averageVolume: number;
  movingAverage: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  trades: number;
}

export interface ParsedOrderBook {
  bids: [string, string][];
  asks: [string, string][];
  bidLiquidity: number;
  askLiquidity: number;
  totalLiquidity: number;
  spread: number;
  liquidityScore: number;
  bidDepth: number;
  askDepth: number;
}

export interface ParsedKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface ParsedAggTrades {
  buyVolume: number;
  sellVolume: number;
  buySellRatio: number;
  totalTrades: number;
  avgPrice: number;
  buyVolumePercent: number;
  sellVolumePercent: number;
}

