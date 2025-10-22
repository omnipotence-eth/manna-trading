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
 * DeepSeek R1 - Advanced reasoning model
 */
export class DeepSeekR1Model extends AITradingModel {
  constructor() {
    super({
      name: 'DeepSeek R1',
      strategy: 'Deep Reasoning + Pattern Recognition',
      riskLevel: 'MEDIUM',
      maxLeverage: 10,
      maxPositionSize: 5000,
      stopLoss: 0.02,
      takeProfit: 0.05,
    });
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
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

    // Decision logic with confidence calculation (MORE AGGRESSIVE - 1 signal enough)
    const totalSignals = bullishSignals + bearishSignals;
    
    if (bullishSignals >= 1 && bullishSignals > bearishSignals) {
      // Higher base confidence: 50% for 1 signal, 70% for 2, 90% for 3
      const confidence = Math.min(0.5 + (bullishSignals - 1) * 0.2, 0.95);
      return {
        symbol,
        action: 'BUY',
        confidence,
        size: 0.1 * confidence, // Size scales with confidence
        reasoning: `BULLISH SIGNAL (${bullishSignals}/3 indicators): ${reasons.join('. ')}`,
      };
    } else if (bearishSignals >= 1 && bearishSignals > bullishSignals) {
      // Higher base confidence: 50% for 1 signal, 70% for 2, 90% for 3
      const confidence = Math.min(0.5 + (bearishSignals - 1) * 0.2, 0.95);
      return {
        symbol,
        action: 'SELL',
        confidence,
        size: 0.1 * confidence,
        reasoning: `BEARISH SIGNAL (${bearishSignals}/3 indicators): ${reasons.join('. ')}`,
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
          
          // Track the best signal across all symbols
          if (signal.action !== 'HOLD' && signal.confidence > highestConfidence) {
            highestConfidence = signal.confidence;
            bestSignal = signal;
          }
        }
        
        // Execute the best signal if confidence > 50% (AGGRESSIVE MODE)
        if (bestSignal && bestSignal.confidence > 0.5) {
          logger.info(`💰 DeepSeek R1 Trading BEST SIGNAL: ${bestSignal.action} ${bestSignal.size.toFixed(4)} ${bestSignal.symbol}`, {
            context: 'AITrading',
            data: { 
              symbol: bestSignal.symbol,
              action: bestSignal.action,
              size: bestSignal.size,
              confidence: bestSignal.confidence,
            },
          });
          
          // Execute trades with confidence > 60%
          await model.executeTrade(bestSignal);
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

