/**
 * Trading-specific constants
 * Extracted from magic numbers throughout the codebase
 * 
 * MATHEMATICAL OPTIMIZATION:
 * - Kelly Criterion-derived position limits
 * - ATR-based volatility thresholds
 * - Statistically optimal R:R ratios
 */

export const TRADING_THRESHOLDS = {
  // Volume thresholds
  MIN_LIQUIDITY_USD: 1_000_000, // Minimum $1M daily volume for trading
  MIN_QUOTE_VOLUME: 500_000, // Minimum $500K quote volume (more strict)
  VOLUME_SPIKE_THRESHOLD: 2.0, // Volume must be 2x average for spike detection
  
  // Spread thresholds
  MAX_SPREAD_PERCENT: 2.0, // Maximum 2% spread (indicates severe liquidity issues)
  MAX_SPREAD_FOR_TRADING: 0.5, // Maximum 0.5% spread for trading
  WIDE_SPREAD_WARNING: 0.2, // Warn if spread > 0.2%
  
  // Order book thresholds
  MIN_LIQUIDITY_SCORE: 0.3, // Minimum liquidity score (below this = execution problems)
  GOOD_LIQUIDITY_SCORE: 0.7, // Good liquidity score threshold
  
  // Confidence thresholds
  HIGH_CONFIDENCE_THRESHOLD: 0.7, // High confidence threshold
  MEDIUM_CONFIDENCE_THRESHOLD: 0.5, // Medium confidence threshold
  
  // Position risk thresholds - KELLY CRITERION OPTIMIZED
  // Based on 15% fractional Kelly with volatility adjustment
  MAX_POSITION_RISK_MICRO: 2.0, // Max 2% risk for accounts <$100 (TIGHTENED from 3% - Kelly-safe)
  MAX_POSITION_RISK_SMALL: 3.0, // Max 3% risk for accounts <$500 (TIGHTENED from 5%)
  MAX_PORTFOLIO_RISK_MICRO: 5.0, // Max 5% portfolio risk for accounts <$100
  MAX_PORTFOLIO_RISK_DEFAULT: 10.0, // Max 10% portfolio risk for larger accounts
  
  // Trailing stop - CHANDELIER EXIT OPTIMIZED
  DEFAULT_TRAILING_STOP_PERCENT: 3.0, // 3% baseline (3x ATR for medium vol)
  CHANDELIER_MULTIPLIER: 3.0, // ATR multiplier for Chandelier Exit
  
  // Risk/Reward ratios - MATHEMATICALLY OPTIMIZED
  // Based on Expected Value = (WinRate × AvgWin) - (LossRate × AvgLoss)
  // At 50% WR: need 1:1 to break even, 2:1 for profit
  // At 55% WR: need 0.82:1 to break even, 1.5:1 for profit
  MIN_RR_MICRO: 3.0, // 3:1 R:R for accounts <$100 (TIGHTENED from 2.5:1 - requires 25% WR to break even)
  MIN_RR_SMALL: 3.0, // 3:1 R:R for accounts $100-$200 (TIGHTENED from 2:1 - requires 25% WR)
  MIN_RR_MEDIUM: 2.5, // 2.5:1 R:R for accounts $200-$500 (TIGHTENED from 1.5:1 - requires 29% WR)
  MIN_RR_LARGE: 2.5, // 2.5:1 R:R for accounts >$500 (TIGHTENED from 1.5:1 - requires 29% WR)
  
  // Account size thresholds
  MICRO_ACCOUNT_THRESHOLD: 100, // Accounts <$100
  SMALL_ACCOUNT_THRESHOLD: 200, // Accounts <$200
  MEDIUM_ACCOUNT_THRESHOLD: 500, // Accounts <$500
  LARGE_ACCOUNT_THRESHOLD: 2000, // Accounts <$2000
  
  // Price change thresholds
  RANDOM_PRICE_CHANGE_RANGE: 0.01, // ±0.5% random price fluctuation
  PRICE_CHANGE_PROBABILITY: 0.5, // 50% probability
  
  // Quantity limits
  MAX_QUANTITY_DEFAULT: 1_000_000, // Default maximum quantity
  MAX_QUANTITY_LIMIT: 1_000_000, // Hard limit for quantity
  
  // Volume display
  VOLUME_DISPLAY_DIVISOR: 1_000_000, // Divide by 1M for display ($M format)
  
  // Default values
  DEFAULT_CONFIDENCE: 0.5, // Default confidence when missing
  DEFAULT_PRICE_MULTIPLIER_BID: 0.999, // Bid price multiplier
  DEFAULT_PRICE_MULTIPLIER_ASK: 1.001, // Ask price multiplier
  DEFAULT_SPREAD: 0.002, // Default spread (0.2%)
  
  // Error thresholds
  MAX_ERROR_COUNT_FOR_REVIEW: 5, // Maximum errors before manual review
  
  // Validation ranges
  MAX_RISK_PERCENT: 100, // Maximum risk percentage
  MAX_REASONABLE_RISK: 200, // Maximum reasonable total risk percentage
  MIN_CONFIDENCE: 0, // Minimum confidence value
  MAX_CONFIDENCE: 1, // Maximum confidence value
} as const;

export const MARKET_SCANNER_CONSTANTS = {
  TOP_SYMBOLS_COUNT: 10, // Focus on top 10 by volume for even lower latency
  ANALYZE_COUNT: 6, // Deep analyze top 6 for speed and quality
  MAX_LIQUIDITY_USD: 10_000_000, // $10M for max liquidity score
  
  // Volume ratio thresholds (stricter for quality)
  EXTREME_VOLUME_SPIKE: 4.0, // 4x average volume (higher = more significant)
  HIGH_VOLUME_SPIKE: 3.0, // 3x average volume
  VOLUME_INCREASE: 2.0, // 2x average volume
  NORMAL_VOLUME: 1.5, // 1.5x average volume
  
  // Score thresholds (STRICT for quality trades)
  STRONG_BUY_SCORE: 80, // Raised - only the best setups
  BUY_SCORE: 70, // Raised - quality over quantity
  NEUTRAL_SCORE: 50, // Raised - avoid marginal trades
  SELL_SCORE: 30, // Raised - only clear shorts
  
  // NEW: Minimum opportunity score to even consider
  MIN_OPPORTUNITY_SCORE: 60, // Don't waste AI calls on weak setups
} as const;

/**
 * MICRO TRADE CONSTANTS - Quick profit-seeking scalping trades
 * Philosophy: Secure small gains frequently with high confidence
 */
export const MICRO_TRADE_CONSTANTS = {
  // Micro profit targets (% profit to trigger exit)
  MICRO_PROFIT_TARGET_PERCENT: 0.5,  // 0.5% profit = secure gain immediately
  MINI_PROFIT_TARGET_PERCENT: 1.0,   // 1.0% profit = partial exit (50%)
  SMALL_PROFIT_TARGET_PERCENT: 1.5,  // 1.5% profit = aggressive trailing stop
  
  // Confidence thresholds for micro trades (lower = more trades)
  MICRO_CONFIDENCE_THRESHOLD: 0.55,  // 55% confidence for micro scalps
  MICRO_MIN_RR: 1.5,                 // 1.5:1 R:R for micro trades (lower barrier)
  
  // Time-based micro exits
  MICRO_HOLD_MAX_MINUTES: 15,        // Close micro trades after 15 min if not profitable
  MICRO_HOLD_PROFIT_LOCK_MINUTES: 5, // Lock in profits after 5 min of being in profit
  
  // Position sizing for micro trades (% of balance)
  MICRO_POSITION_SIZE_PERCENT: 2.0,  // 2.0% per micro trade (single-slot micro)
  MAX_MICRO_POSITIONS: 1,            // Limit to one concurrent micro trade
  
  // Stop-loss for micro trades
  MICRO_STOP_LOSS_PERCENT: 0.75,     // Tight 0.75% stop-loss for micro trades
  
  // Trailing stop activation
  MICRO_TRAILING_ACTIVATION: 0.3,    // Activate trailing at 0.3% profit
  MICRO_TRAILING_DISTANCE: 0.15,     // 0.15% trailing distance
  
  // Volume/momentum triggers
  VOLUME_SPIKE_THRESHOLD: 1.5,       // 1.5x average volume = opportunity
  MOMENTUM_CONFIRMATION_BARS: 2,     // Need 2 bars of momentum confirmation
} as const;

/**
 * MACRO TRADE CONSTANTS - Larger swing/trend trades
 * Philosophy: Wait for high-conviction setups, let winners run
 */
export const MACRO_TRADE_CONSTANTS = {
  // Macro profit targets (% profit to trigger exit)
  MACRO_PROFIT_TARGET_PERCENT: 5.0,  // 5% profit = full take profit
  MACRO_PARTIAL_EXIT_PERCENT: 2.5,   // 2.5% profit = partial exit (25%)
  MACRO_TRAILING_ACTIVATION: 3.0,    // Activate trailing at 3% profit
  
  // Confidence thresholds for macro trades (higher = fewer but better)
  MACRO_CONFIDENCE_THRESHOLD: 0.70,  // 70% confidence for macro trades
  MACRO_MIN_RR: 2.5,                 // 2.5:1 R:R for macro trades
  
  // Time-based macro behavior
  MACRO_MIN_HOLD_HOURS: 2,           // Minimum 2 hours for macro trades
  MACRO_MAX_HOLD_HOURS: 48,          // Maximum 48 hours (2 days)
  
  // Position sizing for macro trades
  MACRO_POSITION_SIZE_PERCENT: 3.5,  // 3.5% per macro trade (single-slot macro)
  MAX_MACRO_POSITIONS: 1,            // Limit to one concurrent macro trade
  
  // Stop-loss for macro trades  
  MACRO_STOP_LOSS_PERCENT: 2.0,      // 2% stop-loss for macro trades
  MACRO_TRAILING_DISTANCE: 1.0,      // 1% trailing distance
} as const;

/**
 * MATHEMATICAL CONSTANTS - Supreme optimization formulas
 */
export const MATH_CONSTANTS = {
  // Kelly Criterion
  KELLY_FRACTION: 0.15, // Use 15% of full Kelly (ultra-conservative)
  MIN_KELLY_SIZE: 1.0, // Minimum 1% position size if edge exists
  MAX_KELLY_SIZE: 12.0, // Maximum 12% position size
  
  // ATR Multipliers for volatility levels
  ATR_MULTIPLIERS: {
    LOW: { stopLoss: 2.0, takeProfit: 3.5 }, // 1.75:1 R:R
    MEDIUM: { stopLoss: 2.5, takeProfit: 4.0 }, // 1.6:1 R:R
    HIGH: { stopLoss: 3.0, takeProfit: 5.0 }, // 1.67:1 R:R
    EXTREME: { stopLoss: 3.5, takeProfit: 6.0 } // 1.71:1 R:R
  },
  
  // Volatility thresholds (ATR as %)
  VOLATILITY_THRESHOLDS: {
    LOW: 2,
    MEDIUM: 5,
    HIGH: 10,
    EXTREME: 15
  },
  
  // Risk metrics
  MIN_SHARPE_RATIO: 1.0, // Minimum acceptable Sharpe (1.0 = adequate)
  TARGET_SHARPE_RATIO: 2.0, // Target Sharpe (2.0 = good)
  MIN_PROFIT_FACTOR: 1.5, // Minimum profit factor
  MAX_DRAWDOWN_PERCENT: 20, // Maximum acceptable drawdown
  
  // Expected Value thresholds
  MIN_EXPECTED_VALUE: 0.5, // Minimum EV per trade (0.5% = break even after fees)
  TARGET_EXPECTED_VALUE: 2.0, // Target EV per trade (2% = good edge)
  
  // Monte Carlo
  MONTE_CARLO_SIMULATIONS: 1000, // Number of simulations
  MONTE_CARLO_TRADES: 100, // Trades per simulation
  MAX_RISK_OF_RUIN: 0.05, // Maximum 5% probability of 50% drawdown
  
  // Regime detection
  ADX_TREND_THRESHOLD: 25, // ADX > 25 = trending
  ADX_STRONG_TREND: 40, // ADX > 40 = strong trend
  
  // Position limits based on account size (as % of balance)
  POSITION_LIMITS: {
    MICRO: { max: 3, concurrent: 1 }, // <$100
    SMALL: { max: 5, concurrent: 2 }, // <$500
    MEDIUM: { max: 8, concurrent: 3 }, // <$2000
    LARGE: { max: 12, concurrent: 5 } // >$2000
  }
} as const;

/**
 * EQUITY-SPECIFIC CONSTANTS — US stocks and ETFs via Alpaca Markets
 * Traditional finance moves differently from crypto — calibrated accordingly.
 */
export const EQUITY_CONSTANTS = {
  // Volatility profile — equities move much less than crypto
  TYPICAL_DAILY_RANGE_PCT: 1.5,   // Average large-cap daily range (%)
  HIGH_VOLATILITY_THRESHOLD: 3.0, // High-vol day (earnings, macro events)
  LOW_VOLATILITY_THRESHOLD: 0.5,  // Low-vol / consolidation day

  // Position sizing — no leverage by default on Alpaca (cash account)
  DEFAULT_LEVERAGE: 1,            // No leverage in paper mode
  MAX_POSITION_PCT: 10,           // Max 10% of portfolio per position
  MAX_PORTFOLIO_RISK_PCT: 20,     // Max 20% of portfolio at risk

  // Risk / reward — tighter than crypto due to lower volatility
  MIN_RR_RATIO: 2.0,
  DEFAULT_STOP_PCT: 1.5,         // 1.5% stop-loss (vs 3–4% for crypto)
  DEFAULT_TARGET_PCT: 3.5,       // 3.5% take-profit (2.33:1 R:R)
  ATR_STOP_MULTIPLIER: 2.0,      // Stop = 2× ATR for equities

  // Scanning — only scan during market hours
  SCAN_INTERVAL_MINUTES: 5,       // Scan every 5 minutes during market hours
  MIN_DOLLAR_VOLUME: 50_000_000,  // $50M min daily dollar volume (large-cap only)
  MIN_PRICE: 5,                   // Skip penny stocks < $5
  MIN_VOLUME_RATIO: 1.3,          // 1.3× average volume for opportunity

  // PDT (Pattern Day Trader) rule awareness
  PDT_ACCOUNT_MINIMUM: 25_000,   // Accounts < $25k limited to 3 day trades / 5 days
  MAX_DAY_TRADES_SMALL_ACCOUNT: 3,

  // Extended hours trading (pre/post market)
  ALLOW_EXTENDED_HOURS: false,    // Off by default — worse fills, higher risk

  // Score thresholds (same 0–100 scale as crypto scanner)
  MIN_SCORE_TO_TRADE: 60,
  STRONG_SIGNAL_SCORE: 75,
} as const;

/** Default watchlist of highly liquid US equities + ETFs */
export const DEFAULT_STOCK_WATCHLIST = [
  // Broad market ETFs
  'SPY', 'QQQ', 'IWM', 'DIA',
  // Sector ETFs
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY',
  // Commodities / bonds
  'GLD', 'TLT',
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'AVGO', 'ORCL',
  // Finance
  'JPM', 'BAC', 'GS', 'V', 'MA',
  // Healthcare
  'UNH', 'JNJ', 'ABBV', 'MRK',
  // Consumer / retail
  'WMT', 'COST', 'HD', 'SBUX',
  // Energy
  'XOM', 'CVX',
] as const;

export type StockSymbol = typeof DEFAULT_STOCK_WATCHLIST[number];
