/**
 * Critical Service Monitor
 * NUCLEAR OPTION: Crashes the entire server if Agent Runner stops
 * This ensures IMMEDIATE visibility and forces operator intervention
 */

import { logger } from '@/lib/logger';
import { agentRunnerService } from '@/services/ai/agentRunnerService';

export class CriticalServiceMonitor {
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private checkIntervalMs = 10000; // Check every 10 seconds (aggressive)
  private gracePeriodMs = 30000; // 30 second grace period before crashing
  private agentRunnerDownSince: number | null = null;
  private failureMode: 'log' | 'crash' = 'crash'; // 'log' for development, 'crash' for production

  constructor(failureMode: 'log' | 'crash' = 'crash') {
    this.failureMode = failureMode;
    logger.info('Critical Service Monitor initialized', {
      context: 'CriticalMonitor',
      failureMode: this.failureMode,
      checkInterval: `${this.checkIntervalMs / 1000}s`,
      gracePeriod: `${this.gracePeriodMs / 1000}s`,
      note: 'Will crash server if Agent Runner stops for more than grace period'
    });
  }

  /**
   * Start critical monitoring
   * WARNING: This will crash the server if Agent Runner stops!
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Critical Service Monitor already running', { context: 'CriticalMonitor' });
      return;
    }

    this.isMonitoring = true;
    this.agentRunnerDownSince = null;

    logger.info('🚨 CRITICAL MONITORING STARTED - Server will crash if Agent Runner stops!', {
      context: 'CriticalMonitor',
      failureMode: this.failureMode,
      gracePeriod: `${this.gracePeriodMs / 1000}s`
    });

    // Check immediately
    this.checkCriticalServices();

    // Schedule regular checks
    this.monitorInterval = setInterval(() => {
      this.checkCriticalServices();
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
    this.agentRunnerDownSince = null;
    logger.info('Critical Service Monitor stopped', { context: 'CriticalMonitor' });
  }

  /**
   * Check if critical services are running
   * If not, crash the server after grace period
   */
  private checkCriticalServices(): void {
    try {
      const { asterConfig } = require('@/lib/configService');
      
      // Only monitor if 24/7 agents are enabled
      if (!asterConfig.trading.enable24_7Agents) {
        return;
      }

      const agentRunnerStatus = agentRunnerService.getStatus();
      const isRunning = agentRunnerStatus.isRunning;
      const now = Date.now();

      if (!isRunning) {
        // Agent Runner is DOWN
        if (this.agentRunnerDownSince === null) {
          // First detection of downtime
          this.agentRunnerDownSince = now;
          logger.error('🚨 CRITICAL: Agent Runner STOPPED! Grace period started.', {
            context: 'CriticalMonitor',
            downSince: new Date(now).toISOString(),
            gracePeriodRemaining: `${this.gracePeriodMs / 1000}s`,
            action: 'Server will crash if not recovered',
            activeWorkflows: agentRunnerStatus.activeWorkflowCount
          });

          // Attempt automatic recovery
          this.attemptRecovery();
        } else {
          // Agent Runner has been down for some time
          const downDuration = now - this.agentRunnerDownSince;
          const remainingGrace = this.gracePeriodMs - downDuration;

          if (downDuration >= this.gracePeriodMs) {
            // Grace period expired - CRASH THE SERVER
            const errorMessage = `CRITICAL FAILURE: Agent Runner has been stopped for ${(downDuration / 1000).toFixed(0)}s (grace period: ${this.gracePeriodMs / 1000}s). Trading system is non-functional.`;
            
            logger.error('[CRITICAL] CRITICAL FAILURE: CRASHING SERVER', {
              context: 'CriticalMonitor',
              reason: 'Agent Runner stopped beyond grace period',
              downSince: new Date(this.agentRunnerDownSince).toISOString(),
              downDuration: `${(downDuration / 1000).toFixed(0)}s`,
              gracePeriod: `${this.gracePeriodMs / 1000}s`,
              action: 'Server crash initiated',
              note: 'Fix Agent Runner and restart server'
            });

            if (this.failureMode === 'crash') {
              // NUCLEAR OPTION: Crash the entire server
              // This forces immediate operator attention
              process.exit(1);
            } else {
              logger.error('[CRITICAL] WOULD CRASH SERVER (but in log-only mode)', {
                context: 'CriticalMonitor',
                failureMode: this.failureMode
              });
            }
          } else {
            // Still within grace period
            logger.warn(`[WARN] Agent Runner still down (${(downDuration / 1000).toFixed(0)}s) - ${(remainingGrace / 1000).toFixed(0)}s until server crash`, {
              context: 'CriticalMonitor',
              downDuration: `${(downDuration / 1000).toFixed(0)}s`,
              gracePeriodRemaining: `${(remainingGrace / 1000).toFixed(0)}s`,
              action: 'Attempting recovery'
            });

            // Attempt recovery again
            this.attemptRecovery();
          }
        }
      } else {
        // Agent Runner is UP
        if (this.agentRunnerDownSince !== null) {
          // Recovery detected
          const downDuration = now - this.agentRunnerDownSince;
          logger.info('[RECOVERY] Agent Runner is running again!', {
            context: 'CriticalMonitor',
            wasStopped: true,
            downDuration: `${(downDuration / 1000).toFixed(0)}s`,
            status: 'healthy',
            activeWorkflows: agentRunnerStatus.activeWorkflowCount
          });
          this.agentRunnerDownSince = null;
        }
      }
    } catch (error) {
      logger.error('Critical service check failed', error as Error, {
        context: 'CriticalMonitor',
        note: 'Monitor itself may be unhealthy'
      });
    }
  }

  /**
   * Attempt to recover Agent Runner
   */
  private async attemptRecovery(): Promise<void> {
    try {
      logger.info('[RECOVERY] Attempting Agent Runner recovery...', {
        context: 'CriticalMonitor'
      });

      await agentRunnerService.start();

      // Verify it actually started
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = agentRunnerService.getStatus();

      if (status.isRunning) {
        logger.info('[OK] Agent Runner recovered successfully!', {
          context: 'CriticalMonitor',
          isRunning: true,
          symbols: status.config.symbols.length,
          activeWorkflows: status.activeWorkflowCount
        });
        this.agentRunnerDownSince = null;
      } else {
        logger.error('[ERROR] Agent Runner recovery failed - still not running', {
          context: 'CriticalMonitor',
          isRunning: false
        });
      }
    } catch (error) {
      logger.error('[ERROR] Agent Runner recovery attempt failed', error as Error, {
        context: 'CriticalMonitor'
      });
    }
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    isMonitoring: boolean;
    failureMode: 'log' | 'crash';
    agentRunnerStatus: 'up' | 'down';
    downSince: number | null;
    gracePeriodMs: number;
  } {
    const agentRunnerStatus = agentRunnerService.getStatus();
    return {
      isMonitoring: this.isMonitoring,
      failureMode: this.failureMode,
      agentRunnerStatus: agentRunnerStatus.isRunning ? 'up' : 'down',
      downSince: this.agentRunnerDownSince,
      gracePeriodMs: this.gracePeriodMs
    };
  }

  /**
   * Change failure mode dynamically
   */
  setFailureMode(mode: 'log' | 'crash'): void {
    logger.info(`Critical Monitor failure mode changed: ${this.failureMode} -> ${mode}`, {
      context: 'CriticalMonitor',
      oldMode: this.failureMode,
      newMode: mode
    });
    this.failureMode = mode;
  }
}

// Export singleton instance
// Default to 'crash' mode for production, can be changed to 'log' for development
const isDevelopment = process.env.NODE_ENV === 'development';
export const criticalServiceMonitor = new CriticalServiceMonitor(isDevelopment ? 'log' : 'crash');


