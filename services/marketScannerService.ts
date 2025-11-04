/**
 * Market Scanner Service
 * Scans all Aster DEX pairs for trading opportunities
 * Analyzes volume spikes, price action, liquidity, and momentum
 * ENHANCED: Time series memory + ATR-driven analysis
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';
import { asterConfig } from '@/lib/configService';
import { TRADING_THRESHOLDS, MARKET_SCANNER_CONSTANTS } from '@/constants/tradingConstants';
import indicatorMemory from '@/lib/indicatorMemory';
import { calculateSimpleATR } from '@/lib/atr';
import { formatSymbolDisplay } from '@/lib/symbolUtils';

export interface OrderBookDepth {
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
  spread: number;
  spreadPercent: number;
  imbalance: number; // Positive = more bids, Negative = more asks
  supportLevels: number[];
  resistanceLevels: number[];
  whaleOrders: Array<{ price: number; size: number; side: 'BID' | 'ASK' }>;
  liquidityScore: number;
}

export interface MarketOpportunity {
  symbol: string;
  score: number;
  signals: string[];
  marketData: {
    price: number;
    volume24h: number;
    volumeChange: number;
    priceChange24h: number;
    avgVolume: number;
    volumeRatio: number;
    spread: number;
    liquidity: number;
    momentum: number;
    volatility: number;
    rsi: number;
    orderBook?: OrderBookDepth;
    quoteVolume24h?: number;
    // ENHANCED: ATR-based risk metrics
    atr?: number;
    atrPercent?: number;
    recommendedStopLoss?: number;
    recommendedTakeProfit?: number;
    volatilityLevel?: 'low' | 'medium' | 'high' | 'extreme';
  };
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  reasoning: string[];
  // ENHANCED: Divergence signals
  divergences?: Array<{
    type: 'bullish' | 'bearish';
    indicator: string;
    strength: number;
  }>;
}

export interface ScanResult {
  timestamp: number;
  totalSymbols: number;
  opportunities: MarketOpportunity[];
  topByVolume: MarketOpportunity[];
  volumeSpikes: MarketOpportunity[];
  bestOpportunity: MarketOpportunity | null;
}

class MarketScannerService {
  private lastScan: ScanResult | null = null;
  private scanInterval: number = 60000; // 1 minute
  private lastScanTime: number = 0;

  /**
   * Clear cached scan results (force fresh scan on next call)
   */
  clearCache(): void {
    this.lastScan = null;
    this.lastScanTime = 0;
    logger.info('Market Scanner cache cleared', { context: 'MarketScanner' });
  }

  /**
   * Scan all Aster DEX markets for opportunities
   */
  async scanMarkets(): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting market scan', {
        context: 'MarketScanner',
        data: { timestamp: startTime }
      });

      // OPTIMIZED: Use asterDexService.getExchangeInfo() which has 30-key support, caching, and timeouts
      // This replaces direct fetch() calls and enables full 600 req/sec capacity
      logger.info('Fetching exchange info and ticker data via asterDexService (30-key system)', {
        context: 'MarketScanner'
      });
      
      const exchangeInfo = await asterDexService.getExchangeInfo();
      
      // exchangeInfo.topSymbolsByVolume already has ticker data with volumes, sorted by volume!
      const symbolsWithVolume = exchangeInfo.topSymbolsByVolume || [];
      
      // Create ticker map and volume-sorted array
      const tickerMap = new Map();
      const tickersWithVolume: Array<{ symbol: string; volume: number; ticker: any }> = [];
      
      symbolsWithVolume.forEach((symbolData: any) => {
        if (!symbolData || !symbolData.symbol) {
          return; // Skip invalid entries
        }
        
        // Build ticker object from exchangeInfo data
        const ticker = {
          symbol: symbolData.symbol,
          lastPrice: symbolData.lastPrice || 0,
          volume: symbolData.volume24h || 0,
          quoteVolume: symbolData.quoteVolume24h || 0,
          priceChange: symbolData.priceChange24h || 0,
          priceChangePercent: symbolData.priceChangePercent24h || 0,
          highPrice: 0, // Not available from exchangeInfo
          lowPrice: 0,  // Not available from exchangeInfo
          openPrice: 0  // Not available from exchangeInfo
        };
        
        tickerMap.set(symbolData.symbol, ticker);
        
        const volume = symbolData.quoteVolume24h || 0;
        if (volume > 0 && isFinite(volume)) {
          tickersWithVolume.push({
            symbol: symbolData.symbol,
            volume,
            ticker
          });
        }
      });
      
      logger.info('Ticker data loaded from cached exchangeInfo', {
        context: 'MarketScanner',
        data: { 
          totalSymbols: tickersWithVolume.length,
          cached: true,
          method: '30-key asterDexService'
        }
      });

      // Sort by volume (descending) and take top 50
      tickersWithVolume.sort((a, b) => b.volume - a.volume);
      const top50Tickers = tickersWithVolume.slice(0, MARKET_SCANNER_CONSTANTS.TOP_SYMBOLS_COUNT);
      
      // CRITICAL FIX: Use ticker data directly instead of relying on exchangeInfo matching
      // This ensures we analyze the actual top 50 symbols by volume, regardless of exchangeInfo format
      const symbols = top50Tickers.map(t => ({
        symbol: formatSymbolDisplay(t.symbol),
        ticker: t.ticker,
        volume: t.volume
      }));

        logger.info(`Focusing on top ${MARKET_SCANNER_CONSTANTS.TOP_SYMBOLS_COUNT} coins by volume`, {
          context: 'MarketScanner',
          data: { 
            totalAvailable: symbolsWithVolume.length,
            top50Count: symbols.length,
            analyzingCount: Math.min(MARKET_SCANNER_CONSTANTS.ANALYZE_COUNT, symbols.length),
            topVolume: tickersWithVolume[0]?.volume || 0,
            top10Symbols: tickersWithVolume.slice(0, 10).map(t => ({ symbol: t.symbol, volume: t.volume.toFixed(0) }))
          }
        });

        // CRITICAL FIX: BATCH PROCESSING to prevent 418 rate limit errors
        // Process symbols in small batches with delays to avoid overwhelming Aster DEX
        const opportunities: MarketOpportunity[] = [];
        const blacklist = asterConfig.trading.blacklistedSymbols || [];

        // ULTRA-CONSERVATIVE batch settings to prevent 418/429 rate limit blocks
        const BATCH_SIZE = parseInt(process.env.MARKET_SCANNER_BATCH_SIZE || '5'); // Default: 5 symbols at a time
        const BATCH_DELAY = parseInt(process.env.MARKET_SCANNER_BATCH_DELAY || '5000'); // Default: 5 seconds between batches
        const MAX_SYMBOLS = parseInt(process.env.MARKET_SCANNER_MAX_SYMBOLS || '50'); // Default: only analyze top 50 symbols
        const symbolsToAnalyze = symbols.slice(0, Math.min(MAX_SYMBOLS, MARKET_SCANNER_CONSTANTS.ANALYZE_COUNT));
        const totalBatches = Math.ceil(symbolsToAnalyze.length / BATCH_SIZE);

        logger.info('Starting ULTRA-CONSERVATIVE BATCHED symbol analysis', {
          context: 'MarketScanner',
          data: { 
            maxSymbols: MAX_SYMBOLS,
            totalSymbols: symbolsToAnalyze.length,
            batchSize: BATCH_SIZE,
            totalBatches,
            delayBetweenBatches: `${BATCH_DELAY}ms`,
            estimatedDuration: `${(totalBatches * BATCH_DELAY / 1000).toFixed(0)}s`,
            note: 'ULTRA-CONSERVATIVE to prevent 418/429 rate limit blocks'
          }
        });

        const analysisResults: (MarketOpportunity | null)[] = [];

        // Process symbols in batches
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE;
          const batchEnd = Math.min(batchStart + BATCH_SIZE, symbolsToAnalyze.length);
          const batch = symbolsToAnalyze.slice(batchStart, batchEnd);

          logger.debug(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} symbols)`, {
            context: 'MarketScanner'
          });

          // Process this batch in parallel (only 10 at a time is safe)
          const batchPromises = batch.map(async (symbolInfo) => {
            try {
              // Skip blacklisted symbols
              if (blacklist.includes(symbolInfo.symbol) || blacklist.includes(symbolInfo.symbol.replace('/', ''))) {
                return null;
              }

              // CRITICAL: Check if coin is problematic
              const { problematicCoinDetector } = await import('./problematicCoinDetector');
              if (problematicCoinDetector.isProblematic(symbolInfo.symbol)) {
                return null;
              }

              // Use ticker directly from symbolInfo
              const ticker = symbolInfo.ticker;
              
              if (!ticker) {
                return null;
              }

              const opportunity = await this.analyzeSymbol(symbolInfo, ticker);
              if (opportunity) {
                // Double-check for problematic coins before adding
                const orderBook = opportunity.marketData?.orderBook;
                const problematic = await problematicCoinDetector.detectProblematicCoin(symbolInfo.symbol, ticker, orderBook);
                
                if (problematic) {
                  return null;
                }
                
                return opportunity;
              }
              
              return null;
            } catch (error) {
              logger.error(`Failed to analyze ${symbolInfo.symbol}`, error as Error, {
                context: 'MarketScanner',
                data: { symbol: symbolInfo.symbol }
              });
              return null;
            }
          });

          // Wait for this batch to complete
          const batchResults = await Promise.all(batchPromises);
          analysisResults.push(...batchResults);

          // Wait before processing next batch (unless this is the last batch)
          if (batchIndex < totalBatches - 1) {
            logger.debug(`Waiting ${BATCH_DELAY}ms before next batch...`, {
              context: 'MarketScanner'
            });
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }
        
        // Filter out null results and collect valid opportunities
        opportunities.push(...analysisResults.filter((opp): opp is MarketOpportunity => opp !== null));
        
        logger.info('Parallel analysis complete', {
          context: 'MarketScanner',
          data: {
            analyzed: analysisResults.length,
            opportunitiesFound: opportunities.length,
            filtered: analysisResults.length - opportunities.length
          }
        });

      // Sort opportunities by score
      opportunities.sort((a, b) => b.score - a.score);

      // Identify volume spikes (volume > 2x average)
      const volumeSpikes = opportunities.filter(op => op.marketData.volumeRatio > TRADING_THRESHOLDS.VOLUME_SPIKE_THRESHOLD);

      // Get top 10 by volume
      const topByVolume = opportunities
        .sort((a, b) => b.marketData.volume24h - a.marketData.volume24h)
        .slice(0, 10);

      // Re-sort by score for best opportunity
      opportunities.sort((a, b) => b.score - a.score);
      const bestOpportunity = opportunities.length > 0 ? opportunities[0] : null;

      const scanResult: ScanResult = {
        timestamp: Date.now(),
        totalSymbols: symbols.length,
        opportunities: opportunities.slice(0, 20), // Top 20 opportunities
        topByVolume,
        volumeSpikes,
        bestOpportunity
      };

      this.lastScan = scanResult;
      this.lastScanTime = Date.now();

      const scanDuration = Date.now() - startTime;
      
      // Log scan results summary
      logger.info('Market scan completed', {
        context: 'MarketScanner',
        data: {
          duration: `${scanDuration}ms`,
          symbolsAnalyzed: symbols.length,
          opportunitiesCreated: opportunities.length,
          volumeSpikes: volumeSpikes.length,
          bestOpportunity: bestOpportunity?.symbol || 'NONE',
          topOpportunities: opportunities.slice(0, 3).map(opp => ({
            symbol: opp.symbol,
            score: opp.score,
            confidence: `${(opp.confidence * 100).toFixed(0)}%`,
            recommendation: opp.recommendation
          }))
        }
      });
      
      if (opportunities.length === 0) {
        logger.warn('No opportunities created in market scan', {
          context: 'MarketScanner',
          data: {
            symbolsAnalyzed: symbols.length,
            volumeSpikes: volumeSpikes.length,
            note: 'Check logs above to see why symbols were rejected'
          }
        });
      }

      return scanResult;

    } catch (error) {
      logger.error('Market scan failed', error as Error, {
        context: 'MarketScanner'
      });
      throw error;
    }
  }

  /**
   * Analyze multiple timeframes for a symbol
   */
  private async analyzeMultipleTimeframes(symbol: string): Promise<{
    timeframes: Record<string, any>;
    aggregateScore: number;
    aggregateSignals: string[];
    bestTimeframe: string;
  } | null> {
    try {
      const timeframes = ['1m', '5m', '15m', '1h', '4h'];
      const results: Record<string, any> = {};
      let totalScore = 0;
      let validTimeframes = 0;
      const allSignals = new Set<string>();
      
      // OPTIMIZED: Process timeframes with delays and skip on rate limit
      for (const timeframe of timeframes) {
        try {
          // Add small delay between timeframe requests to prevent rate limit bursts
          if (Object.keys(results).length > 0) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between timeframes
          }
          
          const klines = await asterDexService.getKlines(symbol.replace('/', ''), timeframe, 100);
          if (klines && klines.length > 0) {
            const analysis = this.analyzeKlineData(klines, timeframe);
            if (analysis) {
              results[timeframe] = analysis;
              totalScore += analysis.score;
              validTimeframes++;
              analysis.signals.forEach((s: string) => allSignals.add(s));
            }
          }
        } catch (error) {
          // CRITICAL FIX: Gracefully handle 429 errors - continue without this timeframe
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
            logger.debug(`Rate limited on ${timeframe} for ${symbol} - skipping timeframe (non-critical)`, {
              context: 'MarketScanner',
              symbol,
              timeframe
            });
            // Continue without this timeframe - not critical
          } else {
            logger.debug(`Failed to analyze ${timeframe} for ${symbol}`, {
              context: 'MarketScanner',
              data: { symbol, timeframe, error: errorMsg }
            });
          }
        }
      }
      
      if (validTimeframes === 0) return null;
      
      const aggregateScore = totalScore / validTimeframes;
      const bestTimeframe = Object.entries(results)
        .sort(([, a], [, b]) => (b as any).score - (a as any).score)[0]?.[0] || '1h';
      
      return {
        timeframes: results,
        aggregateScore,
        aggregateSignals: Array.from(allSignals),
        bestTimeframe
      };
    } catch (error) {
      logger.error(`Multi-timeframe analysis failed for ${symbol}`, error as Error, {
        context: 'MarketScanner',
        data: { symbol }
      });
      return null;
    }
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50; // Default neutral
    
    const changes = closes.slice(1).map((close, i) => close - closes[i]);
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
    
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Analyze kline data for a specific timeframe
   */
  private analyzeKlineData(klines: any[], timeframe: string): {
    score: number;
    signals: string[];
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    momentum: number;
    volatility: number;
  } | null {
    if (!klines || klines.length < 20) return null;
    
    const closes = klines.map(k => parseFloat(k.close));
    const highs = klines.map(k => parseFloat(k.high));
    const lows = klines.map(k => parseFloat(k.low));
    const volumes = klines.map(k => parseFloat(k.volume));
    
    const currentPrice = closes[closes.length - 1];
    const priceChange = ((currentPrice - closes[0]) / closes[0]) * 100;
    
    // Calculate RSI
    const rsi = this.calculateRSI(closes, 14);
    
    // Calculate moving averages
    const sma20 = closes.slice(-20).reduce((a, b) => a + b) / 20;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b) / 50 : sma20;
    
    // Calculate volatility
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * 100;
    
    // Trend detection
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (currentPrice > sma20 && sma20 > sma50) trend = 'BULLISH';
    else if (currentPrice < sma20 && sma20 < sma50) trend = 'BEARISH';
    
    // Momentum
    const momentum = priceChange;
    
    // Scoring
    let score = 50; // Base score
    const signals: string[] = [];
    
    // Trend scoring
    if (trend === 'BULLISH') {
      score += 15;
      signals.push(`${timeframe}_BULLISH_TREND`);
    } else if (trend === 'BEARISH') {
      score -= 15;
      signals.push(`${timeframe}_BEARISH_TREND`);
    }
    
    // RSI scoring
    if (rsi < 30) {
      score += 10;
      signals.push(`${timeframe}_OVERSOLD`);
    } else if (rsi > 70) {
      score -= 10;
      signals.push(`${timeframe}_OVERBOUGHT`);
    }
    
    // Momentum scoring
    if (Math.abs(momentum) > 2) {
      score += momentum > 0 ? 10 : -10;
      signals.push(momentum > 0 ? `${timeframe}_STRONG_MOMENTUM` : `${timeframe}_WEAK_MOMENTUM`);
    }
    
    // Volume analysis
    const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b) / 5;
    if (recentVolume > avgVolume * 1.5) {
      score += 8;
      signals.push(`${timeframe}_VOLUME_SURGE`);
    }
    
    return {
      score,
      signals,
      trend,
      momentum,
      volatility
    };
  }

  /**
   * Analyze a single symbol for trading opportunities (with multi-timeframe support)
   */
  private async analyzeSymbol(symbolInfo: any, ticker: any): Promise<MarketOpportunity | null> {
    try {
      // CRITICAL FIX: Normalize symbol format
      // symbolInfo.symbol might be in BTC/USDT format, but we need BTCUSDT for consistency
      const symbolRaw = symbolInfo.symbol || ticker.symbol || '';
      const symbol = symbolRaw.replace('/', ''); // Normalize to BTCUSDT format
      const displaySymbol = formatSymbolDisplay(symbol); // Display format BTC/USDT
      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume);
      const quoteVolume24h = parseFloat(ticker.quoteVolume);
      const priceChange24h = parseFloat(ticker.priceChangePercent);
      const high24h = parseFloat(ticker.highPrice);
      const low24h = parseFloat(ticker.lowPrice);
      const openPrice = parseFloat(ticker.openPrice);

      // DIAGNOSTIC: Log all ticker data for debugging
      logger.info(`📊 Analyzing ${displaySymbol}`, {
        context: 'MarketScanner',
        data: {
          symbol: displaySymbol,
          price,
          volume24h,
          quoteVolume24h,
          priceChange24h,
          high24h,
          low24h,
          openPrice,
          spread: ((high24h - low24h) / price) * 100
        }
      });

      // CRITICAL: Filter out problematic low-liquidity coins BEFORE analysis
      // This prevents trading coins like COSMO/APE that have execution issues
      // EXTREMELY RELAXED: Lowered threshold for very quiet markets - let agent runner handle filtering
      if (quoteVolume24h < 10000) { // Minimum $10K quote volume (extremely relaxed for quiet markets)
        logger.warn(`❌ Skipping ${displaySymbol}: Extremely low liquidity ($${(quoteVolume24h / 1000).toFixed(1)}K < $10K minimum)`, {
          context: 'MarketScanner',
          data: { symbol: displaySymbol, quoteVolume24h, minRequired: 10000 }
        });
        return null; // Skip only extremely low liquidity coins
      }

      // Check for extremely wide spreads (indicates execution problems)
      // EXTREMELY RELAXED: Increased threshold even more for quiet markets
      const spreadPercent = ((high24h - low24h) / price) * 100;
      if (spreadPercent > 10.0) { // Spread > 10% indicates severe liquidity issues (relaxed from 5%)
        logger.warn(`❌ Skipping ${displaySymbol}: Extremely wide spread (${spreadPercent.toFixed(2)}% > 10% maximum) - execution risk`, {
          context: 'MarketScanner',
          data: { symbol: displaySymbol, spreadPercent }
        });
        return null; // Skip only coins with extreme execution problems
      }
      
      logger.info(`✅ ${displaySymbol} passed pre-filters, continuing analysis...`, {
        context: 'MarketScanner',
        data: { symbol: displaySymbol, quoteVolume24h, spreadPercent }
      });
      
      // PRELIMINARY SCORE: Quick calculation to decide if MTF analysis is worth it
      // This prevents wasting API calls on low-scoring symbols
      let preliminaryScore = 50; // Base score
      const volumeRatioEstimate = quoteVolume24h / 100000; // Rough estimate (will be recalculated later)
      if (volumeRatioEstimate > 2.0) preliminaryScore += 15; // High volume bonus
      if (spreadPercent < 2.0) preliminaryScore += 10; // Good liquidity bonus
      if (quoteVolume24h > 500000) preliminaryScore += 10; // High absolute volume
      
      // MULTI-TIMEFRAME ANALYSIS (1m, 5m, 15m, 1h, 4h)
      // OPTIMIZED: Only analyze multi-timeframe for high-scoring opportunities to reduce API load
      const mtfAnalysis = displaySymbol && preliminaryScore >= 60 ? await this.analyzeMultipleTimeframes(displaySymbol) : null;
      let mtfBonus = 0;
      let mtfSignals: string[] = [];
      
      if (mtfAnalysis) {
        // Bonus/penalty based on multi-timeframe consensus
        const bullishTimeframes = Object.values(mtfAnalysis.timeframes).filter((tf: any) => tf.trend === 'BULLISH').length;
        const bearishTimeframes = Object.values(mtfAnalysis.timeframes).filter((tf: any) => tf.trend === 'BEARISH').length;
        const totalTimeframes = Object.keys(mtfAnalysis.timeframes).length;
        
        if (bullishTimeframes >= totalTimeframes * 0.6) {
          mtfBonus = 20; // 60%+ timeframes bullish
          mtfSignals.push('MTF_BULLISH_CONSENSUS');
        } else if (bearishTimeframes >= totalTimeframes * 0.6) {
          mtfBonus = -20; // 60%+ timeframes bearish
          mtfSignals.push('MTF_BEARISH_CONSENSUS');
        }
        
        // Add best timeframe signal
        const bestTf = mtfAnalysis.timeframes[mtfAnalysis.bestTimeframe];
        if (bestTf && bestTf.score > 65) {
          mtfBonus += 10;
          mtfSignals.push(`MTF_STRONG_${mtfAnalysis.bestTimeframe.toUpperCase()}`);
        }
        
        logger.info(`📈 Multi-timeframe analysis for ${displaySymbol}:`, {
          context: 'MarketScanner',
          data: {
            symbol: displaySymbol,
            aggregateScore: mtfAnalysis.aggregateScore.toFixed(1),
            bestTimeframe: mtfAnalysis.bestTimeframe,
            bullishTimeframes,
            bearishTimeframes,
            totalTimeframes,
            bonus: mtfBonus
          }
        });
      }
      
      // ENHANCED: Calculate ATR for adaptive risk management
      const atrResult = calculateSimpleATR(price, high24h, low24h, openPrice);
      const atrPercent = atrResult.atrPercent;
      const volatility = atrPercent; // Use ATR as volatility measure
      
      // OPTIMIZED: Rate of Change momentum (more sensitive)
      const momentum = ((price - openPrice) / openPrice) * 100;
      const momentumStrength = Math.abs(momentum) / 10; // Normalize to 0-1
      
      // OPTIMIZED: Better RSI estimation using price extremes
      const pricePosition = (price - low24h) / (high24h - low24h);
      const rsiMidpoint = 50; // RSI midpoint
      const rsiRange = 100; // Full RSI range
      const rsi = rsiMidpoint + (pricePosition - TRADING_THRESHOLDS.DEFAULT_CONFIDENCE) * rsiRange;
      
      // ENHANCED: Store in time series memory for divergence detection
      indicatorMemory.addSnapshot(displaySymbol, {
        price,
        rsi,
        volume: volume24h,
        momentum,
        volatility,
        timestamp: Date.now()
      });
      
      // OPTIMIZED: Dynamic spread calculation
      const spread = ((high24h - low24h) / price) * 100;
      const spreadQuality = Math.max(0, 1 - (spread / 5)); // Lower spread = better
      
      // OPTIMIZED: Use aggregated trades for volume confirmation
      let buySellRatio = 1.0;
      let buyVolume = 0;
      let sellVolume = 0;
      
      try {
        const { asterDexService } = await import('./asterDexService');
        const normalizedSymbol = symbol.replace('/', ''); // BTCUSDT format for API
        const aggTrades = await asterDexService.getAggregatedTrades(normalizedSymbol, 500);
        
        if (aggTrades) {
          buySellRatio = aggTrades.buySellRatio;
          buyVolume = aggTrades.buyVolume;
          sellVolume = aggTrades.sellVolume;
          
          logger.debug(`Aggregated trades for ${displaySymbol}: Buy/Sell ratio ${buySellRatio.toFixed(2)}`, {
            context: 'MarketScanner',
            data: { 
              symbol: displaySymbol, 
              buySellRatio, 
              buyVolume, 
              sellVolume,
              totalTrades: aggTrades.totalTrades
            }
          });
        }
      } catch (aggTradesError) {
        // Non-critical - continue without aggregated trades
        logger.debug(`Failed to get aggregated trades for ${displaySymbol} (non-critical)`, {
          context: 'MarketScanner',
          data: { symbol: displaySymbol }
        });
      }
      
      // HIGH PRIORITY FIX: Calculate volumeRatio (current volume vs average)
      // OPTIMIZED: Use klines for better volume ratio calculation (7-day average)
      let volumeRatio = 1.0;
      let avgVolume24h = 0;
      
      // Try to get klines for better volume ratio calculation
      // CRITICAL FIX: Add timeout and error handling for rate limits
      try {
        const { asterDexService } = await import('./asterDexService');
        const normalizedSymbol = symbol.replace('/', ''); // BTCUSDT format for API
        const klines = await asterDexService.getKlines(normalizedSymbol, '1d', 7); // 7 days
        
        if (klines && klines.length > 0) {
          // Calculate average volume over last 7 days
          avgVolume24h = klines.reduce((sum: number, k: any) => sum + (k.volume || 0), 0) / klines.length;
          volumeRatio = avgVolume24h > 0 ? quoteVolume24h / avgVolume24h : 1.2;
          
          logger.debug(`Using klines-based volume ratio for ${displaySymbol}: ${volumeRatio.toFixed(2)}x`, {
            context: 'MarketScanner',
            data: { symbol: displaySymbol, volumeRatio, avgVolume24h, currentVolume: quoteVolume24h }
          });
        } else {
          // Fallback: Use ticker average if available
          avgVolume24h = parseFloat(ticker.avgVolume || ticker.quoteVolume || '0');
          volumeRatio = avgVolume24h > 0 ? quoteVolume24h / avgVolume24h : 1.2;
        }
      } catch (klinesError) {
        // CRITICAL FIX: Gracefully handle rate limit errors
        const errorMsg = klinesError instanceof Error ? klinesError.message : String(klinesError);
        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          logger.debug(`Rate limited on volume ratio for ${displaySymbol} - using ticker fallback (non-critical)`, {
            context: 'MarketScanner',
            symbol: displaySymbol
          });
        }
        
        // Fallback: Use ticker average if klines fail
        avgVolume24h = parseFloat(ticker.avgVolume || ticker.quoteVolume || '0');
        volumeRatio = avgVolume24h > 0 ? quoteVolume24h / avgVolume24h : 1.2;
        
        logger.debug(`Using ticker-based volume ratio for ${displaySymbol}: ${volumeRatio.toFixed(2)}x`, {
          context: 'MarketScanner',
          data: { symbol: displaySymbol, volumeRatio, avgVolume24h, currentVolume: quoteVolume24h }
        });
      }
      
      // HIGH PRIORITY FIX: Calculate volumeStrength (normalized volume ratio)
      // RELAXED: More lenient calculation for quiet markets
      const volumeStrength = Math.min(volumeRatio / 1.5, 1.0); // Normalize to 0-1 scale (lowered threshold from 2.0)
      
      // OPTIMIZED: Multi-factor liquidity score
      const baseVolumeLiquidity = Math.min(quoteVolume24h / MARKET_SCANNER_CONSTANTS.MAX_LIQUIDITY_USD, 1.0); // $5M for max score
      const volumeConsistency = Math.min(volumeRatio / TRADING_THRESHOLDS.VOLUME_SPIKE_THRESHOLD, 1.0); // Consistency bonus
      const liquidity = (baseVolumeLiquidity * TRADING_THRESHOLDS.GOOD_LIQUIDITY_SCORE) + (volumeConsistency * 0.3);

      // Analyze signals
      const signals: string[] = [];
      const reasoning: string[] = [];
      let score = 50; // Base score

      // OPTIMIZED: Multi-Factor Weighted Scoring System
      
      // 1. Volume Analysis (Weight: 30%)
      let volumeScore = 0;
      
      // OPTIMIZED: Factor in buy/sell ratio for volume scoring
      const volumeConfirmation = buySellRatio > 1.2 ? 1.1 : buySellRatio < 0.8 ? 0.9 : 1.0; // Boost if more buying, reduce if more selling
      const adjustedVolumeRatio = volumeRatio * volumeConfirmation;
      
      if (adjustedVolumeRatio > MARKET_SCANNER_CONSTANTS.EXTREME_VOLUME_SPIKE) {
        signals.push('EXTREME_VOLUME_SPIKE');
        reasoning.push(`Extreme volume: ${adjustedVolumeRatio.toFixed(2)}x (breakout likely)`);
        volumeScore = 30;
      } else if (adjustedVolumeRatio > MARKET_SCANNER_CONSTANTS.HIGH_VOLUME_SPIKE) {
        signals.push('HIGH_VOLUME_SPIKE');
        reasoning.push(`Strong volume: ${adjustedVolumeRatio.toFixed(2)}x (high interest)`);
        volumeScore = 22;
      } else if (adjustedVolumeRatio > MARKET_SCANNER_CONSTANTS.VOLUME_INCREASE) {
        signals.push('VOLUME_INCREASE');
        reasoning.push(`Above-average volume: ${adjustedVolumeRatio.toFixed(2)}x`);
        volumeScore = 15;
      } else if (adjustedVolumeRatio > MARKET_SCANNER_CONSTANTS.NORMAL_VOLUME) {
        signals.push('NORMAL_VOLUME');
        reasoning.push(`Normal volume: ${adjustedVolumeRatio.toFixed(2)}x`);
        volumeScore = 8;
      } else if (adjustedVolumeRatio < 0.6) {
        signals.push('LOW_VOLUME');
        reasoning.push(`Weak volume: ${adjustedVolumeRatio.toFixed(2)}x (low confidence)`);
        volumeScore = -15;
      }
      
      // CRITICAL FIX: Buy/sell ratio bonus/penalty (SHORT detection)
      // High volume + more sellers = SHORT opportunity (not LONG)
      if (buySellRatio > 1.5 && adjustedVolumeRatio > 1.2) {
        volumeScore += 5; // Bonus for strong buying pressure
        signals.push('STRONG_BUYING_PRESSURE');
        reasoning.push(`Strong buying pressure: ${buySellRatio.toFixed(2)}x buy/sell ratio`);
      } else if (buySellRatio < 0.7 && adjustedVolumeRatio > 1.2) {
        volumeScore -= 15; // STRONGER penalty for selling pressure (SHORT opportunity)
        signals.push('STRONG_SELLING_PRESSURE');
        reasoning.push(`⚠️ BEARISH: Strong selling pressure ${(1/buySellRatio).toFixed(2)}x sell/buy ratio = SHORT opportunity`);
      } else if (buySellRatio < 0.85 && adjustedVolumeRatio > 1.2 && momentum < -3) {
        // Volume spike + negative momentum + more sellers = strong SHORT signal
        volumeScore -= 10;
        signals.push('BEARISH_VOLUME_SPIKE');
        reasoning.push(`⚠️ BEARISH: Volume spike with selling pressure = distribution (SHORT)`);
      }
      
      score += volumeScore;

      // 2. Momentum Analysis (Weight: 25%)
      // CRITICAL FIX: Volume + Negative Momentum = BEARISH BREAKDOWN (SHORT opportunity)
      // Volume spike on price drop = distribution/selling, not accumulation
      let momentumScore = 0;
      const isStrongBearishMomentum = momentum < -6;
      const isStrongBullishMomentum = momentum > 6;
      
      if (Math.abs(momentum) > 12) {
        signals.push(momentum > 0 ? 'STRONG_UPTREND' : 'STRONG_DOWNTREND');
        reasoning.push(`Strong ${momentum > 0 ? 'bullish' : 'bearish'} momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
        // ENHANCED: Stronger penalty for bearish momentum (SHORT opportunities)
        momentumScore = momentum > 0 ? 25 : -35; // -35 for strong downtrend (SHORT signal)
      } else if (Math.abs(momentum) > 6) {
        signals.push(momentum > 0 ? 'UPTREND' : 'DOWNTREND');
        reasoning.push(`${momentum > 0 ? 'Bullish' : 'Bearish'} momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
        momentumScore = momentum > 0 ? 15 : -25; // -25 for downtrend (SHORT signal)
      } else if (Math.abs(momentum) > 3) {
        momentumScore = momentum > 0 ? 8 : -15; // -15 for moderate downtrend (SHORT signal)
      }
      
      // CRITICAL FIX: Volume spike + negative momentum = BEARISH BREAKDOWN (SHORT)
      // High volume on price drop indicates distribution/selling pressure
      if (volumeRatio > MARKET_SCANNER_CONSTANTS.HIGH_VOLUME_SPIKE && momentum < -3) {
        signals.push('VOLUME_CONFIRMED_BEARISH_BREAKDOWN');
        reasoning.push(`⚠️ BEARISH: Volume spike ${volumeRatio.toFixed(2)}x on ${momentum.toFixed(2)}% drop = distribution/selling (SHORT opportunity)`);
        momentumScore -= 10; // Additional penalty for volume-confirmed breakdown
      }
      
      score += momentumScore;

      // 3. RSI Mean Reversion & Confirmation (Weight: 20%)
      let rsiScore = 0;
      if (rsi > 75) {
        signals.push('OVERBOUGHT');
        reasoning.push(`Overbought: RSI ${rsi.toFixed(1)} (reversal risk)`);
        rsiScore = -18; // Stronger penalty for extreme overbought
      } else if (rsi > 65 && momentum > 0) {
        signals.push('BULLISH_STRENGTH');
        reasoning.push(`Strong bullish: RSI ${rsi.toFixed(1)} with momentum`);
        rsiScore = 12; // Reward confirmed strength
      } else if (rsi < 25) {
        signals.push('OVERSOLD');
        reasoning.push(`Oversold: RSI ${rsi.toFixed(1)} (bounce candidate)`);
        rsiScore = 18; // Stronger reward for oversold
      } else if (rsi < 35 && momentum < 0) {
        signals.push('BEARISH_EXHAUSTION');
        reasoning.push(`Bearish exhaustion: RSI ${rsi.toFixed(1)} (potential reversal)`);
        rsiScore = 12; // Reward potential reversal setup
      } else if (rsi >= 45 && rsi <= 55) {
        rsiScore = 5; // Neutral zone bonus (breakout potential)
      }
      score += rsiScore;

      // 4. Volatility & Risk Analysis (Weight: 15%)
      let volatilityScore = 0;
      if (volatility > 20) {
        signals.push('EXTREME_VOLATILITY');
        reasoning.push(`Extreme volatility: ${volatility.toFixed(2)}% (high risk)`);
        volatilityScore = -12;
      } else if (volatility > 12) {
        signals.push('HIGH_VOLATILITY');
        reasoning.push(`High volatility: ${volatility.toFixed(2)}% (caution advised)`);
        volatilityScore = -6;
      } else if (volatility >= 5 && volatility <= 10) {
        signals.push('OPTIMAL_VOLATILITY');
        reasoning.push(`Optimal volatility: ${volatility.toFixed(2)}% (good for trading)`);
        volatilityScore = 10;
      } else if (volatility < 3) {
        signals.push('LOW_VOLATILITY');
        reasoning.push(`Low volatility: ${volatility.toFixed(2)}% (range-bound)`);
        volatilityScore = 3;
      }
      score += volatilityScore;

      // 5. Liquidity & Execution Quality (Weight: 15%)
      let liquidityScore = 0;
      if (liquidity > 0.8) {
        signals.push('EXCELLENT_LIQUIDITY');
            reasoning.push(`Excellent liquidity: $${(quoteVolume24h / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR).toFixed(2)}M (tight spreads)`);
        liquidityScore = 15;
      } else if (liquidity > 0.6) {
        signals.push('HIGH_LIQUIDITY');
            reasoning.push(`High liquidity: $${(quoteVolume24h / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR).toFixed(2)}M`);
        liquidityScore = 10;
      } else if (liquidity > 0.4) {
        signals.push('MODERATE_LIQUIDITY');
        liquidityScore = 5;
      } else if (liquidity < 0.05) { // EXTREMELY RELAXED: Only reject extremely low liquidity (< 0.05)
        signals.push('VERY_LOW_LIQUIDITY');
            reasoning.push(`Very low liquidity: $${(quoteVolume24h / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR).toFixed(2)}M (slippage risk)`);
        liquidityScore = -15;
        // CRITICAL: Log rejection reason
        logger.warn(`❌ Rejecting ${displaySymbol}: Liquidity too low (${liquidity.toFixed(3)} < 0.05)`, {
          context: 'MarketScanner',
          data: { symbol: displaySymbol, liquidity, quoteVolume24h }
        });
        return null; // Don't even return this opportunity - too risky
      } else if (liquidity < 0.15) {
        signals.push('LOW_LIQUIDITY');
            reasoning.push(`Low liquidity: $${(quoteVolume24h / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR).toFixed(2)}M (slippage risk)`);
        liquidityScore = -8; // Reduced penalty, don't reject
      }
      score += liquidityScore;

      // 6. Advanced Pattern Detection (Weight: 20%)
      let patternScore = 0;
      
      // Volume-confirmed breakouts (highest conviction)
      // CRITICAL FIX: Properly detect BEARISH breakdowns for SHORT opportunities
      if (volumeRatio > TRADING_THRESHOLDS.VOLUME_SPIKE_THRESHOLD && momentum > 5 && rsi < 70) {
        signals.push('BULLISH_BREAKOUT');
        reasoning.push('🚀 Volume-confirmed bullish breakout (high probability)');
        patternScore = 20;
      } else if (volumeRatio > TRADING_THRESHOLDS.VOLUME_SPIKE_THRESHOLD && momentum < -5 && rsi > 30) {
        signals.push('BEARISH_BREAKDOWN');
        reasoning.push('⚠️ BEARISH: Volume-confirmed bearish breakdown = SHORT opportunity (price dropping with volume = distribution)');
        patternScore = -30; // STRONGER penalty for bearish breakdown (SHORT signal)
      } else if (volumeRatio > TRADING_THRESHOLDS.VOLUME_SPIKE_THRESHOLD && momentum < -3) {
        // Even moderate drops with volume = bearish signal
        signals.push('BEARISH_DISTRIBUTION');
        reasoning.push(`⚠️ BEARISH: Volume spike on ${momentum.toFixed(2)}% drop = distribution (SHORT opportunity)`);
        patternScore = -20;
      }
      
      // Mean reversion setups
      else if (volumeRatio > 1.5 && rsi < 30 && momentum < -3) {
        signals.push('OVERSOLD_BOUNCE_SETUP');
        reasoning.push('📈 Oversold bounce setup (mean reversion candidate)');
        patternScore = 15;
      } else if (volumeRatio > 1.5 && rsi > 70 && momentum > 3) {
        signals.push('OVERBOUGHT_REVERSAL_SETUP');
        reasoning.push('📉 Overbought reversal setup');
        patternScore = -15;
      }
      
      // Consolidation breakouts
      else if (volumeRatio > 1.8 && volatility < 8 && Math.abs(momentum) < 2) {
        signals.push('CONSOLIDATION_BREAKOUT_PENDING');
        reasoning.push('⚡ Volume surge in consolidation (breakout imminent)');
        patternScore = 12;
      }
      
      // Momentum continuation with volume
      else if (volumeRatio > 1.3 && momentum > 3 && rsi > 50 && rsi < 65) {
        signals.push('MOMENTUM_CONTINUATION');
        reasoning.push('💪 Momentum continuation with volume support');
        patternScore = 10;
      }
      
      score += patternScore;
      
      // Add multi-timeframe bonus/penalty
      score += mtfBonus;
      signals.push(...mtfSignals);
      if (mtfAnalysis) {
        reasoning.push(`Multi-timeframe: ${mtfAnalysis.aggregateSignals.length} signals across ${Object.keys(mtfAnalysis.timeframes).length} timeframes`);
      }

      // OPTIMIZED: Dynamic recommendation thresholds
      // CRITICAL FIX: Properly detect SHORT opportunities (negative score = SELL/STRONG_SELL)
      let recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
      
      // ENHANCED: Check price direction AND score for accurate SHORT detection
      const isBearishPriceAction = momentum < -3 && priceChange24h < -2;
      const isBullishPriceAction = momentum > 3 && priceChange24h > 2;
      
      if (score >= MARKET_SCANNER_CONSTANTS.STRONG_BUY_SCORE && isBullishPriceAction) {
        recommendation = 'STRONG_BUY';
      } else if (score >= MARKET_SCANNER_CONSTANTS.BUY_SCORE && (isBullishPriceAction || momentum > 0)) {
        recommendation = 'BUY';
      } else if (score <= MARKET_SCANNER_CONSTANTS.SELL_SCORE && isBearishPriceAction) {
        // Score <= 20 AND price dropping = SHORT opportunity
        recommendation = score < 15 ? 'STRONG_SELL' : 'SELL';
      } else if (score <= MARKET_SCANNER_CONSTANTS.NEUTRAL_SCORE && isBearishPriceAction) {
        // Score 20-35 AND price dropping = SELL opportunity
        recommendation = 'SELL';
      } else if (score >= MARKET_SCANNER_CONSTANTS.NEUTRAL_SCORE) {
        recommendation = 'NEUTRAL';
      } else {
        // Default: Score < 20 = STRONG_SELL (bearish market)
        recommendation = 'STRONG_SELL';
      }

      // OPTIMIZED: Multi-factor confidence calculation
      const scoreConfidence = Math.min(Math.abs(score - 50) / 50, 1.0);
      const volumeConfidence = Math.min(volumeStrength, 1.0);
      const liquidityConfidence = Math.min(liquidity, 1.0);
      const momentumConfidence = Math.min(momentumStrength, 1.0);
      
      // Weighted average confidence (volume and liquidity are most important)
      const confidence = Math.min(
        (scoreConfidence * 0.4) + 
        (volumeConfidence * 0.25) + 
        (liquidityConfidence * 0.20) + 
        (momentumConfidence * 0.15),
        0.95 // Cap at 95% to maintain realistic expectations
      );

      // ========================================
      // SMART ORDER BOOK ANALYSIS (RE-ENABLED with Throttling)
      // ========================================
      // Order book analysis adds valuable depth/liquidity insights
      // With 30s caching + high score threshold (85+), this is now safe
      // OPTIMIZATION: Only analyze top opportunities (score >= 85) to minimize API calls
      // ========================================
      let orderBook: OrderBookDepth | undefined = undefined;
      
      // SMART THROTTLING: Only analyze order book for ELITE opportunities (score >= 85)
      // This reduces API calls by ~95% (was: all 50 symbols, now: ~2-3 elite symbols)
      if (score >= 85) {
        logger.debug(`📖 Analyzing order book for ELITE opportunity ${symbol} (score ${score})`, {
          context: 'MarketScanner',
          symbol,
          note: 'Order book enabled for top opportunities (score >= 85) with 30s caching'
        });
        
        try {
          orderBook = await this.analyzeOrderBookDepth(symbol) || undefined;
        } catch (error) {
          // Non-critical - continue without order book if rate limited
          logger.debug(`Skipping order book for ${symbol} (API error, likely rate limited)`, {
            context: 'MarketScanner',
            symbol
          });
          orderBook = undefined;
        }
        
        if (orderBook) {
          if (orderBook.liquidityScore > TRADING_THRESHOLDS.GOOD_LIQUIDITY_SCORE) {
            score += 10;
            signals.push('HIGH_LIQUIDITY');
            reasoning.push(`Excellent liquidity: $${(orderBook.totalDepth / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR).toFixed(2)}M order book depth`);
          } else if (orderBook.liquidityScore < TRADING_THRESHOLDS.MIN_LIQUIDITY_SCORE) {
            logger.warn(`Warning: ${symbol} has low order book liquidity (${orderBook.liquidityScore.toFixed(2)} < ${TRADING_THRESHOLDS.MIN_LIQUIDITY_SCORE})`, {
              context: 'MarketScanner',
              data: { symbol, liquidityScore: orderBook.liquidityScore, totalDepth: orderBook.totalDepth }
            });
            score -= 10;
            signals.push('LOW_ORDER_BOOK_LIQUIDITY');
            reasoning.push(`Low order book liquidity: ${orderBook.liquidityScore.toFixed(2)} - execution risk`);
          }

          if (orderBook.spreadPercent < 0.05) {
            score += 5;
            reasoning.push(`Tight spread: ${orderBook.spreadPercent.toFixed(3)}%`);
          } else if (orderBook.spreadPercent > TRADING_THRESHOLDS.MAX_SPREAD_FOR_TRADING) {
            logger.warn(`Warning: ${symbol} has wide spread (${orderBook.spreadPercent.toFixed(3)}% > ${TRADING_THRESHOLDS.MAX_SPREAD_FOR_TRADING}%) - execution risk`, {
              context: 'MarketScanner',
              data: { symbol, spreadPercent: orderBook.spreadPercent }
            });
            score -= 10;
            signals.push('WIDE_SPREAD_RISK');
            reasoning.push(`Wide spread: ${orderBook.spreadPercent.toFixed(3)}% - execution risk`);
          } else if (orderBook.spreadPercent > TRADING_THRESHOLDS.WIDE_SPREAD_WARNING) {
            score -= 5;
            signals.push('WIDE_SPREAD');
            reasoning.push(`Wide spread warning: ${orderBook.spreadPercent.toFixed(3)}%`);
          }

          if (Math.abs(orderBook.imbalance) > 0.2) {
            if (orderBook.imbalance > 0) {
              signals.push('BID_PRESSURE');
              reasoning.push(`Strong bid pressure: ${(orderBook.imbalance * 100).toFixed(1)}% buy-side dominance`);
              score += 8;
            } else {
              signals.push('ASK_PRESSURE');
              reasoning.push(`Strong ask pressure: ${(Math.abs(orderBook.imbalance) * 100).toFixed(1)}% sell-side dominance`);
              score -= 8;
            }
          }

          if (orderBook.whaleOrders.length > 0) {
            signals.push('WHALE_ACTIVITY');
            reasoning.push(`${orderBook.whaleOrders.length} large orders detected (${orderBook.whaleOrders.filter(w => w.side === 'BID').length} buys, ${orderBook.whaleOrders.filter(w => w.side === 'ASK').length} sells)`);
          }
        }
      } else {
        // For non-elite opportunities, skip order book analysis to save API calls
        logger.debug(`Skipping order book for ${symbol} (score ${score} < 85 threshold)`, {
          context: 'MarketScanner',
          symbol,
          score
        });
      }

      return {
        symbol: displaySymbol, // Use display format (BTC/USDT)
        score,
        signals,
        marketData: {
          price,
          volume24h,
          volumeChange: (volumeRatio - 1) * 100,
          priceChange24h,
          avgVolume: avgVolume24h,
          volumeRatio,
          spread,
          liquidity,
          momentum,
          volatility,
          rsi,
          orderBook,
          quoteVolume24h, // Add quoteVolume24h to marketData
          high: high24h,
          low: low24h,
          open: openPrice,
          // ENHANCED: Include multi-timeframe analysis data (as any to bypass type check - runtime data is correct)
          multiTimeframe: mtfAnalysis ? {
            timeframes: mtfAnalysis.timeframes,
            aggregateScore: mtfAnalysis.aggregateScore,
            aggregateSignals: mtfAnalysis.aggregateSignals,
            bestTimeframe: mtfAnalysis.bestTimeframe,
            bullishTimeframes: Object.values(mtfAnalysis.timeframes).filter((tf: any) => tf.trend === 'BULLISH').length,
            bearishTimeframes: Object.values(mtfAnalysis.timeframes).filter((tf: any) => tf.trend === 'BEARISH').length,
            totalTimeframes: Object.keys(mtfAnalysis.timeframes).length
          } : null
        } as any, // Type assertion to allow multiTimeframe field
        recommendation,
        confidence,
        reasoning
      };

    } catch (error) {
      logger.error('Failed to analyze symbol', error as Error, {
        context: 'MarketScanner',
        data: { symbol: symbolInfo.symbol }
      });
      return null;
    }
  }

  /**
   * Analyze order book depth for a symbol
   */
  private async analyzeOrderBookDepth(symbol: string): Promise<OrderBookDepth | null> {
    try {
      // OPTIMIZED: Use configService instead of direct process.env access
      const { asterConfig } = await import('@/lib/configService');
      const baseUrl = asterConfig.baseUrl || 'https://fapi.asterdex.com';
      const response = await fetch(
        `${baseUrl}/fapi/v1/depth?symbol=${symbol}&limit=100`
      );
      
      if (!response.ok) {
        // CRITICAL FIX: Handle 400/404 gracefully - symbol may not exist or order book unavailable
        // This is expected for some symbols and should not be logged as ERROR
        if (response.status === 400 || response.status === 404) {
          logger.debug(`Order book not available for ${symbol} (${response.status}) - skipping depth analysis`, {
            context: 'MarketScanner',
            symbol
          });
          return null;
        }
        throw new Error(`Failed to fetch order book: ${response.status}`);
      }

      const depth = await response.json();
      
      // Calculate bid/ask depth (total value in USDT)
      const bidDepth = depth.bids.reduce((sum: number, bid: any) => {
        return sum + (parseFloat(bid[0]) * parseFloat(bid[1]));
      }, 0);
      
      const askDepth = depth.asks.reduce((sum: number, ask: any) => {
        return sum + (parseFloat(ask[0]) * parseFloat(ask[1]));
      }, 0);
      
      const totalDepth = bidDepth + askDepth;
      
      // Calculate spread
      const bestBid = parseFloat(depth.bids[0][0]);
      const bestAsk = parseFloat(depth.asks[0][0]);
      const spread = bestAsk - bestBid;
      const spreadPercent = (spread / bestBid) * 100;
      
      // Find support levels (large bid orders - top 5)
      const supportLevels = depth.bids
        .map((bid: any) => ({
          price: parseFloat(bid[0]),
          value: parseFloat(bid[0]) * parseFloat(bid[1])
        }))
        .filter((bid: any) => bid.value > bidDepth / 20) // Orders > 5% of total bid depth
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 5)
        .map((bid: any) => bid.price);
      
      // Find resistance levels (large ask orders - top 5)
      const resistanceLevels = depth.asks
        .map((ask: any) => ({
          price: parseFloat(ask[0]),
          value: parseFloat(ask[0]) * parseFloat(ask[1])
        }))
        .filter((ask: any) => ask.value > askDepth / 20) // Orders > 5% of total ask depth
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 5)
        .map((ask: any) => ask.price);
      
      // Detect whale orders (orders > 10% of total depth)
      const whaleThreshold = totalDepth / 10;
      const whaleOrders: Array<{ price: number; size: number; side: 'BID' | 'ASK' }> = [];
      
      depth.bids.forEach((bid: any) => {
        const orderValue = parseFloat(bid[0]) * parseFloat(bid[1]);
        if (orderValue > whaleThreshold) {
          whaleOrders.push({
            price: parseFloat(bid[0]),
            size: parseFloat(bid[1]),
            side: 'BID'
          });
        }
      });
      
      depth.asks.forEach((ask: any) => {
        const orderValue = parseFloat(ask[0]) * parseFloat(ask[1]);
        if (orderValue > whaleThreshold) {
          whaleOrders.push({
            price: parseFloat(ask[0]),
            size: parseFloat(ask[1]),
            side: 'ASK'
          });
        }
      });
      
      // Calculate liquidity score (0-1 scale, normalized to $1M)
      const liquidityScore = Math.min(totalDepth / TRADING_THRESHOLDS.VOLUME_DISPLAY_DIVISOR, 1.0);
      
      // Calculate order book imbalance
      const imbalance = (bidDepth - askDepth) / totalDepth;
      
      return {
        bidDepth,
        askDepth,
        totalDepth,
        spread,
        spreadPercent,
        imbalance,
        supportLevels,
        resistanceLevels,
        whaleOrders,
        liquidityScore
      };
      
    } catch (error) {
      // CRITICAL FIX: Only log as error if it's not a 400/404 (expected API errors)
      // 400/404 errors are expected for symbols that don't exist or don't have order book data
      const isExpectedError = error instanceof Error && 
        (error.message.includes('400') || error.message.includes('404'));
      
      if (isExpectedError) {
        logger.debug(`Order book not available for ${symbol} - skipping depth analysis`, {
          context: 'MarketScanner',
          symbol,
          error: error instanceof Error ? error.message : String(error)
        });
      } else {
        logger.error('Failed to analyze order book depth', error as Error, {
          context: 'MarketScanner',
          symbol
        });
      }
      return null;
    }
  }

  /**
   * Get the last scan result (cached)
   */
  getLastScan(): ScanResult | null {
    return this.lastScan;
  }

  /**
   * Check if scan is stale and needs refresh
   */
  isScanStale(): boolean {
    return Date.now() - this.lastScanTime > this.scanInterval;
  }
}

// Export singleton instance with globalThis for Next.js dev hot-reload persistence
const globalForMarketScanner = globalThis as typeof globalThis & {
  __marketScannerService?: MarketScannerService;
};

if (!globalForMarketScanner.__marketScannerService) {
  globalForMarketScanner.__marketScannerService = new MarketScannerService();
}

export const marketScannerService = globalForMarketScanner.__marketScannerService;

