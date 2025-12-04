/**
 * API Response Cache
 * Caches API responses to reduce redundant calls to Aster DEX
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  
  /**
   * Cache TTLs (Time To Live) in milliseconds
   * OPTIMIZED: Increased cache times to prevent 429 rate limit errors
   * 
   * CRITICAL: Public endpoints (klines, order book, tickers) are IP-RATE-LIMITED
   * Your 30 API keys only help with authenticated endpoints (trades, account)!
   * Longer cache TTLs = fewer API calls = less rate limiting
   * 
   * MTF ANALYSIS ENABLED: With WebSocket for real-time prices, we can afford
   * to cache klines longer since we still have fresh price data
   */
  private readonly TTL = {
    POSITIONS: 30000,      // 30 seconds - positions change on trades only
    BALANCE: 60000,        // 60 seconds - balance is stable between trades
    PRICE: 10000,          // 10 seconds - WebSocket updates this anyway
    TICKER: 30000,         // 30 seconds - ticker data (IP rate limited!)
    MARKETS: 600000,       // 10 minutes - markets rarely change
    ORDER_BOOK: 120000,    // 2 minutes - order book for confirmation only
    KLINES_1M: 60000,      // 1 minute - for entry timing
    KLINES_5M: 180000,     // 3 minutes - for short-term direction
    KLINES_15M: 300000,    // 5 minutes - for medium confirmation
    KLINES_1H: 600000,     // 10 minutes - for trend confirmation
    KLINES_4H: 900000,     // 15 minutes - for major trend
    KLINES: 180000,        // 3 minutes - default fallback
    EXCHANGE_INFO: 3600000, // 1 hour - exchange info rarely changes
  };

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (now > entry.expiresAt) {
      // Expired, remove from cache
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set cached data with TTL
   */
  set<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get TTL for a specific cache type
   */
  getTTL(type: keyof typeof this.TTL): number {
    return this.TTL[type];
  }

  /**
   * Get TTL for klines based on interval
   * Higher timeframes can be cached longer since they change less frequently
   */
  getKlinesTTL(interval: string): number {
    switch (interval) {
      case '1m': return this.TTL.KLINES_1M;
      case '3m':
      case '5m': return this.TTL.KLINES_5M;
      case '15m':
      case '30m': return this.TTL.KLINES_15M;
      case '1h':
      case '2h': return this.TTL.KLINES_1H;
      case '4h':
      case '6h':
      case '12h':
      case '1d':
      case '1w': return this.TTL.KLINES_4H;
      default: return this.TTL.KLINES;
    }
  }
}

export const apiCache = new APICache();

