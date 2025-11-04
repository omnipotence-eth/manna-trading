/**
 * Dynamic Config Service
 * Updates trading configuration based on RL agent recommendations
 * Adapts parameters in real-time based on market conditions and performance
 */

import { logger } from '@/lib/logger';
import { asterConfig } from '@/lib/configService';
import { rlParameterOptimizer, ParameterState, TradingParameters } from './rlParameterOptimizer';
import { realBalanceService } from './realBalanceService';
import { db } from '@/lib/db';

export interface DynamicConfig {
  confidenceThreshold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  minRRRatio: number;
  maxPositionRiskPercent: number;
  lastUpdated: number;
  reasoning: string;
  totalTrades?: number; // Number of trades used for optimization
}

export class DynamicConfigService {
  private currentConfig: DynamicConfig | null = null;
  private updateInterval = 5 * 60 * 1000; // Update every 5 minutes
  private lastUpdateTime = 0;

  /**
   * Get current optimized configuration
   */
  async getOptimizedConfig(): Promise<DynamicConfig> {
    const now = Date.now();
    
    // Return cached config if recent
    if (this.currentConfig && (now - this.currentConfig.lastUpdated) < this.updateInterval) {
      return this.currentConfig;
    }
    
    // Update configuration
    await this.updateConfig();
    
    return this.currentConfig!;
  }

  /**
   * Update configuration based on RL recommendations
   */
  private async updateConfig(): Promise<void> {
    try {
      logger.info('🔄 Updating dynamic configuration based on RL optimization', {
        context: 'DynamicConfigService'
      });

      // Get current account state
      const balanceConfig = realBalanceService.getBalanceConfig();
      const balance = balanceConfig?.availableBalance || 100;
      
      // Detect market regime
      const marketRegime = await rlParameterOptimizer.detectMarketRegime();
      
      // Get recent performance
      const recentWinRate = await rlParameterOptimizer.getRecentWinRateFromTrades(7);
      const recentVolatility = await rlParameterOptimizer.getRecentVolatility(7);
      
      // Classify account size
      const accountSize = rlParameterOptimizer.classifyAccountSize(balance);
      
      // Create state for RL agent
      const state: ParameterState = {
        marketRegime,
        accountSize,
        recentWinRate,
        recentVolatility
      };
      
      // Get optimal parameters from RL agent
      const optimalParams = rlParameterOptimizer.getOptimalParameters(state);
      
      // Calculate dynamic configuration
      const config: DynamicConfig = {
        confidenceThreshold: optimalParams.confidenceThreshold,
        stopLossPercent: optimalParams.stopLossPercent,
        takeProfitPercent: optimalParams.takeProfitPercent,
        minRRRatio: optimalParams.rrRatio,
        maxPositionRiskPercent: optimalParams.positionSizePercent,
        lastUpdated: Date.now(),
        reasoning: this.generateReasoning(state, optimalParams),
        totalTrades: (await this.getRecentTradeCount()) || 0 // Add trade count for display
      };
      
      this.currentConfig = config;
      this.lastUpdateTime = Date.now();
      
      logger.info('✅ Dynamic configuration updated', {
        context: 'DynamicConfigService',
        data: {
          confidenceThreshold: config.confidenceThreshold,
          rrRatio: config.minRRRatio,
          positionSize: config.maxPositionRiskPercent + '%',
          marketRegime,
          accountSize,
          recentWinRate: (recentWinRate * 100).toFixed(1) + '%',
          reasoning: config.reasoning
        }
      });
    } catch (error) {
      logger.error('Failed to update dynamic configuration', error as Error, {
        context: 'DynamicConfigService'
      });
      
      // Fallback to default config
      this.currentConfig = this.getDefaultConfig();
    }
  }

  /**
   * Get recent trade count for display
   */
  private async getRecentTradeCount(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const result = await db.execute(`
        SELECT COUNT(*) as count
        FROM trades
        WHERE exit_timestamp IS NOT NULL
          AND timestamp >= $1
      `, [cutoffDate.toISOString()]);
      return parseInt(result.rows[0]?.count) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate reasoning for configuration changes
   */
  private generateReasoning(state: ParameterState, params: TradingParameters): string {
    const reasons: string[] = [];
    
    if (state.recentWinRate > 0.65) {
      reasons.push(`High win rate (${(state.recentWinRate * 100).toFixed(0)}%) - using ${(params.confidenceThreshold * 100).toFixed(0)}% confidence`);
    } else if (state.recentWinRate < 0.5) {
      reasons.push(`Low win rate (${(state.recentWinRate * 100).toFixed(0)}%) - being more conservative`);
    }
    
    if (state.marketRegime === 'volatile') {
      reasons.push(`Volatile market - wider stops (${params.stopLossPercent}%) and better R:R (${params.rrRatio}:1)`);
    } else if (state.marketRegime === 'trending') {
      reasons.push(`Trending market - tighter stops (${params.stopLossPercent}%)`);
    }
    
    if (state.accountSize === 'micro') {
      reasons.push(`Micro account - smaller positions (${params.positionSizePercent}%)`);
    }
    
    return reasons.join(' | ') || 'Default configuration';
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): DynamicConfig {
    return {
      confidenceThreshold: asterConfig.trading.confidenceThreshold || 0.55,
      stopLossPercent: asterConfig.trading.stopLossPercent || 3.0,
      takeProfitPercent: asterConfig.trading.takeProfitPercent || 6.0,
      minRRRatio: 2.0,
      maxPositionRiskPercent: 1.0,
      lastUpdated: Date.now(),
      reasoning: 'Using default configuration'
    };
  }

  /**
   * Apply configuration to trading system
   */
  async applyConfig(): Promise<void> {
    const config = await this.getOptimizedConfig();
    
    // Update config service (if possible)
    // Note: This is a read-only update - actual config comes from env vars
    // But we can use dynamic config in agent prompts
    
    logger.info('📊 Applying dynamic configuration', {
      context: 'DynamicConfigService',
      data: {
        confidenceThreshold: config.confidenceThreshold,
        stopLoss: config.stopLossPercent,
        takeProfit: config.takeProfitPercent,
        rrRatio: config.minRRRatio,
        positionSize: config.maxPositionRiskPercent
      }
    });
  }

  /**
   * Record trade outcome for RL learning
   */
  async recordTradeOutcome(trade: {
    pnl: number;
    pnlPercent: number;
    confidence: number;
    duration: number;
    riskPercent: number;
    marketRegime: string;
    accountSize: string;
  }): Promise<void> {
    try {
      // Calculate reward
      const reward = rlParameterOptimizer.calculateReward({
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        confidence: trade.confidence,
        duration: trade.duration,
        riskPercent: trade.riskPercent
      });
      
      // Get state (reconstruct from trade data)
      const recentWinRate = await rlParameterOptimizer.getRecentWinRateFromTrades(7);
      const recentVolatility = await rlParameterOptimizer.getRecentVolatility(7);
      
      const state: ParameterState = {
        marketRegime: trade.marketRegime as any,
        accountSize: trade.accountSize as any,
        recentWinRate,
        recentVolatility
      };
      
      // Get action (reconstruct parameters used)
      const action: TradingParameters = {
        confidenceThreshold: trade.confidence,
        rrRatio: trade.pnlPercent > 0 ? trade.pnlPercent / trade.riskPercent : 2.0,
        positionSizePercent: trade.riskPercent * 100,
        stopLossPercent: trade.riskPercent * 100,
        takeProfitPercent: trade.pnlPercent > 0 ? trade.pnlPercent : 6.0
      };
      
      // Learn from outcome
      await rlParameterOptimizer.learnFromTrade(state, action, reward);
      
      // Update config after learning
      await this.updateConfig();
      
      logger.info('🧠 RL learned from trade outcome', {
        context: 'DynamicConfigService',
        data: {
          reward: reward.toFixed(2),
          pnl: trade.pnlPercent.toFixed(2) + '%',
          marketRegime: trade.marketRegime
        }
      });
    } catch (error) {
      logger.error('Failed to record trade outcome for RL', error as Error, {
        context: 'DynamicConfigService'
      });
    }
  }

  /**
   * Get current configuration summary
   */
  getConfigSummary(): {
    config: DynamicConfig | null;
    rlStats: any;
  } {
    return {
      config: this.currentConfig,
      rlStats: rlParameterOptimizer.getStatistics()
    };
  }
}

// Export singleton instance
const globalForDynamicConfig = globalThis as unknown as {
  dynamicConfigService: DynamicConfigService | undefined;
};

export const dynamicConfigService = globalForDynamicConfig.dynamicConfigService || new DynamicConfigService();

if (process.env.NODE_ENV !== 'production') {
  globalForDynamicConfig.dynamicConfigService = dynamicConfigService;
}

