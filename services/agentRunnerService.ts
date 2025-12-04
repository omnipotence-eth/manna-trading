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
  private keepAliveIntervalId: NodeJS.Timeout | null = null; // CRITICAL FIX: Store keep-alive interval
  private activeWorkflows: Set<string> = new Set();
  private config: AgentRunnerConfig;
  private lastSymbolUpdate: number = 0;
  private symbolUpdateInterval = 24 * 60 * 60 * 1000; // Update symbols every 24 hours
  private cycleCount: number = 0; // Track trading cycles for debugging

  constructor() {
    this.config = {
      symbols: [], // Will be populated from Aster API
      intervalMinutes: asterConfig.trading.agentRunnerInterval || 2, // OPTIMIZED: 2 minutes for faster response
      maxConcurrentWorkflows: asterConfig.trading.maxConcurrentWorkflows || 3,
      enabled: asterConfig.trading.enable24_7Agents !== false,
      focusOnHighVolume: true,
      minVolumeThreshold: 50000 // 50K USDT minimum volume (extremely relaxed for quiet markets)
    };

    logger.info('Agent Runner Service initialized (OPTIMIZED)', {
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
          .map((symbol: { symbol: string }) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbolStr = symbol.symbol || '';
            // CRITICAL FIX: Check if already has slash to prevent double slash (XRP//USDT)
            if (symbolStr.includes('/')) {
              return symbolStr; // Already in correct format
            }
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
          .map((symbol: { symbol: string }) => {
            // Convert BTCUSDT to BTC/USDT format
            const symbolStr = symbol.symbol || '';
            // CRITICAL FIX: Check if already has slash to prevent double slash (XRP//USDT)
            if (symbolStr.includes('/')) {
              return symbolStr; // Already in correct format
            }
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
    logger.info('🔄 Agent Runner start() called', {
      context: 'AgentRunner',
      currentlyRunning: this.isRunning,
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n') // Log who called start()
    });

    if (this.isRunning) {
      logger.warn('⚠️ Agent Runner is already running - start() called but already active', {
        context: 'AgentRunner',
        intervalId: this.intervalId ? 'exists' : 'null',
        keepAliveIntervalId: this.keepAliveIntervalId ? 'exists' : 'null',
        activeWorkflows: this.activeWorkflows.size
      });
      return;
    }

    try {
      // Update symbols before starting (with 20-second timeout)
      logger.info('📊 Fetching symbols from Aster DEX...', {
        context: 'AgentRunner',
        timestamp: new Date().toISOString()
      });
      
      // Add timeout to prevent hanging during initialization
      await Promise.race([
        this.updateSymbols(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Symbol fetch timeout after 20 seconds')), 20000))
      ]);
      
      logger.info(`✅ Loaded ${this.config.symbols.length} trading symbols`, {
        context: 'AgentRunner',
        symbolCount: this.config.symbols.length,
        symbols: this.config.symbols.slice(0, 5)
      });
    } catch (error) {
      logger.error('❌ Failed to load symbols, will retry on first cycle', error as Error, {
        context: 'AgentRunner',
        error: error instanceof Error ? error.message : String(error),
        willUseFallback: true
      });
      // CRITICAL FIX: ALWAYS use fallback symbols if fetch fails - don't let empty symbols block startup
      if (this.config.symbols.length === 0) {
        this.config.symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT'];
        logger.warn('⚠️ Using fallback symbols - Agent Runner will start anyway', { 
          context: 'AgentRunner', 
          symbols: this.config.symbols,
          reason: 'Symbol fetch failed - will retry on first cycle'
        });
      }
    }
    
    // CRITICAL FIX: Ensure we have symbols before starting (double-check)
    if (this.config.symbols.length === 0) {
      logger.error('❌ CRITICAL: No symbols available - using emergency fallback', { context: 'AgentRunner' });
      this.config.symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
    }

    // CRITICAL FIX: Start interval BEFORE setting isRunning to verify it works
    logger.info('⏰ Creating main trading cycle interval...', {
      context: 'AgentRunner',
      intervalMinutes: this.config.intervalMinutes,
      intervalMs: this.config.intervalMinutes * 60 * 1000,
      previousIntervalId: this.intervalId ? 'existed (clearing)' : 'none'
    });

    // Clear any existing interval first (shouldn't happen, but safety)
    if (this.intervalId) {
      logger.warn('⚠️ Found existing intervalId during start() - clearing it', {
        context: 'AgentRunner',
        intervalId: String(this.intervalId)
      });
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Start the main interval
    this.intervalId = setInterval(() => {
      logger.debug('🔄 Trading cycle interval triggered', {
        context: 'AgentRunner',
        isRunning: this.isRunning,
        cycleNumber: this.cycleCount + 1
      });
      this.runTradingCycle().catch(error => {
        logger.error('❌ Error in trading cycle', error, {
          context: 'AgentRunner',
          isRunning: this.isRunning, // Log if Agent Runner is still running after error
          willContinue: true
        });
        // CRITICAL FIX: Don't stop on errors, keep running!
      });
    }, this.config.intervalMinutes * 60 * 1000);

    // Verify interval was set successfully
    if (!this.intervalId) {
      logger.error('❌ CRITICAL: Failed to create Agent Runner interval', null, {
        context: 'AgentRunner',
        config: this.config
      });
      throw new Error('Failed to create Agent Runner interval');
    }

    logger.info('✅ Main interval created successfully', {
      context: 'AgentRunner',
      intervalId: String(this.intervalId),
      intervalMs: this.config.intervalMinutes * 60 * 1000
    });

    // Now set isRunning after verification
    const wasRunning = this.isRunning;
    this.isRunning = true;
    
    logger.info('✅ Agent Runner isRunning set to TRUE', {
      context: 'AgentRunner',
      wasRunning,
      isRunningNow: this.isRunning,
      timestamp: new Date().toISOString()
    });
    
    logger.info('🚀 24/7 Agent Runner STARTED and verified', {
      context: 'AgentRunner',
      symbols: this.config.symbols.slice(0, 10), // Log first 10
      totalSymbols: this.config.symbols.length,
      interval: `${this.config.intervalMinutes} minutes`,
      focusOnHighVolume: this.config.focusOnHighVolume,
      isRunning: this.isRunning,
      intervalSet: !!this.intervalId,
      keepAliveIntervalSet: !!this.keepAliveIntervalId,
      timestamp: new Date().toISOString(),
      config: {
        enabled: this.config.enabled,
        intervalMinutes: this.config.intervalMinutes,
        maxConcurrentWorkflows: this.config.maxConcurrentWorkflows
      }
    });

    // CRITICAL FIX: Don't run first cycle immediately during initialization
    // Market scanner can timeout and flood terminal with errors
    // Let the interval handle the first cycle naturally
    logger.info(`✅ Agent Runner started - first trading cycle will run in ${this.config.intervalMinutes} minutes`, {
      context: 'AgentRunner',
      isRunning: this.isRunning,
      nextCycleIn: `${this.config.intervalMinutes} minutes`,
      note: 'Skipping immediate first cycle to prevent initialization timeouts'
    });
    
    // CRITICAL FIX: Keep-alive mechanism - restart if stops unexpectedly
    logger.info('🔄 Setting up keep-alive mechanism...', {
      context: 'AgentRunner',
      existingKeepAliveInterval: this.keepAliveIntervalId ? 'exists' : 'none'
    });
    
    // Clear any existing keep-alive interval before creating new one
    if (this.keepAliveIntervalId) {
      logger.warn('⚠️ Found existing keep-alive interval - clearing it', {
        context: 'AgentRunner',
        keepAliveIntervalId: String(this.keepAliveIntervalId)
      });
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }
    
    // NOTE: Health Monitor also checks every 30s, but this provides additional safety
    // Health Monitor is primary mechanism (monitors from outside), this is backup
    this.keepAliveIntervalId = setInterval(() => {
      const checkTimestamp = new Date().toISOString();
      logger.debug('🔍 Keep-alive check', {
        context: 'AgentRunner',
        isRunning: this.isRunning,
        enabled: this.config.enabled,
        timestamp: checkTimestamp
      });
      
      if (!this.isRunning && this.config.enabled) {
        logger.warn('⚠️ Agent Runner stopped unexpectedly (keep-alive detected), attempting restart...', { 
          context: 'AgentRunner',
          note: 'Health Monitor should also detect and restart',
          timestamp: checkTimestamp,
          stack: new Error().stack?.split('\n').slice(0, 5).join('\n')
        });
        this.start().catch(err => {
          logger.error('❌ Keep-alive restart failed', err, {
            context: 'AgentRunner',
            timestamp: checkTimestamp
          });
        });
      } else if (this.isRunning) {
        logger.debug('✅ Keep-alive check passed - Agent Runner is running', {
          context: 'AgentRunner',
          timestamp: checkTimestamp
        });
      }
    }, 30000); // Check every 30 seconds
    
    logger.info('✅ Keep-alive mechanism activated', {
      context: 'AgentRunner',
      keepAliveIntervalId: String(this.keepAliveIntervalId),
      checkIntervalMs: 30000
    });
  }

  /**
   * Stop the 24/7 agent runner
   */
  async stop(): Promise<void> {
    const stopCaller = new Error().stack?.split('\n').slice(1, 6).join('\n') || 'unknown';
    
    logger.warn('🛑 Agent Runner stop() called', {
      context: 'AgentRunner',
      currentlyRunning: this.isRunning,
      caller: stopCaller,
      timestamp: new Date().toISOString()
    });

    if (!this.isRunning) {
      logger.warn('⚠️ Agent Runner stop() called but already not running', {
        context: 'AgentRunner',
        intervalId: this.intervalId ? 'exists (clearing)' : 'none',
        keepAliveIntervalId: this.keepAliveIntervalId ? 'exists (clearing)' : 'none',
        caller: stopCaller
      });
      
      // CRITICAL FIX: Still clear intervals even if not running (cleanup)
      if (this.intervalId) {
        logger.info('🧹 Clearing main interval (cleanup)', {
          context: 'AgentRunner',
          intervalId: String(this.intervalId)
        });
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (this.keepAliveIntervalId) {
        logger.info('🧹 Clearing keep-alive interval (cleanup)', {
          context: 'AgentRunner',
          keepAliveIntervalId: String(this.keepAliveIntervalId)
        });
        clearInterval(this.keepAliveIntervalId);
        this.keepAliveIntervalId = null;
      }
      return;
    }

    logger.error('🚨 Agent Runner STOPPING (this should only happen on shutdown!)', {
      context: 'AgentRunner',
      activeWorkflows: this.activeWorkflows.size,
      intervalId: this.intervalId ? String(this.intervalId) : 'null',
      keepAliveIntervalId: this.keepAliveIntervalId ? String(this.keepAliveIntervalId) : 'null',
      stack: stopCaller,
      timestamp: new Date().toISOString(),
      state: {
        isRunning: this.isRunning,
        activeWorkflows: Array.from(this.activeWorkflows),
        symbolsLoaded: this.config.symbols.length
      }
    });

    const wasRunning = this.isRunning;
    this.isRunning = false;

    logger.info('📝 isRunning changed: true → false', {
      context: 'AgentRunner',
      wasRunning,
      isRunningNow: this.isRunning,
      timestamp: new Date().toISOString()
    });

    if (this.intervalId) {
      logger.info('🧹 Clearing main trading cycle interval', {
        context: 'AgentRunner',
        intervalId: String(this.intervalId)
      });
      clearInterval(this.intervalId);
      this.intervalId = null;
    } else {
      logger.warn('⚠️ No main interval to clear (already null?)', {
        context: 'AgentRunner'
      });
    }
    
    // CRITICAL FIX: Clear keep-alive interval when stopping
    if (this.keepAliveIntervalId) {
      logger.info('🧹 Clearing keep-alive interval', {
        context: 'AgentRunner',
        keepAliveIntervalId: String(this.keepAliveIntervalId)
      });
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    } else {
      logger.debug('No keep-alive interval to clear', {
        context: 'AgentRunner'
      });
    }

    logger.info('✅ Stopped 24/7 Agent Runner', {
      context: 'AgentRunner',
      activeWorkflows: this.activeWorkflows.size,
      intervalsCleared: true,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Run a complete trading cycle for all symbols
   * OPTIMIZED: Uses market scanner to find best opportunities instead of trading fixed symbols
   * CRITICAL: This method NEVER throws - all errors are caught and logged
   */
  private async runTradingCycle(): Promise<void> {
    const cycleStartTime = Date.now();
    const cycleNumber = this.cycleCount + 1;
    
    logger.info('🔄 Starting trading cycle', {
      context: 'AgentRunner',
      cycleNumber,
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      activeWorkflows: this.activeWorkflows.size,
      maxConcurrent: this.config.maxConcurrentWorkflows,
      timestamp: new Date().toISOString()
    });

    // CRITICAL FIX: Wrap ENTIRE method in try-catch to prevent ANY crash from stopping Agent Runner
    try {
      // CRITICAL: Check if Agent Runner is still running
      if (!this.isRunning) {
        logger.warn('⚠️ Trading cycle started but isRunning=false - this should not happen!', {
          context: 'AgentRunner',
          cycleNumber,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!this.config.enabled) {
        logger.debug('Agent Runner is disabled', {
          context: 'AgentRunner',
          cycleNumber
        });
        return;
      }

      // Clean up completed workflows
      this.cleanupCompletedWorkflows();

      // Increment cycle counter
      this.cycleCount++;
      
      logger.debug('📊 Trading cycle state check', {
        context: 'AgentRunner',
        cycle: this.cycleCount,
        isRunning: this.isRunning,
        enabled: this.config.enabled,
        intervalId: this.intervalId ? 'exists' : 'null',
        keepAliveIntervalId: this.keepAliveIntervalId ? 'exists' : 'null'
      });

      // Check if we can start new workflows
      if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
        logger.debug('⏸️ Max concurrent workflows reached, skipping trading cycle', {
          context: 'AgentRunner',
          cycle: this.cycleCount,
          activeWorkflows: this.activeWorkflows.size,
          maxConcurrent: this.config.maxConcurrentWorkflows,
          activeWorkflowIds: Array.from(this.activeWorkflows)
        });
        return;
      }
      
      // CRITICAL: Verify Agent Runner is still running before proceeding
      if (!this.isRunning) {
        logger.error('❌ CRITICAL: isRunning=false during trading cycle - Agent Runner stopped!', {
          context: 'AgentRunner',
          cycle: this.cycleCount,
          timestamp: new Date().toISOString()
        });
        return;
      }

      logger.info('Running market scan to find best opportunities', {
        context: 'AgentRunner',
        cycle: this.cycleCount,
        activeWorkflows: this.activeWorkflows.size,
        maxConcurrent: this.config.maxConcurrentWorkflows
      });

      // OPTIMIZED: Use market scanner to find best opportunities
      try {
      const { marketScannerService } = await import('./marketScannerService');
      const scanResult = await marketScannerService.scanMarkets();
      
      logger.info('Market scan completed', {
        context: 'AgentRunner',
        totalSymbols: scanResult.totalSymbols,
        opportunities: scanResult.opportunities.length,
        volumeSpikes: scanResult.volumeSpikes.length,
        bestOpportunity: scanResult.bestOpportunity?.symbol
      });

      // MVP OPTIMIZATION: Lower thresholds for testing - more trades, still safe
      // Quality filters relaxed for MVP, but blacklist + problematic coin detector still active
      // CRITICAL FIX: Use centralized confidence threshold from config (respects .env.local)
      const confidenceThreshold = asterConfig.trading.confidenceThreshold;
      const topOpportunities = scanResult.opportunities
        .filter(opp => opp.score >= 35) // MVP: Lowered from 40 to 35 - more opportunities
        .filter(opp => opp.confidence >= confidenceThreshold) // CRITICAL FIX: Use config value, not hardcoded
        // CRITICAL FIX: Include SELL and STRONG_SELL recommendations (SHORT trades)
        // SELL makes money just as fast as BUY - treat them equally
        .filter(opp => opp.recommendation === 'STRONG_BUY' || opp.recommendation === 'BUY' || 
                      opp.recommendation === 'NEUTRAL' || opp.recommendation === 'SELL' || opp.recommendation === 'STRONG_SELL')
        .filter(opp => {
          // MVP OPTIMIZATION: Relaxed filters - let the problematic coin detector do the heavy filtering
          const quoteVolume = opp.marketData?.quoteVolume24h || 0;
          const spread = opp.marketData?.spread || 0;
          const liquidity = opp.marketData?.liquidity || 0;
          
          // RELAXED: Only check critical execution filters
          // The problematic coin detector already handles spread/volume/liquidity
          const hasMinimumLiquidity = quoteVolume >= 50000; // $50K minimum
          const hasReasonableSpread = spread < 10.0; // <10% spread (very relaxed)
          const hasAnyLiquidity = liquidity > 0.1; // Any meaningful liquidity
          
          // Log why if filtered
          if (!hasMinimumLiquidity || !hasReasonableSpread || !hasAnyLiquidity) {
            logger.info(`Filtered out ${opp.symbol}: volume=$${(quoteVolume/1000).toFixed(1)}K, spread=${spread.toFixed(2)}%, liquidity=${liquidity.toFixed(2)}`, {
              context: 'AgentRunner'
            });
          }
          
          return hasMinimumLiquidity && hasReasonableSpread && hasAnyLiquidity;
        })
        .slice(0, this.config.maxConcurrentWorkflows); // Limit to max concurrent
      
      if (topOpportunities.length === 0) {
        logger.warn('NO opportunities passed filters!', {
          context: 'AgentRunner',
          data: {
            totalOpportunities: scanResult.opportunities.length,
            afterScoreFilter: scanResult.opportunities.filter(o => o.score >= 35).length,
            afterConfidenceFilter: scanResult.opportunities.filter(o => o.confidence >= confidenceThreshold).length,
            topOpportunity: scanResult.bestOpportunity ? {
              symbol: scanResult.bestOpportunity.symbol,
              score: scanResult.bestOpportunity.score,
              confidence: (scanResult.bestOpportunity.confidence * 100).toFixed(0) + '%',
              volume: scanResult.bestOpportunity.marketData?.quoteVolume24h,
              spread: scanResult.bestOpportunity.marketData?.spread,
              liquidity: scanResult.bestOpportunity.marketData?.liquidity
            } : null,
            message: 'All opportunities filtered out - check filter criteria'
          }
        });
        return;
      }

      logger.info(`Found ${topOpportunities.length} quality opportunities!`, {
        context: 'AgentRunner',
        data: {
          opportunities: topOpportunities.map(opp => ({
            symbol: opp.symbol,
            score: opp.score,
            confidence: (opp.confidence * 100).toFixed(0) + '%',
            recommendation: opp.recommendation,
            volume: opp.marketData?.quoteVolume24h,
            liquidity: (opp.marketData?.liquidity * 100).toFixed(0) + '%'
          }))
        }
      });

      // Start workflows for top opportunities that don't have active workflows
      const availableSlots = this.config.maxConcurrentWorkflows - this.activeWorkflows.size;
      
      logger.info(`🔍 Workflow creation check`, {
        context: 'AgentRunner',
        data: {
          topOpportunitiesCount: topOpportunities.length,
          maxConcurrentWorkflows: this.config.maxConcurrentWorkflows,
          activeWorkflowsCount: this.activeWorkflows.size,
          availableSlots,
          activeWorkflowSymbols: Array.from(this.activeWorkflows),
          willCreateWorkflows: availableSlots > 0 && topOpportunities.length > 0
        }
      });
      
      const opportunitiesToTrade = topOpportunities.slice(0, availableSlots);

      // OPTIMIZATION: Start all workflows in parallel instead of sequentially
      // Helper function to format symbol (BTC/USDT -> BTC/USDT, BTCUSDT -> BTC/USDT)
      const formatSymbol = (symbol: string): string => {
        if (symbol.includes('/')) return symbol;
        return symbol.replace('USDT', '/USDT');
      };
      
      const workflowPromises = opportunitiesToTrade
        .map(opportunity => ({
          symbol: formatSymbol(opportunity.symbol),
          opportunity
        }))
        .filter(({ symbol }) => {
          const alreadyActive = this.activeWorkflows.has(symbol);
          if (alreadyActive) {
            logger.debug(`Skipping ${symbol} - workflow already active`, {
              context: 'AgentRunner',
              activeWorkflows: Array.from(this.activeWorkflows)
            });
          }
          return !alreadyActive;
        })
        .map(({ symbol, opportunity }) => {
          logger.info(`🚀 Creating workflow for opportunity: ${symbol}`, {
            context: 'AgentRunner',
            data: {
              symbol,
              score: opportunity.score,
              confidence: (opportunity.confidence * 100).toFixed(0) + '%',
              recommendation: opportunity.recommendation,
              signals: opportunity.signals.slice(0, 3),
              volume: opportunity.marketData?.quoteVolume24h,
              liquidity: (opportunity.marketData?.liquidity * 100).toFixed(0) + '%'
            }
          });
          return this.startWorkflowForSymbol(symbol);
        });

      // CRITICAL: Log how many workflows will be created
      if (workflowPromises.length === 0) {
        logger.warn('⚠️ No workflows will be created - all opportunities filtered out', {
          context: 'AgentRunner',
          data: {
            topOpportunitiesCount: topOpportunities.length,
            opportunitiesToTradeCount: opportunitiesToTrade.length,
            filteredOutCount: opportunitiesToTrade.length - workflowPromises.length,
            activeWorkflows: Array.from(this.activeWorkflows),
            reason: opportunitiesToTrade.length > 0 
              ? 'All symbols already have active workflows' 
              : 'No opportunities passed filters'
          }
        });
      } else {
        logger.info(`✅ Creating ${workflowPromises.length} workflow(s)`, {
          context: 'AgentRunner',
          data: {
            workflowCount: workflowPromises.length,
            symbols: opportunitiesToTrade.map(o => formatSymbol(o.symbol))
          }
        });
      }

      // Start all workflows concurrently
      await Promise.all(workflowPromises);
    } catch (error) {
      logger.error('❌ Failed to run market scan', error, {
        context: 'AgentRunner',
        cycle: this.cycleCount,
        isRunning: this.isRunning,
        timestamp: new Date().toISOString()
      });
      // Fallback to default symbols if scanner fails
      const availableSlots = this.config.maxConcurrentWorkflows - this.activeWorkflows.size;
      const symbolsToProcess = this.config.symbols.slice(0, availableSlots);
      
      logger.info('🔄 Falling back to default symbols', {
        context: 'AgentRunner',
        availableSlots,
        symbolsToProcess: symbolsToProcess.slice(0, 5)
      });
      
      // OPTIMIZATION: Start fallback workflows in parallel too
      const fallbackPromises = symbolsToProcess
        .filter(symbol => !this.activeWorkflows.has(symbol))
        .map(symbol => this.startWorkflowForSymbol(symbol));
      
      await Promise.all(fallbackPromises);
    }
    } catch (fatalError) {
      // CRITICAL FIX: Catch-all error handler - prevents ANY error from crashing Agent Runner
      const cycleDuration = Date.now() - cycleStartTime;
      logger.error('🚨 CRITICAL: Trading cycle crashed (but Agent Runner will continue)', fatalError, {
        context: 'AgentRunner',
        cycle: this.cycleCount,
        duration: `${cycleDuration}ms`,
        message: 'Agent Runner caught fatal error and will retry on next cycle',
        isRunning: this.isRunning,
        intervalId: this.intervalId ? 'exists' : 'null',
        keepAliveIntervalId: this.keepAliveIntervalId ? 'exists' : 'null',
        timestamp: new Date().toISOString(),
        error: fatalError instanceof Error ? fatalError.message : String(fatalError),
        stack: fatalError instanceof Error ? fatalError.stack : undefined
      });
      // Agent Runner will continue - next cycle will run in ${intervalMinutes} minutes
    } finally {
      const cycleDuration = Date.now() - cycleStartTime;
      logger.debug('✅ Trading cycle completed', {
        context: 'AgentRunner',
        cycle: this.cycleCount,
        duration: `${cycleDuration}ms`,
        isRunning: this.isRunning,
        activeWorkflows: this.activeWorkflows.size,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Start a workflow for a specific symbol
   * CRITICAL FIX: Verify workflow actually started before tracking it
   */
  private async startWorkflowForSymbol(symbol: string): Promise<void> {
    try {
      logger.info(`Starting workflow for ${symbol}`, {
        context: 'AgentRunner',
        symbol
      });

      const workflowId = await agentCoordinator.startTradingWorkflow(symbol);
      
      // CRITICAL FIX: Verify workflow actually exists and is running
      const workflowStatus = agentCoordinator.getWorkflowStatus(workflowId);
      if (!workflowStatus) {
        throw new Error(`Workflow ${workflowId} not found after creation`);
      }
      
      if (workflowStatus.status !== 'running') {
        logger.warn(`Workflow ${workflowId} not in running state`, {
          context: 'AgentRunner',
          symbol,
          workflowId,
          status: workflowStatus.status
        });
        throw new Error(`Workflow ${workflowId} status is ${workflowStatus.status}, expected 'running'`);
      }
      
      // Only add to activeWorkflows after verification
      this.activeWorkflows.add(symbol);

      logger.info(`Workflow started and verified for ${symbol}`, {
        context: 'AgentRunner',
        symbol,
        workflowId,
        activeWorkflows: this.activeWorkflows.size,
        verified: true
      });

      // Monitor the workflow completion
      this.monitorWorkflow(workflowId, symbol);

    } catch (error) {
      logger.error(`Failed to start workflow for ${symbol}`, error, {
        context: 'AgentRunner',
        symbol
      });
      // Don't add to activeWorkflows if verification failed
      this.activeWorkflows.delete(symbol);
      throw error; // Re-throw so caller knows it failed
    }
  }

  /**
   * Monitor a workflow until completion
   * CRITICAL FIX: Use async loop instead of setInterval with async callback
   */
  private monitorWorkflow(workflowId: string, symbol: string): void {
    const monitor = async () => {
      try {
        let isRunning = true;
        
        while (isRunning) {
          try {
            const workflow = agentCoordinator.getWorkflowStatus(workflowId);
            
            if (!workflow) {
              logger.warn(`Workflow ${workflowId} not found`, {
                context: 'AgentRunner',
                symbol,
                workflowId
              });
              this.activeWorkflows.delete(symbol);
              isRunning = false;
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

              this.activeWorkflows.delete(symbol);
              isRunning = false;

              // Log the result if available
              if (workflow.result) {
                logger.info(`Workflow result for ${symbol}`, {
                  context: 'AgentRunner',
                  symbol,
                  result: workflow.result
                });
              }
              return;
            }
            
            // Wait before next check (properly awaited)
            await new Promise(resolve => setTimeout(resolve, 10000));
          } catch (error) {
            logger.error(`Error monitoring workflow ${workflowId}`, error, {
              context: 'AgentRunner',
              symbol,
              workflowId
            });
            this.activeWorkflows.delete(symbol);
            isRunning = false;
          }
        }
      } catch (error) {
        logger.error('Workflow monitor crashed', error, {
          context: 'AgentRunner',
          workflowId,
          symbol
        });
        this.activeWorkflows.delete(symbol);
      }
    };
    
    // Start monitoring (fire-and-forget is OK here - it's tracked)
    monitor().catch(error => {
      logger.error('Fatal error in workflow monitor', error, {
        context: 'AgentRunner',
        workflowId,
        symbol
      });
      this.activeWorkflows.delete(symbol);
    });
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
    const status = {
      isRunning: this.isRunning,
      config: this.config,
      activeWorkflows: Array.from(this.activeWorkflows),
      activeWorkflowCount: this.activeWorkflows.size
    };
    
    // Log status checks to track when/why status is being checked
    logger.debug('📊 Agent Runner getStatus() called', {
      context: 'AgentRunner',
      isRunning: status.isRunning,
      activeWorkflows: status.activeWorkflowCount,
      intervalId: this.intervalId ? 'exists' : 'null',
      keepAliveIntervalId: this.keepAliveIntervalId ? 'exists' : 'null',
      timestamp: new Date().toISOString()
    });
    
    return status;
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
