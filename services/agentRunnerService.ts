/**
 * 24/7 Agent Runner Service
 * Continuously runs trading workflows for all supported symbols
 */

import { logger } from '@/lib/logger';
import { agentCoordinator } from '@/services/agentCoordinator';
import { asterConfig } from '@/lib/configService';
import { asterDexService } from '@/services/asterDexService';

export interface AgentRunnerConfig {
  symbols: string[];
  intervalMinutes: number;
  maxConcurrentWorkflows: number;
  enabled: boolean;
  focusOnHighVolume: boolean;
  minVolumeThreshold: number; // Minimum 24h volume in USDT
}

export class AgentRunnerService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private activeWorkflows: Set<string> = new Set();
  private config: AgentRunnerConfig;
  private lastSymbolUpdate: number = 0;
  private symbolUpdateInterval = 24 * 60 * 60 * 1000; // Update symbols every 24 hours

  constructor() {
    this.config = {
      symbols: [], // Will be populated from Aster API
      intervalMinutes: 15, // Run every 15 minutes
      maxConcurrentWorkflows: 3,
      enabled: true,
      focusOnHighVolume: true,
      minVolumeThreshold: 1000000 // 1M USDT minimum volume
    };

    logger.info('Agent Runner Service initialized', {
      context: 'AgentRunner',
      config: this.config
    });
  }

  /**
   * Update symbols from Aster DEX with focus on high volume pairs
   */
  private async updateSymbols(): Promise<void> {
    try {
      logger.info('Updating symbols from Aster DEX', { context: 'AgentRunner' });
      
      const exchangeInfo = await asterDexService.getExchangeInfo();
      
      if (this.config.focusOnHighVolume) {
        // Filter for high volume pairs
        const highVolumeSymbols = exchangeInfo.topVolumeSymbols
          .filter((symbol: any) => symbol.quoteVolume24h >= this.config.minVolumeThreshold)
          .map((symbol: any) => symbol.symbol.replace('USDT', '/USDT')); // Convert BTCUSDT to BTC/USDT
        
        this.config.symbols = highVolumeSymbols;
        
        logger.info('Updated symbols to high volume pairs', {
          context: 'AgentRunner',
          symbolCount: this.config.symbols.length,
          symbols: this.config.symbols.slice(0, 10), // Log first 10
          minVolume: this.config.minVolumeThreshold
        });
      } else {
        // Use all available symbols
        const allSymbols = exchangeInfo.symbols
          .map((symbol: any) => symbol.symbol.replace('USDT', '/USDT'));
        
        this.config.symbols = allSymbols;
        
        logger.info('Updated symbols to all available pairs', {
          context: 'AgentRunner',
          symbolCount: this.config.symbols.length
        });
      }
      
      this.lastSymbolUpdate = Date.now();
    } catch (error) {
      logger.error('Failed to update symbols', error, { context: 'AgentRunner' });
      throw error; // Re-throw to fail the operation
    }
  }

  /**
   * Start the 24/7 agent runner
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent Runner is already running', { context: 'AgentRunner' });
      return;
    }

    // Update symbols before starting
    await this.updateSymbols();

    this.isRunning = true;
    logger.info('Starting 24/7 Agent Runner', {
      context: 'AgentRunner',
      symbols: this.config.symbols.slice(0, 10), // Log first 10
      totalSymbols: this.config.symbols.length,
      interval: `${this.config.intervalMinutes} minutes`,
      focusOnHighVolume: this.config.focusOnHighVolume
    });

    // Start the main interval
    this.intervalId = setInterval(() => {
      this.runTradingCycle().catch(error => {
        logger.error('Error in trading cycle', error, { context: 'AgentRunner' });
      });
    }, this.config.intervalMinutes * 60 * 1000);

    // Run immediately
    await this.runTradingCycle();
  }

  /**
   * Stop the 24/7 agent runner
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Agent Runner is not running', { context: 'AgentRunner' });
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Stopped 24/7 Agent Runner', {
      context: 'AgentRunner',
      activeWorkflows: this.activeWorkflows.size
    });
  }

  /**
   * Run a complete trading cycle for all symbols
   */
  private async runTradingCycle(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Agent Runner is disabled', { context: 'AgentRunner' });
      return;
    }

    // Check if we need to update symbols (every 24 hours)
    if (Date.now() - this.lastSymbolUpdate > this.symbolUpdateInterval) {
      await this.updateSymbols();
    }

    logger.info('Starting trading cycle', {
      context: 'AgentRunner',
      symbols: this.config.symbols.slice(0, 10), // Log first 10
      totalSymbols: this.config.symbols.length,
      activeWorkflows: this.activeWorkflows.size,
      maxConcurrent: this.config.maxConcurrentWorkflows
    });

    // Clean up completed workflows
    this.cleanupCompletedWorkflows();

    // Check if we can start new workflows
    if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
      logger.debug('Max concurrent workflows reached, skipping cycle', {
        context: 'AgentRunner',
        active: this.activeWorkflows.size,
        max: this.config.maxConcurrentWorkflows
      });
      return;
    }

    // Start workflows for symbols that don't have active workflows
    const availableSlots = this.config.maxConcurrentWorkflows - this.activeWorkflows.size;
    const symbolsToProcess = this.config.symbols.slice(0, availableSlots);

    for (const symbol of symbolsToProcess) {
      if (!this.activeWorkflows.has(symbol)) {
        await this.startWorkflowForSymbol(symbol);
      }
    }
  }

  /**
   * Start a workflow for a specific symbol
   */
  private async startWorkflowForSymbol(symbol: string): Promise<void> {
    try {
      logger.info(`Starting workflow for ${symbol}`, {
        context: 'AgentRunner',
        symbol
      });

      const workflowId = await agentCoordinator.startTradingWorkflow(symbol);
      this.activeWorkflows.add(symbol);

      logger.info(`Workflow started for ${symbol}`, {
        context: 'AgentRunner',
        symbol,
        workflowId,
        activeWorkflows: this.activeWorkflows.size
      });

      // Monitor the workflow completion
      this.monitorWorkflow(workflowId, symbol);

    } catch (error) {
      logger.error(`Failed to start workflow for ${symbol}`, error, {
        context: 'AgentRunner',
        symbol
      });
    }
  }

  /**
   * Monitor a workflow until completion
   */
  private monitorWorkflow(workflowId: string, symbol: string): void {
    const checkInterval = setInterval(async () => {
      try {
        const workflow = agentCoordinator.getWorkflowStatus(workflowId);
        
        if (!workflow) {
          logger.warn(`Workflow ${workflowId} not found`, {
            context: 'AgentRunner',
            symbol,
            workflowId
          });
          clearInterval(checkInterval);
          this.activeWorkflows.delete(symbol);
          return;
        }

        if (workflow.status === 'completed' || workflow.status === 'failed' || workflow.status === 'cancelled') {
          logger.info(`Workflow completed for ${symbol}`, {
            context: 'AgentRunner',
            symbol,
            workflowId,
            status: workflow.status,
            duration: workflow.completedAt ? workflow.completedAt - workflow.startedAt : 0
          });

          clearInterval(checkInterval);
          this.activeWorkflows.delete(symbol);

          // Log the result if available
          if (workflow.result) {
            logger.info(`Workflow result for ${symbol}`, {
              context: 'AgentRunner',
              symbol,
              result: workflow.result
            });
          }
        }
      } catch (error) {
        logger.error(`Error monitoring workflow ${workflowId}`, error, {
          context: 'AgentRunner',
          symbol,
          workflowId
        });
        clearInterval(checkInterval);
        this.activeWorkflows.delete(symbol);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Clean up completed workflows from active list
   */
  private cleanupCompletedWorkflows(): void {
    const workflows = agentCoordinator.getAllWorkflowsStatus();
    const completedWorkflows = workflows.filter(w => 
      w.status === 'completed' || w.status === 'failed' || w.status === 'cancelled'
    );

    for (const workflow of completedWorkflows) {
      this.activeWorkflows.delete(workflow.symbol);
    }

    if (completedWorkflows.length > 0) {
      logger.debug('Cleaned up completed workflows', {
        context: 'AgentRunner',
        cleaned: completedWorkflows.length,
        remaining: this.activeWorkflows.size
      });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AgentRunnerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    logger.info('Agent Runner config updated', {
      context: 'AgentRunner',
      config: this.config
    });
  }

  /**
   * Force update symbols from Aster DEX
   */
  async forceUpdateSymbols(): Promise<void> {
    await this.updateSymbols();
  }

  /**
   * Set focus on high volume pairs
   */
  setHighVolumeFocus(enabled: boolean, minVolume: number = 1000000): void {
    this.config.focusOnHighVolume = enabled;
    this.config.minVolumeThreshold = minVolume;
    
    logger.info('Updated volume focus settings', {
      context: 'AgentRunner',
      focusOnHighVolume: enabled,
      minVolumeThreshold: minVolume
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentRunnerConfig {
    return { ...this.config };
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    config: AgentRunnerConfig;
    activeWorkflows: string[];
    activeWorkflowCount: number;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      activeWorkflows: Array.from(this.activeWorkflows),
      activeWorkflowCount: this.activeWorkflows.size
    };
  }

  /**
   * Force run a trading cycle
   */
  async forceRunCycle(): Promise<void> {
    logger.info('Force running trading cycle', { context: 'AgentRunner' });
    await this.runTradingCycle();
  }

  /**
   * Add a symbol to the watch list
   */
  addSymbol(symbol: string): void {
    if (!this.config.symbols.includes(symbol)) {
      this.config.symbols.push(symbol);
      logger.info(`Added symbol ${symbol} to watch list`, {
        context: 'AgentRunner',
        symbols: this.config.symbols
      });
    }
  }

  /**
   * Remove a symbol from the watch list
   */
  removeSymbol(symbol: string): void {
    const index = this.config.symbols.indexOf(symbol);
    if (index > -1) {
      this.config.symbols.splice(index, 1);
      logger.info(`Removed symbol ${symbol} from watch list`, {
        context: 'AgentRunner',
        symbols: this.config.symbols
      });
    }
  }
}

// Export singleton instance
export const agentRunnerService = new AgentRunnerService();
export default agentRunnerService;
