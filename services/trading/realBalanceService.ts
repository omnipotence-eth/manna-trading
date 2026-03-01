/**
 * Real Balance Configuration Service
 * Fetches actual account balance from AsterDEX and updates trading configuration
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';
import { asterConfig } from '@/lib/configService';
import { circuitBreakers } from '@/lib/circuitBreaker';

export interface RealBalanceConfig {
  totalBalance: number;
  availableBalance: number;
  marginBalance: number;
  unrealizedPnl: number;
  lastUpdated: number;
}

class RealBalanceService {
  private balanceConfig: RealBalanceConfig | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;

  constructor() {
    logger.info('Real Balance Service initialized', { context: 'RealBalance' });
  }

  /**
   * Start automatic balance updates
   */
  async start(): Promise<void> {
    logger.info('Starting real balance monitoring', { context: 'RealBalance' });
    
    // CRITICAL FIX: Don't block initialization if balance fetch fails
    // Fetch balance immediately but don't wait if it times out
    this.updateRealBalance().catch((error) => {
      logger.warn('Initial balance fetch failed (non-critical, will retry in background)', {
        context: 'RealBalance',
        error: error instanceof Error ? error.message : String(error)
      });
    });
    
    // Update every 30 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateRealBalance();
    }, 30000);
    
    // Mark as started immediately (don't wait for first balance fetch)
    logger.info('Real balance monitoring started (background fetch in progress)', { context: 'RealBalance' });
  }

  /**
   * Stop automatic balance updates
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    logger.info('Stopped real balance monitoring', { context: 'RealBalance' });
  }

  /**
   * Update real balance from AsterDEX
   */
  async updateRealBalance(): Promise<void> {
    if (this.isUpdating) {
      logger.debug('Balance update already in progress', { context: 'RealBalance' });
      return;
    }

    this.isUpdating = true;

    try {
      logger.debug('Fetching real balance from AsterDEX', { context: 'RealBalance' });

      // OPTIMIZED: Use direct service call instead of HTTP (5x faster, no HTTP overhead)
      const accountInfo = await circuitBreakers.asterApi.execute(async () => {
        // Direct service call - no HTTP roundtrip required
        // Use the authenticatedRequest method (the actual method name in asterDexService)
        // FIXED: Use 'account' not 'fapi/v1/account' since baseUrl already includes /fapi/v1
        const data = await (asterDexService as any).authenticatedRequest('account', {}, 'GET');
        return data;
      });

      if (accountInfo) {
        this.balanceConfig = {
          totalBalance: parseFloat(accountInfo.totalWalletBalance || accountInfo.balance || 0),
          availableBalance: parseFloat(accountInfo.availableBalance || accountInfo.balance || 0),
          marginBalance: parseFloat(accountInfo.totalMarginBalance || accountInfo.totalWalletBalance || 0),
          unrealizedPnl: parseFloat(accountInfo.totalUnrealizedProfit || 0),
          lastUpdated: Date.now()
        };

        // Update trading configuration with real balance
        this.updateTradingConfig();

        logger.info('Real balance updated successfully', {
          context: 'RealBalance',
          totalBalance: this.balanceConfig.totalBalance,
          availableBalance: this.balanceConfig.availableBalance
        });
      } else {
        logger.warn('Failed to fetch account info from AsterDEX', { context: 'RealBalance' });
      }

    } catch (error) {
      logger.error('Failed to update real balance', error, { context: 'RealBalance' });
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Update trading configuration with real balance
   */
  private updateTradingConfig(): void {
    if (!this.balanceConfig) return;

    const realBalance = this.balanceConfig.availableBalance;
    
    // Update configuration values based on real balance
    const updatedConfig = {
      // Set minimum balance for trade to 1% of available balance
      minBalanceForTrade: Math.max(realBalance * 0.01, 10),
      
      // Set safety buffer to 5% of available balance
      safetyBufferPercent: 5,
      
      // Update initial capital to actual balance
      initialCapital: realBalance,
      
      // CRITICAL FIX: Confidence threshold for Chief Analyst execution
      // This checks CHIEF ANALYST confidence (from AI agents), NOT Market Scanner confidence
      // Market Scanner confidence (35%) is for filtering only
      // Chief Analyst confidence (AI decision) is for execution
      // Default: 40%, but can be lowered temporarily for testing/demo via TRADING_CONFIDENCE_THRESHOLD env var
      confidenceThreshold: asterConfig.trading.confidenceThreshold || 0.40, // Use config value (respects env var)
      
      // Adjust position sizing based on balance
      maxPositionSize: realBalance < 100 ? realBalance * 0.03 : realBalance * 0.1, // Max 3% for <$100, 10% for larger
    };

    // Update the global config (this is a simplified approach)
    Object.assign(asterConfig.trading, updatedConfig);

    logger.info('Trading configuration updated with real balance', {
      context: 'RealBalance',
      realBalance,
      updatedConfig
    });
  }

  /**
   * Get current balance configuration
   */
  getBalanceConfig(): RealBalanceConfig | null {
    return this.balanceConfig;
  }

  /**
   * Get trading configuration with real balance
   */
  getTradingConfigWithRealBalance(): any {
    if (!this.balanceConfig) {
      return asterConfig.trading;
    }

    return {
      ...asterConfig.trading,
      realBalance: this.balanceConfig.availableBalance,
      totalBalance: this.balanceConfig.totalBalance,
      marginBalance: this.balanceConfig.marginBalance,
      lastBalanceUpdate: this.balanceConfig.lastUpdated,
      // Override with real balance calculations
      minBalanceForTrade: Math.max(this.balanceConfig.availableBalance * 0.01, 10),
      initialCapital: this.balanceConfig.availableBalance,
      maxPositionSize: this.balanceConfig.availableBalance * 0.1,
    };
  }

  /**
   * Force update balance
   */
  async forceUpdate(): Promise<void> {
    logger.info('Force updating real balance', { context: 'RealBalance' });
    await this.updateRealBalance();
  }

  /**
   * Check if balance is sufficient for trading
   */
  isBalanceSufficientForTrade(minAmount?: number): boolean {
    if (!this.balanceConfig) return false;
    
    const requiredAmount = minAmount || asterConfig.trading.minBalanceForTrade;
    return this.balanceConfig.availableBalance >= requiredAmount;
  }

  /**
   * Get available balance for trading
   */
  getAvailableBalanceForTrading(): number {
    if (!this.balanceConfig) return 0;
    
    const safetyBuffer = this.balanceConfig.availableBalance * (asterConfig.trading.safetyBufferPercent / 100);
    return Math.max(0, this.balanceConfig.availableBalance - safetyBuffer);
  }

  /**
   * Calculate maximum position size based on real balance
   */
  calculateMaxPositionSize(leverage: number = 1): number {
    const availableBalance = this.getAvailableBalanceForTrading();
    return (availableBalance * leverage) * 0.1; // Max 10% of leveraged balance
  }
}

// Singleton using globalThis for Next.js compatibility
const globalForRealBalance = globalThis as typeof globalThis & {
  __realBalanceService?: RealBalanceService;
};

if (!globalForRealBalance.__realBalanceService) {
  globalForRealBalance.__realBalanceService = new RealBalanceService();
}

export const realBalanceService = globalForRealBalance.__realBalanceService;
export default realBalanceService;

