/**
 * In-memory trade history storage (server-side)
 * 
 * NOTE: This is a temporary solution for immediate functionality.
 * In production, you should use a real database (e.g., Vercel Postgres, MongoDB, etc.)
 * 
 * Limitations:
 * - Data is lost when Vercel serverless function cold-starts
 * - Not shared across multiple serverless function instances
 * - For production, migrate to a database
 */

interface Trade {
  id: string;
  timestamp: string;
  model: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  entryReason: string;
  entryConfidence: number;
  entrySignals: string[];
  entryMarketRegime: string;
  entryScore: string;
  exitReason: string;
  exitTimestamp: string;
  duration: number;
}

// In-memory storage (will reset on cold start, but better than nothing)
const tradeHistory: Trade[] = [];
const MAX_TRADES = 100; // Keep last 100 trades

export const tradeHistoryStore = {
  /**
   * Add a new completed trade to history
   */
  addTrade: (trade: Trade): void => {
    tradeHistory.unshift(trade); // Add to beginning
    
    // Keep only last MAX_TRADES
    if (tradeHistory.length > MAX_TRADES) {
      tradeHistory.length = MAX_TRADES;
    }
    
    console.log(`📝 Trade added to server history: ${trade.symbol} ${trade.side} | P&L: $${trade.pnl.toFixed(2)}`);
  },

  /**
   * Get all trades (most recent first)
   */
  getTrades: (): Trade[] => {
    return [...tradeHistory]; // Return a copy
  },

  /**
   * Get trades filtered by criteria
   */
  getFilteredTrades: (filter?: {
    symbol?: string;
    model?: string;
    minPnL?: number;
    maxPnL?: number;
    limit?: number;
  }): Trade[] => {
    let filtered = [...tradeHistory];

    if (filter) {
      if (filter.symbol) {
        filtered = filtered.filter(t => t.symbol === filter.symbol);
      }
      if (filter.model) {
        filtered = filtered.filter(t => t.model === filter.model);
      }
      if (filter.minPnL !== undefined) {
        filtered = filtered.filter(t => t.pnl >= filter.minPnL!);
      }
      if (filter.maxPnL !== undefined) {
        filtered = filtered.filter(t => t.pnl <= filter.maxPnL!);
      }
      if (filter.limit) {
        filtered = filtered.slice(0, filter.limit);
      }
    }

    return filtered;
  },

  /**
   * Get trade statistics
   */
  getStats: () => {
    const totalTrades = tradeHistory.length;
    const wins = tradeHistory.filter(t => t.pnl > 0).length;
    const losses = tradeHistory.filter(t => t.pnl < 0).length;
    const totalPnL = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const avgDuration = totalTrades > 0
      ? tradeHistory.reduce((sum, t) => sum + t.duration, 0) / totalTrades
      : 0;

    return {
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnL,
      avgPnL,
      avgDuration: Math.floor(avgDuration / 60), // Convert to minutes
      bestTrade: tradeHistory.length > 0
        ? Math.max(...tradeHistory.map(t => t.pnl))
        : 0,
      worstTrade: tradeHistory.length > 0
        ? Math.min(...tradeHistory.map(t => t.pnl))
        : 0,
    };
  },

  /**
   * Clear all trade history (use with caution)
   */
  clear: (): void => {
    tradeHistory.length = 0;
    console.log('🗑️ Trade history cleared');
  },
};

export default tradeHistoryStore;

