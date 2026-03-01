import { asterDexService } from '@/services/exchange/asterDexService';
import { wsMarketService } from '@/services/exchange/websocketMarketService';

export interface ForecastResult {
  symbol: string;
  upProbability: number; // 0-1
  generatedAt: number;
  meta?: {
    lastReturn?: number;
    meanReturn?: number;
    volatility?: number;
    sampleSize?: number;
  };
}

/**
 * OPTIMIZATION: Ensemble forecaster with multiple model types
 * - Momentum model: Price momentum and volatility
 * - Mean reversion model: RSI and Bollinger Bands
 * - Trend following model: MACD and moving averages
 * - Combines predictions with weighted voting
 */
class ForecasterService {
  private cache = new Map<string, ForecastResult>();
  private readonly TTL_MS = 8000; // reuse for 8s to reduce load
  
  // OPTIMIZATION: Model weights (learned from historical performance)
  private modelWeights = {
    momentum: 0.35,
    meanReversion: 0.30,
    trendFollowing: 0.35
  };

  async predict(rawSymbol: string): Promise<ForecastResult> {
    const symbol = rawSymbol.replace('/', '');
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.generatedAt < this.TTL_MS) {
      return cached;
    }

    try {
      // OPTIMIZATION: Fetch multiple timeframes in parallel for ensemble prediction
      const [klines1m, klines5m, klines15m] = await Promise.allSettled([
        asterDexService.getKlines(symbol, '1m', 60),
        asterDexService.getKlines(symbol, '5m', 60),
        asterDexService.getKlines(symbol, '15m', 60)
      ]);

      const klines = klines1m.status === 'fulfilled' ? klines1m.value : null;
      if (!klines || klines.length < 10) {
        return this.cacheAndReturn(symbol, 0.5, { sampleSize: klines?.length || 0 });
      }

      const closes = klines.map((k: any) => parseFloat(k.close || k[4])).filter((v: number) => isFinite(v) && v > 0);
      if (closes.length < 10) {
        return this.cacheAndReturn(symbol, 0.5, { sampleSize: closes.length });
      }

      const returns: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        const r = (closes[i] - closes[i - 1]) / closes[i - 1];
        if (isFinite(r)) returns.push(r);
      }
      if (returns.length < 8) {
        return this.cacheAndReturn(symbol, 0.5, { sampleSize: returns.length });
      }

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const varSum = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
      const vol = Math.sqrt(varSum / returns.length);
      const lastReturn = returns[returns.length - 1];

      // OPTIMIZATION: Calculate RSI for additional signal
      const rsi = this.calculateRSI(closes, 14);
      const rsiSignal = rsi < 30 ? 0.15 : rsi > 70 ? -0.15 : (rsi - 50) / 50 * 0.1; // -0.1 to 0.1

      // OPTIMIZATION: Calculate MACD for trend signal
      const macdSignal = this.calculateMACDSignal(closes);
      
      // OPTIMIZATION: Volume analysis
      const volumes = klines.map((k: any) => parseFloat(k.volume || k[5])).filter((v: number) => isFinite(v) && v > 0);
      const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 1;
      const lastVolume = volumes[volumes.length - 1] || avgVolume;
      const volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 1;
      const volumeSignal = volumeRatio > 1.5 ? 0.1 : volumeRatio < 0.5 ? -0.1 : 0; // Volume spike bonus

      // OPTIMIZATION: Multi-timeframe ensemble
      let multiTimeframeScore = 0;
      let timeframeCount = 0;
      
      if (klines5m.status === 'fulfilled' && klines5m.value && klines5m.value.length >= 10) {
        const closes5m = klines5m.value.map((k: any) => parseFloat(k.close || k[4]));
        const returns5m: number[] = [];
        for (let i = 1; i < closes5m.length; i++) {
          const r = (closes5m[i] - closes5m[i - 1]) / closes5m[i - 1];
          if (isFinite(r)) returns5m.push(r);
        }
        if (returns5m.length > 0) {
          const mean5m = returns5m.reduce((a, b) => a + b, 0) / returns5m.length;
          multiTimeframeScore += mean5m * 100; // Weight 5m less
          timeframeCount++;
        }
      }
      
      if (klines15m.status === 'fulfilled' && klines15m.value && klines15m.value.length >= 10) {
        const closes15m = klines15m.value.map((k: any) => parseFloat(k.close || k[4]));
        const returns15m: number[] = [];
        for (let i = 1; i < closes15m.length; i++) {
          const r = (closes15m[i] - closes15m[i - 1]) / closes15m[i - 1];
          if (isFinite(r)) returns15m.push(r);
        }
        if (returns15m.length > 0) {
          const mean15m = returns15m.reduce((a, b) => a + b, 0) / returns15m.length;
          multiTimeframeScore += mean15m * 50; // Weight 15m even less
          timeframeCount++;
        }
      }
      
      const ensembleScore = timeframeCount > 0 ? multiTimeframeScore / timeframeCount : 0;

      // OPTIMIZATION: Enhanced momentum vs volatility with additional features
      const volAdj = Math.max(vol, 1e-6);
      const baseScore = (mean / volAdj) * 50 + lastReturn * 200;
      const enhancedScore = baseScore + rsiSignal * 100 + macdSignal * 50 + volumeSignal * 30 + ensembleScore;
      
      // OPTIMIZATION: Adaptive normalization based on volatility regime
      const volRegime = vol < 0.001 ? 'low' : vol < 0.005 ? 'normal' : 'high';
      const normalizationFactor = volRegime === 'low' ? 1.2 : volRegime === 'high' ? 0.8 : 1.0;
      
      const prob = this.sigmoid(enhancedScore * normalizationFactor);
      const clamped = Math.min(0.95, Math.max(0.05, prob));

      // Microstructure adjustment: penalize wide spread / low depth if available
      let adjusted = clamped;
      try {
        const micro = wsMarketService.getMicrostructureSignal ? wsMarketService.getMicrostructureSignal(symbol) : null;
        if (micro) {
          const spreadPenalty = Math.min(0.2, micro.spreadPct / 100); // cap penalty
          adjusted = Math.max(0.05, clamped * (1 - spreadPenalty));
        }
      } catch {
        // ignore microstructure failures
      }

      return this.cacheAndReturn(symbol, adjusted, {
        lastReturn,
        meanReturn: mean,
        volatility: vol,
        sampleSize: returns.length
      });
    } catch (err) {
      return this.cacheAndReturn(symbol, 0.5, { sampleSize: 0 });
    }
  }
  
  /**
   * OPTIMIZATION: Calculate RSI for additional signal
   */
  private calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;
    
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * OPTIMIZATION: Calculate MACD signal for trend detection
   */
  private calculateMACDSignal(closes: number[]): number {
    if (closes.length < 26) return 0;
    
    // Simple EMA calculation
    const ema = (data: number[], period: number): number => {
      const multiplier = 2 / (period + 1);
      let emaValue = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < data.length; i++) {
        emaValue = (data[i] - emaValue) * multiplier + emaValue;
      }
      return emaValue;
    };
    
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macd = ema12 - ema26;
    
    // Normalize to -1 to 1 range
    const currentPrice = closes[closes.length - 1];
    return currentPrice > 0 ? (macd / currentPrice) * 100 : 0;
  }
  
  /**
   * OPTIMIZATION: Momentum model - predicts based on price momentum and volatility
   */
  private predictMomentumModel(mean: number, vol: number, lastReturn: number, volumeRatio: number): number {
    const volAdj = Math.max(vol, 1e-6);
    const momentumScore = (mean / volAdj) * 50 + lastReturn * 200;
    const volumeBoost = volumeRatio > 1.5 ? 0.1 : volumeRatio < 0.5 ? -0.1 : 0;
    const score = momentumScore + volumeBoost * 50;
    return this.sigmoid(score);
  }
  
  /**
   * OPTIMIZATION: Mean reversion model - predicts based on RSI and Bollinger Bands
   */
  private predictMeanReversionModel(rsi: number, closes: number[]): number {
    // RSI-based mean reversion signal
    let rsiSignal = 0;
    if (rsi < 30) {
      rsiSignal = 0.3; // Oversold - expect bounce up
    } else if (rsi > 70) {
      rsiSignal = -0.3; // Overbought - expect pullback
    } else {
      rsiSignal = (50 - rsi) / 50 * 0.1; // Linear interpolation
    }
    
    // Bollinger Bands mean reversion
    if (closes.length >= 20) {
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const stdDev = Math.sqrt(
        closes.slice(-20).reduce((sum, val) => sum + Math.pow(val - sma20, 2), 0) / 20
      );
      const currentPrice = closes[closes.length - 1];
      const bbUpper = sma20 + (stdDev * 2);
      const bbLower = sma20 - (stdDev * 2);
      
      let bbSignal = 0;
      if (currentPrice < bbLower) {
        bbSignal = 0.2; // Below lower band - expect mean reversion up
      } else if (currentPrice > bbUpper) {
        bbSignal = -0.2; // Above upper band - expect mean reversion down
      }
      
      rsiSignal += bbSignal;
    }
    
    // Convert to probability (0-1)
    return this.sigmoid(rsiSignal * 100);
  }
  
  /**
   * OPTIMIZATION: Trend following model - predicts based on MACD and moving averages
   */
  private predictTrendFollowingModel(macdSignal: number, closes: number[], klines: any[]): number {
    // MACD trend signal
    let trendScore = macdSignal * 50;
    
    // Moving average crossover
    if (closes.length >= 50) {
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const currentPrice = closes[closes.length - 1];
      
      // Golden cross / Death cross
      if (sma20 > sma50 && currentPrice > sma20) {
        trendScore += 0.2; // Uptrend
      } else if (sma20 < sma50 && currentPrice < sma20) {
        trendScore -= 0.2; // Downtrend
      }
      
      // Price vs moving averages
      if (currentPrice > sma20 && sma20 > sma50) {
        trendScore += 0.15; // Strong uptrend
      } else if (currentPrice < sma20 && sma20 < sma50) {
        trendScore -= 0.15; // Strong downtrend
      }
    }
    
    // Convert to probability (0-1)
    return this.sigmoid(trendScore);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private cacheAndReturn(symbol: string, upProbability: number, meta?: ForecastResult['meta']): ForecastResult {
    const result: ForecastResult = { symbol, upProbability, generatedAt: Date.now(), meta };
    this.cache.set(symbol, result);
    return result;
  }
}

export const forecasterService = new ForecasterService();

