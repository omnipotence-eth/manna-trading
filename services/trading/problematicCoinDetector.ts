/**
 * Problematic Coin Detection Service
 * Automatically detects and blacklists coins with execution issues
 * Prevents trading coins like COSMO/APE that have liquidity problems
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';

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
    
    // CRITICAL FIX: Only calculate real spread from order book, not 24h price range
    // The 24h price range (high24h - low24h) is volatility, NOT spread
    // BTC/USDT can have 4% daily range but 0.01% actual bid-ask spread
    const spreadPercent = orderBook?.spreadPercent || 0; // Only use real order book spread
    const avgSpread = orderBook?.spreadPercent || 0; // Same - only use order book data
    
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
    
    // CRITICAL FIX: Only check spread if we have order book data (real bid-ask spread)
    // Skip spread check if orderBook is not available - we can't calculate real spread without it
    if (orderBook && spreadPercent > this.PROBLEMATIC_THRESHOLDS.MAX_SPREAD_PERCENT) {
      reasons.push(`Wide spread: ${spreadPercent.toFixed(2)}% > ${this.PROBLEMATIC_THRESHOLDS.MAX_SPREAD_PERCENT}% maximum`);
    }
    
    if (orderBook && avgSpread > this.PROBLEMATIC_THRESHOLDS.MAX_AVG_SPREAD) {
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
   * CRITICAL FIX: Now fetches order books to calculate real spread (not 24h price range)
   */
  async scanAllSymbols(): Promise<ProblematicCoin[]> {
    try {
      logger.info('[SCAN] Scanning all symbols for problematic coins (with real spread detection)...', {
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

      // CRITICAL FIX: Batch processing to avoid rate limits
      const BATCH_SIZE = 5; // Process 5 symbols at a time
      const BATCH_DELAY = 2000; // 2 second delay between batches

      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.all(batch.map(async (symbolInfo: any) => {
          if (!symbolInfo || !symbolInfo.symbol) return;
          
          const symbol = symbolInfo.symbol;
          
          // Skip blacklisted symbols
          if (blacklist.some(b => symbol.includes(b.replace('/', '')))) {
            return;
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
            
            // CRITICAL FIX: Fetch order book to get REAL spread (not 24h price range)
            // This ensures accurate spread detection for ALL coins
            let orderBook: any = null;
            try {
              const orderBookData = await asterDexService.getOrderBook(symbol, 20);
              if (orderBookData) {
                // Calculate spreadPercent from order book (same logic as marketScannerService)
                const bestBid = parseFloat(orderBookData.bids[0]?.[0] || '0');
                const spread = orderBookData.spread;
                const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;
                
                // Create order book object with spreadPercent (expected by detectProblematicCoin)
                orderBook = {
                  ...orderBookData,
                  spreadPercent
                };
              }
            } catch (orderBookError) {
              // If order book fetch fails, continue without it (spread check will be skipped)
              logger.debug(`Order book fetch failed for ${symbol}, continuing without spread check`, {
                context: 'ProblematicCoinDetector',
                data: { 
                  symbol,
                  error: orderBookError instanceof Error ? orderBookError.message : String(orderBookError)
                }
              });
            }
            
            // CRITICAL FIX: Pass order book to detectProblematicCoin for real spread detection
            const problematic = await this.detectProblematicCoin(symbol, ticker, orderBook);
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
        }));
        
        // CRITICAL FIX: Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      logger.info(`[OK] Problematic coin scan complete: Found ${problematicCoins.length} problematic coins`, {
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

