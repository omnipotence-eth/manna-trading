import { TradingSignal, MarketData, AITradingModel } from '@/types/trading';
import { logger } from '@/lib/logger';

/**
 * Godspeed AI Trading Model
 * OPTIMIZED FOR PROFIT - Professional trading strategy
 */
export class GodspeedModel implements AITradingModel {
  private modelName = 'Godspeed';

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(priceChange: number, volatility: number): number {
    // Simplified RSI calculation based on recent price momentum
    const momentum = priceChange;
    const normalizedVolatility = Math.min(volatility / 10, 5); // Cap volatility impact
    
    // RSI approximation: 50 + (momentum adjusted by volatility)
    let rsi = 50 + (momentum * 5) - (normalizedVolatility * 2);
    return Math.max(0, Math.min(100, rsi)); // Clamp between 0-100
  }

  /**
   * Detect trend strength
   */
  private getTrendStrength(currentPrice: number, movingAverage: number, priceChange: number): {
    trend: 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR',
    strength: number
  } {
    const priceVsMA = ((currentPrice - movingAverage) / movingAverage) * 100;
    
    if (priceVsMA > 2 && priceChange > 1) {
      return { trend: 'STRONG_BULL', strength: 0.9 };
    } else if (priceVsMA > 0.5 && priceChange > 0) {
      return { trend: 'BULL', strength: 0.6 };
    } else if (priceVsMA < -2 && priceChange < -1) {
      return { trend: 'STRONG_BEAR', strength: 0.9 };
    } else if (priceVsMA < -0.5 && priceChange < 0) {
      return { trend: 'BEAR', strength: 0.6 };
    } else {
      return { trend: 'NEUTRAL', strength: 0.3 };
    }
  }

  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
    try {
      // Extract market data
      const priceChange = marketData.priceChange;
      const volume = marketData.volume;
      const volatility = marketData.volatility || 0;
      const volumeRatio = volume / (marketData.averageVolume || 1);
      const currentPrice = marketData.currentPrice;
      const movingAverage = marketData.movingAverage;

      // Calculate technical indicators
      const rsi = this.calculateRSI(priceChange, volatility);
      const trendAnalysis = this.getTrendStrength(currentPrice, movingAverage, priceChange);
      
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0;
      let reasoning = '';
      let signalScore = 0;

      // ===== PROFITABLE STRATEGY: MULTI-FACTOR CONFIRMATION =====
      
      // 1. RSI CONDITIONS (Mean Reversion + Momentum)
      const isOversold = rsi < 30; // Oversold = potential BUY
      const isOverbought = rsi > 70; // Overbought = potential SELL
      const isBullishMomentum = rsi > 50 && rsi < 70; // Healthy uptrend
      const isBearishMomentum = rsi < 50 && rsi > 30; // Healthy downtrend
      
      // 2. VOLUME CONFIRMATION (High volume = strong signal)
      const hasHighVolume = volumeRatio > 1.5; // 50% above average
      const hasVeryHighVolume = volumeRatio > 2.5; // 150% above average
      
      // 3. TREND CONFIRMATION
      const isStrongTrend = trendAnalysis.strength > 0.7;
      const isBullish = trendAnalysis.trend === 'BULL' || trendAnalysis.trend === 'STRONG_BULL';
      const isBearish = trendAnalysis.trend === 'BEAR' || trendAnalysis.trend === 'STRONG_BEAR';
      
      // 4. VOLATILITY FILTER (Too much volatility = risky)
      const isLowVolatility = volatility < 3;
      const isMediumVolatility = volatility >= 3 && volatility < 8;
      const isHighVolatility = volatility >= 8;

      // ===== DECISION LOGIC: QUALITY OVER QUANTITY =====
      
      // STRATEGY 1: Strong Trend Following with Volume Confirmation
      if (isBullish && hasHighVolume && isBullishMomentum && !isHighVolatility) {
        action = 'BUY';
        signalScore += 40; // Base score
        signalScore += hasVeryHighVolume ? 20 : 10; // Volume bonus
        signalScore += isStrongTrend ? 15 : 0; // Trend strength
        signalScore += Math.abs(priceChange) * 2; // Price momentum
        confidence = Math.min(signalScore / 100, 0.95);
        reasoning = `🚀 STRONG BUY: Bullish trend (${trendAnalysis.trend}), RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, +${priceChange.toFixed(2)}%`;
      } 
      else if (isBearish && hasHighVolume && isBearishMomentum && !isHighVolatility) {
        action = 'SELL';
        signalScore += 40; // Base score
        signalScore += hasVeryHighVolume ? 20 : 10; // Volume bonus
        signalScore += isStrongTrend ? 15 : 0; // Trend strength
        signalScore += Math.abs(priceChange) * 2; // Price momentum
        confidence = Math.min(signalScore / 100, 0.95);
        reasoning = `📉 STRONG SELL: Bearish trend (${trendAnalysis.trend}), RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, ${priceChange.toFixed(2)}%`;
      }
      
      // STRATEGY 2: Mean Reversion (Oversold/Overbought Bounce)
      else if (isOversold && hasHighVolume && priceChange < -2) {
        action = 'BUY';
        signalScore = 50 + (Math.abs(priceChange) * 3); // Stronger bounce = higher score
        confidence = Math.min(signalScore / 100, 0.85);
        reasoning = `💎 OVERSOLD BOUNCE: RSI ${rsi.toFixed(0)} (oversold), Volume ${volumeRatio.toFixed(1)}x, Potential reversal from ${priceChange.toFixed(2)}%`;
      }
      else if (isOverbought && hasHighVolume && priceChange > 2) {
        action = 'SELL';
        signalScore = 50 + (Math.abs(priceChange) * 3); // Stronger rejection = higher score
        confidence = Math.min(signalScore / 100, 0.85);
        reasoning = `⚠️ OVERBOUGHT REVERSAL: RSI ${rsi.toFixed(0)} (overbought), Volume ${volumeRatio.toFixed(1)}x, Potential correction from +${priceChange.toFixed(2)}%`;
      }
      
      // STRATEGY 3: Breakout with Volume Spike
      else if (priceChange > 3 && hasVeryHighVolume && rsi < 75) {
        action = 'BUY';
        signalScore = 60 + (priceChange * 2);
        confidence = Math.min(signalScore / 100, 0.9);
        reasoning = `🔥 BREAKOUT: +${priceChange.toFixed(2)}% with ${volumeRatio.toFixed(1)}x volume spike, RSI ${rsi.toFixed(0)}`;
      }
      else if (priceChange < -3 && hasVeryHighVolume && rsi > 25) {
        action = 'SELL';
        signalScore = 60 + (Math.abs(priceChange) * 2);
        confidence = Math.min(signalScore / 100, 0.9);
        reasoning = `💥 BREAKDOWN: ${priceChange.toFixed(2)}% with ${volumeRatio.toFixed(1)}x volume spike, RSI ${rsi.toFixed(0)}`;
      }
      
      // STRATEGY 4: Moderate Trend Following (Lower confidence)
      else if (isBullish && isBullishMomentum && volumeRatio > 1.2) {
        action = 'BUY';
        confidence = 0.45;
        reasoning = `📈 Moderate BUY: Bullish trend, RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, +${priceChange.toFixed(2)}%`;
      }
      else if (isBearish && isBearishMomentum && volumeRatio > 1.2) {
        action = 'SELL';
        confidence = 0.45;
        reasoning = `📉 Moderate SELL: Bearish trend, RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, ${priceChange.toFixed(2)}%`;
      }
      
      // DEFAULT: HOLD (No clear edge)
      else {
        action = 'HOLD';
        confidence = 0.2;
        reasoning = `⏸️ HOLD: Mixed signals - RSI ${rsi.toFixed(0)}, Trend ${trendAnalysis.trend}, Vol ${volumeRatio.toFixed(1)}x, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
      }

      // RISK FILTER: Reject low confidence trades
      if (confidence < 0.4 && action !== 'HOLD') {
        action = 'HOLD';
        reasoning = `🛑 REJECTED: ${reasoning} [Confidence too low: ${(confidence * 100).toFixed(0)}%]`;
        confidence = 0.2;
      }

      // VOLATILITY PENALTY: Reduce confidence in high volatility
      if (isHighVolatility && action !== 'HOLD') {
        confidence *= 0.7; // 30% penalty
        reasoning += ` [High volatility warning: ${volatility.toFixed(1)}]`;
      }

      // 🚀 STRONG MOVEMENT BOOST: Boost confidence for significant 24h moves
      // This rewards coins with strong momentum (pumping/dumping hard)
      if (action !== 'HOLD' && Math.abs(priceChange) > 3) {
        // For moves > 3%, boost confidence proportionally
        const momentumBoost = Math.min(0.12, Math.abs(priceChange) / 100); // Up to 12% boost
        const oldConfidence = confidence;
        confidence = Math.min(confidence * (1 + momentumBoost), 0.95);
        reasoning += ` [🔥 Strong momentum boost: +${((confidence - oldConfidence) * 100).toFixed(1)}% for ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% 24h move]`;
      }

      const signal: TradingSignal = {
        symbol,
        action,
        confidence,
        size: action === 'HOLD' ? 0 : 1.0, // Only use capital when confident
        reasoning: `[${this.modelName}] ${reasoning}`
      };

      logger.debug(`Godspeed OPTIMIZED analysis for ${symbol}`, {
        context: 'Godspeed',
        data: { action, confidence: (confidence * 100).toFixed(1) + '%', rsi: rsi.toFixed(0), trend: trendAnalysis.trend, reasoning }
      });

      return signal;
    } catch (error) {
      logger.error('Godspeed analysis failed', error, { context: 'Godspeed' });
      
      return {
        symbol,
        action: 'HOLD',
        confidence: 0.1,
        size: 0,
        reasoning: `[${this.modelName}] Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

