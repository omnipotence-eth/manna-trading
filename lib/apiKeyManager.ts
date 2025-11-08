/**
 * Multi-API-Key Manager
 * Manages rotation, health checking, and load balancing across multiple Aster API keys
 * 
 * With 30 keys: 20 req/sec/key × 30 = 600 req/sec total capacity!
 */

import { logger } from './logger';
import { CircuitBreaker } from './circuitBreaker';

export interface AsterAPIKey {
  id: string;
  apiKey: string;
  secretKey: string;
  requestCount: number;
  errorCount: number;
  lastUsed: number;
  lastError: number;
  isHealthy: boolean;
  rateLimit: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    currentRPS: number;
    currentRPM: number;
    lastReset: number;
  };
  circuitBreaker?: CircuitBreaker;
}

export type KeySelectionStrategy = 'round-robin' | 'least-used' | 'random' | 'health-based';

interface APIKeyManagerConfig {
  strategy: KeySelectionStrategy;
  healthCheckInterval: number;
  cooldownPeriod: number;
  rateLimitPerKeyRPS: number;
  rateLimitPerKeyRPM: number;
}

export class APIKeyManager {
  private keys: Map<string, AsterAPIKey> = new Map();
  private currentIndex = 0;
  private config: APIKeyManagerConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<APIKeyManagerConfig>) {
    this.config = {
      strategy: config?.strategy || 'least-used',
      healthCheckInterval: config?.healthCheckInterval || 60000, // 1 minute
      cooldownPeriod: config?.cooldownPeriod || 300000, // 5 minutes
      rateLimitPerKeyRPS: config?.rateLimitPerKeyRPS || 20,
      rateLimitPerKeyRPM: config?.rateLimitPerKeyRPM || 1200
    };
    
    this.loadKeysFromEnvironment();
    this.startHealthChecks();
    
    logger.info('API Key Manager initialized', {
      context: 'APIKeyManager',
      data: {
        totalKeys: this.keys.size,
        strategy: this.config.strategy,
        totalCapacity: `${this.keys.size * this.config.rateLimitPerKeyRPS} req/sec`
      }
    });
  }

  /**
   * Load API keys from environment variables
   */
  private loadKeysFromEnvironment(): void {
    try {
      // Try loading key pool from JSON format first
      const keyPoolJson = process.env.ASTER_KEY_POOL;
      if (keyPoolJson) {
        const keyPool = JSON.parse(keyPoolJson);
        keyPool.keys.forEach((key: any, index: number) => {
          this.addKey({
            id: key.id || `key-${index + 1}`,
            apiKey: key.api,
            secretKey: key.secret,
            requestCount: 0,
            errorCount: 0,
            lastUsed: 0,
            lastError: 0,
            isHealthy: true,
            rateLimit: {
              requestsPerSecond: this.config.rateLimitPerKeyRPS,
              requestsPerMinute: this.config.rateLimitPerKeyRPM,
              currentRPS: 0,
              currentRPM: 0,
              lastReset: Date.now()
            }
          });
        });
        
        logger.info('Loaded API keys from ASTER_KEY_POOL', {
          context: 'APIKeyManager',
          data: { keyCount: keyPool.keys.length }
        });
        return;
      }

      // Fallback: Load from comma-separated format
      const apiKeys = process.env.ASTER_API_KEYS?.split(',') || [];
      const secretKeys = process.env.ASTER_SECRET_KEYS?.split(',') || [];

      if (apiKeys.length > 0 && apiKeys.length === secretKeys.length) {
        apiKeys.forEach((apiKey, index) => {
          this.addKey({
            id: `key-${index + 1}`,
            apiKey: apiKey.trim(),
            secretKey: secretKeys[index].trim(),
            requestCount: 0,
            errorCount: 0,
            lastUsed: 0,
            lastError: 0,
            isHealthy: true,
            rateLimit: {
              requestsPerSecond: this.config.rateLimitPerKeyRPS,
              requestsPerMinute: this.config.rateLimitPerKeyRPM,
              currentRPS: 0,
              currentRPM: 0,
              lastReset: Date.now()
            }
          });
        });
        
        logger.info('Loaded API keys from comma-separated format', {
          context: 'APIKeyManager',
          data: { keyCount: apiKeys.length }
        });
        return;
      }

      // Final fallback: Single key from ASTER_API_KEY
      const singleApiKey = process.env.ASTER_API_KEY;
      const singleSecretKey = process.env.ASTER_SECRET_KEY;

      if (singleApiKey && singleSecretKey) {
        this.addKey({
          id: 'key-primary',
          apiKey: singleApiKey,
          secretKey: singleSecretKey,
          requestCount: 0,
          errorCount: 0,
          lastUsed: 0,
          lastError: 0,
          isHealthy: true,
          rateLimit: {
            requestsPerSecond: this.config.rateLimitPerKeyRPS,
            requestsPerMinute: this.config.rateLimitPerKeyRPM,
            currentRPS: 0,
            currentRPM: 0,
            lastReset: Date.now()
          }
        });
        
        logger.warn('Using single API key (not multi-key setup)', {
          context: 'APIKeyManager'
        });
      } else {
        logger.error('No API keys found in environment', undefined, {
          context: 'APIKeyManager'
        });
      }
    } catch (error) {
      logger.error('Failed to load API keys', error as Error, {
        context: 'APIKeyManager'
      });
    }
  }

  /**
   * Add a new API key to the pool
   */
  private addKey(key: AsterAPIKey): void {
    // Create circuit breaker for this key
    key.circuitBreaker = new CircuitBreaker({
      name: `AsterAPI-${key.id}`,
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000,
      monitoringPeriod: 300000
    });
    
    this.keys.set(key.id, key);
  }

  /**
   * Get next key based on configured strategy
   */
  getNextKey(): AsterAPIKey | null {
    const healthyKeys = this.getHealthyKeys();
    
    if (healthyKeys.length === 0) {
      logger.error('No healthy API keys available', undefined, {
        context: 'APIKeyManager',
        data: {
          totalKeys: this.keys.size,
          healthyKeys: 0
        }
      });
      return null;
    }

    switch (this.config.strategy) {
      case 'round-robin':
        return this.getRoundRobinKey(healthyKeys);
      case 'least-used':
        return this.getLeastUsedKey(healthyKeys);
      case 'random':
        return this.getRandomKey(healthyKeys);
      case 'health-based':
        return this.getHealthBasedKey(healthyKeys);
      default:
        return this.getLeastUsedKey(healthyKeys);
    }
  }

  /**
   * Get key by specific ID
   */
  getKeyById(id: string): AsterAPIKey | null {
    return this.keys.get(id) || null;
  }

  /**
   * Get all healthy keys
   */
  private getHealthyKeys(): AsterAPIKey[] {
    return Array.from(this.keys.values()).filter(key => 
      key.isHealthy && 
      key.circuitBreaker?.isHealthy()
    );
  }

  /**
   * Round-robin key selection
   */
  private getRoundRobinKey(healthyKeys: AsterAPIKey[]): AsterAPIKey {
    this.currentIndex = (this.currentIndex + 1) % healthyKeys.length;
    return healthyKeys[this.currentIndex];
  }

  /**
   * Least-used key selection (best for load balancing)
   */
  private getLeastUsedKey(healthyKeys: AsterAPIKey[]): AsterAPIKey {
    return healthyKeys.reduce((least, current) => 
      current.requestCount < least.requestCount ? current : least
    );
  }

  /**
   * Random key selection
   */
  private getRandomKey(healthyKeys: AsterAPIKey[]): AsterAPIKey {
    const randomIndex = Math.floor(Math.random() * healthyKeys.length);
    return healthyKeys[randomIndex];
  }

  /**
   * Health-based key selection (prioritize keys with fewer errors)
   */
  private getHealthBasedKey(healthyKeys: AsterAPIKey[]): AsterAPIKey {
    return healthyKeys.reduce((best, current) => 
      current.errorCount < best.errorCount ? current : best
    );
  }

  /**
   * Record successful request for a key
   */
  recordSuccess(keyId: string): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.requestCount++;
    key.lastUsed = Date.now();
    this.updateRateLimit(key);
  }

  /**
   * Record failed request for a key
   */
  recordError(keyId: string, error: Error): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.errorCount++;
    key.lastError = Date.now();
    this.updateRateLimit(key);

    // Mark as unhealthy if too many recent errors
    if (key.errorCount > 5) {
      this.markUnhealthy(keyId, `Too many errors: ${error.message}`);
    }
  }

  /**
   * Mark a key as unhealthy (rate limited or erroring)
   */
  markUnhealthy(keyId: string, reason: string): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.isHealthy = false;
    
    logger.warn('API key marked as unhealthy', {
      context: 'APIKeyManager',
      data: {
        keyId,
        reason,
        errorCount: key.errorCount,
        cooldownPeriod: `${this.config.cooldownPeriod / 1000}s`
      }
    });

    // Schedule recovery after cooldown period
    setTimeout(() => {
      this.resetKey(keyId);
    }, this.config.cooldownPeriod);
  }

  /**
   * Reset key to healthy state
   */
  resetKey(keyId: string): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.isHealthy = true;
    key.errorCount = 0;
    key.circuitBreaker?.reset();
    
    logger.info('API key reset to healthy state', {
      context: 'APIKeyManager',
      data: { keyId }
    });
  }

  /**
   * Update rate limit tracking
   */
  private updateRateLimit(key: AsterAPIKey): void {
    const now = Date.now();
    const timeSinceReset = now - key.rateLimit.lastReset;

    // Reset counters every second
    if (timeSinceReset >= 1000) {
      key.rateLimit.currentRPS = 0;
      key.rateLimit.lastReset = now;
    }

    // Reset per-minute counter every minute
    if (timeSinceReset >= 60000) {
      key.rateLimit.currentRPM = 0;
    }

    key.rateLimit.currentRPS++;
    key.rateLimit.currentRPM++;

    // Warn if approaching rate limit (only if actually close, not just at threshold)
    // CRITICAL FIX: Increase threshold to 95% to reduce false positives
    // A single request shouldn't trigger warning if maxRPS is 1
    if (key.rateLimit.currentRPS >= key.rateLimit.requestsPerSecond * 0.95 && 
        key.rateLimit.requestsPerSecond > 1) {
      logger.warn('API key approaching rate limit', {
        context: 'APIKeyManager',
        data: {
          keyId: key.id,
          currentRPS: key.rateLimit.currentRPS,
          maxRPS: key.rateLimit.requestsPerSecond,
          utilization: `${Math.round((key.rateLimit.currentRPS / key.rateLimit.requestsPerSecond) * 100)}%`
        }
      });
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health check on all keys
   */
  private performHealthCheck(): void {
    const now = Date.now();
    const stats = {
      total: this.keys.size,
      healthy: 0,
      unhealthy: 0,
      recovering: 0
    };

    for (const [keyId, key] of this.keys) {
      if (key.isHealthy) {
        stats.healthy++;
      } else {
        stats.unhealthy++;
        
        // Check if cooldown period has passed
        if (now - key.lastError > this.config.cooldownPeriod) {
          stats.recovering++;
          this.resetKey(keyId);
        }
      }
    }

    logger.debug('API key health check', {
      context: 'APIKeyManager',
      data: stats
    });

    // Alert if too many unhealthy keys
    if (stats.unhealthy > stats.total * 0.5) {
      logger.error('More than 50% of API keys are unhealthy', undefined, {
        context: 'APIKeyManager',
        data: stats
      });
    }
  }

  /**
   * Get key statistics
   */
  getStats(): {
    totalKeys: number;
    healthyKeys: number;
    unhealthyKeys: number;
    totalRequests: number;
    totalErrors: number;
    totalCapacityRPS: number;
    availableCapacityRPS: number;
    keyDetails: Array<{
      id: string;
      isHealthy: boolean;
      requests: number;
      errors: number;
      currentRPS: number;
    }>;
  } {
    const healthyKeys = this.getHealthyKeys();
    
    return {
      totalKeys: this.keys.size,
      healthyKeys: healthyKeys.length,
      unhealthyKeys: this.keys.size - healthyKeys.length,
      totalRequests: Array.from(this.keys.values()).reduce((sum, key) => sum + key.requestCount, 0),
      totalErrors: Array.from(this.keys.values()).reduce((sum, key) => sum + key.errorCount, 0),
      totalCapacityRPS: this.keys.size * this.config.rateLimitPerKeyRPS,
      availableCapacityRPS: healthyKeys.length * this.config.rateLimitPerKeyRPS,
      keyDetails: Array.from(this.keys.values()).map(key => ({
        id: key.id,
        isHealthy: key.isHealthy,
        requests: key.requestCount,
        errors: key.errorCount,
        currentRPS: key.rateLimit.currentRPS
      }))
    };
  }

  /**
   * Stop health checks (cleanup)
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('API Key Manager stopped', {
      context: 'APIKeyManager'
    });
  }
}

// Export singleton instance
const apiKeyManager = new APIKeyManager({
  strategy: (process.env.API_KEY_STRATEGY as KeySelectionStrategy) || 'least-used',
  healthCheckInterval: parseInt(process.env.API_KEY_HEALTH_CHECK_INTERVAL || '60000'),
  cooldownPeriod: parseInt(process.env.API_KEY_COOLDOWN_PERIOD || '300000'),
  rateLimitPerKeyRPS: parseInt(process.env.RATE_LIMIT_PER_KEY_RPS || '20'),
  rateLimitPerKeyRPM: parseInt(process.env.RATE_LIMIT_PER_KEY_RPM || '1200')
});

export default apiKeyManager;

