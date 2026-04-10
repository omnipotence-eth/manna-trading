/**
 * API Cache Service
 * Simple TTL cache for API responses and computed values
 */

import { logger } from '@/lib/logger';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

type CacheCategory = 'PRICE' | 'ORDER_BOOK' | 'TICKER' | 'EXCHANGE_INFO' | 'BALANCE' | 'POSITIONS';

const TTL_MAP: Record<CacheCategory, number> = {
  PRICE: 5,
  ORDER_BOOK: 3,
  TICKER: 10,
  EXCHANGE_INFO: 300,
  BALANCE: 30,
  POSITIONS: 10,
};

class ApiCache {
  private cache = new Map<string, CacheEntry>();

  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  getTTL(category: CacheCategory): number {
    return TTL_MAP[category] ?? 10;
  }

  getKlinesTTL(interval: string): number {
    switch (interval) {
      case '1m': return 30;
      case '5m': return 60;
      case '15m': return 120;
      case '1h': return 300;
      default: return 600;
    }
  }

  clear(): void {
    this.cache.clear();
    logger.debug('API cache cleared', { context: 'ApiCache' });
  }

  size(): number {
    return this.cache.size;
  }
}

const globalForCache = globalThis as typeof globalThis & { __apiCache?: ApiCache };
if (!globalForCache.__apiCache) {
  globalForCache.__apiCache = new ApiCache();
}
export const apiCache = globalForCache.__apiCache;
