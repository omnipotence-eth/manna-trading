/**
 * Data Ingestion Service
 * Aggregates market data from multiple sources for agent analysis
 * WORLD-CLASS: Parallel data gathering for optimal performance
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  quoteVolume: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  open24h: number;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  spread?: number;
  liquidityScore?: number;
  rsi?: number;
  buyVolume?: number;
  sellVolume?: number;
  buySellRatio?: number;
  timestamp: number;
}

class DataIngestionService {
  /**
   * Get comprehensive market data for a symbol
   * WORLD-CLASS: Fetches all data in parallel for optimal performance
   */
  async getMarketData(symbol: string): Promise<MarketData> {
    const startTime = Date.now();
    
    try {
      logger.debug('Gathering market data', {
        context: 'DataIngestion',
        data: { symbol }
      });

      // WORLD-CLASS: Fetch all data sources in parallel
      const [
        price,
        ticker,
        orderBook,
        aggregatedTrades
      ] = await Promise.all([
        asterDexService.getPrice(symbol).catch(() => null),
        asterDexService.getTicker(symbol).catch(() => null),
        asterDexService.getOrderBook(symbol, 5).catch(() => null),
        asterDexService.getAggregatedTrades(symbol, 100).catch(() => null)
      ]);

      // Validate critical data
      if (!price || price <= 0) {
        throw new Error(`Invalid price for ${symbol}: ${price}`);
      }

      if (!ticker) {
        throw new Error(`No ticker data for ${symbol}`);
      }

      // Build comprehensive market data object
      // ticker is from getTicker() which returns a different structure
      const marketData: MarketData = {
        symbol,
        price,
        volume: ticker?.volume || 0,
        quoteVolume: ticker?.quoteVolume || 0,
        priceChange24h: 0, // Not directly available from getTicker
        priceChangePercent24h: ticker?.priceChangePercent || 0,
        high24h: ticker?.highPrice || 0,
        low24h: ticker?.lowPrice || 0,
        open24h: ticker?.openPrice || 0,
        lastPrice: ticker?.price || price,
        timestamp: Date.now()
      };
      
      // Calculate 24h price change from open and current
      if (marketData.open24h > 0) {
        marketData.priceChange24h = marketData.lastPrice - marketData.open24h;
      }

      // Add order book data if available
      if (orderBook && orderBook.bids && orderBook.asks && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0][0]);
        const bestAsk = parseFloat(orderBook.asks[0][0]);
        
        marketData.bidPrice = bestBid;
        marketData.askPrice = bestAsk;
        const spreadAmount = bestAsk - bestBid;
        marketData.spread = (spreadAmount / bestBid) * 100; // Spread as percentage

        // Calculate liquidity score (simplified - sum of top 5 bids/asks)
        const bidLiquidity = orderBook.bids.slice(0, 5).reduce((sum: number, [_price, qty]: [string, string]) => sum + parseFloat(qty), 0);
        const askLiquidity = orderBook.asks.slice(0, 5).reduce((sum: number, [_price, qty]: [string, string]) => sum + parseFloat(qty), 0);
        marketData.liquidityScore = (bidLiquidity + askLiquidity) / 2;
      }

      // Add volume analysis if available
      if (aggregatedTrades) {
        marketData.buyVolume = aggregatedTrades.buyVolume;
        marketData.sellVolume = aggregatedTrades.sellVolume;
        marketData.buySellRatio = aggregatedTrades.buySellRatio;
      }

      // Note: RSI calculation would typically be done by technical analysis agent
      // We don't calculate it here to avoid duplication

      const duration = Date.now() - startTime;
      logger.debug('Market data gathered successfully', {
        context: 'DataIngestion',
        data: {
          symbol,
          duration: `${duration}ms`,
          price: marketData.price,
          volume: marketData.volume,
          hasOrderBook: !!orderBook,
          hasVolumeData: !!(marketData.buyVolume || marketData.sellVolume)
        }
      });

      return marketData;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to gather market data', error, {
        context: 'DataIngestion',
        data: {
          symbol,
          duration: `${duration}ms`,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  /**
   * Get market data for multiple symbols in parallel
   * WORLD-CLASS: Batch processing for efficiency
   */
  async getMarketDataBatch(symbols: string[]): Promise<Map<string, MarketData>> {
    const results = new Map<string, MarketData>();
    
    // Fetch all in parallel
    const promises = symbols.map(async (symbol) => {
      try {
        const data = await this.getMarketData(symbol);
        return { symbol, data };
      } catch (error) {
        logger.error(`Failed to get market data for ${symbol}`, error, {
          context: 'DataIngestion'
        });
        return { symbol, data: null };
      }
    });

    const resultsArray = await Promise.all(promises);
    
    resultsArray.forEach(({ symbol, data }) => {
      if (data) {
        results.set(symbol, data);
      }
    });

    return results;
  }
}

// Export singleton instance
export const dataIngestionService = new DataIngestionService();

