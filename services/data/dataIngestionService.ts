/**
 * Data Ingestion Service
 * Gathers and normalizes market data from exchange APIs
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';

export interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number;
  // Extended fields used by agent pipeline
  volume?: number;
  avgVolume?: number;
  rsi?: number;
  buyVolume?: number;
  sellVolume?: number;
  buyVolumePercent?: number;
  sellVolumePercent?: number;
  buySellRatio?: number;
  bidAskSpread?: number;
  volumeRatio?: number;
  volumeScore?: number;
  liquidityScore?: number;
  liquidity?: number;
  momentum?: number;
  momentumScore?: number;
  volatility?: number;
  orderBook?: {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
  };
  orderBookDepth?: {
    bidLiquidity: number;
    askLiquidity: number;
    totalLiquidity: number;
    spread: number;
    liquidityScore: number;
  };
  klines?: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  }>;
}

class DataIngestionService {
  async getMarketData(symbol: string): Promise<MarketData> {
    try {
      const [ticker, orderBook] = await Promise.all([
        asterDexService.getTicker(symbol),
        asterDexService.getOrderBook(symbol).catch(() => null),
      ]);

      if (!ticker) {
        throw new Error(`No ticker data for ${symbol}`);
      }

      const price = ticker.price;
      const volume = ticker.volume;
      const avgVolume = ticker.averageVolume || volume;

      return {
        symbol,
        price,
        volume24h: volume,
        volume,
        avgVolume,
        volumeRatio: avgVolume > 0 ? volume / avgVolume : 1,
        priceChange24h: ticker.priceChangePercent,
        priceChangePercent24h: ticker.priceChangePercent,
        high24h: ticker.highPrice,
        low24h: ticker.lowPrice,
        bid: 0,
        ask: 0,
        spread: 0,
        timestamp: Date.now(),
        orderBook: orderBook
          ? {
              bids: (orderBook.bids || []).slice(0, 10).map((b: [string, string]) => [parseFloat(b[0]), parseFloat(b[1])] as [number, number]),
              asks: (orderBook.asks || []).slice(0, 10).map((a: [string, string]) => [parseFloat(a[0]), parseFloat(a[1])] as [number, number]),
            }
          : undefined,
      };
    } catch (error) {
      logger.error('Failed to get market data', error as Error, {
        context: 'DataIngestion',
        data: { symbol },
      });
      throw error;
    }
  }
}

const globalForService = globalThis as typeof globalThis & { __dataIngestionService?: DataIngestionService };
if (!globalForService.__dataIngestionService) {
  globalForService.__dataIngestionService = new DataIngestionService();
}
export const dataIngestionService = globalForService.__dataIngestionService;
