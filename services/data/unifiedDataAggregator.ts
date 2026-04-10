/**
 * Unified Data Aggregator
 * Aggregates real-time market data from multiple sources into a unified view
 */

import { logger } from '@/lib/logger';

export interface AggregatedMarketData {
  symbol: string;
  price: number;
  volume24h: number;
  priceChangePercent24h: number;
  fundingRate: number;
  spreadPercent: number;
  signalStrength: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  overallScore: number;
  atrPercent: number;
  totalLiquidationValue24h: number;
  lastUpdate: number;
}

export interface LiquidationEvent {
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  value: number;
  timestamp: number;
}

interface AggregatorStatus {
  connected: boolean;
  symbolCount: number;
  lastUpdate: number;
}

class UnifiedDataAggregator {
  private marketData = new Map<string, AggregatedMarketData>();
  private liquidations: LiquidationEvent[] = [];
  private connected = false;

  getStatus(): AggregatorStatus {
    return {
      connected: this.connected,
      symbolCount: this.marketData.size,
      lastUpdate: Date.now(),
    };
  }

  getMarketData(symbol: string): AggregatedMarketData | null {
    return this.marketData.get(symbol) || null;
  }

  getAllMarketData(): Map<string, AggregatedMarketData> {
    return this.marketData;
  }

  getRecentLiquidations(): LiquidationEvent[] {
    return this.liquidations.slice(-50);
  }

  async addSymbol(symbol: string): Promise<void> {
    if (!this.marketData.has(symbol)) {
      this.marketData.set(symbol, this.createDefault(symbol));
      logger.info('Symbol added to aggregator', { context: 'DataAggregator', data: { symbol } });
    }
  }

  async connect(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      await this.addSymbol(symbol);
    }
    this.connected = true;
    logger.info('Data aggregator connected', {
      context: 'DataAggregator',
      data: { symbols: symbols.length },
    });
  }

  disconnect(): void {
    this.connected = false;
    logger.info('Data aggregator disconnected', { context: 'DataAggregator' });
  }

  private createDefault(symbol: string): AggregatedMarketData {
    return {
      symbol,
      price: 0,
      volume24h: 0,
      priceChangePercent24h: 0,
      fundingRate: 0,
      spreadPercent: 0,
      signalStrength: 'NEUTRAL',
      overallScore: 50,
      atrPercent: 0,
      totalLiquidationValue24h: 0,
      lastUpdate: Date.now(),
    };
  }
}

const globalForService = globalThis as typeof globalThis & { __unifiedDataAggregator?: UnifiedDataAggregator };
if (!globalForService.__unifiedDataAggregator) {
  globalForService.__unifiedDataAggregator = new UnifiedDataAggregator();
}
export const unifiedDataAggregator = globalForService.__unifiedDataAggregator;
