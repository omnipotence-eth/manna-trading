/**
 * Health Monitor Service
 * Monitors system health and auto-restarts services if they crash
 */

import { logger } from '@/lib/logger';
import { agentRunnerService } from '@/services/ai/agentRunnerService';
import { realBalanceService } from '@/services/trading/realBalanceService';
import { positionMonitorService } from '@/services/trading/positionMonitorService';

export class HealthMonitorService {
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private checkIntervalMs = 30000; // Check every 30 seconds
  private lastHealthCheck = Date.now();
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;

  constructor() {
    logger.info('Health Monitor Service initialized', {
      context: 'HealthMonitor',
      checkInterval: `${this.checkIntervalMs / 1000}s`
    });
  }

  /**
   * Start monitoring system health
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Health Monitor already running', { context: 'HealthMonitor' });
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting Health Monitor', { context: 'HealthMonitor' });

    // Run first check immediately
    this.performHealthCheck();

    // Schedule regular checks
    this.monitorInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Health Monitor stopped', { context: 'HealthMonitor' });
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      this.lastHealthCheck = Date.now();

      // Check 1: Agent Runner (CRITICAL - Required for 24/7 trading)
      const agentRunnerStatus = agentRunnerService.getStatus();
      const { asterConfig } = await import('@/lib/configService');
      
      // Only check if 24/7 agents are enabled
      if (asterConfig.trading.enable24_7Agents) {
        if (!agentRunnerStatus.isRunning) {
          logger.warn('[WARN] Agent Runner is NOT running - attempting immediate restart (required for 24/7 trading)', {
            context: 'HealthMonitor',
            service: 'AgentRunner',
            impact: 'System cannot trade automatically without Agent Runner'
          });

          try {
            await agentRunnerService.start();
            const verifyStatus = agentRunnerService.getStatus();
            if (verifyStatus.isRunning) {
              logger.info('[OK] Agent Runner restarted successfully and verified running', {
                context: 'HealthMonitor',
                data: {
                  isRunning: true,
                  activeWorkflows: verifyStatus.activeWorkflowCount,
                  symbols: verifyStatus.config.symbols.length
                }
              });
              this.consecutiveFailures = 0;
            } else {
              throw new Error('Agent Runner start() completed but isRunning=false');
            }
          } catch (error) {
            logger.error('[ERROR] Failed to restart Agent Runner (CRITICAL - 24/7 trading disabled)', error as Error, {
              context: 'HealthMonitor',
              consecutiveFailures: this.consecutiveFailures + 1,
              maxFailures: this.maxConsecutiveFailures,
              recommendation: 'Check server logs and ensure Ollama/DeepSeek is running'
            });
            this.consecutiveFailures++;
          }
        } else {
          // Agent Runner is healthy - reset failure counter
          if (this.consecutiveFailures > 0) {
            logger.info('[OK] Agent Runner recovered - resetting failure counter', {
              context: 'HealthMonitor',
              previousFailures: this.consecutiveFailures
            });
          }
          this.consecutiveFailures = 0;
        }
      }

      // Check 2: Real Balance Service
      // Note: RealBalanceService doesn't expose isRunning, so we check if it has recent data
      // This is a lighter check - if balance is updating, service is working
      const balanceConfig = realBalanceService.getBalanceConfig();
      if (!balanceConfig || balanceConfig.totalBalance === 0) {
        logger.debug('[WARN] Real Balance Service has no balance data yet (may still be initializing)', {
          context: 'HealthMonitor',
          service: 'RealBalanceService'
        });
      }

      // Check 3: DeepSeek Connection
      try {
        const { deepseekService } = await import('@/services/ai/deepseekService');
        // CRITICAL FIX: Use sufficient tokens (20) to ensure model generates actual content
        await deepseekService.chat('Say ping in one word.', undefined, { max_tokens: 20 });
      } catch (error) {
        logger.warn('[WARN] DeepSeek connection check failed', {
          context: 'HealthMonitor',
          error: error instanceof Error ? error.message : String(error),
          note: 'Workflows may fail until Ollama is available'
        });
      }

      // Log health check summary
      logger.debug('Health check completed', {
        context: 'HealthMonitor',
        agentRunner: agentRunnerStatus.isRunning ? 'healthy' : 'unhealthy',
        activeWorkflows: agentRunnerStatus.activeWorkflowCount,
        consecutiveFailures: this.consecutiveFailures
      });

      // Check if we've hit max consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        logger.error('🚨 CRITICAL: Max consecutive failures reached!', {
          context: 'HealthMonitor',
          consecutiveFailures: this.consecutiveFailures,
          maxAllowed: this.maxConsecutiveFailures,
          recommendation: 'Manual intervention may be required - check Ollama, Aster DEX API, and server logs'
        });
      }

    } catch (error) {
      logger.error('Health check failed', error as Error, {
        context: 'HealthMonitor'
      });
    }
  }

  /**
   * Get health monitor status
   */
  getStatus(): {
    isMonitoring: boolean;
    lastCheck: number;
    consecutiveFailures: number;
    maxConsecutiveFailures: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.maxConsecutiveFailures
    };
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForHealthMonitor = globalThis as typeof globalThis & {
  __healthMonitorService?: HealthMonitorService;
};

if (!globalForHealthMonitor.__healthMonitorService) {
  globalForHealthMonitor.__healthMonitorService = new HealthMonitorService();
}

export const healthMonitorService = globalForHealthMonitor.__healthMonitorService;


