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
      const symbols = exchangeInfo.topSymbolsByVolume || exchangeInfo.symbols || [];

      if (symbols.length === 0) {
        throw new Error('No symbols returned from exchange info');
      }

      logger.info('Fetched exchange symbols', {
        context: 'MarketScanner',
        data: { totalSymbols: symbols.length }
      });

      // Fetch 24hr ticker data for all symbols
      const tickerResponse = await fetch(`${process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com'}/fapi/v1/ticker/24hr`);
      if (!tickerResponse.ok) {
        throw new Error(`Failed to fetch ticker data: ${tickerResponse.status}`);
      }
      const tickerData = await tickerResponse.json();

      // Create a map for quick lookup
      const tickerMap = new Map();
      if (Array.isArray(tickerData)) {
        tickerData.forEach((ticker: any) => {
          tickerMap.set(ticker.symbol, ticker);
        });
      }

      // Analyze each symbol
      const opportunities: MarketOpportunity[] = [];

      for (const symbolInfo of symbols.slice(0, 30)) { // Analyze top 30 by volume
        try {
          const ticker = tickerMap.get(symbolInfo.symbol);
          if (!ticker) continue;

          const opportunity = await this.analyzeSymbol(symbolInfo, ticker);
          if (opportunity) {
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

      // Calculate average volume (using weighted average)
      const avgVolume = volume24h * 0.8; // Simplified average
      const volumeRatio = volume24h / avgVolume;

      // Calculate volatility
      const volatility = ((high24h - low24h) / low24h) * 100;

      // Calculate momentum (simplified)
      const momentum = ((price - openPrice) / openPrice) * 100;

      // Estimate RSI (simplified based on price change)
      let rsi = 50;
      if (priceChange24h > 0) {
        rsi = 50 + Math.min(priceChange24h * 2, 30);
      } else {
        rsi = 50 + Math.max(priceChange24h * 2, -30);
      }

      // Estimate spread (simplified)
      const spread = ((high24h - low24h) / price) * 100;

      // Liquidity score based on volume
      const liquidity = Math.min(quoteVolume24h / 1000000, 1.0); // 0-1 scale

      // Analyze signals
      const signals: string[] = [];
      const reasoning: string[] = [];
      let score = 50; // Base score

      // Volume Analysis
      if (volumeRatio > 3.0) {
        signals.push('EXTREME_VOLUME_SPIKE');
        reasoning.push(`Extreme volume spike: ${volumeRatio.toFixed(2)}x average`);
        score += 25;
      } else if (volumeRatio > 2.0) {
        signals.push('HIGH_VOLUME_SPIKE');
        reasoning.push(`High volume spike: ${volumeRatio.toFixed(2)}x average`);
        score += 15;
      } else if (volumeRatio > 1.5) {
        signals.push('VOLUME_INCREASE');
        reasoning.push(`Above-average volume: ${volumeRatio.toFixed(2)}x`);
        score += 10;
      } else if (volumeRatio < 0.5) {
        signals.push('LOW_VOLUME');
        reasoning.push(`Below-average volume: ${volumeRatio.toFixed(2)}x`);
        score -= 10;
      }

      // Price Change Analysis
      if (priceChange24h > 10) {
        signals.push('STRONG_UPTREND');
        reasoning.push(`Strong bullish momentum: +${priceChange24h.toFixed(2)}%`);
        score += 20;
      } else if (priceChange24h > 5) {
        signals.push('UPTREND');
        reasoning.push(`Bullish momentum: +${priceChange24h.toFixed(2)}%`);
        score += 10;
      } else if (priceChange24h < -10) {
        signals.push('STRONG_DOWNTREND');
        reasoning.push(`Strong bearish momentum: ${priceChange24h.toFixed(2)}%`);
        score -= 20;
      } else if (priceChange24h < -5) {
        signals.push('DOWNTREND');
        reasoning.push(`Bearish momentum: ${priceChange24h.toFixed(2)}%`);
        score -= 10;
      }

      // RSI Analysis
      if (rsi > 70) {
        signals.push('OVERBOUGHT');
        reasoning.push(`Overbought conditions: RSI ${rsi.toFixed(1)}`);
        score -= 15;
      } else if (rsi < 30) {
        signals.push('OVERSOLD');
        reasoning.push(`Oversold conditions: RSI ${rsi.toFixed(1)}, potential bounce`);
        score += 15;
      }

      // Volatility Analysis
      if (volatility > 15) {
        signals.push('HIGH_VOLATILITY');
        reasoning.push(`High volatility: ${volatility.toFixed(2)}%, increased risk`);
        score -= 5;
      } else if (volatility > 8) {
        signals.push('MODERATE_VOLATILITY');
        reasoning.push(`Moderate volatility: ${volatility.toFixed(2)}%`);
      } else {
        signals.push('LOW_VOLATILITY');
        reasoning.push(`Low volatility: ${volatility.toFixed(2)}%, stable conditions`);
        score += 5;
      }

      // Liquidity Analysis
      if (liquidity > 0.7) {
        signals.push('HIGH_LIQUIDITY');
        reasoning.push(`High liquidity: $${(quoteVolume24h / 1000000).toFixed(2)}M volume`);
        score += 10;
      } else if (liquidity < 0.3) {
        signals.push('LOW_LIQUIDITY');
        reasoning.push(`Low liquidity: $${(quoteVolume24h / 1000000).toFixed(2)}M volume`);
        score -= 10;
      }

      // Momentum + Volume Confirmation
      if (volumeRatio > 1.5 && priceChange24h > 3) {
        signals.push('BULLISH_BREAKOUT');
        reasoning.push('Volume-confirmed bullish breakout pattern');
        score += 15;
      } else if (volumeRatio > 1.5 && priceChange24h < -3) {
        signals.push('BEARISH_BREAKDOWN');
        reasoning.push('Volume-confirmed bearish breakdown pattern');
        score -= 15;
      }

      // Determine recommendation
      let recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
      if (score >= 80) {
        recommendation = 'STRONG_BUY';
      } else if (score >= 60) {
        recommendation = 'BUY';
      } else if (score >= 40) {
        recommendation = 'NEUTRAL';
      } else if (score >= 20) {
        recommendation = 'SELL';
      } else {
        recommendation = 'STRONG_SELL';
      }

      // Calculate confidence based on signal strength
      const confidence = Math.min(Math.abs(score - 50) / 50, 1.0);

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
            score -= 10;
            signals.push('LOW_LIQUIDITY');
            reasoning.push(`Low liquidity warning: $${(orderBook.totalDepth / 1000000).toFixed(2)}M order book depth`);
          }

          if (orderBook.spreadPercent < 0.05) {
            score += 5;
            reasoning.push(`Tight spread: ${orderBook.spreadPercent.toFixed(3)}%`);
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
      const response = await fetch(
        `${process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com'}/fapi/v1/depth?symbol=${symbol}&limit=100`
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

