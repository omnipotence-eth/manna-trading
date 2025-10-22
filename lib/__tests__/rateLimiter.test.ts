import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  jest.useFakeTimers();

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should allow requests within the limit', () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 10000, // 10 seconds
    });

    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
  });

  it('should block requests exceeding the limit', () => {
    const limiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 10000,
    });

    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(false); // Exceeds limit
    expect(limiter.checkLimit('user1')).toBe(false);
  });

  it('should track different keys independently', () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 10000,
    });

    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user2')).toBe(true); // Different user
    expect(limiter.checkLimit('user2')).toBe(true);

    expect(limiter.checkLimit('user1')).toBe(false);
    expect(limiter.checkLimit('user2')).toBe(false);
  });

  it('should reset limit after window expires', () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 10000, // 10 seconds
    });

    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(false); // Exceeds limit

    // Fast-forward time by 10 seconds
    jest.advanceTimersByTime(10000);

    expect(limiter.checkLimit('user1')).toBe(true); // Allowed again
  });

  it('should get remaining requests correctly', () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 10000,
    });

    expect(limiter.getRemainingRequests('user1')).toBe(5);

    limiter.checkLimit('user1');
    expect(limiter.getRemainingRequests('user1')).toBe(4);

    limiter.checkLimit('user1');
    limiter.checkLimit('user1');
    expect(limiter.getRemainingRequests('user1')).toBe(2);

    limiter.checkLimit('user1');
    limiter.checkLimit('user1');
    expect(limiter.getRemainingRequests('user1')).toBe(0);
  });

  it('should get reset time correctly', () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 10000,
    });

    const startTime = Date.now();
    limiter.checkLimit('user1');

    const resetTime = limiter.getResetTime('user1');
    expect(resetTime).toBe(startTime + 10000);
  });

  it('should reset rate limit for specific key', () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 10000,
    });

    limiter.checkLimit('user1');
    limiter.checkLimit('user1');
    expect(limiter.checkLimit('user1')).toBe(false); // Exceeds limit

    limiter.reset('user1');

    expect(limiter.checkLimit('user1')).toBe(true); // Allowed after reset
  });

  it('should reset all rate limits', () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 10000,
    });

    limiter.checkLimit('user1');
    limiter.checkLimit('user2');

    expect(limiter.checkLimit('user1')).toBe(false);
    expect(limiter.checkLimit('user2')).toBe(false);

    limiter.resetAll();

    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user2')).toBe(true);
  });

  it('should cleanup old entries periodically', () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 5000, // 5 seconds
    });

    limiter.checkLimit('user1');
    limiter.checkLimit('user2');
    limiter.checkLimit('user3');

    expect(limiter.getRemainingRequests('user1')).toBe(4);

    // Fast-forward time beyond window
    jest.advanceTimersByTime(10000);

    // After cleanup, limits should be reset
    expect(limiter.getRemainingRequests('user1')).toBe(5);
  });

  it('should handle edge case with zero maxRequests', () => {
    const limiter = new RateLimiter({
      maxRequests: 0,
      windowMs: 10000,
    });

    expect(limiter.checkLimit('user1')).toBe(false);
  });

  it('should handle multiple requests within sliding window', () => {
    const limiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 10000,
    });

    // Make 3 requests at t=0
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(true);
    expect(limiter.checkLimit('user1')).toBe(false);

    // Fast-forward 6 seconds (not enough to reset)
    jest.advanceTimersByTime(6000);
    expect(limiter.checkLimit('user1')).toBe(false);

    // Fast-forward another 5 seconds (total 11 seconds, window reset)
    jest.advanceTimersByTime(5000);
    expect(limiter.checkLimit('user1')).toBe(true);
  });
});

