import { asterDexService } from './asterDexService';
import { logger } from '@/lib/logger';
import { TRADING_CONSTANTS, SUPPORTED_SYMBOLS } from '@/constants';
import type { MarketData } from '@/types/trading';
import { useStore } from '@/store/useStore';

export interface TradingSignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  size: number;
  reasoning: string;
}

export interface AIModelConfig {
  name: string;
  strategy: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  maxLeverage: number;
  maxPositionSize: number;
  stopLoss: number;
  takeProfit: number;
}

/**
 * Base class for AI trading models
 */
export abstract class AITradingModel {
  protected config: AIModelConfig;
  protected balance: number = 100; // Starting with $100
  protected positions: Map<string, any> = new Map();

  constructor(config: AIModelConfig) {
    this.config = config;
  }

  /**
   * Analyze market and generate trading signal
   */
  abstract analyze(symbol: string, marketData: MarketData): Promise<TradingSignal>;

  /**
   * Execute trading signal
   */
  async executeTrade(signal: TradingSignal): Promise<boolean> {
    try {
      if (signal.action === 'HOLD') {
        return false;
      }

      logger.info(`🤖 ${this.config.name}: ${signal.reasoning}`, {
        context: 'AITrading',
        data: { model: this.config.name, signal: signal.action, symbol: signal.symbol },
      });

      const leverage = this.calculateLeverage(signal.confidence);
      const order = await asterDexService.placeMarketOrder(
        signal.symbol,
        signal.action,
        signal.size,
        leverage
      );

      if (order) {
        logger.trade(`${this.config.name} executed trade`, {
          model: this.config.name,
          action: signal.action,
          symbol: signal.symbol,
          orderId: order.orderId,
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to execute trade for ${this.config.name}`, error, {
        context: 'AITrading',
        data: { model: this.config.name, signal },
      });
      return false;
    }
  }

  /**
   * Calculate leverage based on confidence (optimized for profitability)
   */
  protected calculateLeverage(confidence: number): number {
    // Use aggressive leverage scaling:
    // 45% conf = 4.5x, 60% conf = 7x, 80% conf = 10x (capped)
    const baseLeverage = this.config.maxLeverage * (confidence * 1.2); // 20% more aggressive
    return Math.min(Math.max(baseLeverage, 3), this.config.maxLeverage); // Min 3x, Max 10x
  }

  /**
   * Update model state
   */
  async update() {
    // Override in subclass to implement learning/adaptation
  }
}

/**
 * Momentum-based trading model
 */
export class AlphaTraderModel extends AITradingModel {
  constructor() {
    super({
      name: 'AlphaTrader',
      strategy: 'Momentum + Trend Following',
      riskLevel: 'MEDIUM',
      maxLeverage: 10,
      maxPositionSize: 5000,
      stopLoss: 0.02,
      takeProfit: 0.05,
    });
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    // Simplified momentum analysis
    const price = marketData.currentPrice;
    const prevPrice = marketData.previousPrice || price;
    const momentum = (price - prevPrice) / prevPrice;

    if (momentum > 0.01) {
      return {
        symbol,
        action: 'BUY',
        confidence: Math.min(momentum * 50, 1),
        size: 0.1,
        reasoning: `Strong upward momentum detected. Price change: ${(momentum * 100).toFixed(2)}%`,
      };
    } else if (momentum < -0.01) {
      return {
        symbol,
        action: 'SELL',
        confidence: Math.min(Math.abs(momentum) * 50, 1),
        size: 0.1,
        reasoning: `Strong downward momentum detected. Price change: ${(momentum * 100).toFixed(2)}%`,
      };
    }

    return {
      symbol,
      action: 'HOLD',
      confidence: 0,
      size: 0,
      reasoning: 'Momentum insufficient for trade entry',
    };
  }
}

/**
 * Statistical arbitrage model
 */
export class QuantumAIModel extends AITradingModel {
  constructor() {
    super({
      name: 'QuantumAI',
      strategy: 'Statistical Arbitrage',
      riskLevel: 'LOW',
      maxLeverage: 5,
      maxPositionSize: 3000,
      stopLoss: 0.015,
      takeProfit: 0.03,
    });
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    // Simplified mean reversion analysis
    const price = marketData.currentPrice;
    const ma = marketData.movingAverage || price;
    const deviation = (price - ma) / ma;

    if (deviation < -0.02) {
      return {
        symbol,
        action: 'BUY',
        confidence: Math.min(Math.abs(deviation) * 30, 1),
        size: 0.15,
        reasoning: `Price below moving average. Mean reversion opportunity detected.`,
      };
    } else if (deviation > 0.02) {
      return {
        symbol,
        action: 'SELL',
        confidence: Math.min(deviation * 30, 1),
        size: 0.15,
        reasoning: `Price above moving average. Mean reversion to downside expected.`,
      };
    }

    return {
      symbol,
      action: 'HOLD',
      confidence: 0,
      size: 0,
      reasoning: 'Price within expected range',
    };
  }
}

/**
 * Deep learning model
 */
export class NeuralNetV2Model extends AITradingModel {
  constructor() {
    super({
      name: 'NeuralNet-V2',
      strategy: 'Deep Learning + Pattern Recognition',
      riskLevel: 'MEDIUM',
      maxLeverage: 8,
      maxPositionSize: 4000,
      stopLoss: 0.025,
      takeProfit: 0.06,
    });
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    // Simplified pattern recognition
    const volume = marketData.volume || 1;
    const avgVolume = marketData.averageVolume || 1;
    const volumeRatio = volume / avgVolume;
    const priceChange = marketData.priceChange || 0;

    if (volumeRatio > 1.5 && priceChange > 0) {
      return {
        symbol,
        action: 'BUY',
        confidence: Math.min(volumeRatio * 0.3, 1),
        size: 0.2,
        reasoning: `Volume spike with positive price action. Pattern indicates continuation.`,
      };
    } else if (volumeRatio > 1.5 && priceChange < 0) {
      return {
        symbol,
        action: 'SELL',
        confidence: Math.min(volumeRatio * 0.3, 1),
        size: 0.2,
        reasoning: `Volume spike with negative price action. Pattern indicates further decline.`,
      };
    }

    return {
      symbol,
      action: 'HOLD',
      confidence: 0,
      size: 0,
      reasoning: 'No significant pattern detected',
    };
  }
}

/**
 * Risk Management Configuration
 */
export interface RiskConfig {
  maxRiskPerTrade: number;        // Max % of capital to risk per trade (default: 2%)
  maxPositionSize: number;         // Max % of capital in single position (default: 20%)
  maxPortfolioRisk: number;        // Max % of capital at risk total (default: 10%)
  stopLossPercent: number;         // Stop loss % per trade (default: 3%)
  takeProfitPercent: number;       // Take profit % per trade (default: 6%)
  maxDrawdown: number;             // Stop trading if drawdown exceeds (default: 15%)
  trailingStopPercent: number;     // Trailing stop to lock profits (default: 2%)
  maxOpenPositions: number;        // Max simultaneous positions (default: 3)
}

const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTrade: 0.08,      // 8% per trade (aggressive for growth)
  maxPositionSize: 0.50,      // 50% max in one position (maximize opportunity)
  maxPortfolioRisk: 0.25,     // 25% total portfolio risk (aggressive)
  stopLossPercent: 0.025,     // 2.5% stop loss (tighter to preserve capital)
  takeProfitPercent: 0.08,    // 8% take profit (higher R:R ratio, 3.2:1)
  maxDrawdown: 0.25,          // 25% max drawdown (more room for volatility)
  trailingStopPercent: 0.03,  // 3% trailing stop (lock in gains better)
  maxOpenPositions: 3,        // Max 3 positions at once
};

// Global entry data map (shared between model and service for trade journaling)
const globalEntryDataMap: Map<string, any> = new Map();

/**
 * DeepSeek R1 - Advanced reasoning model with professional risk management
 */
export class DeepSeekR1Model extends AITradingModel {
  private riskConfig: RiskConfig;
  private initialBalance: number = 100;
  private peakBalance: number = 100;
  private currentDrawdown: number = 0;
  private lastTradeTime: Map<string, number> = new Map(); // Track last trade time per symbol
  private readonly TRADE_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes cooldown (faster re-entry on opportunities)
  private entryDataMap: Map<string, any> = globalEntryDataMap; // Use global map for trade journal
  
  constructor() {
    super({
      name: 'DeepSeek R1',
      strategy: 'Deep Reasoning + Pattern Recognition + Risk Management',
      riskLevel: 'MEDIUM',
      maxLeverage: 10,
      maxPositionSize: 5000,
      stopLoss: 0.02,
      takeProfit: 0.05,
    });
    this.riskConfig = DEFAULT_RISK_CONFIG;
  }
  
  /**
   * Extract signals from reasoning string for trade journal
   */
  private extractSignalsFromReasoning(reasoning: string): string[] {
    const signals: string[] = [];
    if (reasoning.includes('momentum')) signals.push('Momentum');
    if (reasoning.includes('trend') || reasoning.includes('uptrend') || reasoning.includes('downtrend')) signals.push('Trend');
    if (reasoning.includes('volume')) signals.push('Volume');
    if (reasoning.includes('CONVERGENCE')) signals.push('Convergence');
    if (reasoning.includes('volatility') || reasoning.includes('VOLATILITY')) signals.push('Volatility');
    return signals.length > 0 ? signals : ['Price Action'];
  }

  /**
   * Extract market regime from reasoning string
   */
  private extractMarketRegime(reasoning: string): string {
    if (reasoning.includes('TRENDING')) return 'TRENDING';
    if (reasoning.includes('CONSOLIDATION')) return 'CONSOLIDATION';
    if (reasoning.includes('VOLATILE')) return 'VOLATILE';
    return 'RANGING';
  }

  /**
   * Extract score from reasoning string
   */
  private extractScore(reasoning: string): string {
    const scoreMatch = reasoning.match(/Score:(\d+)\/(\d+)/);
    return scoreMatch ? `${scoreMatch[1]}/${scoreMatch[2]}` : 'N/A';
  }

  /**
   * Check if we can take a new trade based on risk limits
   */
  private async canTakeTrade(signal: TradingSignal): Promise<{ allowed: boolean; reason: string }> {
    try {
      // 1. Check trade cooldown (prevent overtrading same asset)
      const lastTrade = this.lastTradeTime.get(signal.symbol) || 0;
      const timeSinceLastTrade = Date.now() - lastTrade;
      if (timeSinceLastTrade < this.TRADE_COOLDOWN_MS) {
        const minutesLeft = Math.ceil((this.TRADE_COOLDOWN_MS - timeSinceLastTrade) / 60000);
        return {
          allowed: false,
          reason: `Cooldown active for ${signal.symbol}. Wait ${minutesLeft} more minute(s).`
        };
      }
      
      // 2. Check margin sufficiency BEFORE attempting trade
      const balance = await asterDexService.getBalance();
      if (balance < 10) { // Need at least $10 to trade
        return {
          allowed: false,
          reason: `Insufficient margin ($${balance.toFixed(2)}). Need at least $10 to trade.`
        };
      }
      
      // 3. Check drawdown limit
      if (balance > this.peakBalance) {
        this.peakBalance = balance;
      }
      this.currentDrawdown = (this.peakBalance - balance) / this.peakBalance;
      
      if (this.currentDrawdown >= this.riskConfig.maxDrawdown) {
        return {
          allowed: false,
          reason: `Max drawdown reached (${(this.currentDrawdown * 100).toFixed(1)}%). Stopping trading for safety.`
        };
      }
      
      // 4. Check existing position on this symbol
      const positions = await asterDexService.getPositions();
      const existingPosition = positions.find(p => p.symbol === signal.symbol);
      
      if (existingPosition) {
        // Check if we're trying to trade in the SAME direction (prevent stacking)
        const currentSide = existingPosition.side === 'LONG' ? 'BUY' : 'SELL';
        if (currentSide === signal.action) {
          return {
            allowed: false,
            reason: `Already have a ${currentSide} position on ${signal.symbol}. No stacking allowed.`
          };
        }
        
        // If trading OPPOSITE direction, we'll close the existing position first
        logger.info(`🔄 Signal reversal detected on ${signal.symbol}: Closing ${currentSide}, opening ${signal.action}`, {
          context: 'RiskManagement',
        });
      }
      
      // 5. Check max open positions
      if (positions.length >= this.riskConfig.maxOpenPositions && !existingPosition) {
        return {
          allowed: false,
          reason: `Max ${this.riskConfig.maxOpenPositions} positions already open. Close existing positions first.`
        };
      }
      
      // 6. Check portfolio risk (total exposure)
      const totalExposure = positions.reduce((sum, pos) => sum + (pos.size * pos.entryPrice), 0);
      const portfolioRisk = totalExposure / balance;
      
      if (portfolioRisk >= this.riskConfig.maxPortfolioRisk && !existingPosition) {
        return {
          allowed: false,
          reason: `Portfolio risk limit reached (${(portfolioRisk * 100).toFixed(1)}%). Too much capital at risk.`
        };
      }
      
      return { allowed: true, reason: 'Risk checks passed' };
    } catch (error) {
      logger.error('Risk check failed', error, { context: 'RiskManagement' });
      return { allowed: false, reason: 'Risk check error' };
    }
  }
  
  /**
   * Calculate position size based on risk management rules
   */
  private async calculatePositionSize(signal: TradingSignal, price: number): Promise<number> {
    const balance = await asterDexService.getBalance();
    
    // Define minimum order sizes and precision per market (Aster DEX requirements)
    const MARKET_CONFIG: Record<string, { minSize: number; precision: number }> = {
      'BTC/USDT': { minSize: 0.001, precision: 3 },   // 0.001 BTC min
      'ETH/USDT': { minSize: 0.01, precision: 2 },    // 0.01 ETH min
      'SOL/USDT': { minSize: 0.1, precision: 1 },     // 0.1 SOL min
      'ASTER/USDT': { minSize: 10, precision: 0 },    // 10 ASTER min (whole numbers)
      'ZEC/USDT': { minSize: 0.05, precision: 2 },    // 0.05 ZEC min
    };
    
    const config = MARKET_CONFIG[signal.symbol] || { minSize: 0.001, precision: 3 };
    const minSize = config.minSize;
    const precision = config.precision;
    
    // Max risk per trade (e.g., 5% of $101 = $5.05)
    const maxRiskAmount = balance * this.riskConfig.maxRiskPerTrade;
    
    // Max position size (e.g., 30% of $101 = $30.30)
    const maxPositionValue = balance * this.riskConfig.maxPositionSize;
    
    // Calculate size based on stop loss distance
    // If stop loss is 3%, we can risk $5.05 / 0.03 = $168.33 worth of crypto
    const riskBasedSize = maxRiskAmount / (this.riskConfig.stopLossPercent * price);
    
    // Take the smaller of risk-based size and max position size
    let finalSize = Math.min(
      riskBasedSize,
      maxPositionValue / price
    );
    
    // Ensure we meet minimum order size
    if (finalSize < minSize) {
      logger.warn(`⚠️ Calculated size ${finalSize.toFixed(6)} < minimum ${minSize} for ${signal.symbol}`, {
        context: 'RiskManagement',
      });
      finalSize = minSize; // Use minimum size (will be checked against balance)
    }
    
    // Round to correct precision (CRITICAL for Aster DEX)
    finalSize = Math.floor(finalSize * Math.pow(10, precision)) / Math.pow(10, precision);
    
    // Verify we can afford this position
    const positionValue = finalSize * price;
    if (positionValue > balance) {
      logger.warn(`⚠️ Position value $${positionValue.toFixed(2)} exceeds balance $${balance.toFixed(2)}`, {
        context: 'RiskManagement',
      });
      return 0; // Can't afford this trade
    }
    
    logger.info(`📊 Position Size Calculation for ${signal.symbol}`, {
      context: 'RiskManagement',
      data: {
        balance: balance.toFixed(2),
        maxRisk: maxRiskAmount.toFixed(2),
        stopLoss: (this.riskConfig.stopLossPercent * 100).toFixed(1) + '%',
        minOrderSize: minSize.toFixed(precision),
        calculatedSize: finalSize.toFixed(precision),
        estimatedValue: (finalSize * price).toFixed(2),
        meetsMinimum: finalSize >= minSize ? '✅' : '❌',
        precision: precision,
      }
    });
    
    return finalSize;
  }
  
  /**
   * Override executeTrade to add risk management
   */
  async executeTrade(signal: TradingSignal): Promise<boolean> {
    try {
      if (signal.action === 'HOLD') {
        return false;
      }

      // 1. Check if we can take this trade (risk limits)
      const riskCheck = await this.canTakeTrade(signal);
      if (!riskCheck.allowed) {
        logger.warn(`🛑 Trade blocked by risk management: ${riskCheck.reason}`, {
          context: 'RiskManagement',
          data: { symbol: signal.symbol, action: signal.action }
        });
        
        // Add message to Model Chat
        useStore.getState().addModelMessage({
          id: `${Date.now()}-risk-block`,
          model: this.config.name,
          message: `🛑 RISK LIMIT: ${riskCheck.reason}`,
          timestamp: Date.now(),
          type: 'alert',
        });
        
        return false;
      }

      // 2. Calculate proper position size based on risk
      const price = await asterDexService.getPrice(signal.symbol);
      const safeSize = await this.calculatePositionSize(signal, price);
      
      // Check if position size is valid
      if (safeSize <= 0) {
        logger.warn(`🛑 Position size too small or can't afford ${signal.symbol} trade`, {
          context: 'RiskManagement',
        });
        
        useStore.getState().addModelMessage({
          id: `${Date.now()}-size-block`,
          model: this.config.name,
          message: `⚠️ SKIPPED: ${signal.symbol} position too small or insufficient balance`,
          timestamp: Date.now(),
          type: 'alert',
        });
        
        return false;
      }
      
      logger.info(`🤖 ${this.config.name}: ${signal.reasoning}`, {
        context: 'AITrading',
        data: { 
          model: this.config.name, 
          signal: signal.action, 
          symbol: signal.symbol,
          originalSize: signal.size,
          riskAdjustedSize: safeSize,
        },
      });

      // 3. Check if we need to close an existing opposite position
      const positions = await asterDexService.getPositions();
      const existingPosition = positions.find(p => p.symbol === signal.symbol);
      
      if (existingPosition) {
        const currentSide = existingPosition.side === 'LONG' ? 'BUY' : 'SELL';
        const oppositeSide = currentSide === 'BUY' ? 'SELL' : 'BUY';
        
        // If signal is opposite to current position, CLOSE the existing position
        if (signal.action === oppositeSide) {
          logger.info(`🔄 Closing existing ${currentSide} position before opening ${signal.action}`, {
            context: 'RiskManagement',
            data: { symbol: signal.symbol, oldSide: currentSide, newSide: signal.action }
          });
          
          // Close position using reduceOnly=true to ensure we're closing, not adding
          const closeSize = existingPosition.size;
          const closeOrder = await asterDexService.placeMarketOrder(
            signal.symbol,
            oppositeSide,
            closeSize,
            1, // Use 1x leverage to close
            true // reduceOnly=true - THIS IS CRITICAL FOR CLOSING POSITIONS
          );
          
          if (closeOrder) {
            logger.trade(`✅ Closed ${currentSide} position on ${signal.symbol}`, {
              context: 'RiskManagement',
              data: { symbol: signal.symbol, side: currentSide, size: closeSize }
            });
            
            useStore.getState().addModelMessage({
              id: `${Date.now()}-close-position`,
              model: this.config.name,
              message: `🔄 CLOSED: ${currentSide} position on ${signal.symbol} (${closeSize.toFixed(6)}) due to signal reversal`,
              timestamp: Date.now(),
              type: 'trade',
            });
          } else {
            logger.error(`❌ Failed to close ${currentSide} position on ${signal.symbol}`, undefined, {
              context: 'RiskManagement',
            });
          }
        }
      }
      
      // 4. Execute NEW position with safe position size
      const leverage = Math.min(this.calculateLeverage(signal.confidence), 10); // Cap at 10x as requested
      const order = await asterDexService.placeMarketOrder(
        signal.symbol,
        signal.action,
        safeSize,
        leverage
      );

      if (order) {
        // Update last trade time for cooldown tracking
        this.lastTradeTime.set(signal.symbol, Date.now());
        
        logger.trade(`${this.config.name} executed SAFE trade with risk management`, {
          model: this.config.name,
          action: signal.action,
          symbol: signal.symbol,
          orderId: order.orderId,
          size: safeSize,
          stopLoss: `${(this.riskConfig.stopLossPercent * 100).toFixed(1)}%`,
          takeProfit: `${(this.riskConfig.takeProfitPercent * 100).toFixed(1)}%`,
        });
        
        // Store entry analysis data for trade journal
        const entryData = {
          entryReason: signal.reasoning,
          entryConfidence: signal.confidence * 100,
          entrySignals: this.extractSignalsFromReasoning(signal.reasoning),
          entryMarketRegime: this.extractMarketRegime(signal.reasoning),
          entryScore: this.extractScore(signal.reasoning),
          entryTimestamp: Date.now(),
          leverage: leverage,
        };
        
        // Store in a map for later retrieval when position closes
        if (!this.entryDataMap) {
          this.entryDataMap = new Map();
        }
        this.entryDataMap.set(signal.symbol, entryData);
        
        // Add success message to Model Chat
        useStore.getState().addModelMessage({
          id: `${Date.now()}-trade-success`,
          model: this.config.name,
          message: `✅ TRADE EXECUTED: ${signal.action} ${safeSize.toFixed(6)} ${signal.symbol} @ ${leverage}x leverage (SL: ${(this.riskConfig.stopLossPercent * 100).toFixed(1)}%, TP: ${(this.riskConfig.takeProfitPercent * 100).toFixed(1)}%)`,
          timestamp: Date.now(),
          type: 'trade',
        });
        
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to execute trade for ${this.config.name}`, error, {
        context: 'AITrading',
        data: { model: this.config.name, signal },
      });
      return false;
    }
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    // 🔥 FORCE TRADE TEST: Verify trading system works (REMOVE AFTER TESTING)
    const IS_TESTING = process.env.NEXT_PUBLIC_FORCE_TRADE_TEST === 'true';
    if (IS_TESTING && symbol === 'BTC/USDT') {
      logger.warn('🧪 TEST MODE: Forcing a SELL signal to verify trading works', { context: 'Testing' });
      return {
        symbol,
        action: 'SELL',
        confidence: 0.55, // Above 40% threshold
        size: 0.001, // Minimum BTC size
        reasoning: 'TEST: Forced SELL signal to verify Aster DEX connection and trading permissions',
      };
    }
    
    // ENHANCED MULTI-STRATEGY ANALYSIS with Advanced Technical Indicators
    const price = marketData.currentPrice;
    const prevPrice = marketData.previousPrice || price;
    const ma = marketData.movingAverage || price;
    const volume = marketData.volume || 1;
    const avgVolume = marketData.averageVolume || 1;
    const priceChange = marketData.priceChange || 0;
    const high = marketData.highPrice || price;
    const low = marketData.lowPrice || price;
    const open = marketData.openPrice || prevPrice;
    const trades = marketData.trades || 0;
    const quoteVolume = marketData.quoteVolume || 0;

    // === BASIC INDICATORS ===
    const momentum = (price - prevPrice) / prevPrice;
    const trendDeviation = (price - ma) / ma;
    const volumeRatio = volume / avgVolume;
    const volatility = Math.abs(priceChange);
    const momentumPercent = momentum * 100;
    const trendPercent = trendDeviation * 100;
    
    // === ADVANCED TECHNICAL INDICATORS ===
    // 1. Price Range & Volatility
    const priceRange = high - low;
    const rangePercent = (priceRange / low) * 100;
    const pricePosition = (price - low) / (priceRange || 1); // 0-1 where in range (0=low, 1=high)
    
    // 2. Candle Patterns (Bullish/Bearish signals)
    const bodySize = Math.abs(price - open);
    const upperWick = high - Math.max(price, open);
    const lowerWick = Math.min(price, open) - low;
    const isBullishCandle = price > open;
    const bodyPercent = (bodySize / priceRange) * 100;
    
    // 3. Volume Profile (buying vs selling pressure)
    const avgTradeSize = volume / (trades || 1);
    const volumeIntensity = quoteVolume / (avgVolume * price || 1); // Normalized volume
    
    // 4. Relative Strength (price vs MA positioning)
    const maDistance = Math.abs(trendPercent);
    const maStrength = maDistance > 2 ? 'strong' : maDistance > 1 ? 'moderate' : 'weak';
    
    // 5. Market Microstructure
    const spreadEstimate = priceRange / price; // Rough bid-ask spread estimate
    const liquidityScore = trades > 1000 ? 'high' : trades > 500 ? 'medium' : 'low';
    
    // Advanced scoring system (weighted signals)
    let bullishScore = 0;
    let bearishScore = 0;
    const reasons: string[] = [];

    // === STRATEGY 1: MOMENTUM TRADING (Weight: High) ===
    if (momentumPercent > 2) {
      bullishScore += 4;
      reasons.push(`🚀 Strong bullish momentum: +${momentumPercent.toFixed(2)}%`);
    } else if (momentumPercent > 1) {
      bullishScore += 3;
      reasons.push(`📈 Moderate bullish momentum: +${momentumPercent.toFixed(2)}%`);
    } else if (momentumPercent > 0.3) {
      bullishScore += 2;
      reasons.push(`↗️ Bullish momentum: +${momentumPercent.toFixed(2)}%`);
    } else if (momentumPercent < -2) {
      bearishScore += 4;
      reasons.push(`🔻 Strong bearish momentum: ${momentumPercent.toFixed(2)}%`);
    } else if (momentumPercent < -1) {
      bearishScore += 3;
      reasons.push(`📉 Moderate bearish momentum: ${momentumPercent.toFixed(2)}%`);
    } else if (momentumPercent < -0.3) {
      bearishScore += 2;
      reasons.push(`↘️ Bearish momentum: ${momentumPercent.toFixed(2)}%`);
    }

    // === STRATEGY 2: TREND FOLLOWING (Weight: High) ===
    if (trendPercent > 2) {
      bullishScore += 4;
      reasons.push(`📊 Strong uptrend: +${trendPercent.toFixed(2)}% above MA`);
    } else if (trendPercent > 1) {
      bullishScore += 3;
      reasons.push(`📊 Moderate uptrend: +${trendPercent.toFixed(2)}% above MA`);
    } else if (trendPercent > 0.5) {
      bullishScore += 2;
      reasons.push(`📊 Uptrend: +${trendPercent.toFixed(2)}% above MA`);
    } else if (trendPercent < -2) {
      bearishScore += 4;
      reasons.push(`📊 Strong downtrend: ${trendPercent.toFixed(2)}% below MA`);
    } else if (trendPercent < -1) {
      bearishScore += 3;
      reasons.push(`📊 Moderate downtrend: ${trendPercent.toFixed(2)}% below MA`);
    } else if (trendPercent < -0.5) {
      bearishScore += 2;
      reasons.push(`📊 Downtrend: ${trendPercent.toFixed(2)}% below MA`);
    }

    // === STRATEGY 3: VOLUME ANALYSIS (Weight: Medium) ===
    if (volumeRatio > 2.5) {
      const volumeWeight = 4;
      if (priceChange > 0) {
        bullishScore += volumeWeight;
        reasons.push(`🔥 Exceptional buying volume: ${volumeRatio.toFixed(2)}x avg`);
      } else {
        bearishScore += volumeWeight;
        reasons.push(`🔥 Exceptional selling volume: ${volumeRatio.toFixed(2)}x avg`);
      }
    } else if (volumeRatio > 1.5) {
      const volumeWeight = 3;
      if (priceChange > 0) {
        bullishScore += volumeWeight;
        reasons.push(`💪 High buying volume: ${volumeRatio.toFixed(2)}x avg`);
      } else {
        bearishScore += volumeWeight;
        reasons.push(`💪 High selling volume: ${volumeRatio.toFixed(2)}x avg`);
      }
    } else if (volumeRatio > 1.1) {
      const volumeWeight = 2;
      if (priceChange > 0) {
        bullishScore += volumeWeight;
        reasons.push(`📊 Above-avg buying volume: ${volumeRatio.toFixed(2)}x`);
      } else {
        bearishScore += volumeWeight;
        reasons.push(`📊 Above-avg selling volume: ${volumeRatio.toFixed(2)}x`);
      }
    }

    // === STRATEGY 4: VOLATILITY & PATTERN RECOGNITION ===
    if (volatility > 5 && volumeRatio > 1.5) {
      reasons.push(`⚡ HIGH VOLATILITY BREAKOUT: ${volatility.toFixed(2)}%`);
      // High volatility with volume = strong signal amplifier
      if (priceChange > 0) {
        bullishScore += 2;
      } else {
        bearishScore += 2;
      }
    } else if (volatility < 0.5 && volumeRatio < 0.8) {
      reasons.push(`😴 Consolidation phase (low vol: ${volatility.toFixed(2)}%)`);
      // Reduce confidence in consolidation
      bullishScore = Math.floor(bullishScore * 0.7);
      bearishScore = Math.floor(bearishScore * 0.7);
    }

    // === STRATEGY 5: MOMENTUM + TREND CONVERGENCE ===
    const alignmentStrength = Math.abs(momentum) * Math.abs(trendDeviation) * 100;
    if ((momentum > 0 && trendDeviation > 0) || (momentum < 0 && trendDeviation < 0)) {
      if (alignmentStrength > 1) {
        const convergenceBonus = 3;
        if (momentum > 0) {
          bullishScore += convergenceBonus;
          reasons.push(`✅ STRONG CONVERGENCE: Momentum & trend aligned bullish`);
        } else {
          bearishScore += convergenceBonus;
          reasons.push(`✅ STRONG CONVERGENCE: Momentum & trend aligned bearish`);
        }
      }
    }
    
    // === STRATEGY 6: PRICE POSITION & RANGE ANALYSIS ===
    // Price near highs = potential resistance, near lows = potential support
    if (pricePosition > 0.9 && rangePercent > 3) {
      // Near 24h high with good range = breakout potential if volume confirms
      if (volumeRatio > 1.3 && isBullishCandle) {
        bullishScore += 3;
        reasons.push(`🚀 Breakout signal: Price at ${(pricePosition * 100).toFixed(0)}% of range with volume`);
      } else {
        bearishScore += 1;
        reasons.push(`⚠️ Resistance zone: Near 24h high, potential reversal`);
      }
    } else if (pricePosition < 0.1 && rangePercent > 3) {
      // Near 24h low = potential bounce if volume confirms
      if (volumeRatio > 1.3 && !isBullishCandle) {
        bearishScore += 3;
        reasons.push(`📉 Breakdown signal: Price at ${(pricePosition * 100).toFixed(0)}% of range with volume`);
      } else {
        bullishScore += 1;
        reasons.push(`💪 Support zone: Near 24h low, potential bounce`);
      }
    } else if (pricePosition > 0.6 && pricePosition < 0.9) {
      // Strong position in upper range
      if (momentum > 0) {
        bullishScore += 2;
        reasons.push(`📈 Strong upside momentum in upper range`);
      }
    } else if (pricePosition > 0.1 && pricePosition < 0.4) {
      // Weak position in lower range
      if (momentum < 0) {
        bearishScore += 2;
        reasons.push(`📉 Weak downside pressure in lower range`);
      }
    }
    
    // === STRATEGY 7: CANDLE PATTERN RECOGNITION ===
    // Strong body = strong conviction, wicks show rejection
    if (bodyPercent > 60) {
      // Strong directional candle
      const candleWeight = 2;
      if (isBullishCandle) {
        bullishScore += candleWeight;
        reasons.push(`🟢 Strong bullish candle (${bodyPercent.toFixed(0)}% body)`);
      } else {
        bearishScore += candleWeight;
        reasons.push(`🔴 Strong bearish candle (${bodyPercent.toFixed(0)}% body)`);
      }
    }
    
    // Hammer/Shooting Star patterns
    if (lowerWick > bodySize * 2 && upperWick < bodySize && low < price) {
      bullishScore += 2;
      reasons.push(`🔨 Hammer pattern: Strong rejection of lows`);
    } else if (upperWick > bodySize * 2 && lowerWick < bodySize && high > price) {
      bearishScore += 2;
      reasons.push(`⭐ Shooting star: Strong rejection of highs`);
    }
    
    // === STRATEGY 8: LIQUIDITY & MARKET DEPTH ===
    // High trade count = good liquidity = reliable signals
    if (liquidityScore === 'high') {
      // Boost confidence in liquid markets
      reasons.push(`💧 High liquidity (${trades} trades)`);
      bullishScore = Math.floor(bullishScore * 1.1);
      bearishScore = Math.floor(bearishScore * 1.1);
    } else if (liquidityScore === 'low' && spreadEstimate > 0.01) {
      // Reduce confidence in illiquid markets
      reasons.push(`⚠️ Low liquidity (${trades} trades, wide spread)`);
      bullishScore = Math.floor(bullishScore * 0.85);
      bearishScore = Math.floor(bearishScore * 0.85);
    }
    
    // === STRATEGY 9: VOLUME INTENSITY (Smart Money Detection) ===
    if (volumeIntensity > 1.5) {
      // Exceptionally high $ volume = institutional activity
      const intensityWeight = 3;
      if (priceChange > 0) {
        bullishScore += intensityWeight;
        reasons.push(`💰 Smart money buying: ${volumeIntensity.toFixed(1)}x volume intensity`);
      } else {
        bearishScore += intensityWeight;
        reasons.push(`💰 Smart money selling: ${volumeIntensity.toFixed(1)}x volume intensity`);
      }
    }
    
    // === STRATEGY 10: MEAN REVERSION vs TREND CONTINUATION ===
    // If far from MA with weakening momentum = potential mean reversion
    if (maDistance > 3 && Math.abs(momentumPercent) < 1) {
      if (trendPercent > 3) {
        bearishScore += 2;
        reasons.push(`🔄 Mean reversion signal: ${maDistance.toFixed(1)}% above MA, momentum fading`);
      } else if (trendPercent < -3) {
        bullishScore += 2;
        reasons.push(`🔄 Mean reversion signal: ${maDistance.toFixed(1)}% below MA, momentum fading`);
      }
    }

    // === MARKET REGIME DETECTION ===
    let marketRegime = 'RANGING';
    let regimeBonus = 1.0;
    
    if (Math.abs(trendPercent) > 1.5 && volumeRatio > 1.2) {
      marketRegime = 'TRENDING';
      regimeBonus = 1.35; // INCREASED: Boost confidence more in trending markets (profit opportunity)
      reasons.push(`🎯 STRONG TREND detected`);
    } else if (Math.abs(trendPercent) > 0.8 && volumeRatio > 1.0) {
      marketRegime = 'TRENDING';
      regimeBonus = 1.2; // Moderate trend bonus
      reasons.push(`🎯 TRENDING market`);
    } else if (volatility < 1 && volumeRatio < 0.9) {
      marketRegime = 'CONSOLIDATION';
      regimeBonus = 0.6; // REDUCED: More aggressive reduction in consolidation (avoid choppy markets)
      reasons.push(`⏸️ CONSOLIDATION phase`);
    } else if (volatility > 4) {
      marketRegime = 'VOLATILE';
      regimeBonus = 1.15; // Slight boost in volatile markets (opportunity for quick gains)
      reasons.push(`🌪️ HIGH VOLATILITY`);
    }

    // === FINAL DECISION LOGIC ===
    const totalScore = bullishScore + bearishScore;
    const maxPossibleScore = 35; // Updated for 10 strategies (was 20 for 5 strategies)
    
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let rawConfidence = 0;

    if (bullishScore > bearishScore) {
      action = 'BUY';
      rawConfidence = Math.min((bullishScore / maxPossibleScore) * 1.5, 0.95);
      rawConfidence = Math.max(rawConfidence, 0.45); // Minimum 45% to execute (above threshold)
      
      const confidence = Math.min(rawConfidence * regimeBonus, 0.95);
      return {
        symbol,
        action: 'BUY',
        confidence,
        size: 0.1 * confidence,
        reasoning: `🟢 BULLISH [Score:${bullishScore}/${totalScore}, Conf:${(confidence*100).toFixed(1)}%, ${marketRegime}]: ${reasons.join('. ')}`,
      };
    } else if (bearishScore > bullishScore) {
      action = 'SELL';
      rawConfidence = Math.min((bearishScore / maxPossibleScore) * 1.5, 0.95);
      rawConfidence = Math.max(rawConfidence, 0.45); // Minimum 45% to execute (above threshold)
      
      const confidence = Math.min(rawConfidence * regimeBonus, 0.95);
      return {
        symbol,
        action: 'SELL',
        confidence,
        size: 0.1 * confidence,
        reasoning: `🔴 BEARISH [Score:${bearishScore}/${totalScore}, Conf:${(confidence*100).toFixed(1)}%, ${marketRegime}]: ${reasons.join('. ')}`,
      };
    } else if (totalScore > 0) {
      // TIE-BREAKER: Use price momentum
      action = priceChange >= 0 ? 'BUY' : 'SELL';
      const confidence = 0.45; // Above threshold to allow trading
      return {
        symbol,
        action,
        confidence,
        size: 0.1 * confidence,
        reasoning: `🟡 TIE (${bullishScore}v${bearishScore}): Following momentum ${priceChange>0?'↗️':'↘️'} ${priceChange.toFixed(2)}%. ${reasons.join('. ')}`,
      };
    }

    return {
      symbol,
      action: 'HOLD',
      confidence: 0,
      size: 0,
      reasoning: `⚪ NEUTRAL (${marketRegime}): ${reasons.length > 0 ? reasons.join('. ') : 'Waiting for clear signals'}`,
    };
  }
}

/**
 * Trading service to manage all AI models
 */
class AITradingService {
  private models: AITradingModel[] = [];
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private entryDataMap: Map<string, any> = globalEntryDataMap; // Use global map for trade journal

  constructor() {
    this.initializeModels();
  }

  private initializeModels() {
    // Start with just one model (DeepSeek R1) with $100 initial capital
    this.models = [
      new DeepSeekR1Model(),
    ];
    logger.info('✅ Initialized DeepSeek R1 with $100 starting capital', { context: 'AITrading' });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Trading service already running', { context: 'AITrading' });
      return;
    }

    logger.info('🚀 Starting AI trading service with $100 initial capital...', { context: 'AITrading' });
    this.isRunning = true;

    // Initialize Aster DEX connection
    await asterDexService.initialize();

    // Allocate initial $100 capital to DeepSeek R1 by buying BTC
    const modelName = 'DeepSeek R1'; // Hardcode since config is protected
    const initialCapital = 100;
    const symbol = 'BTC/USDT';
    
    try {
      const allocated = await asterDexService.allocateInitialCapital(modelName, initialCapital, symbol);
      if (allocated) {
        logger.info(`✅ ${modelName} allocated $${initialCapital} to ${symbol}`, { context: 'AITrading' });
      } else {
        logger.warn(`⚠️ Initial allocation failed for ${modelName}, will trade with available balance`, { context: 'AITrading' });
      }
    } catch (error) {
      logger.error('Failed to allocate initial capital', error, { context: 'AITrading' });
    }

    // Trading loop is managed externally by Dashboard to prevent duplicate API calls
    // this.intervalId = setInterval(() => {
    //   this.runTradingCycle();
    // }, TRADING_CONSTANTS.TRADE_UPDATE_INTERVAL);

    logger.info('✅ AI trading service started', { context: 'AITrading' });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    asterDexService.disconnect();
    logger.info('🛑 AI trading service stopped', { context: 'AITrading' });
  }

  /**
   * Run a single trading cycle (for server-side cron jobs)
   */
  async runSingleCycle(): Promise<{ signals: TradingSignal[], bestSignal: TradingSignal | null }> {
    if (!this.isRunning) {
      // Initialize if not already running
      await asterDexService.initialize();
      this.isRunning = true;
    }
    return await this.runTradingCycle();
  }

  /**
   * Monitor and manage existing positions (stop-loss, take-profit, time-based exits)
   */
  private async monitorPositions(): Promise<void> {
    try {
      const positions = await asterDexService.getPositions();
      
      if (positions.length === 0) return;
      
      logger.info(`📊 Monitoring ${positions.length} open positions...`, { context: 'PositionMonitor' });
      
      // Add message to Model Chat
      useStore.getState().addModelMessage({
        id: `monitor-${Date.now()}`,
        model: 'DeepSeek R1',
        message: `📊 Monitoring ${positions.length} open position(s) for stop-loss/take-profit...`,
        timestamp: Date.now(),
        type: 'analysis',
      });
      
      for (const position of positions) {
        const currentPrice = await asterDexService.getPrice(position.symbol);
        const entryPrice = position.entryPrice;
        
        // Calculate ROE (Return on Equity) - accounts for LEVERAGE
        // This is your ACTUAL profit/loss % on the margin you put up
        const leverage = position.leverage || 5;
        const positionValue = position.size * entryPrice;
        const marginUsed = positionValue / leverage; // How much of YOUR money is at risk
        
        // Calculate ROE percentage: (Dollar P&L / Margin Used) * 100
        const roePnlPercent = (position.unrealizedPnl / marginUsed) * 100;
        
        // Also calculate price-based P&L for comparison
        let pricePnlPercent = 0;
        if (position.side === 'LONG') {
          pricePnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          pricePnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
        
        // Use ROE for stop-loss decisions (the REAL loss on your capital)
        const pnlPercent = roePnlPercent;
        
        logger.info(`📈 ${position.symbol} ${position.side}: Entry=$${entryPrice.toFixed(2)}, Current=$${currentPrice.toFixed(2)}, ROE=${pnlPercent.toFixed(2)}% (Price Move: ${pricePnlPercent.toFixed(2)}%, ${leverage}x leverage)`, {
          context: 'PositionMonitor',
          data: {
            symbol: position.symbol,
            side: position.side,
            entryPrice: entryPrice.toFixed(2),
            currentPrice: currentPrice.toFixed(2),
            roePnlPercent: pnlPercent.toFixed(2),
            pricePnlPercent: pricePnlPercent.toFixed(2),
            leverage: leverage,
            marginUsed: marginUsed.toFixed(2),
            unrealizedPnl: position.unrealizedPnl.toFixed(2),
            positionSize: position.size.toFixed(4),
          }
        });
        
        let shouldClose = false;
        let reason = '';
        
        // ⚠️ ALL THRESHOLDS BELOW USE ROE (RETURN ON EQUITY) - ACCOUNTS FOR LEVERAGE ⚠️
        // This means if you're using 5x leverage and price drops 2%, ROE loss = 10%
        
        // Get current market conditions for exit analysis
        const tickerData = await asterDexService.getTicker(position.symbol);
        const priceChange = tickerData?.priceChangePercent || 0;
        const volume = tickerData?.volume || 0;
        const avgVolume = tickerData?.averageVolume || 1;
        const volumeRatio = volume / avgVolume;
        
        // EMERGENCY: Close ANY position with > 10% ROE loss IMMEDIATELY
        if (pnlPercent <= -10) {
          shouldClose = true;
          reason = `🚨 EMERGENCY STOP: Severe ROE loss (${pnlPercent.toFixed(2)}%). Entry: $${entryPrice.toFixed(2)}, Current: $${currentPrice.toFixed(2)}. Market conditions deteriorated significantly - protecting capital.`;
          logger.error(`🚨🚨🚨 EMERGENCY STOP LOSS! ${position.symbol} ROE down ${pnlPercent.toFixed(2)}%!`, {
            context: 'PositionMonitor',
          });
        }
        // Check Stop Loss (2.5% ROE loss - tighter risk control)
        else if (pnlPercent <= -2.5) {
          shouldClose = true;
          reason = `Stop Loss triggered at ${pnlPercent.toFixed(2)}% ROE loss. Entry: $${entryPrice.toFixed(2)}, Exit: $${currentPrice.toFixed(2)}. Price moved ${pricePnlPercent.toFixed(2)}% against position with ${leverage}x leverage. Risk management protocol activated to preserve capital.`;
          logger.warn(`🚨 STOP LOSS TRIGGERED FOR ${position.symbol}! ${pnlPercent.toFixed(2)}% ROE loss`, {
            context: 'PositionMonitor',
          });
        }
        // Check Take Profit (8% ROE gain - lock in wins)
        else if (pnlPercent >= 8) {
          shouldClose = true;
          reason = `✅ Take Profit triggered at +${pnlPercent.toFixed(2)}% ROE gain! Entry: $${entryPrice.toFixed(2)}, Exit: $${currentPrice.toFixed(2)}. Price moved ${pricePnlPercent.toFixed(2)}% favorably with ${leverage}x leverage. Target profit achieved - locking in gains. Market 24h: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%.`;
          logger.info(`💰 TAKE PROFIT! ${position.symbol} ROE up ${pnlPercent.toFixed(2)}%!`, {
            context: 'PositionMonitor',
          });
        }
        // Note: Trailing stop removed - let it hit take profit at 8% or stop loss at -2.5%
        // This prevents premature exits and maximizes profit potential
        // Check for positions that have been open too long with losses (prevent holding losers)
        else if (pnlPercent < -1 && pnlPercent > -3) {
          // If losing more than 1% ROE but less than stop loss, consider market conditions
          
          // If position is LONG and market is falling, or SHORT and market is rising
          const isLongInDowntrend = position.side === 'LONG' && priceChange < -2;
          const isShortInUptrend = position.side === 'SHORT' && priceChange > 2;
          
          if (isLongInDowntrend || isShortInUptrend) {
            shouldClose = true;
            reason = `Position moving against prevailing trend - ${pnlPercent.toFixed(2)}% ROE loss. Market ${priceChange > 0 ? 'uptrend' : 'downtrend'} of ${Math.abs(priceChange).toFixed(2)}% conflicts with ${position.side} position. Volume: ${volumeRatio.toFixed(2)}x. Cutting loss early to avoid deeper drawdown.`;
          }
        }
        
        if (shouldClose) {
          logger.warn(`🚨 ${reason} - Closing ${position.side} position on ${position.symbol}`, {
            context: 'PositionMonitor',
          });
          
          // Determine opposite side for closing
          const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
          
          // Close position using reduceOnly=true
          const closeOrder = await asterDexService.placeMarketOrder(
            position.symbol,
            closeSide,
            position.size,
            1, // Use 1x leverage
            true // reduceOnly=true
          );
          
          if (closeOrder) {
            logger.trade(`✅ Closed ${position.side} position on ${position.symbol} due to: ${reason}`, {
              context: 'PositionMonitor',
              data: { symbol: position.symbol, side: position.side, pnlPercent, reason }
            });
            
            // Get entry data from the map
            const entryData = this.entryDataMap.get(position.symbol);
            const now = Date.now();
            const entryTime = entryData?.entryTimestamp || (now - 60000); // Default to 1 min ago if not found
            const durationSeconds = Math.floor((now - entryTime) / 1000);
            
            // Create trade journal entry
            const tradeEntry = {
              id: `trade-${now}`,
              timestamp: new Date(entryTime).toISOString(),
              model: 'DeepSeek R1',
              symbol: position.symbol,
              side: position.side,
              size: position.size,
              entryPrice: position.entryPrice,
              exitPrice: currentPrice,
              pnl: position.unrealizedPnl,
              pnlPercent: pnlPercent,
              leverage: entryData?.leverage || 5,
              entryReason: entryData?.entryReason || 'Position opened automatically',
              entryConfidence: entryData?.entryConfidence || 50,
              entrySignals: entryData?.entrySignals || ['Price Action'],
              entryMarketRegime: entryData?.entryMarketRegime || 'RANGING',
              entryScore: entryData?.entryScore || 'N/A',
              exitReason: reason,
              exitTimestamp: new Date(now).toISOString(),
              duration: durationSeconds,
            };
            
            // Add to client-side store (if running in browser)
            if (typeof window !== 'undefined') {
              useStore.getState().addTrade(tradeEntry);
            }
            
            // ALSO log to server-side trade history (persists across sessions)
            try {
              const response = await fetch('/api/trades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tradeEntry),
              });
              if (response.ok) {
                logger.info(`✅ Trade logged to server: ${position.symbol}`, { context: 'TradeJournal' });
              } else {
                logger.warn(`⚠️ Failed to log trade to server (${response.status})`, { context: 'TradeJournal' });
              }
            } catch (error) {
              logger.error('Failed to log trade to server', error, { context: 'TradeJournal' });
            }
            
            // Remove entry data from map
            this.entryDataMap.delete(position.symbol);
            
            useStore.getState().addModelMessage({
              id: `${Date.now()}-monitor-close`,
              model: 'DeepSeek R1',
              message: `🔄 CLOSED ${position.side} ${position.symbol} (${position.size.toFixed(6)}) - ${reason}`,
              timestamp: Date.now(),
              type: 'trade',
            });
          } else {
            logger.error(`❌ Failed to close ${position.side} position on ${position.symbol}`, undefined, {
              context: 'PositionMonitor',
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error monitoring positions', error, { context: 'PositionMonitor' });
    }
  }

  private async runTradingCycle(): Promise<{ signals: TradingSignal[], bestSignal: TradingSignal | null }> {
    const allSignals: TradingSignal[] = [];
    
    try {
      // STEP 1: Monitor existing positions for stop-loss/take-profit
      await this.monitorPositions();
      
      // STEP 2: Fetch trading pairs (Original stable list)
      let symbols = [
        'BTC/USDT', 
        'ETH/USDT', 
        'SOL/USDT', 
        'BNB/USDT',
        'XRP/USDT'
      ];
      
      // Log how many pairs we're analyzing
      logger.info(`🔍 DeepSeek R1 analyzing ${symbols.length} markets...`, { context: 'AITrading' });
      
      let bestSignal: TradingSignal | null = null;
      let highestConfidence = 0;

      for (const model of this.models) {
        // Analyze each symbol and pick the best signal
        for (const symbol of symbols) {
          // Get real market data from Binance/Aster DEX
          const currentPrice = await asterDexService.getPrice(symbol);
          
          // Skip if price is 0 (market not available)
          if (currentPrice === 0) {
            logger.warn(`⚠️ ${symbol} price is 0, skipping...`, { context: 'AITrading' });
            continue;
          }
          
          // Fetch real 24h ticker data for additional metrics
          const tickerData = await asterDexService.getTicker(symbol);
          
          const marketData: MarketData = {
            currentPrice: currentPrice,
            previousPrice: tickerData?.previousPrice || currentPrice,
            movingAverage: tickerData?.movingAverage || currentPrice,
            volume: tickerData?.volume || 0,
            averageVolume: tickerData?.averageVolume || 0,
            priceChange: tickerData?.priceChangePercent || 0,
            highPrice: tickerData?.highPrice || currentPrice,
            lowPrice: tickerData?.lowPrice || currentPrice,
            openPrice: tickerData?.openPrice || currentPrice,
            trades: tickerData?.trades || 0,
            quoteVolume: tickerData?.quoteVolume || 0,
          };

          logger.debug(`📊 Market data for ${symbol}`, {
            context: 'AITrading',
            data: { price: currentPrice, change: marketData.priceChange },
          });

          // Analyze this symbol
          const signal = await model.analyze(symbol, marketData);
          
          // Log analysis (works on both client and server)
          logger.info(`🤖 DeepSeek R1 Analysis [${symbol}]: ${signal.action} (${(signal.confidence * 100).toFixed(1)}%)`, {
            context: 'AITrading',
            data: { 
              symbol,
              action: signal.action, 
              confidence: signal.confidence,
              reasoning: signal.reasoning 
            },
          });
          
          // Send chart analysis insights to Model Chat (extract key levels)
          if (signal.action !== 'HOLD') {
            const priceChange = marketData.priceChange || 0;
            const volumeRatio = (marketData.volume || 0) / (marketData.averageVolume || 1);
            const trendPercent = ((currentPrice - (marketData.movingAverage || currentPrice)) / (marketData.movingAverage || currentPrice)) * 100;
            
            let chartInsights = `📊 ${symbol} Chart Analysis:\n`;
            chartInsights += `• Current: $${currentPrice.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% 24h)\n`;
            chartInsights += `• MA Trend: ${trendPercent >= 0 ? 'Above' : 'Below'} MA by ${Math.abs(trendPercent).toFixed(2)}%\n`;
            chartInsights += `• Volume: ${volumeRatio.toFixed(2)}x average\n`;
            
            // Extract key levels
            if (signal.reasoning.includes('support')) {
              chartInsights += `• 🛡️ Support identified near current levels\n`;
            }
            if (signal.reasoning.includes('resistance') || signal.reasoning.includes('high')) {
              chartInsights += `• ⚠️ Approaching resistance zone\n`;
            }
            if (signal.reasoning.includes('breakout') || signal.reasoning.includes('BREAKOUT')) {
              chartInsights += `• 🚀 Breakout pattern detected\n`;
            }
            if (signal.reasoning.includes('CONVERGENCE')) {
              chartInsights += `• 🎯 Multiple indicators converging\n`;
            }
            
            // Send to Model Chat
            useStore.getState().addModelMessage({
              id: `chart-${symbol}-${Date.now()}`,
              model: 'DeepSeek R1',
              message: chartInsights,
              timestamp: Date.now(),
              type: 'analysis',
            });
          }
          
          // Store ALL signals for Model Chat display
          allSignals.push(signal);
          
          // Track the best signal - PRIORITIZE TRENDING/VOLATILE MARKETS
          if (signal.action !== 'HOLD') {
            // Calculate signal quality score: confidence + regime bonus
            const isTrending = signal.reasoning.includes('TRENDING') || signal.reasoning.includes('STRONG TREND');
            const isVolatile = signal.reasoning.includes('HIGH VOLATILITY');
            const hasConvergence = signal.reasoning.includes('CONVERGENCE');
            
            let qualityScore = signal.confidence;
            if (isTrending) qualityScore *= 1.15; // 15% boost for trending markets
            if (isVolatile) qualityScore *= 1.08; // 8% boost for volatile markets
            if (hasConvergence) qualityScore *= 1.1; // 10% boost for convergence
            
            if (qualityScore > highestConfidence) {
              highestConfidence = qualityScore;
              bestSignal = signal;
            }
          }
        }
        
        // SMART SELECTION: If best signal is expensive, find most affordable alternative
        if (bestSignal && bestSignal.action !== 'HOLD') {
          const balance = await asterDexService.getBalance();
          const MIN_ORDER_VALUES: Record<string, number> = {
            'BTC/USDT': 107,  // ~0.001 BTC
            'ETH/USDT': 38,   // ~0.01 ETH
            'SOL/USDT': 18,   // ~0.1 SOL
            'ASTER/USDT': 10, // ~10 ASTER
            'ZEC/USDT': 13,   // ~0.05 ZEC
          };
          
          const bestSignalMinValue = MIN_ORDER_VALUES[bestSignal.symbol] || 100;
          
          // If we can't afford the best signal, find a cheaper alternative
          if (bestSignalMinValue > balance * 0.5) { // If min order > 50% of balance
            logger.warn(`💡 Best signal ${bestSignal.symbol} requires ~$${bestSignalMinValue}, finding cheaper alternative...`, {
              context: 'SmartSelection',
            });
            
            // Find most affordable tradeable signal
            let affordableBest: TradingSignal | null = null;
            let affordableBestValue = Infinity;
            
            for (const sig of allSignals) {
              if (sig.action !== 'HOLD' && sig.confidence > 0.4) {
                const minValue = MIN_ORDER_VALUES[sig.symbol] || 100;
                if (minValue < balance * 0.5 && minValue < affordableBestValue) {
                  affordableBest = sig;
                  affordableBestValue = minValue;
                }
              }
            }
            
            if (affordableBest) {
              logger.info(`✅ Switching to affordable alternative: ${affordableBest.symbol} (min ~$${affordableBestValue})`, {
                context: 'SmartSelection',
              });
              bestSignal = affordableBest;
            }
          }
        }
        
        // Execute the best signal if confidence > 40% (ULTRA AGGRESSIVE MODE)
        if (bestSignal && bestSignal.confidence > 0.4) {
          logger.info(`💰 DeepSeek R1 Trading BEST SIGNAL: ${bestSignal.action} ${bestSignal.size.toFixed(4)} ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}%`, {
            context: 'AITrading',
            data: { 
              symbol: bestSignal.symbol,
              action: bestSignal.action,
              size: bestSignal.size,
              confidence: bestSignal.confidence,
              reasoning: bestSignal.reasoning,
            },
          });
          
          // Execute the trade (includes risk management checks)
          const executed = await model.executeTrade(bestSignal);
          if (executed) {
            logger.trade(`✅ Trade executed successfully: ${bestSignal.symbol}`, { context: 'AITrading' });
          } else {
            logger.warn(`❌ Trade execution failed or blocked: ${bestSignal.symbol}`, { context: 'AITrading' });
          }
        } else if (bestSignal) {
          logger.warn(`⏸️ Best signal confidence too low: ${bestSignal.action} ${bestSignal.symbol} @ ${(bestSignal.confidence * 100).toFixed(1)}% (need >40%)`, {
            context: 'AITrading'
          });
        } else {
          logger.info(`😴 No tradeable signals found across all 5 markets`, { context: 'AITrading' });
        }
      }
      
      // Return ALL signals for display + the best signal for execution
      return { signals: allSignals, bestSignal };
    } catch (error) {
      logger.error('Error in trading cycle', error, { context: 'AITrading' });
    }
    return { signals: allSignals, bestSignal: null };
  }

  getModels() {
    return this.models;
  }
}

export const aiTradingService = new AITradingService();
export default aiTradingService;

