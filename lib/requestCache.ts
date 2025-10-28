/**
 * Intelligent Request Caching Layer
 * Provides efficient caching for API requests with TTL and invalidation
 */

import { logger } from './logger';

/**
 * Cache entry interface
 */
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

/**
 * Cache configuration
 */
interface CacheConfig {
  defaultTTL: number;
  maxSize: number;
  cleanupInterval: number;
  enableStats: boolean;
}

/**
 * Cache statistics
 */
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * Intelligent Request Cache
 */
export class RequestCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    hitRate: 0
  };
  private config: CacheConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 30000, // 30 seconds
      maxSize: config.maxSize || 1000,
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      enableStats: config.enableStats || true
    };

    this.startCleanupTimer();
    
    logger.info('Request cache initialized', {
      context: 'RequestCache',
      data: {
        defaultTTL: this.config.defaultTTL,
        maxSize: this.config.maxSize,
        cleanupInterval: this.config.cleanupInterval
      }
    });
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    logger.debug(`Cache hit for key: ${key}`, {
      context: 'RequestCache',
      data: {
        key,
        hits: entry.hits,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl
      }
    });

    return entry.data as T;
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const entryTTL = ttl || this.config.defaultTTL;

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: entryTTL,
      hits: 0,
      lastAccessed: now
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;

    logger.debug(`Cache set for key: ${key}`, {
      context: 'RequestCache',
      data: {
        key,
        ttl: entryTTL,
        size: this.cache.size
      }
    });
  }

  /**
   * Delete cached data
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size = this.cache.size;
      logger.debug(`Cache deleted for key: ${key}`, {
        context: 'RequestCache',
        data: { key, size: this.cache.size }
      });
    }
    return deleted;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    
    logger.info(`Cache cleared`, {
      context: 'RequestCache',
      data: { clearedEntries: size }
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    return Date.now() - entry.timestamp <= entry.ttl;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      
      logger.debug(`Evicted LRU entry: ${oldestKey}`, {
        context: 'RequestCache',
        data: {
          evictedKey: oldestKey,
          size: this.cache.size,
          evictions: this.stats.evictions
        }
      });
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      this.stats.size = this.cache.size;
      
      logger.debug(`Cache cleanup completed`, {
        context: 'RequestCache',
        data: {
          cleanedEntries: cleaned,
          remainingSize: this.cache.size,
          totalEvictions: this.stats.evictions
        }
      });
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.clear();
    
    logger.info('Request cache destroyed', {
      context: 'RequestCache',
      data: { finalStats: this.getStats() }
    });
  }
}

/**
 * Global cache instances for different data types
 */
export const caches = {
  // Account data cache (30 seconds TTL)
  account: new RequestCache({
    defaultTTL: 30000,
    maxSize: 100,
    cleanupInterval: 60000
  }),
  
  // Positions cache (10 seconds TTL)
  positions: new RequestCache({
    defaultTTL: 10000,
    maxSize: 200,
    cleanupInterval: 30000
  }),
  
  // Ticker data cache (5 seconds TTL)
  ticker: new RequestCache({
    defaultTTL: 5000,
    maxSize: 500,
    cleanupInterval: 30000
  }),
  
  // Trades cache (60 seconds TTL)
  trades: new RequestCache({
    defaultTTL: 60000,
    maxSize: 1000,
    cleanupInterval: 120000
  }),
  
  // Model messages cache (30 seconds TTL)
  messages: new RequestCache({
    defaultTTL: 30000,
    maxSize: 500,
    cleanupInterval: 60000
  })
};

/**
 * Cache key generators
 */
export const cacheKeys = {
  account: () => 'account:data',
  positions: () => 'positions:data',
  ticker: (symbol: string) => `ticker:${symbol}`,
  trades: (limit?: number) => `trades:${limit || 'all'}`,
  messages: (limit?: number) => `messages:${limit || 'all'}`,
  symbolPrecision: (symbol: string) => `precision:${symbol}`,
  tradingPairs: () => 'trading:pairs'
};

/**
 * Cache middleware for API routes
 */
export function withCache<T>(
  cache: RequestCache,
  key: string,
  ttl?: number
) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args: any[]): Promise<T> {
      // Try to get from cache first
      const cached = cache.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      cache.set(key, result, ttl);
      
      return result;
    };

    return descriptor;
  };
}

/**
 * Cache invalidation utilities
 */
export function invalidateAccountCache(): void {
  caches.account.delete(cacheKeys.account());
  logger.info('Account cache invalidated', { context: 'CacheInvalidation' });
}

export function invalidatePositionsCache(): void {
  caches.positions.delete(cacheKeys.positions());
  logger.info('Positions cache invalidated', { context: 'CacheInvalidation' });
}

export function invalidateTickerCache(symbol?: string): void {
  if (symbol) {
    caches.ticker.delete(cacheKeys.ticker(symbol));
    logger.info(`Ticker cache invalidated for ${symbol}`, { context: 'CacheInvalidation' });
  } else {
    caches.ticker.clear();
    logger.info('All ticker cache invalidated', { context: 'CacheInvalidation' });
  }
}

export function invalidateTradesCache(): void {
  caches.trades.clear();
  logger.info('Trades cache invalidated', { context: 'CacheInvalidation' });
}

export function invalidateMessagesCache(): void {
  caches.messages.clear();
  logger.info('Messages cache invalidated', { context: 'CacheInvalidation' });
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  return {
    account: caches.account.getStats(),
    positions: caches.positions.getStats(),
    ticker: caches.ticker.getStats(),
    trades: caches.trades.getStats(),
    messages: caches.messages.getStats()
  };
}
