/**
 * Data Ingestion Layer for Multi-Agent Trading System
 * Gathers market, sentiment, and on-chain data from various sources
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/asterDexService';
import { circuitBreakers } from '@/lib/circuitBreaker';

export interface MarketData {
  symbol: string;
  price: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
  volume: number;
  avgVolume: number;
  volatility: number;
  change1h: number;
  change4h: number;
  // Technical indicators
  rsi: number;
  ma20: number;
  ma50: number;
  ma200: number;
  priceVsMA20: number;
  // Additional metrics
  marketCap?: number;
  circulatingSupply?: number;
  // Order book and liquidity data
  orderBookDepth?: {
    bidLiquidity: number;
    askLiquidity: number;
    totalLiquidity: number;
    spread: number;
    liquidityScore: number;
    bidDepth: number;
    askDepth: number;
  };
  bidAskSpread?: number;
  liquidityScore?: number;
}

export interface SentimentData {
  symbol: string;
  news: Array<{
    source: string;
    headline: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    timestamp: number;
    url?: string;
  }>;
  socialMetrics: {
    redditMentions: number;
    redditChange: number;
    twitterMentions?: number;
    twitterChange?: number;
  };
  fearGreedIndex: number;
  trendingRank: number;
  sentimentScores: {
    newsSentiment: number;
    redditSentiment: number;
    twitterSentiment?: number;
    overallSentiment: number;
  };
  // Additional sentiment data
  googleTrends?: number;
  searchVolume?: number;
}

export interface OnChainData {
  symbol: string;
  whaleActivity: {
    whaleBuys: number;
    whaleBuyVolume: number;
    whaleSells: number;
    whaleSellVolume: number;
    netWhaleFlow: number;
    whaleThreshold: number; // Minimum amount considered whale
  };
  liquidity: {
    totalLiquidity: number;
    liquidityChange: number;
    depthAnalysis: number;
    slippageEstimate: number;
  };
  exchangeFlows: {
    inflows: number;
    inflowChange: number;
    outflows: number;
    outflowChange: number;
    netFlow: number;
  };
  smartContractEvents: Array<{
    type: string;
    description: string;
    timestamp: number;
    value?: number;
  }>;
  // Additional on-chain metrics
  activeAddresses?: number;
  transactionCount?: number;
  networkHashRate?: number;
}

export class DataIngestionService {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {
    logger.info('Data Ingestion Service initialized', {
      context: 'DataIngestion',
      sources: ['Aster DEX ONLY (actual trading prices with 30-key pool)']
    });
  }

  /**
   * Get comprehensive market data for a symbol
   */
  async getMarketData(symbol: string = 'BTC/USDT'): Promise<MarketData> {
    const cacheKey = `market:${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      logger.debug('📊 Gathering market data', {
        context: 'DataIngestion',
        symbol
      });

      // CRITICAL: Use ONLY Aster DEX data (actual exchange prices with 30-key pool)
      // NO external APIs (CoinGecko, etc.) - only real trading prices from Aster DEX
      const [asterData, technicalData] = await Promise.all([
        this.getAsterMarketData(symbol),
        this.calculateTechnicalIndicators(symbol)
      ]);

      // CRITICAL FIX: Use only Aster DEX data (all we need!)
      const marketData: MarketData = {
        symbol,
        price: asterData.price,
        priceChange24h: technicalData.change1h || 0,
        high24h: asterData.high24h,
        low24h: asterData.low24h,
        volume: asterData.volume,
        avgVolume: asterData.avgVolume,
        volatility: technicalData.volatility,
        change1h: technicalData.change1h,
        change4h: technicalData.change4h,
        rsi: technicalData.rsi,
        ma20: technicalData.ma20,
        ma50: technicalData.ma50,
        ma200: technicalData.ma200,
        priceVsMA20: technicalData.priceVsMA20,
        marketCap: undefined, // Don't need for trading
        circulatingSupply: undefined, // Don't need for trading
        // Order book and liquidity data
        orderBookDepth: asterData.orderBookDepth,
        bidAskSpread: asterData.bidAskSpread,
        liquidityScore: asterData.liquidityScore
      };

      this.setCachedData(cacheKey, marketData);
      
      logger.info('📊 Market data gathered successfully', {
        context: 'DataIngestion',
        symbol,
        price: marketData.price,
        rsi: marketData.rsi,
        volume: marketData.volume
      });

      return marketData;
    } catch (error) {
      logger.error('📊 Failed to gather market data', error, {
        context: 'DataIngestion',
        symbol
      });
      throw error;
    }
  }

  /**
   * Get sentiment data from various sources
   */
  async getSentimentData(symbol: string = 'BTC/USDT'): Promise<SentimentData> {
    const cacheKey = `sentiment:${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      logger.debug('💬 Gathering sentiment data', {
        context: 'DataIngestion',
        symbol
      });

      const [newsData, socialData, fearGreedData] = await Promise.all([
        this.getNewsSentiment(symbol),
        this.getSocialSentiment(symbol),
        this.getFearGreedIndex()
      ]);

      const sentimentData: SentimentData = {
        symbol,
        news: newsData,
        socialMetrics: socialData,
        fearGreedIndex: fearGreedData.index,
        trendingRank: fearGreedData.trendingRank,
        sentimentScores: {
          newsSentiment: this.calculateNewsSentiment(newsData),
          redditSentiment: socialData.redditSentiment || 0,
          twitterSentiment: socialData.twitterSentiment,
          overallSentiment: this.calculateOverallSentiment(newsData, socialData, fearGreedData)
        }
      };

      this.setCachedData(cacheKey, sentimentData);
      
      logger.info('💬 Sentiment data gathered successfully', {
        context: 'DataIngestion',
        symbol,
        overallSentiment: sentimentData.sentimentScores.overallSentiment,
        newsCount: newsData.length,
        fearGreedIndex: fearGreedData.index
      });

      return sentimentData;
    } catch (error) {
      logger.error('💬 Failed to gather sentiment data', error, {
        context: 'DataIngestion',
        symbol
      });
      throw error;
    }
  }

  /**
   * Get on-chain data from blockchain sources
   */
  async getOnChainData(symbol: string = 'BTC/USDT'): Promise<OnChainData> {
    const cacheKey = `onchain:${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      logger.debug('⛓️ Gathering on-chain data', {
        context: 'DataIngestion',
        symbol
      });

      const [whaleData, liquidityData, exchangeData, eventsData] = await Promise.all([
        this.getWhaleActivity(symbol),
        this.getLiquidityData(symbol),
        this.getExchangeFlows(symbol),
        this.getSmartContractEvents(symbol)
      ]);

      const onChainData: OnChainData = {
        symbol,
        whaleActivity: whaleData,
        liquidity: liquidityData,
        exchangeFlows: exchangeData,
        smartContractEvents: eventsData
      };

      this.setCachedData(cacheKey, onChainData);
      
      logger.info('⛓️ On-chain data gathered successfully', {
        context: 'DataIngestion',
        symbol,
        netWhaleFlow: whaleData.netWhaleFlow,
        totalLiquidity: liquidityData.totalLiquidity,
        netFlow: exchangeData.netFlow,
        eventsCount: eventsData.length
      });

      return onChainData;
    } catch (error) {
      logger.error('⛓️ Failed to gather on-chain data', error, {
        context: 'DataIngestion',
        symbol
      });
      throw error;
    }
  }

  /**
   * Get comprehensive data for all agents
   */
  async getAllData(symbol: string = 'BTC/USDT'): Promise<{
    market: MarketData;
    sentiment: SentimentData;
    onchain: OnChainData;
  }> {
    logger.debug('🔄 Gathering comprehensive data', {
      context: 'DataIngestion',
      symbol
    });

    const [market, sentiment, onchain] = await Promise.all([
      this.getMarketData(symbol),
      this.getSentimentData(symbol),
      this.getOnChainData(symbol)
    ]);

    logger.info('🔄 Comprehensive data gathered', {
      context: 'DataIngestion',
      symbol,
      marketPrice: market.price,
      sentimentScore: sentiment.sentimentScores.overallSentiment,
      whaleFlow: onchain.whaleActivity.netWhaleFlow
    });

    return { market, sentiment, onchain };
  }

  // Private helper methods

  private async getAsterMarketData(symbol: string): Promise<any> {
    return circuitBreakers.asterApi.execute(async () => {
      try {
        // Get comprehensive data from AsterDEX
        const [price, ticker, orderBook] = await Promise.all([
          asterDexService.getPrice(symbol),
          asterDexService.getTicker(symbol),
          this.getAsterOrderBookDepth(symbol)
        ]);
        
        if (price > 0) {
          return {
            price: price,
            volume: ticker?.volume || 0,
            avgVolume: ticker?.volume || 0, // Will be calculated properly later
            high24h: ticker?.highPrice || price,
            low24h: ticker?.lowPrice || price,
            orderBookDepth: orderBook,
            bidAskSpread: orderBook?.spread || 0,
            liquidityScore: orderBook?.liquidityScore || 0
          };
        } else {
          throw new Error('Invalid price from AsterDEX');
        }
      } catch (error) {
        logger.error('Aster DEX data unavailable - NO FALLBACK (trading system requires actual exchange prices)', { 
          context: 'DataIngestion',
          symbol,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // CRITICAL: No CoinGecko fallback!
        // We MUST use actual Aster DEX prices for trading decisions
        // Fallback prices from external sources would cause:
        // 1. Price mismatch between displayed price and actual trade execution
        // 2. Bad trade decisions based on wrong prices
        // 3. Potential losses due to arbitrage gaps
        throw error;
      }
    });
  }

  /**
   * Get Aster DEX order book depth for liquidity analysis
   * OPTIMIZED: Now uses asterDexService.getOrderBook() with 30-key support and caching
   */
  private async getAsterOrderBookDepth(symbol: string): Promise<any> {
    try {
      // OPTIMIZED: Use asterDexService.getOrderBook() which has:
      // - 30-key load balancing for 600 req/sec capacity
      // - 2-second caching for performance
      // - 10-second timeout protection
      // - Automatic retry logic via rate limiter
      const orderBookData = await asterDexService.getOrderBook(symbol, 20);
      
      if (!orderBookData) {
        throw new Error('Order book data unavailable');
      }
      
      // Return in expected format (asterDexService already calculates all metrics)
      return {
        bidLiquidity: orderBookData.bidLiquidity,
        askLiquidity: orderBookData.askLiquidity,
        totalLiquidity: orderBookData.totalLiquidity,
        spread: orderBookData.spread,
        liquidityScore: orderBookData.liquidityScore,
        bidDepth: orderBookData.bidDepth,
        askDepth: orderBookData.askDepth
      };
    } catch (error) {
      logger.warn('Failed to get order book depth', { 
        context: 'DataIngestion',
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async getCoinGeckoData(symbol: string): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // Map symbol to CoinGecko ID
      const coinId = this.mapSymbolToCoinGeckoId(symbol);
      
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
      );
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const marketData = data.market_data;

      return {
        price: marketData.current_price.usd,
        priceChange24h: marketData.price_change_percentage_24h,
        high24h: marketData.high_24h.usd,
        low24h: marketData.low_24h.usd,
        volume: marketData.total_volume.usd,
        avgVolume: marketData.total_volume.usd, // Simplified
        marketCap: marketData.market_cap.usd,
        circulatingSupply: marketData.circulating_supply
      };
    });
  }

  private async calculateTechnicalIndicators(symbol: string): Promise<any> {
    try {
      // Fetch kline data from Aster DEX for real technical calculations
      const { asterDexService } = await import('@/services/asterDexService');
      
      // Get 1-hour candles for short-term indicators
      const klines1h = await asterDexService.getKlines(symbol, '1h', 24); // Last 24 hours
      // Get 4-hour candles for medium-term indicators
      const klines4h = await asterDexService.getKlines(symbol, '4h', 50); // Last 50 4-hour periods
      // Get daily candles for long-term indicators (MA20, MA50, MA200)
      const klinesDaily = await asterDexService.getKlines(symbol, '1d', 200); // Last 200 days
      
      if (!klines1h || klines1h.length < 2) {
        throw new Error('Insufficient 1h kline data');
      }
      if (!klinesDaily || klinesDaily.length < 20) {
        throw new Error('Insufficient daily kline data for MA calculations');
      }
      
      // Extract prices from klines (getKlines returns objects with close property)
      const closes1h = klines1h.map((k: any) => k.close); // close price
      const closesDaily = klinesDaily.map((k: any) => k.close);
      
      // Calculate 1-hour price change
      const change1h = closes1h.length >= 2
        ? ((closes1h[closes1h.length - 1] - closes1h[closes1h.length - 2]) / closes1h[closes1h.length - 2]) * 100
        : 0;
      
      // Calculate 4-hour price change
      const closes4h = klines4h ? klines4h.map((k: any) => k.close) : closes1h;
      const change4h = closes4h.length >= 2
        ? ((closes4h[closes4h.length - 1] - closes4h[closes4h.length - 2]) / closes4h[closes4h.length - 2]) * 100
        : change1h * 4;
      
      // Calculate RSI (14-period on 1h data)
      const rsi = this.calculateRSI(closes1h, 14);
      
      // Calculate Moving Averages on daily data
      const currentPrice = closesDaily[closesDaily.length - 1];
      const ma20 = closesDaily.length >= 20 
        ? this.calculateMA(closesDaily, 20) 
        : currentPrice;
      const ma50 = closesDaily.length >= 50 
        ? this.calculateMA(closesDaily, 50) 
        : currentPrice;
      const ma200 = closesDaily.length >= 200 
        ? this.calculateMA(closesDaily, 200) 
        : currentPrice;
      
      // Calculate volatility (standard deviation of returns over last 24 hours)
      const returns = closes1h.slice(-24).map((price, idx, arr) => 
        idx === 0 ? 0 : ((price - arr[idx - 1]) / arr[idx - 1])
      );
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const volatility = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      ) * 100; // Convert to percentage
      
      return {
        volatility: volatility,
        change1h: change1h,
        change4h: change4h,
        rsi: rsi,
        ma20: ma20,
        ma50: ma50,
        ma200: ma200,
        priceVsMA20: currentPrice / ma20
      };
    } catch (error) {
      logger.error('Failed to calculate real technical indicators, using fallback', error as Error, {
        context: 'DataIngestion',
        symbol
      });
      
      // Fallback: return neutral values rather than mock data
      return {
        volatility: 1.0,
        change1h: 0,
        change4h: 0,
        rsi: 50, // Neutral
        ma20: 0,
        ma50: 0,
        ma200: 0,
        priceVsMA20: 1.0
      };
    }
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) {
      return 50; // Neutral if insufficient data
    }
    
    const changes = prices.slice(-period - 1).map((price, idx, arr) => 
      idx === 0 ? 0 : price - arr[idx - 1]
    ).slice(1); // Remove first 0
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);
    
    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100; // All gains
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }
  
  /**
   * Calculate Simple Moving Average
   */
  private calculateMA(prices: number[], period: number): number {
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private async getNewsSentiment(symbol: string): Promise<any[]> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Return empty array if news API unavailable
      // TODO: Integrate with real news APIs (CryptoPanic, CoinDesk API, etc.)
      logger.debug('News sentiment data not available - returning empty array', {
        context: 'DataIngestion',
        data: { symbol }
      });
      return [];
    });
  }

  private async getSocialSentiment(symbol: string): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Return neutral/empty values if social APIs unavailable
      // TODO: Integrate with real social APIs (Reddit API, Twitter API, etc.)
      logger.debug('Social sentiment data not available - returning neutral values', {
        context: 'DataIngestion',
        data: { symbol }
      });
      return {
        redditMentions: 0,
        redditChange: 0,
        redditSentiment: 0.5, // Neutral
        twitterMentions: 0,
        twitterChange: 0,
        twitterSentiment: 0.5 // Neutral
      };
    });
  }

  private async getFearGreedIndex(): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Try to fetch from alternative.me API, fallback to neutral
      try {
        const response = await fetch('https://api.alternative.me/fng/', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        if (response.ok) {
          const data = await response.json();
          return {
            index: data.data?.[0]?.value || 50, // Neutral if unavailable
            trendingRank: 1
          };
        }
      } catch (error) {
        logger.debug('Fear/Greed Index API unavailable - using neutral value', {
          context: 'DataIngestion',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      // Fallback to neutral (50 = neutral)
      return {
        index: 50,
        trendingRank: 0
      };
    });
  }

  private async getWhaleActivity(symbol: string): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Return empty values if on-chain APIs unavailable
      // TODO: Integrate with real on-chain APIs (Glassnode, CryptoQuant, etc.)
      logger.debug('Whale activity data not available - returning empty values', {
        context: 'DataIngestion',
        data: { symbol }
      });
      return {
        whaleBuys: 0,
        whaleBuyVolume: 0,
        whaleSells: 0,
        whaleSellVolume: 0,
        netWhaleFlow: 0,
        whaleThreshold: 100000
      };
    });
  }

  private async getLiquidityData(symbol: string): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Get from Aster DEX order book API
      // If unavailable, return minimal values (not fake data)
      try {
        const { asterDexService } = await import('@/services/asterDexService');
        const orderBook = await asterDexService.getOrderBook(symbol);
        if (orderBook) {
          const bidDepth = orderBook.bids.reduce((sum, bid) => sum + bid.quantity, 0);
          const askDepth = orderBook.asks.reduce((sum, ask) => sum + ask.quantity, 0);
          return {
            totalLiquidity: bidDepth + askDepth,
            liquidityChange: 0,
            depthAnalysis: Math.min(bidDepth, askDepth),
            slippageEstimate: orderBook.spreadPercent || 0
          };
        }
      } catch (error) {
        logger.debug('Liquidity data unavailable from Aster DEX - returning minimal values', {
          context: 'DataIngestion',
          data: { symbol },
          error: error instanceof Error ? error.message : String(error)
        });
      }
      // Minimal fallback (not fake data)
      return {
        totalLiquidity: 0,
        liquidityChange: 0,
        depthAnalysis: 0,
        slippageEstimate: 0
      };
    });
  }

  private async getExchangeFlows(symbol: string): Promise<any> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Return zero values if on-chain APIs unavailable
      // TODO: Integrate with real exchange flow APIs (Glassnode, CryptoQuant, etc.)
      logger.debug('Exchange flow data not available - returning zero values', {
        context: 'DataIngestion',
        data: { symbol }
      });
      return {
        inflows: 0,
        inflowChange: 0,
        outflows: 0,
        outflowChange: 0,
        netFlow: 0
      };
    });
  }

  private async getSmartContractEvents(symbol: string): Promise<any[]> {
    return circuitBreakers.externalApi.execute(async () => {
      // REAL DATA ONLY: Return empty array if blockchain APIs unavailable
      // TODO: Integrate with real blockchain APIs (Etherscan, Blockchair, etc.)
      logger.debug('Smart contract events not available - returning empty array', {
        context: 'DataIngestion',
        data: { symbol }
      });
      return [];
    });
  }

  private mapSymbolToCoinGeckoId(symbol: string): string {
    const mapping: Record<string, string> = {
      'BTC/USDT': 'bitcoin',
      'ETH/USDT': 'ethereum',
      'SOL/USDT': 'solana',
      'BNB/USDT': 'binancecoin',
      'DOGE/USDT': 'dogecoin',
      'XRP/USDT': 'ripple'
    };
    return mapping[symbol] || 'bitcoin';
  }

  private calculateNewsSentiment(news: any[]): number {
    if (news.length === 0) return 0;
    
    const sentimentScores = news.map(article => {
      switch (article.sentiment) {
        case 'positive': return 1;
        case 'negative': return -1;
        case 'neutral': return 0;
        default: return 0;
      }
    });
    
    return sentimentScores.reduce((sum: number, score: number) => sum + score, 0) / sentimentScores.length;
  }

  private calculateOverallSentiment(news: any[], social: any, fearGreed: any): number {
    const newsSentiment = this.calculateNewsSentiment(news);
    const socialSentiment = (social.redditSentiment + (social.twitterSentiment || 0)) / 2;
    const fearGreedNormalized = (fearGreed.index - 50) / 50; // Convert 0-100 to -1 to 1
    
    return (newsSentiment + socialSentiment + fearGreedNormalized) / 3;
  }

  private getCachedData(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('🗑️ Data ingestion cache cleared', { context: 'DataIngestion' });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const dataIngestionService = new DataIngestionService();
export default dataIngestionService;
