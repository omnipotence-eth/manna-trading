/**
 * Optimized Data Service
 * Fast, cached access to account value, positions, and P&L data
 */

import { logger } from '@/lib/logger';
import { asterDexService } from '@/services/exchange/asterDexService';
import type { AsterPosition } from '@/services/exchange/asterDexService';
import { apiCache } from './apiCache';

interface PositionData {
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
}

interface AccountData {
  accountValue: number;
  availableBalance: number;
  positions: PositionData[];
  totalPnl: number;
  cacheHit: boolean;
  timestamp: number;
}

const CACHE_KEY = 'optimized:account';
const CACHE_TTL = 5; // seconds

class OptimizedDataService {
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  async getAllAccountData(): Promise<AccountData> {
    const cached = apiCache.get<AccountData>(CACHE_KEY);
    if (cached) return { ...cached, cacheHit: true };
    return this.fetchFresh();
  }

  async forceRefresh(): Promise<AccountData> {
    return this.fetchFresh();
  }

  startAutoUpdates(intervalMs: number = 3000): void {
    this.stopAutoUpdates();
    this.updateInterval = setInterval(async () => {
      try {
        await this.fetchFresh();
      } catch (error) {
        logger.error('Auto-update failed', error as Error, { context: 'OptimizedData' });
      }
    }, intervalMs);
    logger.info('Auto-updates started', { context: 'OptimizedData', data: { intervalMs } });
  }

  stopAutoUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Auto-updates stopped', { context: 'OptimizedData' });
    }
  }

  private async fetchFresh(): Promise<AccountData> {
    try {
      const [balance, positions] = await Promise.all([
        asterDexService.getBalance(),
        asterDexService.getPositions().catch((): AsterPosition[] => []),
      ]);

      const positionData: PositionData[] = positions
        .filter((p: AsterPosition) => Math.abs(p.size) > 0)
        .map((p: AsterPosition) => ({
          symbol: p.symbol,
          side: p.side,
          size: p.size,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
          pnl: p.unrealizedPnl,
          leverage: p.leverage,
        }));

      const totalPnl = positionData.reduce((sum, p) => sum + p.pnl, 0);

      const data: AccountData = {
        accountValue: (balance || 0) + totalPnl,
        availableBalance: balance || 0,
        positions: positionData,
        totalPnl,
        cacheHit: false,
        timestamp: Date.now(),
      };

      apiCache.set(CACHE_KEY, data, CACHE_TTL);
      return data;
    } catch (error) {
      logger.error('Failed to fetch account data', error as Error, { context: 'OptimizedData' });
      throw error;
    }
  }
}

const globalForService = globalThis as typeof globalThis & { __optimizedDataService?: OptimizedDataService };
if (!globalForService.__optimizedDataService) {
  globalForService.__optimizedDataService = new OptimizedDataService();
}
export const optimizedDataService = globalForService.__optimizedDataService;
