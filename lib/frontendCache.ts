// Frontend caching and state management utilities
import { frontendLogger } from './frontendLogger';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  enablePersistence?: boolean; // Whether to persist to localStorage
}

class FrontendCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private options: Required<CacheOptions>;
  private accessOrder: string[] = [];

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 100,
      enablePersistence: options.enablePersistence || false,
    };

    // Load from localStorage if persistence is enabled
    if (this.options.enablePersistence && typeof window !== 'undefined') {
      this.loadFromStorage();
    }

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  set(key: string, value: T, customTtl?: number): void {
    const ttl = customTtl || this.options.ttl;
    const now = Date.now();

    // Remove from access order if it exists
    const existingIndex = this.accessOrder.indexOf(key);
    if (existingIndex !== -1) {
      this.accessOrder.splice(existingIndex, 1);
    }

    // Add to beginning of access order
    this.accessOrder.unshift(key);

    this.cache.set(key, {
      value,
      timestamp: now,
      ttl,
      accessCount: (this.cache.get(key)?.accessCount || 0) + 1,
      lastAccessed: now,
    });

    // Enforce max size
    if (this.cache.size > this.options.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Persist to localStorage if enabled
    if (this.options.enablePersistence) {
      this.saveToStorage();
    }

    frontendLogger.debug(`Cache set: ${key}`, {
      component: 'FrontendCache',
      data: { ttl, size: this.cache.size }
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      frontendLogger.debug(`Cache expired: ${key}`, { component: 'FrontendCache' });
      return null;
    }

    // Update access info
    entry.lastAccessed = now;
    entry.accessCount++;

    // Move to front of access order
    this.removeFromAccessOrder(key);
    this.accessOrder.unshift(key);

    frontendLogger.debug(`Cache hit: ${key}`, {
      component: 'FrontendCache',
      data: { accessCount: entry.accessCount }
    });

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.removeFromAccessOrder(key);
    
    if (this.options.enablePersistence) {
      this.saveToStorage();
    }
    
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    
    if (this.options.enablePersistence) {
      this.clearStorage();
    }
    
    frontendLogger.info('Cache cleared', { component: 'FrontendCache' });
  }

  size(): number {
    return this.cache.size;
  }

  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder[this.accessOrder.length - 1];
    this.cache.delete(lruKey);
    this.removeFromAccessOrder(lruKey);
    
    frontendLogger.debug(`Cache evicted LRU: ${lruKey}`, { component: 'FrontendCache' });
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      frontendLogger.debug(`Cache cleanup: ${cleanedCount} expired entries removed`, {
        component: 'FrontendCache'
      });
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const data = Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        value: entry.value,
        timestamp: entry.timestamp,
        ttl: entry.ttl,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed,
      }));
      
      localStorage.setItem('frontend_cache', JSON.stringify(data));
    } catch (error) {
      frontendLogger.error('Failed to save cache to localStorage', error as Error, {
        component: 'FrontendCache'
      });
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('frontend_cache');
      if (!stored) return;
      
      const data = JSON.parse(stored);
      const now = Date.now();
      
      data.forEach((item: any) => {
        // Only load non-expired entries
        if (now - item.timestamp <= item.ttl) {
          this.cache.set(item.key, {
            value: item.value,
            timestamp: item.timestamp,
            ttl: item.ttl,
            accessCount: item.accessCount || 0,
            lastAccessed: item.lastAccessed || item.timestamp,
          });
          this.accessOrder.push(item.key);
        }
      });
      
      frontendLogger.info(`Loaded ${this.cache.size} entries from localStorage`, {
        component: 'FrontendCache'
      });
    } catch (error) {
      frontendLogger.error('Failed to load cache from localStorage', error as Error, {
        component: 'FrontendCache'
      });
    }
  }

  private clearStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem('frontend_cache');
    } catch (error) {
      frontendLogger.error('Failed to clear cache from localStorage', error as Error, {
        component: 'FrontendCache'
      });
    }
  }
}

// Specialized caches for different data types
export const frontendCaches = {
  // API response cache (5 minutes TTL)
  api: new FrontendCache<any>({ ttl: 5 * 60 * 1000, maxSize: 50 }),
  
  // Price data cache (30 seconds TTL)
  prices: new FrontendCache<any>({ ttl: 30 * 1000, maxSize: 100 }),
  
  // User preferences cache (persistent)
  preferences: new FrontendCache<any>({ 
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 20,
    enablePersistence: true 
  }),
  
  // Component state cache (1 minute TTL)
  components: new FrontendCache<any>({ ttl: 60 * 1000, maxSize: 30 }),
};

// Cache key generators
export const cacheKeys = {
  api: (endpoint: string, params?: Record<string, any>) => 
    `api:${endpoint}:${params ? JSON.stringify(params) : ''}`,
  
  prices: (symbol: string) => `prices:${symbol}`,
  
  preferences: (key: string) => `prefs:${key}`,
  
  component: (componentName: string, props?: Record<string, any>) =>
    `component:${componentName}:${props ? JSON.stringify(props) : ''}`,
};

// Hook for using cache in React components
export function useFrontendCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttl?: number; cacheType?: keyof typeof frontendCaches }
) {
  const cacheType = options?.cacheType || 'api';
  const cache = frontendCaches[cacheType];
  
  const getCachedValue = (): T | null => {
    return cache.get(key);
  };
  
  const setCachedValue = (value: T): void => {
    cache.set(key, value, options?.ttl);
  };
  
  const invalidateCache = (): void => {
    cache.delete(key);
  };
  
  return {
    getCachedValue,
    setCachedValue,
    invalidateCache,
    hasValue: () => cache.has(key),
  };
}

export default frontendCaches;
