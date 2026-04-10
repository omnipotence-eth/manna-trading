/**
 * Quantitative Data Service
 * Comprehensive market snapshots for quantitative trading decisions
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';

export interface MarketSnapshot {
  symbol: string;
  price: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  derivatives: {
    fundingRate: number;
    openInterest: number;
    nextFundingTime: number;
  };
  microstructure: {
    bidAskSpread: number;
    orderBookDepth: number;
    volumeProfile: number;
  };
  timestamp: number;
  // Extended fields for portfolio reasoning compatibility
  bullishScore?: number;
  bearishScore?: number;
  overallBias?: 'STRONG_BUY' | 'STRONG_SELL' | 'BUY' | 'SELL' | 'NEUTRAL';
  technicals?: {
    rsi14?: number;
  };
  sentiment?: {
    fearGreedIndex?: number;
  };
  volatility?: {
    volatilityRegime?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME_HIGH' | 'NORMAL' | 'EXTREME_LOW';
  };
}

class QuantDataService {
  async getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
    try {
      const [ticker, fundingRate] = await Promise.all([
        asterDexService.getTicker(symbol),
        asterDexService.getFundingRate(symbol).catch(() => null),
      ]);

      if (!ticker) {
        throw new Error(`No ticker data for ${symbol}`);
      }

      return {
        symbol,
        price: {
          open: ticker.openPrice,
          high: ticker.highPrice,
          low: ticker.lowPrice,
          close: ticker.price,
          volume: ticker.volume,
        },
        derivatives: {
          fundingRate: fundingRate ? parseFloat(fundingRate.lastFundingRate) : 0,
          openInterest: 0,
          nextFundingTime: fundingRate ? fundingRate.nextFundingTime : 0,
        },
        microstructure: {
          bidAskSpread: 0,
          orderBookDepth: 0,
          volumeProfile: ticker.quoteVolume,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to get market snapshot', error as Error, {
        context: 'QuantData',
        data: { symbol },
      });
      throw error;
    }
  }
}

const globalForService = globalThis as typeof globalThis & { __quantDataService?: QuantDataService };
if (!globalForService.__quantDataService) {
  globalForService.__quantDataService = new QuantDataService();
}
export const quantDataService = globalForService.__quantDataService;
