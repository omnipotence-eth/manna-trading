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

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Startup service already initialized', { context: 'Startup' });
      return;
    }

    logger.info('Initializing application services', { context: 'Startup' });

    try {
      // Initialize Real Balance Service
      logger.info('Starting Real Balance Service', { context: 'Startup' });
      await realBalanceService.start();

      // Initialize Position Monitor Service
      logger.info('Starting Position Monitor Service', { context: 'Startup' });
      await positionMonitorService.start();

      // Initialize 24/7 Agent Runner
      if (asterConfig.trading.enable24_7Agents) {
        logger.info('Starting 24/7 Agent Runner', { context: 'Startup' });
        await agentRunnerService.start();
      } else {
        logger.info('24/7 Agent Runner disabled in config', { context: 'Startup' });
      }

      this.initialized = true;
      logger.info('✅ Application services initialized successfully', { context: 'Startup' });

    } catch (error) {
      logger.error('Failed to initialize application services', error, { context: 'Startup' });
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
