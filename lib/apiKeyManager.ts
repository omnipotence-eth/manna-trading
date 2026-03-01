/**
 * Unified API Key Manager - Single Source of Truth
 * 
 * CONSOLIDATED FROM:
 * - lib/apiKeyManager.ts (original)
 * - lib/security.ts APIKeyManager (removed)
 * - services/apiKeyOptimizer.ts (merged)
 * 
 * FEATURES:
 * - 30-key pool management for maximum throughput
 * - Weight-based rate limiting per Aster DEX API docs
 * - Priority queue for request types
 * - Health checks with circuit breakers
 * - Automatic cooldown and recovery
 * 
 * RATE LIMITS (from Aster DEX API docs):
 * - IP Weight: 2400/minute
 * - Orders: 300/10 seconds, 1200/minute
 * 
 * @see https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
 */

import { logger } from './logger';
import { CircuitBreaker } from './circuitBreaker';

// ============================================================================
// RATE LIMIT CONSTANTS (from Aster DEX API documentation)
// ============================================================================

export const ASTER_RATE_LIMITS = {
  // IP-based limits
  IP_WEIGHT_PER_MINUTE: 2400,
  IP_ORDERS_PER_10_SEC: 300,
  IP_ORDERS_PER_MINUTE: 1200,
  
  // Endpoint weights (from API docs)
  ENDPOINT_WEIGHTS: {
    // Market Data
    ping: 1,
    time: 1,
    exchangeInfo: 10,
    depth: 5,        // Adjusted by limit
    trades: 5,
    historicalTrades: 20,
    aggTrades: 20,
    klines: 5,
    markPrice: 1,
    fundingRate: 1,
    ticker24hr: 1,   // 40 for all symbols
    tickerPrice: 1,  // 2 for all symbols
    bookTicker: 1,   // 2 for all symbols
    
    // Account/Trade
    order: 1,
    cancelOrder: 1,
    cancelAllOrders: 1,
    batchOrders: 5,
    queryOrder: 1,
    openOrders: 1,   // 40 for all symbols
    allOrders: 5,
    account: 5,
    balance: 5,
    positions: 5,
    leverage: 1,
    marginType: 1,
    positionMargin: 1,
    positionRisk: 5,
    userTrades: 5,
    income: 30,
    leverageBracket: 1,
    adlQuantile: 5,
    forceOrders: 20,
    commissionRate: 20,
  }
} as const;

// ============================================================================
// INTERFACES
// ============================================================================

export interface AsterAPIKey {
  id: string;
  apiKey: string;
  secretKey: string;
  
  // Usage stats
  requestCount: number;
  errorCount: number;
  lastUsed: number;
  lastError: number;
  
  // Health
  isHealthy: boolean;
  cooldownUntil: number;
  
  // Weight-based rate limiting
  weightUsedThisMinute: number;
  ordersThisMinute: number;
  ordersThisTenSeconds: number;
  windowStart: number;
  tenSecWindowStart: number;
  
  // Circuit breaker
  circuitBreaker?: CircuitBreaker;
  
  // Permissions
  permissions: ('read' | 'trade' | 'withdraw')[];
  priority: number; // Lower = higher priority
}

export type KeySelectionStrategy = 'round-robin' | 'least-used' | 'least-weight' | 'health-based';

export type EndpointType = keyof typeof ASTER_RATE_LIMITS.ENDPOINT_WEIGHTS;

interface APIKeyManagerConfig {
  strategy: KeySelectionStrategy;
  healthCheckInterval: number;
  cooldownPeriod: number;
}

// ============================================================================
// UNIFIED API KEY MANAGER CLASS
// ============================================================================

class UnifiedAPIKeyManager {
  private keys: Map<string, AsterAPIKey> = new Map();
  private currentIndex = 0;
  private config: APIKeyManagerConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private initialized = false;
  
  // Statistics
  private totalRequests = 0;
  private totalWeightUsed = 0;
  private requestsPerSecond: number[] = [];

  constructor(config?: Partial<APIKeyManagerConfig>) {
    this.config = {
      strategy: config?.strategy || 'least-weight',
      healthCheckInterval: config?.healthCheckInterval || 60000,
      cooldownPeriod: config?.cooldownPeriod || 60000, // 1 minute cooldown
    };
  }
  
  /**
   * Initialize the manager (lazy init for globalThis pattern)
   */
  private initialize(): void {
    if (this.initialized) return;
    
    this.loadKeysFromEnvironment();
    this.startHealthChecks();
    this.startRateLimitResets();
    this.initialized = true;
    
    logger.info('🔑 Unified API Key Manager initialized', {
      context: 'APIKeyManager',
      data: {
        totalKeys: this.keys.size,
        strategy: this.config.strategy,
        maxWeightPerMinute: ASTER_RATE_LIMITS.IP_WEIGHT_PER_MINUTE
      }
    });
  }

  /**
   * Load API keys from environment variables
   */
  private loadKeysFromEnvironment(): void {
    try {
      // Method 1: JSON key pool (recommended for 30 keys)
      const keyPoolJson = process.env.ASTER_KEY_POOL;
      if (keyPoolJson) {
        try {
          const keyPool = JSON.parse(keyPoolJson);
          keyPool.keys.forEach((key: { id?: string; api: string; secret: string }, index: number) => {
            this.addKey({
              id: key.id || `key-${index + 1}`,
              apiKey: key.api,
              secretKey: key.secret,
              permissions: ['read', 'trade'],
              priority: index
            });
          });
          
          logger.info(`Loaded ${keyPool.keys.length} API keys from ASTER_KEY_POOL`, {
            context: 'APIKeyManager'
          });
          return;
        } catch (e) {
          logger.warn('Failed to parse ASTER_KEY_POOL JSON', { context: 'APIKeyManager' });
        }
      }

      // Method 2: Comma-separated keys
      const apiKeys = process.env.ASTER_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
      const secretKeys = process.env.ASTER_SECRET_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];

      if (apiKeys.length > 0 && apiKeys.length === secretKeys.length) {
        apiKeys.forEach((apiKey, index) => {
          this.addKey({
            id: `key-${index + 1}`,
            apiKey,
            secretKey: secretKeys[index],
            permissions: ['read', 'trade'],
            priority: index
          });
        });
        
        logger.info(`Loaded ${apiKeys.length} API keys from comma-separated format`, {
          context: 'APIKeyManager'
        });
        return;
      }

      // Method 3: Single key fallback
      const singleApiKey = process.env.ASTER_API_KEY;
      const singleSecretKey = process.env.ASTER_SECRET_KEY;

      if (singleApiKey && singleSecretKey) {
        this.addKey({
          id: 'primary',
          apiKey: singleApiKey,
          secretKey: singleSecretKey,
          permissions: ['read', 'trade'],
          priority: 0
        });
        
        logger.warn('Using single API key - multi-key setup recommended', {
          context: 'APIKeyManager'
        });
      } else {
        logger.error('No API keys configured!', undefined, { context: 'APIKeyManager' });
      }
    } catch (error) {
      logger.error('Failed to load API keys', error as Error, { context: 'APIKeyManager' });
    }
  }

  /**
   * Add a new API key to the pool
   */
  private addKey(config: {
    id: string;
    apiKey: string;
    secretKey: string;
    permissions: ('read' | 'trade' | 'withdraw')[];
    priority: number;
  }): void {
    const key: AsterAPIKey = {
      id: config.id,
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      requestCount: 0,
      errorCount: 0,
      lastUsed: 0,
      lastError: 0,
      isHealthy: true,
      cooldownUntil: 0,
      weightUsedThisMinute: 0,
      ordersThisMinute: 0,
      ordersThisTenSeconds: 0,
      windowStart: Date.now(),
      tenSecWindowStart: Date.now(),
      permissions: config.permissions,
      priority: config.priority,
      circuitBreaker: new CircuitBreaker({
        name: `API-${config.id}`,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        monitoringPeriod: 60000
      })
    };
    
    this.keys.set(config.id, key);
  }

  /**
   * Get the best key for a request based on endpoint weight
   */
  getBestKey(
    endpoint: EndpointType = 'ticker24hr',
    requireTrade: boolean = false
  ): { key: string; secret: string; id: string } | null {
    this.initialize();
    
    const weight = ASTER_RATE_LIMITS.ENDPOINT_WEIGHTS[endpoint] || 1;
    const isOrder = ['order', 'cancelOrder', 'batchOrders'].includes(endpoint);
    const now = Date.now();
    
    // Find best available key
    let bestKey: AsterAPIKey | null = null;
    let lowestWeight = Infinity;
    
    for (const key of this.keys.values()) {
      // Skip unhealthy keys
      if (!key.isHealthy || key.cooldownUntil > now) continue;
      
      // Skip keys without trade permission if needed
      if (requireTrade && !key.permissions.includes('trade')) continue;
      
      // Check circuit breaker
      if (key.circuitBreaker && !key.circuitBreaker.isHealthy()) continue;
      
      // Reset windows if needed
      this.resetWindowsIfNeeded(key, now);
      
      // Check weight capacity
      if (key.weightUsedThisMinute + weight > ASTER_RATE_LIMITS.IP_WEIGHT_PER_MINUTE) {
        continue; // This key is at capacity
      }
      
      // Check order limits for order endpoints
      if (isOrder) {
        if (key.ordersThisTenSeconds >= ASTER_RATE_LIMITS.IP_ORDERS_PER_10_SEC) continue;
        if (key.ordersThisMinute >= ASTER_RATE_LIMITS.IP_ORDERS_PER_MINUTE) continue;
      }
      
      // Select key with lowest weight usage
      if (key.weightUsedThisMinute < lowestWeight) {
        lowestWeight = key.weightUsedThisMinute;
        bestKey = key;
      }
    }
    
    if (!bestKey) {
      logger.warn('All API keys at capacity or unhealthy', {
        context: 'APIKeyManager',
        data: { 
          requestedWeight: weight,
          endpoint,
          totalKeys: this.keys.size
        }
      });
      return null;
    }
    
    // Pre-record the weight usage
    bestKey.weightUsedThisMinute += weight;
    bestKey.requestCount++;
    bestKey.lastUsed = now;
    
    if (isOrder) {
      bestKey.ordersThisTenSeconds++;
      bestKey.ordersThisMinute++;
    }
    
    this.totalRequests++;
    this.totalWeightUsed += weight;
    
    return {
      key: bestKey.apiKey,
      secret: bestKey.secretKey,
      id: bestKey.id
    };
  }

  /**
   * Get next key using round-robin (legacy method for compatibility)
   */
  getNextKey(): { apiKey: string; secretKey: string } {
    const result = this.getBestKey();
    if (!result) {
      // Fallback to first key
      const first = this.keys.values().next().value;
      if (first) {
        return { apiKey: first.apiKey, secretKey: first.secretKey };
      }
      throw new Error('No API keys available');
    }
    return { apiKey: result.key, secretKey: result.secret };
  }

  /**
   * Reset rate limit windows if time has passed
   */
  private resetWindowsIfNeeded(key: AsterAPIKey, now: number): void {
    // Reset per-minute window
    if (now - key.windowStart >= 60000) {
      key.weightUsedThisMinute = 0;
      key.ordersThisMinute = 0;
      key.windowStart = now;
    }
    
    // Reset 10-second window
    if (now - key.tenSecWindowStart >= 10000) {
      key.ordersThisTenSeconds = 0;
      key.tenSecWindowStart = now;
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(keyId: string): void {
    const key = this.keys.get(keyId);
    if (!key) return;
    
    // Reset the circuit breaker by executing a successful no-op
    // The CircuitBreaker tracks success internally through execute()
    key.errorCount = Math.max(0, key.errorCount - 1); // Decrement error count on success
  }

  /**
   * Record failed request
   */
  recordError(keyId: string, error: Error, statusCode?: number): void {
    const key = this.keys.get(keyId);
    if (!key) return;
    
    key.errorCount++;
    key.lastError = Date.now();
    
    // Handle rate limit (429)
    if (statusCode === 429) {
      this.markUnhealthy(keyId, 'Rate limited (429)', 60000);
    }
    
    // Handle too many errors
    if (key.errorCount > 5 && key.isHealthy) {
      this.markUnhealthy(keyId, `Too many errors: ${error.message}`, 30000);
    }
  }

  /**
   * Mark key as unhealthy with cooldown
   */
  markUnhealthy(keyId: string, reason: string, cooldownMs?: number): void {
    const key = this.keys.get(keyId);
    if (!key) return;
    
    key.isHealthy = false;
    key.cooldownUntil = Date.now() + (cooldownMs || this.config.cooldownPeriod);
    
    logger.warn(`API key ${keyId} marked unhealthy: ${reason}`, {
      context: 'APIKeyManager',
      data: { 
        keyId, 
        reason,
        cooldownMs: cooldownMs || this.config.cooldownPeriod
      }
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      let recovered = 0;
      
      for (const [keyId, key] of this.keys) {
        // Recover keys that have passed their cooldown
        if (!key.isHealthy && key.cooldownUntil <= now) {
          key.isHealthy = true;
          key.errorCount = 0;
          key.circuitBreaker?.reset();
          recovered++;
        }
      }
      
      if (recovered > 0) {
        logger.info(`Recovered ${recovered} API keys from cooldown`, {
          context: 'APIKeyManager'
        });
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Start rate limit reset timers
   */
  private startRateLimitResets(): void {
    // Reset minute window
    setInterval(() => {
      for (const key of this.keys.values()) {
        key.weightUsedThisMinute = 0;
        key.ordersThisMinute = 0;
        key.windowStart = Date.now();
      }
    }, 60000);
    
    // Reset 10-second window
    setInterval(() => {
      for (const key of this.keys.values()) {
        key.ordersThisTenSeconds = 0;
        key.tenSecWindowStart = Date.now();
      }
    }, 10000);
  }

  /**
   * Get detailed statistics
   */
  getStats(): {
    totalKeys: number;
    healthyKeys: number;
    totalRequests: number;
    totalWeightUsed: number;
    avgWeightPerKey: number;
    capacityUsed: number;
    keyDetails: Array<{
      id: string;
      isHealthy: boolean;
      weightUsed: number;
      requests: number;
      errors: number;
    }>;
  } {
    this.initialize();
    
    const healthy = Array.from(this.keys.values()).filter(k => k.isHealthy).length;
    const totalWeightUsed = Array.from(this.keys.values())
      .reduce((sum, k) => sum + k.weightUsedThisMinute, 0);
    const maxCapacity = this.keys.size * ASTER_RATE_LIMITS.IP_WEIGHT_PER_MINUTE;
    
    return {
      totalKeys: this.keys.size,
      healthyKeys: healthy,
      totalRequests: this.totalRequests,
      totalWeightUsed,
      avgWeightPerKey: this.keys.size > 0 ? totalWeightUsed / this.keys.size : 0,
      capacityUsed: maxCapacity > 0 ? (totalWeightUsed / maxCapacity) * 100 : 0,
      keyDetails: Array.from(this.keys.values()).map(k => ({
        id: k.id,
        isHealthy: k.isHealthy,
        weightUsed: k.weightUsedThisMinute,
        requests: k.requestCount,
        errors: k.errorCount
      }))
    };
  }

  /**
   * Get current weight usage percentage
   */
  getWeightUsagePercent(): number {
    this.initialize();
    
    const totalWeight = Array.from(this.keys.values())
      .reduce((sum, k) => sum + k.weightUsedThisMinute, 0);
    const maxWeight = this.keys.size * ASTER_RATE_LIMITS.IP_WEIGHT_PER_MINUTE;
    
    return maxWeight > 0 ? (totalWeight / maxWeight) * 100 : 0;
  }

  /**
   * Check if we have capacity for a request
   */
  hasCapacity(weight: number = 1): boolean {
    this.initialize();
    
    for (const key of this.keys.values()) {
      if (key.isHealthy && 
          key.cooldownUntil <= Date.now() &&
          key.weightUsedThisMinute + weight <= ASTER_RATE_LIMITS.IP_WEIGHT_PER_MINUTE) {
        return true;
      }
    }
    return false;
  }

  /**
   * Wait for capacity to be available
   */
  async waitForCapacity(weight: number = 1, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      if (this.hasCapacity(weight)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  /**
   * Stop the manager (cleanup)
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('API Key Manager stopped', { context: 'APIKeyManager' });
  }
}

// ============================================================================
// SINGLETON EXPORT (using globalThis for proper Next.js handling)
// ============================================================================

const globalForKeyManager = globalThis as typeof globalThis & {
  __apiKeyManager?: UnifiedAPIKeyManager;
};

if (!globalForKeyManager.__apiKeyManager) {
  globalForKeyManager.__apiKeyManager = new UnifiedAPIKeyManager({
    strategy: (process.env.API_KEY_STRATEGY as KeySelectionStrategy) || 'least-weight',
    healthCheckInterval: parseInt(process.env.API_KEY_HEALTH_CHECK_INTERVAL || '60000'),
    cooldownPeriod: parseInt(process.env.API_KEY_COOLDOWN_PERIOD || '60000'),
  });
}

export const apiKeyManager = globalForKeyManager.__apiKeyManager;
export { UnifiedAPIKeyManager as APIKeyManager };
export default apiKeyManager;
