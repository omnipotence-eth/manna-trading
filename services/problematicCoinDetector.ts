/**
 * Problematic Coin Detection Service
 * Automatically detects and blacklists coins with execution issues
 * Prevents trading coins like COSMO/APE that have liquidity problems
 */

import { logger } from '@/lib/logger';
import { asterDexService } from './asterDexService';

export interface ProblematicCoin {
  symbol: string;
  reason: string;
  metrics: {
    quoteVolume24h: number;
    liquidityScore: number;
    spreadPercent: number;
    avgSpread: number;
  };
  detectionDate: number;
}

class ProblematicCoinDetector {
  private detectedCoins: Map<string, ProblematicCoin> = new Map();
  private readonly PROBLEMATIC_THRESHOLDS = {
    MIN_QUOTE_VOLUME: 50000, // $50K minimum (was $5K) - PROTECT AGAINST ATOM-like coins
    MIN_LIQUIDITY_SCORE: 0.3, // Minimum liquidity score (was 0.1) - stricter
    MAX_SPREAD_PERCENT: 2.0, // Maximum 2% spread (was 10%) - CATCH ATOM (3% spread)
    MAX_AVG_SPREAD: 1.0 // Maximum 1% average spread (was 5%) - strict protection
  };

  /**
   * Detect if a coin is problematic based on liquidity metrics
   */
  async detectProblematicCoin(symbol: string, ticker: any, orderBook?: any): Promise<ProblematicCoin | null> {
    const quoteVolume24h = parseFloat(ticker.quoteVolume) || 0;
    const high24h = parseFloat(ticker.highPrice) || 0;
    const low24h = parseFloat(ticker.lowPrice) || 0;
    const price = parseFloat(ticker.lastPrice) || 0;
    
    // Calculate spread
    const spreadPercent = price > 0 ? ((high24h - low24h) / price) * 100 : 0;
    const avgSpread = orderBook?.spreadPercent || spreadPercent;
    
    // Calculate liquidity score
    const baseVolumeLiquidity = Math.min(quoteVolume24h / 5000000, 1.0);
    const liquidityScore = baseVolumeLiquidity;
    
    const reasons: string[] = [];
    
    // Check thresholds
    if (quoteVolume24h < this.PROBLEMATIC_THRESHOLDS.MIN_QUOTE_VOLUME) {
      reasons.push(`Low quote volume: $${(quoteVolume24h / 1000).toFixed(1)}K < $${(this.PROBLEMATIC_THRESHOLDS.MIN_QUOTE_VOLUME / 1000).toFixed(1)}K minimum`);
    }
    
    if (liquidityScore < this.PROBLEMATIC_THRESHOLDS.MIN_LIQUIDITY_SCORE) {
      reasons.push(`Low liquidity score: ${liquidityScore.toFixed(2)} < ${this.PROBLEMATIC_THRESHOLDS.MIN_LIQUIDITY_SCORE} minimum`);
    }
    
    if (spreadPercent > this.PROBLEMATIC_THRESHOLDS.MAX_SPREAD_PERCENT) {
      reasons.push(`Wide spread: ${spreadPercent.toFixed(2)}% > ${this.PROBLEMATIC_THRESHOLDS.MAX_SPREAD_PERCENT}% maximum`);
    }
    
    if (avgSpread > this.PROBLEMATIC_THRESHOLDS.MAX_AVG_SPREAD && orderBook) {
      reasons.push(`Wide average spread: ${avgSpread.toFixed(3)}% > ${this.PROBLEMATIC_THRESHOLDS.MAX_AVG_SPREAD}% maximum`);
    }
    
    if (reasons.length > 0) {
      const problematicCoin: ProblematicCoin = {
        symbol,
        reason: reasons.join('; '),
        metrics: {
          quoteVolume24h,
          liquidityScore,
          spreadPercent,
          avgSpread
        },
        detectionDate: Date.now()
      };
      
      this.detectedCoins.set(symbol, problematicCoin);
      
      logger.warn(`🚨 PROBLEMATIC COIN DETECTED: ${symbol}`, {
        context: 'ProblematicCoinDetector',
        data: {
          symbol: problematicCoin.symbol,
          reason: problematicCoin.reason,
          quoteVolume24h: problematicCoin.metrics.quoteVolume24h,
          liquidityScore: problematicCoin.metrics.liquidityScore,
          spreadPercent: problematicCoin.metrics.spreadPercent,
          avgSpread: problematicCoin.metrics.avgSpread,
          detectionDate: problematicCoin.detectionDate
        } as Record<string, unknown>
      });
      
      return problematicCoin;
    }
    
    return null;
  }

  /**
   * Check if a coin is problematic (already detected)
   */
  isProblematic(symbol: string): boolean {
    return this.detectedCoins.has(symbol) || 
           this.detectedCoins.has(symbol.replace('/', '')) ||
           this.detectedCoins.has(symbol.replace('USDT', '/USDT'));
  }

  /**
   * Get all detected problematic coins
   */
  getProblematicCoins(): ProblematicCoin[] {
    return Array.from(this.detectedCoins.values());
  }

  /**
   * Get problematic coin by symbol
   */
  getProblematicCoin(symbol: string): ProblematicCoin | undefined {
    return this.detectedCoins.get(symbol) ||
           this.detectedCoins.get(symbol.replace('/', '')) ||
           this.detectedCoins.get(symbol.replace('USDT', '/USDT'));
  }

  /**
   * Scan all symbols and detect problematic ones
   */
  async scanAllSymbols(): Promise<ProblematicCoin[]> {
    try {
      logger.info('🔍 Scanning all symbols for problematic coins...', {
        context: 'ProblematicCoinDetector'
      });

      const exchangeInfo = await asterDexService.getExchangeInfo();
      
      // CRITICAL FIX: exchangeInfo.symbols already contains ticker data (volume, price, etc.)
      // No need to fetch separate tickers
      const symbols = exchangeInfo.symbols || [];

      const problematicCoins: ProblematicCoin[] = [];

      // Skip already blacklisted symbols
      const { asterConfig } = await import('@/lib/configService');
      const blacklist = asterConfig.trading.blacklistedSymbols || [];

      for (const symbolInfo of symbols) {
        if (!symbolInfo || !symbolInfo.symbol) continue;
        
        const symbol = symbolInfo.symbol;
        
        // Skip blacklisted symbols
        if (blacklist.some(b => symbol.includes(b.replace('/', '')))) {
          continue;
        }

        try {
          // CRITICAL FIX: Use symbolInfo directly as ticker (it already has volume/price data)
          // Convert to ticker format expected by detectProblematicCoin
          const ticker = {
            quoteVolume: symbolInfo.quoteVolume24h || 0,
            highPrice: symbolInfo.high24h || symbolInfo.lastPrice || 0,
            lowPrice: symbolInfo.low24h || symbolInfo.lastPrice || 0,
            lastPrice: symbolInfo.lastPrice || 0,
            volume: symbolInfo.volume24h || 0
          };
          
          const problematic = await this.detectProblematicCoin(symbol, ticker);
          if (problematic) {
            problematicCoins.push(problematic);
          }
        } catch (error) {
          logger.debug(`Error checking ${symbol}`, {
            context: 'ProblematicCoinDetector',
            data: { 
              symbol,
              error: error instanceof Error ? error.message : String(error)
            }
          });
        }
      }

      logger.info(`✅ Problematic coin scan complete: Found ${problematicCoins.length} problematic coins`, {
        context: 'ProblematicCoinDetector',
        data: {
          totalScanned: exchangeInfo.symbols?.length || 0,
          problematicFound: problematicCoins.length,
          problematicSymbols: problematicCoins.map(c => c.symbol)
        }
      });

      return problematicCoins;
    } catch (error) {
      logger.error('Failed to scan for problematic coins', error as Error, {
        context: 'ProblematicCoinDetector'
      });
      return [];
    }
  }
}

// Export singleton instance
const globalForProblematicCoinDetector = globalThis as typeof globalThis & {
  __problematicCoinDetector?: ProblematicCoinDetector;
};

if (!globalForProblematicCoinDetector.__problematicCoinDetector) {
  globalForProblematicCoinDetector.__problematicCoinDetector = new ProblematicCoinDetector();
}

export const problematicCoinDetector = globalForProblematicCoinDetector.__problematicCoinDetector;

