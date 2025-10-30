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
      intervalMinutes: asterConfig.trading.agentRunnerInterval || 2, // OPTIMIZED: 2 minutes for faster response
      maxConcurrentWorkflows: asterConfig.trading.maxConcurrentWorkflows || 3,
      enabled: asterConfig.trading.enable24_7Agents !== false,
      focusOnHighVolume: true,
      minVolumeThreshold: 1000000 // 1M USDT minimum volume
    };

    logger.info('🚀 Agent Runner Service initialized (OPTIMIZED)', {
      context: 'AgentRunner',
      config: {
        intervalMinutes: this.config.intervalMinutes,
        maxConcurrentWorkflows: this.config.maxConcurrentWorkflows,
        enabled: this.config.enabled,
        focusOnHighVolume: this.config.focusOnHighVolume
      }
    });
  }

  /**
   * Update symbols from Aster DEX with focus on high volume pairs
   */
  private async updateSymbols(): Promise<void> {
    try {
      logger.info('Updating symbols from Aster DEX', { context: 'AgentRunner' });
      
      const exchangeInfo = await asterDexService.getExchangeInfo();
      
      // CRITICAL FIX: Validate exchangeInfo response
      if (!exchangeInfo) {
        throw new Error('Exchange info is null or undefined');
      }
      
      // Get blacklist from config
      const { asterConfig } = await import('@/lib/configService');
      const blacklist = asterConfig.trading.blacklistedSymbols || [];

      if (this.config.focusOnHighVolume) {
        // CRITICAL FIX: Use correct property name (topSymbolsByVolume, not topVolumeSymbols)
        const topSymbols = exchangeInfo.topSymbolsByVolume || exchangeInfo.symbols || [];
        
        // Filter for high volume pairs (excluding blacklist)
        const highVolumeSymbols = topSymbols
          .filter((symbol: any) => {
            // Ensure symbol has required properties
            if (!symbol || !symbol.symbol) return false;
            const volume = symbol.quoteVolume24h || 0;
            return volume >= this.config.minVolumeThreshold;
          })
          .map((symbol: any) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbolStr = symbol.symbol || '';
            return symbolStr.replace('USDT', '/USDT');
          })
          .filter((symbol: string) => {
            // Filter out blacklisted symbols
            return symbol && !blacklist.includes(symbol) && !blacklist.includes(symbol.replace('/', ''));
          });
        
        this.config.symbols = highVolumeSymbols;
        
        logger.info('Updated symbols to high volume pairs (excluding blacklist)', {
          context: 'AgentRunner',
          symbolCount: this.config.symbols.length,
          symbols: this.config.symbols.slice(0, 10), // Log first 10
          minVolume: this.config.minVolumeThreshold,
          blacklisted: blacklist.length
        });
      } else {
        // Use all available symbols (excluding blacklist)
        const allSymbols = (exchangeInfo.symbols || [])
          .filter((symbol: any) => symbol && symbol.symbol) // Validate symbol exists
          .map((symbol: any) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbolStr = symbol.symbol || '';
            return symbolStr.replace('USDT', '/USDT');
          })
          .filter((symbol: string) => {
            // Filter out blacklisted symbols
            return symbol && !blacklist.includes(symbol) && !blacklist.includes(symbol.replace('/', ''));
          });
        
        this.config.symbols = allSymbols;
        
        logger.info('Updated symbols to all available pairs (excluding blacklist)', {
          context: 'AgentRunner',
          symbolCount: this.config.symbols.length,
          blacklisted: blacklist.length
        });
      }
      
      // Ensure we have at least some symbols
      if (this.config.symbols.length === 0) {
        logger.warn('No symbols found after filtering, using fallback symbols', { context: 'AgentRunner' });
        // Fallback to common pairs
        this.config.symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
      }
      
      this.lastSymbolUpdate = Date.now();
    } catch (error) {
      logger.error('Failed to update symbols', error, { context: 'AgentRunner' });
      // Use fallback symbols instead of throwing
      logger.warn('Using fallback symbols due to error', { context: 'AgentRunner' });
      this.config.symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
      this.lastSymbolUpdate = Date.now();
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

    try {
      // Update symbols before starting (with timeout)
      logger.info('Fetching symbols from Aster DEX...', { context: 'AgentRunner' });
      await this.updateSymbols();
      logger.info(`Loaded ${this.config.symbols.length} trading symbols`, { context: 'AgentRunner' });
    } catch (error) {
      logger.error('Failed to load symbols, will retry on first cycle', error as Error, { context: 'AgentRunner' });
      // Continue anyway - will retry in runTradingCycle
    }

    this.isRunning = true;
    logger.info('✅ 24/7 Agent Runner STARTED', {
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

    // Run first cycle in background (don't await)
    this.runTradingCycle().catch(error => {
      logger.error('Error in first trading cycle', error, { context: 'AgentRunner' });
    });
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
   * OPTIMIZED: Uses market scanner to find best opportunities instead of trading fixed symbols
   */
  private async runTradingCycle(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Agent Runner is disabled', { context: 'AgentRunner' });
      return;
    }

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

    logger.info('🔍 Running market scan to find best opportunities', {
      context: 'AgentRunner',
      activeWorkflows: this.activeWorkflows.size,
      maxConcurrent: this.config.maxConcurrentWorkflows
    });

    // OPTIMIZED: Use market scanner to find best opportunities
    try {
      const { marketScannerService } = await import('./marketScannerService');
      const scanResult = await marketScannerService.scanMarkets();
      
      logger.info('✅ Market scan completed', {
        context: 'AgentRunner',
        totalSymbols: scanResult.totalSymbols,
        opportunities: scanResult.opportunities.length,
        volumeSpikes: scanResult.volumeSpikes.length,
        bestOpportunity: scanResult.bestOpportunity?.symbol
      });

      // OPTIMIZED: Get ONLY the BEST opportunities (ultra-selective for profitability)
      // Increased thresholds for higher win rate
      const topOpportunities = scanResult.opportunities
        .filter(opp => opp.score >= 80) // Only STRONG_BUY (was 70)
        .filter(opp => opp.confidence >= 0.65) // Confidence >= 65% (was 35%)
        .filter(opp => opp.recommendation === 'STRONG_BUY') // Only STRONG_BUY recommendations
        .filter(opp => {
          // Additional quality filters - STRICT for execution safety
          const volumeStrength = (opp as any).volumeStrength || 0;
          const liquidityScore = (opp as any).liquidityScore || 0;
          const quoteVolume = (opp as any).marketData?.quoteVolume24h || 0;
          const spread = (opp as any).marketData?.spread || 999;
          
          // CRITICAL: Enforce minimum liquidity to prevent COSMO/APE issues
          const hasMinimumLiquidity = quoteVolume >= 500000; // Minimum $500K quote volume
          const hasReasonableSpread = spread < 0.5; // Spread < 0.5%
          
          return volumeStrength > 0.6 && 
                 liquidityScore > 0.7 && 
                 hasMinimumLiquidity &&
                 hasReasonableSpread; // High volume + high liquidity + execution safety
        })
        .slice(0, this.config.maxConcurrentWorkflows); // Limit to max concurrent
      
      if (topOpportunities.length === 0) {
        logger.info('No ULTRA-HIGH-QUALITY opportunities found (score >= 80, confidence >= 65%, STRONG_BUY only, volume >60%, liquidity >70%)', {
          context: 'AgentRunner',
          totalOpportunities: scanResult.opportunities.length,
          topScore: scanResult.bestOpportunity?.score || 0,
          topConfidence: scanResult.bestOpportunity?.confidence || 0,
          message: 'Being ultra-selective for maximum profitability - waiting for perfect setups'
        });
        return;
      }

      logger.info(`🎯 Found ${topOpportunities.length} ULTRA-HIGH-QUALITY opportunities (STRONG_BUY only, score >=80, confidence >=65%)`, {
        context: 'AgentRunner',
        opportunities: topOpportunities.map(opp => ({
          symbol: opp.symbol,
          score: opp.score,
          confidence: (opp.confidence * 100).toFixed(0) + '%',
          recommendation: opp.recommendation,
          volumeStrength: ((opp as any).volumeStrength * 100).toFixed(0) + '%',
          liquidityScore: ((opp as any).liquidityScore * 100).toFixed(0) + '%'
        }))
      });

      // Start workflows for top opportunities that don't have active workflows
      const availableSlots = this.config.maxConcurrentWorkflows - this.activeWorkflows.size;
      const opportunitiesToTrade = topOpportunities.slice(0, availableSlots);

      for (const opportunity of opportunitiesToTrade) {
        const symbol = opportunity.symbol.replace('USDT', '/USDT'); // Convert format
        if (!this.activeWorkflows.has(symbol)) {
          logger.info(`💼 Starting workflow for opportunity: ${symbol}`, {
            context: 'AgentRunner',
            score: opportunity.score,
            confidence: (opportunity.confidence * 100).toFixed(0) + '%',
            signals: opportunity.signals.slice(0, 3)
          });
          await this.startWorkflowForSymbol(symbol);
        }
      }
    } catch (error) {
      logger.error('Failed to run market scan', error, {
        context: 'AgentRunner'
      });
      // Fallback to default symbols if scanner fails
      const availableSlots = this.config.maxConcurrentWorkflows - this.activeWorkflows.size;
      const symbolsToProcess = this.config.symbols.slice(0, availableSlots);
      for (const symbol of symbolsToProcess) {
        if (!this.activeWorkflows.has(symbol)) {
          await this.startWorkflowForSymbol(symbol);
        }
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
