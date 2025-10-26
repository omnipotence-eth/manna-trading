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
   * 🔮 PREDICTIVE TREND ANALYSIS
   * Uses leading indicators to predict trends instead of chasing them
   */
  private async analyzeChartTrends(symbol: string): Promise<{
    trend1m: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    trend5m: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    trend15m: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    strength1m: number;
    strength5m: number;
    strength15m: number;
    trendAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
    confidence: number;
    reasoning: string;
    // New predictive indicators
    predictiveSignal: 'EARLY_BULLISH' | 'EARLY_BEARISH' | 'NEUTRAL';
    leadingIndicators: {
      volumeDivergence: number;
      momentumShift: number;
      supportResistanceBreak: number;
      accumulationDistribution: number;
    };
    predictionConfidence: number;
  }> {
    try {
      // Fetch candles for different timeframes
      const [klines1m, klines5m, klines15m] = await Promise.all([
        asterDexService.getKlines(symbol, '1m', 20),
        asterDexService.getKlines(symbol, '5m', 20),
        asterDexService.getKlines(symbol, '15m', 20)
      ]);

      // Helper function to detect trend in a timeframe
      const detectTrend = (candles: any[] | null) => {
        if (!candles || candles.length < 10) {
          return { trend: 'SIDEWAYS' as const, strength: 0 };
        }

        // Use simple moving averages and price action
        const prices = candles.map(k => k.close);
        const recentPrices = prices.slice(-5);
        const olderPrices = prices.slice(0, 10);

        const recentAvg = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
        const olderAvg = olderPrices.reduce((sum, p) => sum + p, 0) / olderPrices.length;

        const priceChange = ((recentAvg - olderAvg) / olderAvg) * 100;

        // Count higher highs/lows for trend confirmation
        let higherHighs = 0;
        let lowerLows = 0;
        
        for (let i = 1; i < candles.length; i++) {
          if (candles[i].high > candles[i-1].high) higherHighs++;
          if (candles[i].low < candles[i-1].low) lowerLows++;
        }

        const bullishBias = higherHighs / (candles.length - 1);
        const bearishBias = lowerLows / (candles.length - 1);

        // Determine trend
        let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
        let strength = 0;

        if (priceChange > 0.3 && bullishBias > 0.5) {
          trend = 'UPTREND';
          strength = Math.min(bullishBias * Math.abs(priceChange) * 10, 1);
        } else if (priceChange < -0.3 && bearishBias > 0.5) {
          trend = 'DOWNTREND';
          strength = Math.min(bearishBias * Math.abs(priceChange) * 10, 1);
        } else {
          trend = 'SIDEWAYS';
          strength = 0.3;
        }

        return { trend, strength };
      };

      // Analyze each timeframe
      const analysis1m = detectTrend(klines1m);
      const analysis5m = detectTrend(klines5m);
      const analysis15m = detectTrend(klines15m);

      // Determine overall trend alignment
      let trendAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' = 'NEUTRAL';
      let confidence = 0;
      let reasoning = '';

      const bullishCount = [analysis1m.trend, analysis5m.trend, analysis15m.trend]
        .filter(t => t === 'UPTREND').length;
      const bearishCount = [analysis1m.trend, analysis5m.trend, analysis15m.trend]
        .filter(t => t === 'DOWNTREND').length;

      // Strong alignment: All timeframes agree
      if (bullishCount === 3) {
        trendAlignment = 'BULLISH';
        confidence = (analysis1m.strength + analysis5m.strength + analysis15m.strength) / 3;
        reasoning = `📈 ALL TIMEFRAMES BULLISH: 1m/5m/15m all trending up (strength: ${(confidence * 100).toFixed(0)}%)`;
      } else if (bearishCount === 3) {
        trendAlignment = 'BEARISH';
        confidence = (analysis1m.strength + analysis5m.strength + analysis15m.strength) / 3;
        reasoning = `📉 ALL TIMEFRAMES BEARISH: 1m/5m/15m all trending down (strength: ${(confidence * 100).toFixed(0)}%)`;
      }
      // Moderate alignment: 2/3 agree
      else if (bullishCount >= 2) {
        trendAlignment = 'BULLISH';
        confidence = ((analysis1m.strength + analysis5m.strength + analysis15m.strength) / 3) * 0.75;
        reasoning = `📈 MOSTLY BULLISH: ${bullishCount}/3 timeframes uptrend (strength: ${(confidence * 100).toFixed(0)}%)`;
      } else if (bearishCount >= 2) {
        trendAlignment = 'BEARISH';
        confidence = ((analysis1m.strength + analysis5m.strength + analysis15m.strength) / 3) * 0.75;
        reasoning = `📉 MOSTLY BEARISH: ${bearishCount}/3 timeframes downtrend (strength: ${(confidence * 100).toFixed(0)}%)`;
      }
      // Mixed signals
      else {
        trendAlignment = 'MIXED';
        confidence = 0.3;
        reasoning = `⚠️ MIXED TRENDS: 1m ${analysis1m.trend}, 5m ${analysis5m.trend}, 15m ${analysis15m.trend}`;
      }

      // 🔮 PREDICTIVE ANALYSIS: Calculate leading indicators
      const leadingIndicators = await this.calculateLeadingIndicators(symbol, klines1m || [], klines5m || [], klines15m || []);
      
      // Determine predictive signal based on leading indicators
      const predictiveSignal = this.determinePredictiveSignal(leadingIndicators, analysis1m.trend, analysis5m.trend, analysis15m.trend);
      
      // Calculate prediction confidence
      const predictionConfidence = this.calculatePredictionConfidence(leadingIndicators, analysis1m.strength, analysis5m.strength, analysis15m.strength);

      // Enhance trend alignment with predictive signals
      if (predictiveSignal === 'EARLY_BULLISH' && predictionConfidence >= 0.6) {
        trendAlignment = 'BULLISH';
        confidence = Math.max(confidence, predictionConfidence);
        reasoning = `🔮 EARLY BULLISH PREDICTION: Leading indicators suggest uptrend forming (confidence: ${(predictionConfidence * 100).toFixed(0)}%)`;
      } else if (predictiveSignal === 'EARLY_BEARISH' && predictionConfidence >= 0.6) {
        trendAlignment = 'BEARISH';
        confidence = Math.max(confidence, predictionConfidence);
        reasoning = `🔮 EARLY BEARISH PREDICTION: Leading indicators suggest downtrend forming (confidence: ${(predictionConfidence * 100).toFixed(0)}%)`;
      }

      return {
        trend1m: analysis1m.trend,
        trend5m: analysis5m.trend,
        trend15m: analysis15m.trend,
        strength1m: analysis1m.strength,
        strength5m: analysis5m.strength,
        strength15m: analysis15m.strength,
        trendAlignment,
        confidence,
        reasoning,
        predictiveSignal,
        leadingIndicators,
        predictionConfidence
      };
    } catch (error) {
      logger.error(`Chart trend analysis failed for ${symbol}`, error, { context: 'Godspeed' });
      return {
        trend1m: 'SIDEWAYS',
        trend5m: 'SIDEWAYS',
        trend15m: 'SIDEWAYS',
        strength1m: 0,
        strength5m: 0,
        strength15m: 0,
        trendAlignment: 'NEUTRAL',
        confidence: 0,
        reasoning: 'Trend analysis error',
        predictiveSignal: 'NEUTRAL',
        leadingIndicators: {
          volumeDivergence: 0,
          momentumShift: 0,
          supportResistanceBreak: 0,
          accumulationDistribution: 0
        },
        predictionConfidence: 0
      };
    }
  }

  /**
   * 🔮 CALCULATE LEADING INDICATORS
   * Analyzes early signals that predict trend changes before they happen
   */
  private async calculateLeadingIndicators(symbol: string, klines1m: any[], klines5m: any[], klines15m: any[]): Promise<{
    volumeDivergence: number;
    momentumShift: number;
    supportResistanceBreak: number;
    accumulationDistribution: number;
  }> {
    try {
      // 1. VOLUME DIVERGENCE ANALYSIS
      // Detects when volume increases but price doesn't follow (early reversal signal)
      const volumeDivergence = this.calculateVolumeDivergence(klines1m, klines5m);
      
      // 2. MOMENTUM SHIFT ANALYSIS  
      // Detects when momentum is changing direction before price follows
      const momentumShift = this.calculateMomentumShift(klines1m, klines5m, klines15m);
      
      // 3. SUPPORT/RESISTANCE BREAK ANALYSIS
      // Detects when price is approaching key levels (breakout prediction)
      const supportResistanceBreak = this.calculateSupportResistanceBreak(klines1m, klines5m);
      
      // 4. ACCUMULATION/DISTRIBUTION ANALYSIS
      // Detects smart money accumulation before retail follows
      const accumulationDistribution = this.calculateAccumulationDistribution(klines1m, klines5m);

      return {
        volumeDivergence,
        momentumShift,
        supportResistanceBreak,
        accumulationDistribution
      };
    } catch (error) {
      logger.error('Failed to calculate leading indicators', error, { context: 'Godspeed' });
      return {
        volumeDivergence: 0,
        momentumShift: 0,
        supportResistanceBreak: 0,
        accumulationDistribution: 0
      };
    }
  }

  /**
   * Calculate volume divergence (leading indicator)
   */
  private calculateVolumeDivergence(klines1m: any[], klines5m: any[]): number {
    if (klines1m.length < 5 || klines5m.length < 3) return 0;

    // Compare recent volume vs price movement
    const recent1m = klines1m.slice(-5);
    const recent5m = klines5m.slice(-3);
    
    // Calculate volume trend
    const volumes1m = recent1m.map(k => parseFloat(k[5]));
    const avgVolume1m = volumes1m.reduce((sum, vol) => sum + vol, 0) / volumes1m.length;
    const currentVolume1m = volumes1m[volumes1m.length - 1];
    const volumeRatio1m = currentVolume1m / avgVolume1m;

    // Calculate price momentum
    const prices1m = recent1m.map(k => parseFloat(k[4]));
    const priceChange1m = ((prices1m[prices1m.length - 1] - prices1m[0]) / prices1m[0]) * 100;

    // Volume divergence: High volume but low price movement = reversal signal
    let divergence = 0;
    if (volumeRatio1m > 1.5 && Math.abs(priceChange1m) < 0.5) {
      divergence = volumeRatio1m * 0.3; // Strong divergence
    } else if (volumeRatio1m > 1.2 && Math.abs(priceChange1m) < 1.0) {
      divergence = volumeRatio1m * 0.2; // Moderate divergence
    }

    return Math.min(divergence, 1.0);
  }

  /**
   * Calculate momentum shift (leading indicator)
   */
  private calculateMomentumShift(klines1m: any[], klines5m: any[], klines15m: any[]): number {
    if (klines1m.length < 10) return 0;

    // Calculate RSI for different timeframes
    const rsi1m = this.calculateRSIFromKlines(klines1m.slice(-10));
    const rsi5m = this.calculateRSIFromKlines(klines5m.slice(-6));
    
    // Momentum shift: RSI divergence between timeframes
    let shift = 0;
    
    // Bullish momentum shift: 1m RSI rising while 5m RSI still low
    if (rsi1m > 50 && rsi5m < 45 && rsi1m > rsi5m + 10) {
      shift = (rsi1m - rsi5m) / 100; // Positive shift
    }
    // Bearish momentum shift: 1m RSI falling while 5m RSI still high  
    else if (rsi1m < 50 && rsi5m > 55 && rsi5m > rsi1m + 10) {
      shift = -(rsi5m - rsi1m) / 100; // Negative shift
    }

    return Math.max(-1.0, Math.min(1.0, shift));
  }

  /**
   * Calculate support/resistance break probability (leading indicator)
   */
  private calculateSupportResistanceBreak(klines1m: any[], klines5m: any[]): number {
    if (klines1m.length < 20) return 0;

    // Find recent highs and lows
    const highs = klines1m.slice(-20).map(k => parseFloat(k[2]));
    const lows = klines1m.slice(-20).map(k => parseFloat(k[3]));
    const currentPrice = parseFloat(klines1m[klines1m.length - 1][4]);

    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);
    const range = recentHigh - recentLow;
    
    // Calculate proximity to key levels
    const proximityToHigh = (recentHigh - currentPrice) / range;
    const proximityToLow = (currentPrice - recentLow) / range;
    
    // Breakout probability: Close to resistance/support + volume
    let breakProbability = 0;
    
    if (proximityToHigh < 0.1) { // Near resistance
      const volume = parseFloat(klines1m[klines1m.length - 1][5]);
      const avgVolume = klines1m.slice(-10).map(k => parseFloat(k[5])).reduce((sum, vol) => sum + vol, 0) / 10;
      if (volume > avgVolume * 1.3) {
        breakProbability = 0.7; // High breakout probability
      }
    } else if (proximityToLow < 0.1) { // Near support
      const volume = parseFloat(klines1m[klines1m.length - 1][5]);
      const avgVolume = klines1m.slice(-10).map(k => parseFloat(k[5])).reduce((sum, vol) => sum + vol, 0) / 10;
      if (volume > avgVolume * 1.3) {
        breakProbability = -0.7; // High breakdown probability
      }
    }

    return breakProbability;
  }

  /**
   * Calculate accumulation/distribution (leading indicator)
   */
  private calculateAccumulationDistribution(klines1m: any[], klines5m: any[]): number {
    if (klines1m.length < 10) return 0;

    // Calculate A/D line: Smart money accumulation
    let adLine = 0;
    for (let i = 1; i < klines1m.length; i++) {
      const current = klines1m[i];
      const previous = klines1m[i - 1];
      
      const high = parseFloat(current[2]);
      const low = parseFloat(current[3]);
      const close = parseFloat(current[4]);
      const volume = parseFloat(current[5]);
      
      const previousClose = parseFloat(previous[4]);
      
      // Money Flow Multiplier
      const mfm = ((close - low) - (high - close)) / (high - low);
      
      // Money Flow Volume
      const mfv = mfm * volume;
      
      adLine += mfv;
    }

    // Normalize A/D line
    const avgVolume = klines1m.map(k => parseFloat(k[5])).reduce((sum, vol) => sum + vol, 0) / klines1m.length;
    const normalizedAD = adLine / (avgVolume * klines1m.length);

    // Accumulation signal: Positive A/D = smart money buying
    return Math.max(-1.0, Math.min(1.0, normalizedAD * 10));
  }

  /**
   * Determine predictive signal based on leading indicators
   */
  private determinePredictiveSignal(indicators: any, trend1m: string, trend5m: string, trend15m: string): 'EARLY_BULLISH' | 'EARLY_BEARISH' | 'NEUTRAL' {
    const { volumeDivergence, momentumShift, supportResistanceBreak, accumulationDistribution } = indicators;
    
    let bullishScore = 0;
    let bearishScore = 0;

    // Score based on leading indicators
    if (volumeDivergence > 0.3) bullishScore += 1;
    if (momentumShift > 0.2) bullishScore += 1;
    if (supportResistanceBreak > 0.5) bullishScore += 1;
    if (accumulationDistribution > 0.3) bullishScore += 1;

    if (volumeDivergence < -0.3) bearishScore += 1;
    if (momentumShift < -0.2) bearishScore += 1;
    if (supportResistanceBreak < -0.5) bearishScore += 1;
    if (accumulationDistribution < -0.3) bearishScore += 1;

    // Early signal: Leading indicators suggest trend change
    if (bullishScore >= 2 && (trend1m === 'SIDEWAYS' || trend5m === 'SIDEWAYS')) {
      return 'EARLY_BULLISH';
    } else if (bearishScore >= 2 && (trend1m === 'SIDEWAYS' || trend5m === 'SIDEWAYS')) {
      return 'EARLY_BEARISH';
    }

    return 'NEUTRAL';
  }

  /**
   * Calculate prediction confidence based on leading indicators
   */
  private calculatePredictionConfidence(indicators: any, strength1m: number, strength5m: number, strength15m: number): number {
    const { volumeDivergence, momentumShift, supportResistanceBreak, accumulationDistribution } = indicators;
    
    // Weight leading indicators
    const leadingScore = (
      Math.abs(volumeDivergence) * 0.25 +
      Math.abs(momentumShift) * 0.25 +
      Math.abs(supportResistanceBreak) * 0.25 +
      Math.abs(accumulationDistribution) * 0.25
    );

    // Combine with traditional trend strength
    const traditionalStrength = (strength1m + strength5m + strength15m) / 3;
    
    // Prediction confidence: Leading indicators + trend confirmation
    return Math.min(1.0, leadingScore + (traditionalStrength * 0.3));
  }

  /**
   * Calculate RSI from klines data
   */
  private calculateRSIFromKlines(klines: any[]): number {
    if (klines.length < 14) return 50;

    const closes = klines.map(k => parseFloat(k[4]));
    const gains = [];
    const losses = [];

    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }

    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }

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
      // 🚀 PRIORITY 1: Analyze chart trends across timeframes
      const trendAnalysis = await this.analyzeChartTrends(symbol);
      
      // 🚀 PRIORITY 2: Check 1-minute chart for rapid volume spikes and price action
      const oneMinAnalysis = await this.analyze1MinuteAction(symbol);
      
      // STRONG SIGNAL: Volume spike + Trend alignment
      if (oneMinAnalysis.confidence >= 0.65 && oneMinAnalysis.action !== 'NEUTRAL') {
        // Boost confidence if trend aligns
        let finalConfidence = oneMinAnalysis.confidence;
        let trendBoost = 0;
        
        if (oneMinAnalysis.action === 'BUY' && trendAnalysis.trendAlignment === 'BULLISH') {
          trendBoost = trendAnalysis.confidence * 0.1; // Up to 10% boost
          finalConfidence = Math.min(finalConfidence + trendBoost, 0.98);
        } else if (oneMinAnalysis.action === 'SELL' && trendAnalysis.trendAlignment === 'BEARISH') {
          trendBoost = trendAnalysis.confidence * 0.1; // Up to 10% boost
          finalConfidence = Math.min(finalConfidence + trendBoost, 0.98);
        }
        
        logger.info(`🎯 1-MINUTE SIGNAL TRIGGERED: ${symbol}`, {
          context: 'Godspeed',
          data: {
            action: oneMinAnalysis.action,
            confidence: (finalConfidence * 100).toFixed(1) + '%',
            rapidChange: oneMinAnalysis.rapidPriceChange.toFixed(2) + '%',
            volumeSpike: oneMinAnalysis.volumeSpike,
            trendAlignment: trendAnalysis.trendAlignment,
            trendBoost: trendBoost > 0 ? `+${(trendBoost * 100).toFixed(1)}%` : 'none'
          }
        });

        const reasoning = trendBoost > 0 
          ? `${oneMinAnalysis.reasoning} | ${trendAnalysis.reasoning}`
          : oneMinAnalysis.reasoning;

        return {
          symbol,
          action: oneMinAnalysis.action as 'BUY' | 'SELL',
          confidence: finalConfidence,
          size: 1.0,
          reasoning: `[${this.modelName}] ${reasoning}`
        };
      }
      
      // 🔮 PREDICTIVE SIGNAL: Early trend detection (highest priority)
      if (trendAnalysis.predictiveSignal === 'EARLY_BULLISH' && trendAnalysis.predictionConfidence >= 0.65) {
        logger.info(`🔮 EARLY BULLISH PREDICTION: ${symbol}`, {
          context: 'Godspeed',
          data: {
            action: 'BUY',
            predictionConfidence: (trendAnalysis.predictionConfidence * 100).toFixed(1) + '%',
            leadingIndicators: trendAnalysis.leadingIndicators,
            trends: `1m:${trendAnalysis.trend1m} 5m:${trendAnalysis.trend5m} 15m:${trendAnalysis.trend15m}`
          }
        });

        return {
          symbol,
          action: 'BUY',
          confidence: trendAnalysis.predictionConfidence,
          size: 1.0,
          reasoning: `[${this.modelName}] ${trendAnalysis.reasoning}`
        };
      } else if (trendAnalysis.predictiveSignal === 'EARLY_BEARISH' && trendAnalysis.predictionConfidence >= 0.65) {
        logger.info(`🔮 EARLY BEARISH PREDICTION: ${symbol}`, {
          context: 'Godspeed',
          data: {
            action: 'SELL',
            predictionConfidence: (trendAnalysis.predictionConfidence * 100).toFixed(1) + '%',
            leadingIndicators: trendAnalysis.leadingIndicators,
            trends: `1m:${trendAnalysis.trend1m} 5m:${trendAnalysis.trend5m} 15m:${trendAnalysis.trend15m}`
          }
        });

        return {
          symbol,
          action: 'SELL',
          confidence: trendAnalysis.predictionConfidence,
          size: 1.0,
          reasoning: `[${this.modelName}] ${trendAnalysis.reasoning}`
        };
      }

      // STRONG SIGNAL: Trend alignment alone (all 3 timeframes agree)
      if (trendAnalysis.confidence >= 0.70 && trendAnalysis.trendAlignment !== 'NEUTRAL' && trendAnalysis.trendAlignment !== 'MIXED') {
        const action = trendAnalysis.trendAlignment === 'BULLISH' ? 'BUY' : 'SELL';
        
        logger.info(`🎯 TREND ALIGNMENT SIGNAL: ${symbol}`, {
          context: 'Godspeed',
          data: {
            action,
            confidence: (trendAnalysis.confidence * 100).toFixed(1) + '%',
            alignment: trendAnalysis.trendAlignment,
            trends: `1m:${trendAnalysis.trend1m} 5m:${trendAnalysis.trend5m} 15m:${trendAnalysis.trend15m}`
          }
        });

        return {
          symbol,
          action,
          confidence: trendAnalysis.confidence,
          size: 1.0,
          reasoning: `[${this.modelName}] ${trendAnalysis.reasoning}`
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
      const longTermTrend = this.getTrendStrength(currentPrice, movingAverage, priceChange);
      
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

      // 📊 TREND BOOST: If short-term trends align, boost the signal
      let trendBoost = 0;

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
      const isStrongTrend = longTermTrend.strength > 0.6; // AGGRESSIVE: Accept slightly weaker trends (was 0.7)
      const isBullish = longTermTrend.trend === 'BULL' || longTermTrend.trend === 'STRONG_BULL';
      const isBearish = longTermTrend.trend === 'BEAR' || longTermTrend.trend === 'STRONG_BEAR';
      
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
        reasoning = `🚀 STRONG BUY: Bullish trend (${longTermTrend.trend}), RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, +${priceChange.toFixed(2)}%`;
      } 
      else if (isBearish && hasHighVolume && isBearishMomentum && !isHighVolatility) {
        action = 'SELL';
        signalScore += 40; // Base score
        signalScore += hasVeryHighVolume ? 20 : 10; // Volume bonus
        signalScore += isStrongTrend ? 15 : 0; // Trend strength
        signalScore += Math.abs(priceChange) * 2; // Price momentum
        confidence = Math.min(signalScore / 100, 0.95);
        reasoning = `📉 STRONG SELL: Bearish trend (${longTermTrend.trend}), RSI ${rsi.toFixed(0)}, Volume ${volumeRatio.toFixed(1)}x, ${priceChange.toFixed(2)}%`;
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
        reasoning = `⏸️ HOLD: Mixed signals - RSI ${rsi.toFixed(0)}, Trend ${longTermTrend.trend}, Vol ${volumeRatio.toFixed(1)}x, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
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

      // 📈 CHART TREND BOOST: Apply boost if multi-timeframe trends align with our signal
      if (action === 'BUY' && (trendAnalysis.trendAlignment === 'BULLISH')) {
        trendBoost = trendAnalysis.confidence * 0.12; // Up to 12% boost
        confidence = Math.min(confidence + trendBoost, 0.95);
        reasoning += ` [📈 Trend aligned: ${trendAnalysis.trendAlignment} +${(trendBoost * 100).toFixed(1)}%]`;
      } else if (action === 'SELL' && (trendAnalysis.trendAlignment === 'BEARISH')) {
        trendBoost = trendAnalysis.confidence * 0.12; // Up to 12% boost
        confidence = Math.min(confidence + trendBoost, 0.95);
        reasoning += ` [📉 Trend aligned: ${trendAnalysis.trendAlignment} +${(trendBoost * 100).toFixed(1)}%]`;
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
        data: { 
          action, 
          confidence: (confidence * 100).toFixed(1) + '%', 
          rsi: rsi.toFixed(0), 
          longTermTrend: longTermTrend.trend, 
          chartTrends: `1m:${trendAnalysis.trend1m} 5m:${trendAnalysis.trend5m} 15m:${trendAnalysis.trend15m}`,
          reasoning 
        }
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

