/**
 * Market Scanner Service
 * Scans all Aster DEX pairs for trading opportunities
 * Analyzes volume spikes, price action, liquidity, and momentum
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';

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
  };
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  reasoning: string[];
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
   * Scan all Aster DEX markets for opportunities
   */
  async scanMarkets(): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting market scan', {
        context: 'MarketScanner',
        data: { timestamp: startTime }
      });

      // Get all exchange info with volumes
      const exchangeInfo = await asterDexService.getExchangeInfo();
      const allSymbols = exchangeInfo.topSymbolsByVolume || exchangeInfo.symbols || [];

      if (allSymbols.length === 0) {
        throw new Error('No symbols returned from exchange info');
      }

      logger.info('Fetched exchange symbols', {
        context: 'MarketScanner',
        data: { totalSymbols: allSymbols.length }
      });

      // Fetch 24hr ticker data for all symbols
      // OPTIMIZED: Use configService instead of direct process.env access
      const { asterConfig } = await import('@/lib/configService');
      const baseUrl = asterConfig.baseUrl || 'https://fapi.asterdex.com';
      const tickerResponse = await fetch(`${baseUrl}/fapi/v1/ticker/24hr`);
      if (!tickerResponse.ok) {
        throw new Error(`Failed to fetch ticker data: ${tickerResponse.status}`);
      }
      const tickerData = await tickerResponse.json();

      // Create a map for quick lookup and sort by volume
      const tickerMap = new Map();
      const tickersWithVolume: Array<{ symbol: string; volume: number; ticker: any }> = [];
      
      if (Array.isArray(tickerData)) {
        tickerData.forEach((ticker: any) => {
          tickerMap.set(ticker.symbol, ticker);
          const volume = parseFloat(ticker.volume || '0');
          if (volume > 0) {
            tickersWithVolume.push({
              symbol: ticker.symbol,
              volume,
              ticker
            });
          }
        });
      }

      // Sort by volume (descending) and take top 50
      tickersWithVolume.sort((a, b) => b.volume - a.volume);
      const top50Symbols = tickersWithVolume.slice(0, 50).map(t => t.symbol);
      
      // Filter allSymbols to only include top 50 by volume
      const symbols = allSymbols.filter((s: any) => 
        top50Symbols.includes(s.symbol || s)
      );

      logger.info('Focusing on top 50 coins by volume', {
        context: 'MarketScanner',
        data: { 
          totalAvailable: allSymbols.length,
          top50Count: symbols.length,
          analyzingCount: Math.min(30, symbols.length),
          topVolume: tickersWithVolume[0]?.volume || 0,
          top10Symbols: tickersWithVolume.slice(0, 10).map(t => ({ symbol: t.symbol, volume: t.volume.toFixed(0) }))
        }
      });

      // Analyze top 50 symbols (excluding blacklisted)
      const opportunities: MarketOpportunity[] = [];
      const { asterConfig } = await import('@/lib/configService');
      const blacklist = asterConfig.trading.blacklistedSymbols || [];

      for (const symbolInfo of symbols.slice(0, 30)) { // Analyze top 30 by volume
        try {
          // Skip blacklisted symbols
          if (blacklist.includes(symbolInfo.symbol) || blacklist.includes(symbolInfo.symbol.replace('/', ''))) {
            logger.info(`⛔ Skipping blacklisted symbol: ${symbolInfo.symbol}`, { context: 'MarketScanner' });
            continue;
          }

          // CRITICAL: Check if coin is problematic (low liquidity, wide spreads, etc.)
          const { problematicCoinDetector } = await import('./problematicCoinDetector');
          if (problematicCoinDetector.isProblematic(symbolInfo.symbol)) {
            const problematicCoin = problematicCoinDetector.getProblematicCoin(symbolInfo.symbol);
            logger.warn(`⛔ Skipping problematic coin: ${symbolInfo.symbol} - ${problematicCoin?.reason || 'Execution issues detected'}`, {
              context: 'MarketScanner',
              data: problematicCoin
            });
            continue;
          }

          const ticker = tickerMap.get(symbolInfo.symbol);
          if (!ticker) continue;

          const opportunity = await this.analyzeSymbol(symbolInfo, ticker);
          if (opportunity) {
            // CRITICAL: Double-check for problematic coins before adding
            const { problematicCoinDetector } = await import('./problematicCoinDetector');
            const orderBook = opportunity.marketData?.orderBook;
            const problematic = await problematicCoinDetector.detectProblematicCoin(symbolInfo.symbol, ticker, orderBook);
            
            if (problematic) {
              logger.warn(`⛔ Rejected opportunity: ${symbolInfo.symbol} is problematic`, {
                context: 'MarketScanner',
                data: { symbol: symbolInfo.symbol, reason: problematic.reason }
              });
              continue; // Skip this opportunity
            }
            
            opportunities.push(opportunity);
          }
        } catch (error) {
          logger.error(`Failed to analyze ${symbolInfo.symbol}`, error as Error, {
            context: 'MarketScanner',
            data: { symbol: symbolInfo.symbol }
          });
        }
      }

      // Sort opportunities by score
      opportunities.sort((a, b) => b.score - a.score);

      // Identify volume spikes (volume > 2x average)
      const volumeSpikes = opportunities.filter(op => op.marketData.volumeRatio > 2.0);

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
      logger.info('Market scan completed', {
        context: 'MarketScanner',
        data: {
          duration: `${scanDuration}ms`,
          totalSymbols: symbols.length,
          opportunities: opportunities.length,
          volumeSpikes: volumeSpikes.length,
          bestSymbol: bestOpportunity?.symbol || 'none'
        }
      });

      return scanResult;

    } catch (error) {
      logger.error('Market scan failed', error as Error, {
        context: 'MarketScanner'
      });
      throw error;
    }
  }

  /**
   * Analyze a single symbol for trading opportunities
   */
  private async analyzeSymbol(symbolInfo: any, ticker: any): Promise<MarketOpportunity | null> {
    try {
      const symbol = symbolInfo.symbol;
      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume);
      const quoteVolume24h = parseFloat(ticker.quoteVolume);
      const priceChange24h = parseFloat(ticker.priceChangePercent);
      const high24h = parseFloat(ticker.highPrice);
      const low24h = parseFloat(ticker.lowPrice);
      const openPrice = parseFloat(ticker.openPrice);

      // CRITICAL: Filter out problematic low-liquidity coins BEFORE analysis
      // This prevents trading coins like COSMO/APE that have execution issues
      const MIN_LIQUIDITY_USD = 1000000; // Minimum $1M daily volume for trading
      const MIN_QUOTE_VOLUME = 500000; // Minimum $500K quote volume (more strict)
      
      if (quoteVolume24h < MIN_QUOTE_VOLUME) {
        logger.debug(`Skipping ${symbol}: Low liquidity ($${(quoteVolume24h / 1000).toFixed(1)}K < $${(MIN_QUOTE_VOLUME / 1000).toFixed(1)}K minimum)`, {
          context: 'MarketScanner',
          data: { symbol, quoteVolume24h, minRequired: MIN_QUOTE_VOLUME }
        });
        return null; // Skip this coin entirely
      }

      // Check for extremely wide spreads (indicates execution problems)
      const spreadPercent = ((high24h - low24h) / price) * 100;
      if (spreadPercent > 2.0) { // Spread > 2% indicates severe liquidity issues
        logger.debug(`Skipping ${symbol}: Wide spread (${spreadPercent.toFixed(2)}% > 2% maximum) - execution risk`, {
          context: 'MarketScanner',
          data: { symbol, spreadPercent }
        });
        return null; // Skip coins with execution problems
      }
      
      // OPTIMIZED: True Range-based volatility (more accurate)
      const trueRange = Math.max(
        high24h - low24h,
        Math.abs(high24h - openPrice),
        Math.abs(low24h - openPrice)
      );
      const volatility = (trueRange / openPrice) * 100;
      
      // OPTIMIZED: Rate of Change momentum (more sensitive)
      const momentum = ((price - openPrice) / openPrice) * 100;
      const momentumStrength = Math.abs(momentum) / 10; // Normalize to 0-1
      
      // OPTIMIZED: Better RSI estimation using price extremes
      const pricePosition = (price - low24h) / (high24h - low24h);
      const rsi = 50 + (pricePosition - 0.5) * 100;
      
      // OPTIMIZED: Dynamic spread calculation
      const spread = ((high24h - low24h) / price) * 100;
      const spreadQuality = Math.max(0, 1 - (spread / 5)); // Lower spread = better
      
      // OPTIMIZED: Multi-factor liquidity score
      const baseVolumeLiquidity = Math.min(quoteVolume24h / 5000000, 1.0); // $5M for max score
      const volumeConsistency = Math.min(volumeRatio / 2.0, 1.0); // Consistency bonus
      const liquidity = (baseVolumeLiquidity * 0.7) + (volumeConsistency * 0.3);

      // Analyze signals
      const signals: string[] = [];
      const reasoning: string[] = [];
      let score = 50; // Base score

      // OPTIMIZED: Multi-Factor Weighted Scoring System
      
      // 1. Volume Analysis (Weight: 30%)
      let volumeScore = 0;
      if (volumeRatio > 3.5) {
        signals.push('EXTREME_VOLUME_SPIKE');
        reasoning.push(`Extreme volume: ${volumeRatio.toFixed(2)}x (breakout likely)`);
        volumeScore = 30;
      } else if (volumeRatio > 2.5) {
        signals.push('HIGH_VOLUME_SPIKE');
        reasoning.push(`Strong volume: ${volumeRatio.toFixed(2)}x (high interest)`);
        volumeScore = 22;
      } else if (volumeRatio > 1.7) {
        signals.push('VOLUME_INCREASE');
        reasoning.push(`Above-average volume: ${volumeRatio.toFixed(2)}x`);
        volumeScore = 15;
      } else if (volumeRatio > 1.2) {
        signals.push('NORMAL_VOLUME');
        volumeScore = 8;
      } else if (volumeRatio < 0.6) {
        signals.push('LOW_VOLUME');
        reasoning.push(`Weak volume: ${volumeRatio.toFixed(2)}x (low confidence)`);
        volumeScore = -15;
      }
      score += volumeScore;

      // 2. Momentum Analysis (Weight: 25%)
      let momentumScore = 0;
      if (Math.abs(momentum) > 12) {
        signals.push(momentum > 0 ? 'STRONG_UPTREND' : 'STRONG_DOWNTREND');
        reasoning.push(`Strong ${momentum > 0 ? 'bullish' : 'bearish'} momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
        momentumScore = momentum > 0 ? 25 : -25;
      } else if (Math.abs(momentum) > 6) {
        signals.push(momentum > 0 ? 'UPTREND' : 'DOWNTREND');
        reasoning.push(`${momentum > 0 ? 'Bullish' : 'Bearish'} momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(2)}%`);
        momentumScore = momentum > 0 ? 15 : -15;
      } else if (Math.abs(momentum) > 3) {
        momentumScore = momentum > 0 ? 8 : -8;
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
        reasoning.push(`Excellent liquidity: $${(quoteVolume24h / 1000000).toFixed(2)}M (tight spreads)`);
        liquidityScore = 15;
      } else if (liquidity > 0.6) {
        signals.push('HIGH_LIQUIDITY');
        reasoning.push(`High liquidity: $${(quoteVolume24h / 1000000).toFixed(2)}M`);
        liquidityScore = 10;
      } else if (liquidity > 0.4) {
        signals.push('MODERATE_LIQUIDITY');
        liquidityScore = 5;
      } else if (liquidity < 0.25) {
        signals.push('LOW_LIQUIDITY');
        reasoning.push(`Low liquidity: $${(quoteVolume24h / 1000000).toFixed(2)}M (slippage risk)`);
        liquidityScore = -12;
        // CRITICAL: Reject low-liquidity coins entirely (prevents COSMO/APE issues)
        return null; // Don't even return this opportunity - too risky
      }
      score += liquidityScore;

      // 6. Advanced Pattern Detection (Weight: 20%)
      let patternScore = 0;
      
      // Volume-confirmed breakouts (highest conviction)
      if (volumeRatio > 2.0 && momentum > 5 && rsi < 70) {
        signals.push('BULLISH_BREAKOUT');
        reasoning.push('🚀 Volume-confirmed bullish breakout (high probability)');
        patternScore = 20;
      } else if (volumeRatio > 2.0 && momentum < -5 && rsi > 30) {
        signals.push('BEARISH_BREAKDOWN');
        reasoning.push('⚠️ Volume-confirmed bearish breakdown');
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

      // OPTIMIZED: Dynamic recommendation thresholds
      let recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
      if (score >= 85) {
        recommendation = 'STRONG_BUY';
      } else if (score >= 70) {
        recommendation = 'BUY';
      } else if (score >= 40) {
        recommendation = 'NEUTRAL';
      } else if (score >= 25) {
        recommendation = 'SELL';
      } else {
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

      // Analyze order book depth (only for top opportunities to avoid rate limits)
      let orderBook: OrderBookDepth | undefined;
      if (score >= 60) { // Only analyze order book for good opportunities
        orderBook = await this.analyzeOrderBookDepth(symbol) || undefined;
        
        if (orderBook) {
          // Adjust score based on order book analysis
          if (orderBook.liquidityScore > 0.7) {
            score += 10;
            signals.push('HIGH_LIQUIDITY');
            reasoning.push(`Excellent liquidity: $${(orderBook.totalDepth / 1000000).toFixed(2)}M order book depth`);
          } else if (orderBook.liquidityScore < 0.3) {
            // CRITICAL: Reject coins with order book liquidity <0.3 (execution problems)
            logger.warn(`Rejecting ${symbol}: Order book liquidity too low (${orderBook.liquidityScore.toFixed(2)} < 0.3) - can't exit positions`, {
              context: 'MarketScanner',
              data: { symbol, liquidityScore: orderBook.liquidityScore, totalDepth: orderBook.totalDepth }
            });
            return null; // Skip this coin - can't exit positions properly
          }

          if (orderBook.spreadPercent < 0.05) {
            score += 5;
            reasoning.push(`Tight spread: ${orderBook.spreadPercent.toFixed(3)}%`);
          } else if (orderBook.spreadPercent > 0.5) {
            // CRITICAL: Reject coins with spread >0.5% (execution problems like COSMO/APE)
            logger.warn(`Rejecting ${symbol}: Spread too wide (${orderBook.spreadPercent.toFixed(3)}% > 0.5%) - execution risk`, {
              context: 'MarketScanner',
              data: { symbol, spreadPercent: orderBook.spreadPercent }
            });
            return null; // Skip this coin - can't execute properly
          } else if (orderBook.spreadPercent > 0.2) {
            score -= 5;
            signals.push('WIDE_SPREAD');
            reasoning.push(`Wide spread warning: ${orderBook.spreadPercent.toFixed(3)}%`);
          }

          // Order book imbalance signals
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

          // Whale activity
          if (orderBook.whaleOrders.length > 0) {
            signals.push('WHALE_ACTIVITY');
            reasoning.push(`${orderBook.whaleOrders.length} large orders detected (${orderBook.whaleOrders.filter(w => w.side === 'BID').length} buys, ${orderBook.whaleOrders.filter(w => w.side === 'ASK').length} sells)`);
          }
        }
      }

      return {
        symbol,
        score,
        signals,
        marketData: {
          price,
          volume24h,
          volumeChange: (volumeRatio - 1) * 100,
          priceChange24h,
          avgVolume,
          volumeRatio,
          spread,
          liquidity,
          momentum,
          volatility,
          rsi,
          orderBook
        },
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
      const liquidityScore = Math.min(totalDepth / 1000000, 1.0);
      
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
      logger.error('Failed to analyze order book depth', error as Error, {
        context: 'MarketScanner',
        data: { symbol }
      });
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

