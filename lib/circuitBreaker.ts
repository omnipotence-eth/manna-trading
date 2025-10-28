/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascade failures and provides graceful degradation
 */

import { logger } from './logger';
import { AppError, ErrorType } from './errorHandler';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;        // Number of failures before opening
  successThreshold: number;       // Number of successes to close from half-open
  timeout: number;                // Time to wait before trying half-open
  monitoringPeriod: number;       // Time window for failure counting
  name: string;                   // Circuit breaker name for logging
}

/**
 * Circuit breaker statistics
 */
interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  failureRate: number;
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 60000, // 1 minute
      monitoringPeriod: config.monitoringPeriod || 300000, // 5 minutes
      name: config.name || 'CircuitBreaker'
    };

    logger.info(`Circuit breaker initialized: ${this.config.name}`, {
      context: 'CircuitBreaker',
      data: {
        name: this.config.name,
        failureThreshold: this.config.failureThreshold,
        successThreshold: this.config.successThreshold,
        timeout: this.config.timeout
      }
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open and should remain open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.timeout) {
        logger.warn(`Circuit breaker ${this.config.name} is OPEN, rejecting request`, {
          context: 'CircuitBreaker',
          data: {
            name: this.config.name,
            state: this.state,
            timeSinceLastFailure: Date.now() - this.lastFailureTime,
            timeout: this.config.timeout
          }
        });
        
        throw new AppError(
          `Circuit breaker ${this.config.name} is OPEN`,
          ErrorType.EXTERNAL_API,
          503,
          'CircuitBreaker',
          {
            circuitName: this.config.name,
            state: this.state,
            failures: this.failures
          }
        );
      } else {
        // Timeout expired, transition to half-open
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        
        logger.info(`Circuit breaker ${this.config.name} transitioning to HALF_OPEN`, {
          context: 'CircuitBreaker',
          data: {
            name: this.config.name,
            state: this.state,
            timeSinceLastFailure: Date.now() - this.lastFailureTime
          }
        });
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    // If in half-open state and we have enough successes, close the circuit
    if (this.state === CircuitState.HALF_OPEN && this.successes >= this.config.successThreshold) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      
      logger.info(`Circuit breaker ${this.config.name} closed after successful recovery`, {
        context: 'CircuitBreaker',
        data: {
          name: this.config.name,
          state: this.state,
          successes: this.successes,
          successThreshold: this.config.successThreshold
        }
      });
    }

    // Reset failure count on success (for closed state)
    if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    // If we've exceeded the failure threshold, open the circuit
    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      
      logger.error(`Circuit breaker ${this.config.name} opened due to failures`, error, {
        context: 'CircuitBreaker',
        data: {
          name: this.config.name,
          state: this.state,
          failures: this.failures,
          failureThreshold: this.config.failureThreshold,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    // If in half-open state and we fail, go back to open
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      
      logger.warn(`Circuit breaker ${this.config.name} reopened from half-open due to failure`, {
        context: 'CircuitBreaker',
        data: {
          name: this.config.name,
          state: this.state,
          failures: this.failures,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const failureRate = this.totalRequests > 0 ? this.totalFailures / this.totalRequests : 0;
    
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      failureRate
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    
    logger.info(`Circuit breaker ${this.config.name} reset to CLOSED`, {
      context: 'CircuitBreaker',
      data: {
        name: this.config.name,
        state: this.state
      }
    });
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED || 
           (this.state === CircuitState.HALF_OPEN && this.successes > 0);
  }

  /**
   * Get circuit breaker name
   */
  getName(): string {
    return this.config.name;
  }
}

/**
 * Global circuit breaker instances for different services
 */
export const circuitBreakers = {
  // Aster DEX API circuit breaker
  asterApi: new CircuitBreaker({
    name: 'AsterAPI',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, // 1 minute
    monitoringPeriod: 300000 // 5 minutes
  }),
  
  // Database circuit breaker (more lenient for development)
  database: new CircuitBreaker({
    name: 'Database',
    failureThreshold: 10, // Increased threshold for development
    successThreshold: 2,
    timeout: 15000, // Reduced timeout for faster recovery
    monitoringPeriod: 60000 // 1 minute
  }),
  
  // External API circuit breaker
  externalApi: new CircuitBreaker({
    name: 'ExternalAPI',
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 120000, // 2 minutes
    monitoringPeriod: 600000 // 10 minutes
  })
};

/**
 * Circuit breaker middleware for API routes
 */
export function withCircuitBreaker<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  circuitBreaker: CircuitBreaker
) {
  return async (...args: T): Promise<R> => {
    return circuitBreaker.execute(() => handler(...args));
  };
}

/**
 * Get all circuit breaker statistics for monitoring
 */
export function getCircuitBreakerStats() {
  return {
    asterApi: circuitBreakers.asterApi.getStats(),
    database: circuitBreakers.database.getStats(),
    externalApi: circuitBreakers.externalApi.getStats()
  };
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  Object.values(circuitBreakers).forEach(cb => cb.reset());
  
  logger.info('All circuit breakers reset', {
    context: 'CircuitBreaker',
    data: {
      resetCount: Object.keys(circuitBreakers).length
    }
  });
}

/**
 * Health check for all circuit breakers
 */
export function getCircuitBreakerHealth() {
  const health = {
    overall: true,
    circuits: {} as Record<string, boolean>
  };

  for (const [name, cb] of Object.entries(circuitBreakers)) {
    const isHealthy = cb.isHealthy();
    health.circuits[name] = isHealthy;
    if (!isHealthy) {
      health.overall = false;
    }
  }

  return health;
}
