import { TradingSignal, MarketData, AITradingModel } from '@/types/trading';
import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';

/**
 * Godspeed AI Trading Model
 * OPTIMIZED FOR PROFIT - Professional trading strategy with 1-minute chart analysis
 */
export class GodspeedModel implements AITradingModel {
  private modelName = 'Godspeed';

  /**
   * Analyze 1-minute candles for rapid volume and price changes
   */
  private async analyze1MinuteAction(symbol: string): Promise<{
    volumeSpike: boolean;
    sellVolume: boolean;
    buyVolume: boolean;
    rapidPriceChange: number;
    avgVolume: number;
    recentVolume: number;
    action: 'BUY' | 'SELL' | 'NEUTRAL';
    confidence: number;
    reasoning: string;
  }> {
    try {
      // Fetch last 15 1-minute candles
      const klines = await asterDexService.getKlines(symbol, '1m', 15);
      
      if (!klines || klines.length < 10) {
        return {
          volumeSpike: false,
          sellVolume: false,
          buyVolume: false,
          rapidPriceChange: 0,
          avgVolume: 0,
          recentVolume: 0,
          action: 'NEUTRAL',
          confidence: 0,
          reasoning: 'Insufficient 1m data'
        };
      }

      // Get most recent candles
      const latestCandle = klines[klines.length - 1];
      const recentCandles = klines.slice(-5); // Last 5 minutes
      const olderCandles = klines.slice(0, -5); // Previous 10 minutes for baseline

      // Calculate average volumes
      const avgVolume = olderCandles.reduce((sum, k) => sum + k.volume, 0) / olderCandles.length;
      const recentVolume = recentCandles.reduce((sum, k) => sum + k.volume, 0) / recentCandles.length;
      const latestVolume = latestCandle.volume;

      // Detect volume spike: Recent volume > 2x average
      const volumeSpike = recentVolume > avgVolume * 2.0 || latestVolume > avgVolume * 2.5;

      // Calculate rapid price change (last 5 minutes)
      const fiveMinAgo = recentCandles[0].close;
      const currentPrice = latestCandle.close;
      const rapidPriceChange = ((currentPrice - fiveMinAgo) / fiveMinAgo) * 100;

      // Detect buy vs sell pressure from candle patterns
      let buyPressure = 0;
      let sellPressure = 0;

      recentCandles.forEach(candle => {
        const bodySize = Math.abs(candle.close - candle.open);
        const wickSize = candle.high - candle.low;
        const isBullish = candle.close > candle.open;

        if (isBullish) {
          buyPressure += (bodySize / wickSize) * candle.volume;
        } else {
          sellPressure += (bodySize / wickSize) * candle.volume;
        }
      });

      const totalPressure = buyPressure + sellPressure;
      const buyVolumeRatio = totalPressure > 0 ? buyPressure / totalPressure : 0.5;
      const sellVolumeRatio = 1 - buyVolumeRatio;

      // Strong buy volume: More than 65% buy pressure
      const buyVolume = buyVolumeRatio > 0.65 && volumeSpike;
      
      // Strong sell volume: More than 65% sell pressure  
      const sellVolume = sellVolumeRatio > 0.65 && volumeSpike;

      // Determine action based on 1-minute analysis
      let action: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let confidence = 0;
      let reasoning = '';

      // STRATEGY: Buy into large volume spikes with positive price action
      if (buyVolume && rapidPriceChange > 0.3) {
        action = 'BUY';
        confidence = Math.min(0.75 + (rapidPriceChange / 10), 0.95);
        reasoning = `🚀 BUY VOLUME SPIKE: ${buyVolumeRatio.toFixed(0)}% buy pressure, ${recentVolume.toFixed(0)}/${avgVolume.toFixed(0)} vol, +${rapidPriceChange.toFixed(2)}% in 5min`;
      }
      // STRATEGY: Sell into sell volume quickly (dump detection)
      else if (sellVolume && rapidPriceChange < -0.3) {
        action = 'SELL';
        confidence = Math.min(0.75 + (Math.abs(rapidPriceChange) / 10), 0.95);
        reasoning = `📉 SELL VOLUME SPIKE: ${sellVolumeRatio.toFixed(0)}% sell pressure, ${recentVolume.toFixed(0)}/${avgVolume.toFixed(0)} vol, ${rapidPriceChange.toFixed(2)}% in 5min`;
      }
      // STRATEGY: Catch early breakouts (volume spike + price rising)
      else if (volumeSpike && rapidPriceChange > 0.5) {
        action = 'BUY';
        confidence = Math.min(0.65 + (rapidPriceChange / 15), 0.85);
        reasoning = `⚡ RAPID BREAKOUT: ${recentVolume.toFixed(0)}/${avgVolume.toFixed(0)} volume, +${rapidPriceChange.toFixed(2)}% surge in 5min`;
      }
      // STRATEGY: Catch dumps early (volume spike + price falling)
      else if (volumeSpike && rapidPriceChange < -0.5) {
        action = 'SELL';
        confidence = Math.min(0.65 + (Math.abs(rapidPriceChange) / 15), 0.85);
        reasoning = `⚡ RAPID DUMP: ${recentVolume.toFixed(0)}/${avgVolume.toFixed(0)} volume, ${rapidPriceChange.toFixed(2)}% drop in 5min`;
      }

      return {
        volumeSpike,
        sellVolume,
        buyVolume,
        rapidPriceChange,
        avgVolume,
        recentVolume,
        action,
        confidence,
        reasoning
      };
    } catch (error) {
      logger.error(`1-minute analysis failed for ${symbol}`, error, { context: 'Godspeed' });
      return {
        volumeSpike: false,
        sellVolume: false,
        buyVolume: false,
        rapidPriceChange: 0,
        avgVolume: 0,
        recentVolume: 0,
        action: 'NEUTRAL',
        confidence: 0,
        reasoning: 'Analysis error'
      };
    }
  }

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
      // 🚀 PRIORITY 1: Check 1-minute chart for rapid volume spikes and price action
      const oneMinAnalysis = await this.analyze1MinuteAction(symbol);
      
      // If 1-minute analysis finds a strong signal, use it immediately
      if (oneMinAnalysis.confidence >= 0.65 && oneMinAnalysis.action !== 'NEUTRAL') {
        logger.info(`🎯 1-MINUTE SIGNAL TRIGGERED: ${symbol}`, {
          context: 'Godspeed',
          data: {
            action: oneMinAnalysis.action,
            confidence: (oneMinAnalysis.confidence * 100).toFixed(1) + '%',
            rapidChange: oneMinAnalysis.rapidPriceChange.toFixed(2) + '%',
            volumeSpike: oneMinAnalysis.volumeSpike,
            reasoning: oneMinAnalysis.reasoning
          }
        });

        return {
          symbol,
          action: oneMinAnalysis.action as 'BUY' | 'SELL',
          confidence: oneMinAnalysis.confidence,
          size: 1.0,
          reasoning: `[${this.modelName}] ${oneMinAnalysis.reasoning}`
        };
      }

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

      // 💡 BOOST: If 1-minute analysis shows moderate interest, boost the longer-term signal
      let oneMinuteBoost = 0;
      if (oneMinAnalysis.confidence > 0.4 && oneMinAnalysis.confidence < 0.65) {
        oneMinuteBoost = oneMinAnalysis.confidence * 0.15; // Up to 10% boost
        reasoning += ` [1m boost: +${(oneMinuteBoost * 100).toFixed(1)}%]`;
      }

      // ===== PROFITABLE STRATEGY: MULTI-FACTOR CONFIRMATION =====
      
      // 1. RSI CONDITIONS (AGGRESSIVE - Lower thresholds for low volatility markets)
      const isOversold = rsi < 40; // AGGRESSIVE: Catch early oversold (was 30)
      const isOverbought = rsi > 60; // AGGRESSIVE: Catch early overbought (was 70)
      const isBullishMomentum = rsi > 50 && rsi < 75; // Wider bullish range
      const isBearishMomentum = rsi < 50 && rsi > 25; // Wider bearish range
      
      // 2. VOLUME CONFIRMATION (AGGRESSIVE - Lower requirements)
      const hasHighVolume = volumeRatio > 1.2; // AGGRESSIVE: 20% above average (was 1.5x)
      const hasVeryHighVolume = volumeRatio > 2.0; // AGGRESSIVE: 100% above average (was 2.5x)
      
      // 3. TREND CONFIRMATION (AGGRESSIVE - Accept weaker trends)
      const isStrongTrend = trendAnalysis.strength > 0.6; // AGGRESSIVE: Accept slightly weaker trends (was 0.7)
      const isBullish = trendAnalysis.trend === 'BULL' || trendAnalysis.trend === 'STRONG_BULL';
      const isBearish = trendAnalysis.trend === 'BEAR' || trendAnalysis.trend === 'STRONG_BEAR';
      
      // 4. VOLATILITY FILTER (AGGRESSIVE - Be more tolerant of volatility)
      const isLowVolatility = volatility < 3;
      const isMediumVolatility = volatility >= 3 && volatility < 10; // AGGRESSIVE: Higher threshold (was 8)
      const isHighVolatility = volatility >= 10; // AGGRESSIVE: Only penalize extreme volatility (was 8)

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
      
      // STRATEGY 4: Moderate Trend Following (AGGRESSIVE - Higher base confidence)
      else if (isBullish && isBullishMomentum && volumeRatio > 1.0) {
        action = 'BUY';
        confidence = 0.52; // AGGRESSIVE: Above 50% threshold (was 0.45)
        reasoning = `📈 Moderate BUY: Bullish trend, RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, +${priceChange.toFixed(2)}%`;
      }
      else if (isBearish && isBearishMomentum && volumeRatio > 1.0) {
        action = 'SELL';
        confidence = 0.52; // AGGRESSIVE: Above 50% threshold (was 0.45)
        reasoning = `📉 Moderate SELL: Bearish trend, RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, ${priceChange.toFixed(2)}%`;
      }
      
      // STRATEGY 5: AGGRESSIVE Range Trading (NEW - for sideways markets)
      else if ((rsi < 45 || rsi > 55) && volumeRatio > 0.8) {
        if (rsi < 45 && priceChange < 0) {
          action = 'BUY';
          confidence = 0.51; // Just above threshold
          reasoning = `🎯 RANGE BUY: RSI ${rsi.toFixed(0)} near support, ${priceChange.toFixed(2)}% pullback`;
        } else if (rsi > 55 && priceChange > 0) {
          action = 'SELL';
          confidence = 0.51; // Just above threshold
          reasoning = `🎯 RANGE SELL: RSI ${rsi.toFixed(0)} near resistance, +${priceChange.toFixed(2)}% extension`;
        }
      }
      
      // DEFAULT: HOLD (No clear edge)
      else {
        action = 'HOLD';
        confidence = 0.2;
        reasoning = `⏸️ HOLD: Mixed signals - RSI ${rsi.toFixed(0)}, Trend ${trendAnalysis.trend}, Vol ${volumeRatio.toFixed(1)}x, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
      }

      // RISK FILTER: AGGRESSIVE - Lower rejection threshold
      if (confidence < 0.35 && action !== 'HOLD') {
        action = 'HOLD';
        reasoning = `🛑 REJECTED: ${reasoning} [Confidence too low: ${(confidence * 100).toFixed(0)}%]`;
        confidence = 0.2;
      }

      // VOLATILITY PENALTY: AGGRESSIVE - Smaller penalty
      if (isHighVolatility && action !== 'HOLD') {
        confidence *= 0.85; // AGGRESSIVE: Only 15% penalty (was 30%)
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

      // 💥 1-MINUTE BOOST: Apply boost from 1-minute analysis if present
      if (oneMinuteBoost > 0 && action !== 'HOLD') {
        confidence = Math.min(confidence + oneMinuteBoost, 0.95);
        reasoning += ` [⚡ 1min activity: ${oneMinAnalysis.rapidPriceChange.toFixed(2)}% in 5min]`;
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

