/**
 * Trading-specific constants
 * Extracted from magic numbers throughout the codebase
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
  
  // Position risk thresholds
  MAX_POSITION_RISK_MICRO: 3.0, // Max 3% risk for accounts <$100
  MAX_POSITION_RISK_SMALL: 5.0, // Max 5% risk for accounts <$500
  MAX_PORTFOLIO_RISK_MICRO: 5.0, // Max 5% portfolio risk for accounts <$100
  MAX_PORTFOLIO_RISK_DEFAULT: 10.0, // Max 10% portfolio risk for larger accounts
  
  // Trailing stop
  DEFAULT_TRAILING_STOP_PERCENT: 2.0, // 2% trailing stop
  
  // Risk/Reward ratios (MVP: Lowered for more trades)
  MIN_RR_MICRO: 3.0, // MVP: 3:1 R:R for accounts <$100 (was 4:1)
  MIN_RR_SMALL: 2.5, // MVP: 2.5:1 R:R for accounts $100-$200 (was 3.5:1)
  MIN_RR_MEDIUM: 2.0, // MVP: 2:1 R:R for accounts $200-$500 (was 3:1)
  MIN_RR_LARGE: 2.0, // MVP: 2:1 R:R for accounts >$500 (was 2.5:1)
  
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
  TOP_SYMBOLS_COUNT: 100, // Top 100 symbols by volume (was 50) - scan more opportunities!
  ANALYZE_COUNT: 100, // Analyze top 100 symbols (was 50) - better market coverage
  MAX_LIQUIDITY_USD: 5_000_000, // $5M for max liquidity score
  
  // Volume ratio thresholds
  EXTREME_VOLUME_SPIKE: 3.5, // 3.5x average volume
  HIGH_VOLUME_SPIKE: 2.5, // 2.5x average volume
  VOLUME_INCREASE: 1.7, // 1.7x average volume
  NORMAL_VOLUME: 1.2, // 1.2x average volume
  
  // Score thresholds (RELAXED for quiet markets)
  STRONG_BUY_SCORE: 75, // Lowered from 85
  BUY_SCORE: 55, // Lowered from 70 for quiet markets
  NEUTRAL_SCORE: 35, // Lowered from 40
  SELL_SCORE: 20, // Lowered from 25
} as const;

