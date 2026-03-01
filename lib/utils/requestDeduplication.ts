/**
 * Request Deduplication Utility
 * Prevents duplicate concurrent API requests
 * 
 * Usage:
 * ```typescript
 * const deduplicator = new RequestDeduplicator();
 * 
 * // Multiple components calling the same endpoint simultaneously
 * const result1 = await deduplicator.dedupe('getBalance', () => fetch('/api/balance'));
 * const result2 = await deduplicator.dedupe('getBalance', () => fetch('/api/balance'));
 * // Only one request is made, both get the same result
 * ```
 */

import { logger } from '@/lib/logger';

class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<any>>();
  private requestCounts = new Map<string, number>(); // Track deduplication stats

  /**
   * Deduplicate a request - if a request with the same key is already pending,
   * return the existing promise instead of making a new request
   * 
   * @param key - Unique key for the request (e.g., 'getBalance', 'getPositions')
   * @param fn - Function that returns a promise (the actual request)
   * @returns Promise that resolves to the request result
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If a request with this key is already pending, return that promise
    if (this.pendingRequests.has(key)) {
      const count = (this.requestCounts.get(key) || 0) + 1;
      this.requestCounts.set(key, count);
      
      logger.debug('[DEDUP] Deduplicating request', {
        context: 'RequestDeduplicator',
        data: { key, deduplicationCount: count }
      });
      
      return this.pendingRequests.get(key)!;
    }
    
    // Create new request promise
    const promise = fn()
      .then((result) => {
        // Request completed successfully
        this.pendingRequests.delete(key);
        return result;
      })
      .catch((error) => {
        // Request failed - remove from pending so it can be retried
        this.pendingRequests.delete(key);
        throw error;
      });
    
    // Store the promise
    this.pendingRequests.set(key, promise);
    
    return promise;
  }

  /**
   * Check if a request with the given key is currently pending
   */
  hasPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  /**
   * Cancel a pending request (useful for cleanup)
   */
  cancel(key: string): void {
    if (this.pendingRequests.has(key)) {
      this.pendingRequests.delete(key);
      logger.debug('[DEDUP] Cancelled pending request', {
        context: 'RequestDeduplicator',
        data: { key }
      });
    }
  }

  /**
   * Clear all pending requests (useful for cleanup)
   */
  clear(): void {
    const count = this.pendingRequests.size;
    this.pendingRequests.clear();
    this.requestCounts.clear();
    
    if (count > 0) {
      logger.debug('[DEDUP] Cleared all pending requests', {
        context: 'RequestDeduplicator',
        data: { clearedCount: count }
      });
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): { key: string; deduplicationCount: number }[] {
    return Array.from(this.requestCounts.entries()).map(([key, count]) => ({
      key,
      deduplicationCount: count
    }));
  }

  /**
   * Get count of currently pending requests
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

// Singleton instance for application-wide use
const requestDeduplicator = new RequestDeduplicator();

export { RequestDeduplicator, requestDeduplicator };
export default requestDeduplicator;

