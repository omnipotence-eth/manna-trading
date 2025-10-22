// lib/rateLimiter.ts

import { logger } from './logger';

interface RateLimitConfig {
  maxRequests: number; // Maximum number of requests allowed
  windowMs: number; // Time window in milliseconds
  message?: string; // Custom error message
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map(); // Track requests per key
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup old entries periodically
    setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
  }

  /**
   * Check if a request is allowed for a given key
   * @param key - Unique identifier for the rate limit (e.g., user ID, IP address)
   * @returns true if allowed, false if rate limit exceeded
   */
  checkLimit(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // Filter out timestamps outside the current window
    const recentTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );

    if (recentTimestamps.length >= this.config.maxRequests) {
      logger.warn(`Rate limit exceeded for key: ${key}`, {
        context: 'RateLimiter',
        data: { key, count: recentTimestamps.length, limit: this.config.maxRequests },
      });
      return false; // Rate limit exceeded
    }

    // Add current timestamp and update the map
    recentTimestamps.push(now);
    this.requests.set(key, recentTimestamps);

    return true; // Request allowed
  }

  /**
   * Get remaining requests for a key
   */
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    const recentTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );

    return Math.max(0, this.config.maxRequests - recentTimestamps.length);
  }

  /**
   * Get reset time for a key (in milliseconds)
   */
  getResetTime(key: string): number {
    const timestamps = this.requests.get(key) || [];

    if (timestamps.length === 0) {
      return 0;
    }

    const oldestTimestamp = Math.min(...timestamps);
    return oldestTimestamp + this.config.windowMs;
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.requests.delete(key);
    logger.debug(`Rate limit reset for key: ${key}`, {
      context: 'RateLimiter',
      data: { key },
    });
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.requests.clear();
    logger.debug('All rate limits reset', { context: 'RateLimiter' });
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, timestamps] of this.requests.entries()) {
      const recentTimestamps = timestamps.filter(
        (timestamp) => now - timestamp < this.config.windowMs
      );

      if (recentTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentTimestamps);
      }
    }
  }
}

// Preset rate limiters for common use cases
export const apiRateLimiter = new RateLimiter({
  maxRequests: 100, // 100 requests
  windowMs: 60 * 1000, // per minute
  message: 'Too many API requests. Please try again later.',
});

export const tradeRateLimiter = new RateLimiter({
  maxRequests: 10, // 10 trades
  windowMs: 10 * 1000, // per 10 seconds
  message: 'Too many trade requests. Please slow down.',
});

export const orderRateLimiter = new RateLimiter({
  maxRequests: 50, // 50 orders
  windowMs: 60 * 1000, // per minute
  message: 'Too many order requests. Please try again later.',
});

export { RateLimiter };
export type { RateLimitConfig };

