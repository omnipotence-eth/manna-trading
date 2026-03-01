/**
 * Income Tracker Service
 * Tracks all income sources (fees, funding, realized PnL) for comprehensive profit analysis
 * Per API docs: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';

export interface IncomeSummary {
  totalIncome: number;
  realizedPnL: number;
  fundingFees: number;
  commissions: number;
  transfers: number;
  bySymbol: Record<string, {
    realizedPnL: number;
    fundingFees: number;
    commissions: number;
  }>;
  byType: Record<string, number>;
  period: {
    startTime: number;
    endTime: number;
    days: number;
  };
}

class IncomeTracker {
  /**
   * Get comprehensive income summary
   * Per API docs: Returns all income sources for accurate profit tracking
   */
  async getIncomeSummary(days: number = 30): Promise<IncomeSummary> {
    try {
      const endTime = Date.now();
      const startTime = endTime - (days * 24 * 60 * 60 * 1000);
      
      const incomeHistory = await asterDexService.getIncomeHistory({
        startTime,
        endTime,
        limit: 1000
      });
      
      const summary: IncomeSummary = {
        totalIncome: 0,
        realizedPnL: 0,
        fundingFees: 0,
        commissions: 0,
        transfers: 0,
        bySymbol: {},
        byType: {},
        period: {
          startTime,
          endTime,
          days
        }
      };
      
      for (const income of incomeHistory) {
        const amount = parseFloat(income.income || '0');
        const asset = income.asset || 'USDT';
        
        // Only count USDT income for now
        if (asset === 'USDT') {
          summary.totalIncome += amount;
          
          // Categorize by type
          const type = income.incomeType || 'UNKNOWN';
          summary.byType[type] = (summary.byType[type] || 0) + amount;
          
          // Categorize by symbol
          const symbol = income.symbol || 'UNKNOWN';
          if (!summary.bySymbol[symbol]) {
            summary.bySymbol[symbol] = {
              realizedPnL: 0,
              fundingFees: 0,
              commissions: 0
            };
          }
          
          // Categorize by income type
          switch (type) {
            case 'REALIZED_PNL':
              summary.realizedPnL += amount;
              summary.bySymbol[symbol].realizedPnL += amount;
              break;
            case 'FUNDING_FEE':
              summary.fundingFees += amount;
              summary.bySymbol[symbol].fundingFees += amount;
              break;
            case 'COMMISSION':
              summary.commissions += amount;
              summary.bySymbol[symbol].commissions += amount;
              break;
            case 'TRANSFER':
              summary.transfers += amount;
              break;
          }
        }
      }
      
      logger.info('Income summary generated', {
        context: 'IncomeTracker',
        data: {
          totalIncome: summary.totalIncome.toFixed(2),
          realizedPnL: summary.realizedPnL.toFixed(2),
          fundingFees: summary.fundingFees.toFixed(2),
          commissions: summary.commissions.toFixed(2),
          symbolCount: Object.keys(summary.bySymbol).length,
          days
        }
      });
      
      return summary;
    } catch (error) {
      logger.error('Failed to generate income summary', error, {
        context: 'IncomeTracker'
      });
      
      // Return empty summary on error
      return {
        totalIncome: 0,
        realizedPnL: 0,
        fundingFees: 0,
        commissions: 0,
        transfers: 0,
        bySymbol: {},
        byType: {},
        period: {
          startTime: Date.now() - (30 * 24 * 60 * 60 * 1000),
          endTime: Date.now(),
          days: 30
        }
      };
    }
  }
  
  /**
   * Get net profit (realized PnL - fees - funding)
   */
  async getNetProfit(days: number = 30): Promise<number> {
    const summary = await this.getIncomeSummary(days);
    return summary.realizedPnL - Math.abs(summary.commissions) - Math.abs(summary.fundingFees);
  }
}

// Export singleton instance
const globalForIncomeTracker = globalThis as typeof globalThis & {
  __incomeTracker?: IncomeTracker;
};

if (!globalForIncomeTracker.__incomeTracker) {
  globalForIncomeTracker.__incomeTracker = new IncomeTracker();
}

export const incomeTracker = globalForIncomeTracker.__incomeTracker;
export default incomeTracker;

