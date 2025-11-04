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
   */
  private readonly TTL = {
    POSITIONS: 20000,    // 20 seconds - increased from 10s (positions don't change that fast)
    BALANCE: 30000,      // 30 seconds - increased from 15s (balance updates are not critical)
    PRICE: 10000,        // 10 seconds - increased from 5s (acceptable for trading decisions)
    TICKER: 10000,       // 10 seconds - ticker data (unchanged)
    MARKETS: 300000,     // 5 minutes - markets rarely change (unchanged)
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
}

export const apiCache = new APICache();

