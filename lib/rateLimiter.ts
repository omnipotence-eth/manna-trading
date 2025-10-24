/**
 * Simple in-memory rate limiter for API routes
 */

class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if under limit
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    // Add this request
    this.requests.push(now);
    return true;
  }

  /**
   * Wait until a slot is available
   */
  async waitForSlot(): Promise<void> {
    while (!(await this.checkLimit())) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (Date.now() - oldestRequest) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
      }
    }
  }

  /**
   * Get current request count
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length;
  }
}

// Global rate limiter instance (shared across all API routes)
// Aster DEX allows much higher rates, but we keep it conservative for reliability
export const globalRateLimiter = new RateLimiter(60000, 300); // 300 requests per minute (5 req/sec) - Conservative but responsive

/**
 * Middleware to apply rate limiting to API routes
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await globalRateLimiter.waitForSlot();
  return fn();
}
