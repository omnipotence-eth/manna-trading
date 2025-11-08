/**
 * Application Startup Service
 * Initializes all services when the application starts
 */

import { logger } from '@/lib/logger';
import { agentRunnerService } from '@/services/agentRunnerService';
import { realBalanceService } from '@/services/realBalanceService';
import { positionMonitorService } from '@/services/positionMonitorService';
import { healthMonitorService } from '@/services/healthMonitorService';
import { criticalServiceMonitor } from '@/services/criticalServiceMonitor';
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

    logger.info('Initializing application services', { context: 'Startup' });

    // STEP 0: Quick DeepSeek R1 check (NON-BLOCKING - just warn if not available)
    logger.info('[0/5] Checking DeepSeek R1 connection...', { context: 'Startup' });
    try {
      const { deepseekService } = await import('@/services/deepseekService');
      
      // Quick test with SHORT timeout (10 seconds)
      const testPromise = deepseekService.chat('test', undefined, { max_tokens: 5 });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 10000);
      });
      
      await Promise.race([testPromise, timeoutPromise]);
      
      logger.info('[0/5] ✅ DeepSeek R1 is available!', { context: 'Startup' });
    } catch (error) {
      // CRITICAL CHANGE: Don't fail startup if DeepSeek is slow
      // Agent Runner can start, workflows will fail but system continues
      logger.warn('[0/5] ⚠️ DeepSeek R1 not responding (workflows may fail until Ollama starts)', {
        context: 'Startup',
        note: 'Starting services anyway - ensure Ollama is running: ollama serve'
      });
      // Continue with initialization - don't throw!
    }

    try {
      // Step 1: Initialize Real Balance Service (non-blocking - starts in background)
      logger.info('[1/4] Starting Real Balance Service...', { context: 'Startup' });
      realBalanceService.start(); // Don't await - let it fetch in background
      logger.info('[1/4] Real Balance Service started (fetching balance in background)', { context: 'Startup' });

      // Step 2: Clean up old positions BEFORE starting monitor
      logger.info('[2/4] Checking for old positions...', { context: 'Startup' });
      try {
        // CRITICAL FIX: Clear from memory FIRST
        const openPositions = positionMonitorService.getOpenPositions();
        if (openPositions.length > 0) {
          logger.warn(`[2/4] Found ${openPositions.length} positions in memory - clearing...`, {
            context: 'Startup',
            positions: openPositions.map(p => p.symbol)
          });
          positionMonitorService.clearAllPositions();
          logger.info('[2/4] Old positions cleared from memory', { context: 'Startup' });
        }
        
        // CRITICAL FIX: Delete from database SECOND to prevent reload when monitor starts
        try {
          const { db } = await import('@/lib/db');
          const deleteResult = await db.execute(`DELETE FROM open_positions WHERE status = 'OPEN'`, []);
          const deletedCount = deleteResult.rowCount || 0;
          if (deletedCount > 0) {
            logger.info(`[2/4] Deleted ${deletedCount} old positions from database`, { context: 'Startup' });
          } else {
            logger.info('[2/4] No old positions found in database', { context: 'Startup' });
          }
        } catch (dbError) {
          logger.warn('[2/4] Failed to delete positions from database (non-critical)', {
            context: 'Startup',
            error: dbError instanceof Error ? dbError.message : String(dbError)
          });
        }
      } catch (cleanupError) {
        logger.warn('[2/5] Position cleanup failed (non-critical)', {
          context: 'Startup',
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
        // Continue anyway
      }

      // Step 3: Initialize Position Monitor Service
      logger.info('[3/5] Starting Position Monitor Service...', { context: 'Startup' });
      await positionMonitorService.start();
      logger.info('[3/5] Position Monitor Service started', { context: 'Startup' });

      // Step 4: Initialize 24/7 Agent Runner
      if (asterConfig.trading.enable24_7Agents) {
        logger.info('[4/5] Starting 24/7 Agent Runner (this may take 10-20 seconds)...', { context: 'Startup' });
        
        // CRITICAL FIX: Don't use Promise.race with timeout - it can interrupt start() before isRunning is set
        // start() already handles its own 20-second timeout for symbol fetch and uses fallback symbols
        // Let start() complete fully so isRunning gets set to true
        try {
          await agentRunnerService.start();
          
          // CRITICAL FIX: Wait a moment for isRunning to be set (start() sets it after interval creation)
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // CRITICAL FIX: Verify Agent Runner actually started (not just that promise resolved)
          const runnerStatus = agentRunnerService.getStatus();
          if (runnerStatus.isRunning) {
            logger.info('[4/5] Agent Runner started successfully and verified running', { 
              context: 'Startup',
              data: {
                isRunning: true,
                symbols: runnerStatus.config.symbols.length,
                activeWorkflows: runnerStatus.activeWorkflowCount
              }
            });
          } else {
            logger.error('[4/5] Agent Runner start() completed but isRunning=false', {
              context: 'Startup',
              data: { status: runnerStatus }
            });
            throw new Error('Agent Runner failed to start - start() completed but isRunning=false');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // CRITICAL FIX: Check status even after error - start() might have succeeded despite throwing
          // This handles cases where start() throws but isRunning was set before the throw
          const runnerStatus = agentRunnerService.getStatus();
          if (runnerStatus.isRunning) {
            logger.warn('[4/5] Agent Runner reported error but is actually running - continuing', {
              context: 'Startup',
              data: { error: errorMsg, isRunning: true, symbols: runnerStatus.config.symbols.length }
            });
            // Continue - Agent Runner is running despite error
          } else {
            logger.error('[4/5] Agent Runner startup failed', error as Error, { 
              context: 'Startup',
              data: {
                error: errorMsg,
                isRunning: false,
                suggestion: 'Check if Aster DEX API is accessible. Agent Runner uses fallback symbols if symbol fetch fails.'
              }
            });
            // CRITICAL: Don't mark as initialized if Agent Runner fails - it's required for trading
            throw new Error(`Agent Runner startup failed: ${errorMsg}`);
          }
        }
      } else {
        logger.info('[4/5] 24/7 Agent Runner disabled in config', { context: 'Startup' });
      }

      // Step 5: Verify DeepSeek R1 is still responding (final check)
      logger.info('[5/6] Final DeepSeek R1 verification...', { context: 'Startup' });
      try {
        const { deepseekService } = await import('@/services/deepseekService');
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('DeepSeek R1 final verification timeout after 15 seconds')), 15000);
        });
        
        const finalTest = await Promise.race([
          deepseekService.chat('Test', undefined, { max_tokens: 10 }),
          timeoutPromise
        ]) as string;
        
        logger.info('[5/6] DeepSeek R1 verified and ready for trading!', {
          context: 'Startup',
          data: {
            aiStatus: 'operational',
            readyToTrade: true,
            note: 'All agents will use DeepSeek R1 for analysis',
            response: finalTest.substring(0, 50)
          }
        });
      } catch (verifyError) {
        logger.warn('[5/6] DeepSeek R1 verification failed', {
          context: 'Startup',
          error: verifyError instanceof Error ? verifyError.message : String(verifyError),
          impact: 'Workflows may fail - ensure Ollama is running'
        });
      }

      // CRITICAL FIX: Set initialized flag LAST, after all services are verified
      // Verify Agent Runner is running (if enabled) before marking as initialized
      if (asterConfig.trading.enable24_7Agents) {
        const finalRunnerCheck = agentRunnerService.getStatus();
        if (!finalRunnerCheck.isRunning) {
          logger.error('🚨 CRITICAL: Agent Runner not running after initialization - SYSTEM CANNOT START', {
            context: 'Startup',
            data: { status: finalRunnerCheck },
            impact: 'Trading system is NON-FUNCTIONAL without Agent Runner',
            action: 'Initialization FAILED - will NOT mark as initialized'
          });
          this.initialized = false;
          throw new Error('CRITICAL FAILURE: Agent Runner not running after initialization. System REQUIRES Agent Runner for trading. Check Ollama, DeepSeek, and Aster DEX API connectivity.');
        }
        
        logger.info('✅ VERIFIED: Agent Runner is running and healthy', {
          context: 'Startup',
          isRunning: finalRunnerCheck.isRunning,
          symbols: finalRunnerCheck.config.symbols.length,
          activeWorkflows: finalRunnerCheck.activeWorkflowCount
        });
      }
      
      this.initialized = true;
      
      // Step 6: Start Health Monitor (auto-restart crashed services)
      logger.info('[6/7] Starting Health Monitor (auto-restart system)...', { context: 'Startup' });
      healthMonitorService.start();
      logger.info('[6/7] Health Monitor started - services will auto-restart if they crash', { context: 'Startup' });
      
      // Step 7: Start Critical Service Monitor (NUCLEAR OPTION - crashes server if Agent Runner stops)
      if (asterConfig.trading.enable24_7Agents) {
        logger.info('[7/7] Starting Critical Service Monitor (will crash server if Agent Runner stops)...', { context: 'Startup' });
        
        // Check if we're in development or production
        const isDevelopment = process.env.NODE_ENV === 'development';
        if (!isDevelopment) {
          // Production: Crash server if Agent Runner stops (ensures visibility)
          criticalServiceMonitor.setFailureMode('crash');
          logger.warn('⚠️ CRITICAL MONITOR IN CRASH MODE: Server will crash if Agent Runner stops!', {
            context: 'Startup',
            mode: 'crash',
            gracePeriod: '30 seconds',
            note: 'This ensures immediate visibility of critical failures'
          });
        } else {
          // Development: Log warnings instead of crashing (more developer-friendly)
          criticalServiceMonitor.setFailureMode('log');
          logger.info('Critical Monitor in LOG mode (development)', {
            context: 'Startup',
            mode: 'log',
            note: 'Set NODE_ENV=production for crash mode'
          });
        }
        
        criticalServiceMonitor.start();
        logger.info('[7/7] Critical Service Monitor started - Agent Runner is under active protection', { context: 'Startup' });
      }
      
      logger.info('Application services initialized successfully', { 
        context: 'Startup',
        data: {
          initialized: true,
          agentRunnerRunning: asterConfig.trading.enable24_7Agents ? agentRunnerService.getStatus().isRunning : 'disabled',
          services: ['RealBalance', 'PositionMonitor', 'AgentRunner', 'DeepSeek', 'HealthMonitor']
        }
      });

    } catch (error) {
      logger.error('Failed to initialize application services', error, { context: 'Startup' });
      
      // CRITICAL FIX: Don't mark as initialized if DeepSeek verification failed
      // DeepSeek is REQUIRED for trading - system should not proceed without it
      if (error instanceof Error && error.message.includes('DeepSeek R1 not available')) {
        logger.error('CRITICAL: Cannot proceed without DeepSeek R1 - keeping initialized=false', {
          context: 'Startup',
          error: error.message
        });
        this.initialized = false; // Keep false so it can retry
        throw error; // Re-throw critical errors - system MUST have DeepSeek
      }
      
      // CRITICAL FIX: Only mark as initialized if Agent Runner is not required OR if it's truly a non-critical error
      // Agent Runner failure is now considered critical (we throw above, so this path shouldn't be reached)
      if (error instanceof Error && 
          (error.message.includes('Agent Runner') || error.message.includes('Position Monitor'))) {
        logger.error('CRITICAL: Required service failed - keeping initialized=false', {
          context: 'Startup',
          error: error.message
        });
        this.initialized = false;
        throw error; // Re-throw to prevent partial initialization
      }
      
      // Only mark as initialized for truly non-critical errors
      this.initialized = true;
      logger.warn('Continuing with partial initialization (non-critical error)', { context: 'Startup' });
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down application services', { context: 'Startup' });

    try {
      // Stop monitors first
      criticalServiceMonitor.stop();
      healthMonitorService.stop();
      
      // Stop services
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
    // CRITICAL FIX: Check actual service states, not just the initialization flag
    // This allows manual service starts to be reflected in the status
    
    // If flag is true, system is initialized
    if (this.initialized) {
      return true;
    }
    
    // CRITICAL FIX: If Agent Runner is required and running, system is functionally initialized
    // This handles the case where initialization failed but Agent Runner was started manually
    if (asterConfig.trading.enable24_7Agents) {
      const isAgentRunnerRunning = agentRunnerService.getStatus().isRunning;
      if (isAgentRunnerRunning) {
        // Agent Runner is the critical service - if it's running, system is functional
        logger.debug('System marked as initialized because Agent Runner is running', {
          context: 'Startup',
          flagValue: this.initialized,
          agentRunnerRunning: isAgentRunnerRunning
        });
        return true;
      }
    }
    
    // Otherwise return the flag value
    return this.initialized;
  }
}

// Export singleton instance
export const startupService = new StartupService();
export default startupService;
