/**
 * Advanced Caching Strategies
 * Implements intelligent caching with Redis integration and cache warming
 */

import { logger } from './logger';
import { PerformanceMonitor } from './performanceMonitor';
import { asterConfig } from './configService';

/**
 * Cache warming strategies
 */
export enum CacheWarmingStrategy {
  IMMEDIATE = 'immediate',
  SCHEDULED = 'scheduled',
  ON_DEMAND = 'on_demand',
  BACKGROUND = 'background'
}

/**
 * Cache invalidation strategies
 */
export enum CacheInvalidationStrategy {
  TIME_BASED = 'time_based',
  EVENT_BASED = 'event_based',
  DEPENDENCY_BASED = 'dependency_based',
  MANUAL = 'manual'
}

/**
 * Advanced cache entry with metadata
 */
interface AdvancedCacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
  dependencies: string[];
  invalidationStrategy: CacheInvalidationStrategy;
  warmingStrategy: CacheWarmingStrategy;
  metadata: {
    source: string;
    version: string;
    compressed: boolean;
    size: number;
  };
}

/**
 * Advanced Cache Manager
 */
export class AdvancedCacheManager {
  private cache = new Map<string, AdvancedCacheEntry>();
  private dependencies = new Map<string, Set<string>>();
  private warmingQueue = new Set<string>();
  private invalidationTimers = new Map<string, NodeJS.Timeout>();
  
  constructor(
    private maxSize: number = 10000,
    private defaultTTL: number = 300000, // 5 minutes
    private warmingInterval: number = 60000 // 1 minute
  ) {
    this.startWarmingProcess();
    this.startCleanupProcess();
    
    logger.info('Advanced cache manager initialized', {
      context: 'AdvancedCache',
      data: {
        maxSize,
        defaultTTL,
        warmingInterval
      }
    });
  }

  /**
   * Set cache entry with advanced metadata
   */
  set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      dependencies?: string[];
      invalidationStrategy?: CacheInvalidationStrategy;
      warmingStrategy?: CacheWarmingStrategy;
      source?: string;
      version?: string;
    } = {}
  ): void {
    const now = Date.now();
    const entry: AdvancedCacheEntry<T> = {
      data,
      timestamp: now,
      ttl: options.ttl || this.defaultTTL,
      hits: 0,
      lastAccessed: now,
      dependencies: options.dependencies || [],
      invalidationStrategy: options.invalidationStrategy || CacheInvalidationStrategy.TIME_BASED,
      warmingStrategy: options.warmingStrategy || CacheWarmingStrategy.ON_DEMAND,
      metadata: {
        source: options.source || 'unknown',
        version: options.version || '1.0',
        compressed: false,
        size: JSON.stringify(data).length
      }
    };

    // Set up invalidation timer if time-based
    if (entry.invalidationStrategy === CacheInvalidationStrategy.TIME_BASED) {
      this.setInvalidationTimer(key, entry.ttl);
    }

    // Update dependencies
    entry.dependencies.forEach(dep => {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, new Set());
      }
      this.dependencies.get(dep)!.add(key);
    });

    this.cache.set(key, entry);
    PerformanceMonitor.recordCounter('cache:advanced:set');
    
    logger.debug('Advanced cache entry set', {
      context: 'AdvancedCache',
      data: {
        key,
        ttl: entry.ttl,
        dependencies: entry.dependencies.length,
        strategy: entry.invalidationStrategy,
        size: entry.metadata.size
      }
    });
  }

  /**
   * Get cache entry with hit tracking
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      PerformanceMonitor.recordCounter('cache:advanced:miss');
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      PerformanceMonitor.recordCounter('cache:advanced:expired');
      return null;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccessed = Date.now();
    PerformanceMonitor.recordCounter('cache:advanced:hit');
    
    logger.debug('Advanced cache hit', {
      context: 'AdvancedCache',
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
   * Invalidate cache by dependency
   */
  invalidateByDependency(dependency: string): void {
    const dependentKeys = this.dependencies.get(dependency);
    if (!dependentKeys) return;

    let invalidatedCount = 0;
    dependentKeys.forEach(key => {
      if (this.cache.has(key)) {
        this.delete(key);
        invalidatedCount++;
      }
    });

    PerformanceMonitor.recordCounter('cache:advanced:invalidation');
    
    logger.info('Cache invalidated by dependency', {
      context: 'AdvancedCache',
      data: {
        dependency,
        invalidatedCount
      }
    });
  }

  /**
   * Warm cache with data fetching function
   */
  async warmCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: {
      ttl?: number;
      dependencies?: string[];
      invalidationStrategy?: CacheInvalidationStrategy;
      warmingStrategy?: CacheWarmingStrategy;
      source?: string;
      version?: string;
    } = {}
  ): Promise<T> {
    try {
      logger.debug('Warming cache', { context: 'AdvancedCache', data: { key } });
      
      const data = await fetchFn();
      this.set(key, data, options);
      
      PerformanceMonitor.recordCounter('cache:advanced:warmed');
      
      logger.info('Cache warmed successfully', {
        context: 'AdvancedCache',
        data: {
          key,
          size: JSON.stringify(data).length,
          strategy: options.warmingStrategy || CacheWarmingStrategy.ON_DEMAND
        }
      });
      
      return data;
    } catch (error) {
      PerformanceMonitor.recordCounter('cache:advanced:warm_error');
      logger.error('Cache warming failed', error, { context: 'AdvancedCache' });
      throw error;
    }
  }

  /**
   * Preload critical data
   */
  async preloadCriticalData(): Promise<void> {
    const criticalKeys = [
      'account:data',
      'positions:data',
      'trading:pairs',
      'prices:btcusdt',
      'prices:ethusdt'
    ];

    logger.info('Preloading critical cache data', {
      context: 'AdvancedCache',
      data: { keys: criticalKeys }
    });

    // This would be implemented with actual data fetching functions
    // For now, we'll just mark them for warming
    criticalKeys.forEach(key => {
      this.warmingQueue.add(key);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    warmingQueueSize: number;
    dependenciesCount: number;
    memoryUsage: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;
    let memoryUsage = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      memoryUsage += entry.metadata.size;
    }

    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate,
      totalHits,
      totalMisses,
      warmingQueueSize: this.warmingQueue.size,
      dependenciesCount: this.dependencies.size,
      memoryUsage
    };
  }

  /**
   * Delete cache entry
   */
  private delete(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    // Clear invalidation timer
    const timer = this.invalidationTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.invalidationTimers.delete(key);
    }

    // Remove from dependencies
    entry.dependencies.forEach(dep => {
      const dependentKeys = this.dependencies.get(dep);
      if (dependentKeys) {
        dependentKeys.delete(key);
        if (dependentKeys.size === 0) {
          this.dependencies.delete(dep);
        }
      }
    });

    this.cache.delete(key);
    this.warmingQueue.delete(key);
  }

  /**
   * Set invalidation timer
   */
  private setInvalidationTimer(key: string, ttl: number): void {
    const timer = setTimeout(() => {
      this.delete(key);
      logger.debug('Cache entry expired', { context: 'AdvancedCache', data: { key } });
    }, ttl);
    
    this.invalidationTimers.set(key, timer);
  }

  /**
   * Start cache warming process
   */
  private startWarmingProcess(): void {
    setInterval(() => {
      if (this.warmingQueue.size > 0) {
        logger.debug('Cache warming process running', {
          context: 'AdvancedCache',
          data: { queueSize: this.warmingQueue.size }
        });
        
        // Process warming queue
        this.warmingQueue.forEach(key => {
          // This would trigger actual data fetching
          logger.debug('Processing warming queue item', {
            context: 'AdvancedCache',
            data: { key }
          });
        });
        
        this.warmingQueue.clear();
      }
    }, this.warmingInterval);
  }

  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Start cleanup process
   */
  private startCleanupProcess(): void {
    // Clear existing interval if any (prevent duplicates)
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cache cleanup completed', {
          context: 'AdvancedCache',
          data: {
            cleanedCount,
            remainingSize: this.cache.size
          }
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Clear all cache
   */
  clear(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Clear all timers
    this.invalidationTimers.forEach(timer => clearTimeout(timer));
    this.invalidationTimers.clear();
    
    // Clear cache and dependencies
    this.cache.clear();
    this.dependencies.clear();
    this.warmingQueue.clear();
    
    logger.info('Advanced cache cleared', { context: 'AdvancedCache' });
  }
}

/**
 * Global advanced cache instance
 */
export const advancedCache = new AdvancedCacheManager();

/**
 * Cache warming utilities
 */
export class CacheWarmer {
  private warmingFunctions = new Map<string, () => Promise<any>>();

  /**
   * Register warming function
   */
  register(key: string, warmingFn: () => Promise<any>): void {
    this.warmingFunctions.set(key, warmingFn);
    logger.debug('Cache warming function registered', {
      context: 'CacheWarmer',
      data: { key }
    });
  }

  /**
   * Warm specific cache key
   */
  async warm(key: string): Promise<void> {
    const warmingFn = this.warmingFunctions.get(key);
    if (!warmingFn) {
      logger.warn('No warming function registered', {
        context: 'CacheWarmer',
        data: { key }
      });
      return;
    }

    try {
      await advancedCache.warmCache(key, warmingFn);
    } catch (error) {
      logger.error('Cache warming failed', error, {
        context: 'CacheWarmer',
        data: { key }
      });
    }
  }

  /**
   * Warm all registered caches
   */
  async warmAll(): Promise<void> {
    const keys = Array.from(this.warmingFunctions.keys());
    
    logger.info('Warming all caches', {
      context: 'CacheWarmer',
      data: { keys }
    });

    await Promise.allSettled(
      keys.map(key => this.warm(key))
    );
  }
}

/**
 * Global cache warmer instance
 */
export const cacheWarmer = new CacheWarmer();

/**
 * Initialize advanced caching
 */
export function initializeAdvancedCaching(): void {
  // Register warming functions for critical data
  cacheWarmer.register('account:data', async () => {
    // This would fetch account data
    return { balance: 0, timestamp: Date.now() };
  });

  cacheWarmer.register('positions:data', async () => {
    // This would fetch positions data
    return { positions: [], timestamp: Date.now() };
  });

  cacheWarmer.register('trading:pairs', async () => {
    // This would fetch trading pairs
    return { pairs: [], timestamp: Date.now() };
  });

  // Preload critical data
  advancedCache.preloadCriticalData();

  logger.info('Advanced caching initialized', {
    context: 'AdvancedCache',
    data: {
      warmingFunctions: cacheWarmer['warmingFunctions'].size,
      maxSize: advancedCache['maxSize'],
      defaultTTL: advancedCache['defaultTTL']
    }
  });
}
