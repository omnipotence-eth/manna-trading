/**
 * Application Startup Service
 * Initializes all services when the application starts
 */

import { logger } from '@/lib/logger';
import { agentRunnerService } from '@/services/agentRunnerService';
import { realBalanceService } from '@/services/realBalanceService';
import { positionMonitorService } from '@/services/positionMonitorService';
import { asterConfig } from '@/lib/configService';

class StartupService {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null; // CRITICAL FIX: Prevent race conditions

  async initialize(): Promise<void> {
    // CRITICAL FIX: Return existing promise if initialization is in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initialized) {
      logger.warn('Startup service already initialized', { context: 'Startup' });
      return;
    }

    // CRITICAL FIX: Store promise to prevent concurrent initialization
    this.initializationPromise = this._initialize();
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async _initialize(): Promise<void> {

    logger.info('🚀 Initializing application services', { context: 'Startup' });

    try {
      // Initialize Real Balance Service
      logger.info('Starting Real Balance Service', { context: 'Startup' });
      await realBalanceService.start();

      // Initialize Position Monitor Service
      logger.info('Starting Position Monitor Service', { context: 'Startup' });
      await positionMonitorService.start();

      // Initialize 24/7 Agent Runner
      if (asterConfig.trading.enable24_7Agents) {
        logger.info('Starting 24/7 Agent Runner (this may take 10-20 seconds)', { context: 'Startup' });
        
        // Start Agent Runner with timeout protection
        const startPromise = agentRunnerService.start();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Agent Runner startup timeout')), 30000)
        );
        
        try {
          await Promise.race([startPromise, timeoutPromise]);
          logger.info('✅ Agent Runner started successfully', { context: 'Startup' });
        } catch (error) {
          logger.error('Agent Runner startup failed or timed out', error as Error, { context: 'Startup' });
          // Continue anyway - runner may still work
        }
      } else {
        logger.info('24/7 Agent Runner disabled in config', { context: 'Startup' });
      }

      this.initialized = true;
      logger.info('✅ Application services initialized successfully', { context: 'Startup' });

    } catch (error) {
      logger.error('Failed to initialize application services', error, { context: 'Startup' });
      // Mark as initialized anyway to prevent retry loops
      this.initialized = true;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down application services', { context: 'Startup' });

    try {
      realBalanceService.stop();
      positionMonitorService.stop();
      await agentRunnerService.stop();
      this.initialized = false;
      logger.info('Application services shut down successfully', { context: 'Startup' });
    } catch (error) {
      logger.error('Error during shutdown', error, { context: 'Startup' });
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const startupService = new StartupService();
export default startupService;
