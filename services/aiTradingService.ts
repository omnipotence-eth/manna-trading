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
   * Calculate leverage based on confidence
   */
  protected calculateLeverage(confidence: number): number {
    const baseLeverage = this.config.maxLeverage * confidence;
    return Math.min(baseLeverage, this.config.maxLeverage);
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
  maxRiskPerTrade: 0.05,      // 5% per trade (increased for small account)
  maxPositionSize: 0.30,      // 30% max in one position (increased for flexibility)
  maxPortfolioRisk: 0.15,     // 15% total portfolio risk (more aggressive)
  stopLossPercent: 0.03,      // 3% stop loss
  takeProfitPercent: 0.06,    // 6% take profit
  maxDrawdown: 0.20,          // 20% max drawdown (more room to trade)
  trailingStopPercent: 0.02,  // 2% trailing stop
  maxOpenPositions: 3,        // Max 3 positions at once
};

/**
 * DeepSeek R1 - Advanced reasoning model with professional risk management
 */
export class DeepSeekR1Model extends AITradingModel {
  private riskConfig: RiskConfig;
  private initialBalance: number = 100;
  private peakBalance: number = 100;
  private currentDrawdown: number = 0;
  private lastTradeTime: Map<string, number> = new Map(); // Track last trade time per symbol
  private readonly TRADE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between trades on same asset
  
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
      const existingPosition = positions.find(p => p.symbol === signal.symbol.replace('/', ''));
      
      if (existingPosition) {
        // Check if we're trying to trade in the SAME direction (prevent stacking)
        const currentSide = existingPosition.positionAmt > 0 ? 'BUY' : 'SELL';
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
      const totalExposure = positions.reduce((sum, pos) => sum + Math.abs(pos.positionAmt * pos.entryPrice), 0);
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
      const existingPosition = positions.find(p => p.symbol === signal.symbol.replace('/', ''));
      
      if (existingPosition) {
        const currentSide = existingPosition.positionAmt > 0 ? 'BUY' : 'SELL';
        const oppositeSide = currentSide === 'BUY' ? 'SELL' : 'BUY';
        
        // If signal is opposite to current position, CLOSE the existing position
        if (signal.action === oppositeSide) {
          logger.info(`🔄 Closing existing ${currentSide} position before opening ${signal.action}`, {
            context: 'RiskManagement',
            data: { symbol: signal.symbol, oldSide: currentSide, newSide: signal.action }
          });
          
          // Close position by trading in opposite direction with same size
          const closeSize = Math.abs(existingPosition.positionAmt);
          const closeOrder = await asterDexService.placeMarketOrder(
            signal.symbol,
            oppositeSide,
            closeSize,
            1 // Use 1x leverage to close
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
    
    // Multi-factor analysis combining momentum, volume, and price action
    const price = marketData.currentPrice;
    const prevPrice = marketData.previousPrice || price;
    const ma = marketData.movingAverage || price;
    const volume = marketData.volume || 1;
    const avgVolume = marketData.averageVolume || 1;
    const priceChange = marketData.priceChange || 0;

    // Calculate indicators
    const momentum = (price - prevPrice) / prevPrice;
    const trendDeviation = (price - ma) / ma;
    const volumeRatio = volume / avgVolume;
    
    // Multi-step reasoning process
    let bullishSignals = 0;
    let bearishSignals = 0;
    const reasons: string[] = [];

    // 1. Momentum Analysis (MORE SENSITIVE - 0.3% instead of 0.5%)
    if (momentum > 0.003) {
      bullishSignals++;
      reasons.push(`Bullish momentum: ${(momentum * 100).toFixed(2)}%`);
    } else if (momentum < -0.003) {
      bearishSignals++;
      reasons.push(`Bearish momentum: ${(momentum * 100).toFixed(2)}%`);
    }

    // 2. Trend Analysis (MORE SENSITIVE - 0.5% instead of 1%)
    if (trendDeviation > 0.005) {
      bullishSignals++;
      reasons.push('Price above moving average (uptrend)');
    } else if (trendDeviation < -0.005) {
      bearishSignals++;
      reasons.push('Price below moving average (downtrend)');
    }

    // 3. Volume Confirmation (MORE SENSITIVE - 1.1x instead of 1.2x)
    if (volumeRatio > 1.1) {
      if (priceChange > 0) {
        bullishSignals++;
        reasons.push('High volume supporting upward move');
      } else {
        bearishSignals++;
        reasons.push('High volume supporting downward move');
      }
    }

    // 4. Pattern Recognition
    const volatility = Math.abs(priceChange);
    if (volatility > 2 && volumeRatio > 1.5) {
      reasons.push(`High volatility detected: ${volatility.toFixed(2)}%`);
    }

    // Decision logic with confidence calculation (ULTRA AGGRESSIVE - trade on ANY signal)
    const totalSignals = bullishSignals + bearishSignals;
    
    if (bullishSignals > bearishSignals) {
      // Higher base confidence: 50% for 1 signal, 70% for 2, 90% for 3
      const confidence = Math.min(0.5 + (bullishSignals - 1) * 0.2, 0.95);
      return {
        symbol,
        action: 'BUY',
        confidence,
        size: 0.1 * confidence, // Size scales with confidence
        reasoning: `BULLISH SIGNAL (${bullishSignals}/3 indicators): ${reasons.join('. ')}`,
      };
    } else if (bearishSignals > bullishSignals) {
      // Higher base confidence: 50% for 1 signal, 70% for 2, 90% for 3
      const confidence = Math.min(0.5 + (bearishSignals - 1) * 0.2, 0.95);
      return {
        symbol,
        action: 'SELL',
        confidence,
        size: 0.1 * confidence,
        reasoning: `BEARISH SIGNAL (${bearishSignals}/3 indicators): ${reasons.join('. ')}`,
      };
    } else if (bullishSignals === bearishSignals && totalSignals > 0) {
      // TIE-BREAKER: Use price change direction with 40% confidence
      const action = priceChange >= 0 ? 'BUY' : 'SELL';
      const confidence = 0.4; // Lower confidence for tie situations
      return {
        symbol,
        action,
        confidence,
        size: 0.1 * confidence,
        reasoning: `TIE-BREAKER (${bullishSignals}v${bearishSignals}): Following price momentum (${priceChange.toFixed(2)}%). ${reasons.join('. ')}`,
      };
    }

    return {
      symbol,
      action: 'HOLD',
      confidence: 0,
      size: 0,
      reasoning: `NEUTRAL (${bullishSignals} bullish, ${bearishSignals} bearish signals). ${reasons.length > 0 ? reasons.join('. ') : 'Waiting for clearer market direction.'}`,
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

    // Start trading loop
    this.intervalId = setInterval(() => {
      this.runTradingCycle();
    }, TRADING_CONSTANTS.TRADE_UPDATE_INTERVAL);

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

  private async runTradingCycle(): Promise<{ signals: TradingSignal[], bestSignal: TradingSignal | null }> {
    const allSignals: TradingSignal[] = [];
    
    try {
      // DeepSeek R1 analyzes multiple pairs on Aster DEX
      const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ASTER/USDT', 'ZEC/USDT'];
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
          
          // Store ALL signals for Model Chat display
          allSignals.push(signal);
          
          // Track the best signal across all symbols (with affordability check)
          if (signal.action !== 'HOLD' && signal.confidence > highestConfidence) {
            highestConfidence = signal.confidence;
            bestSignal = signal;
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

