/**
 * In-memory trade storage for development
 * Stores trades in memory when database is not available
 */

import { logger } from './logger';

export interface Trade {
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
  createdAt?: Date;
}

// In-memory storage
let trades: Trade[] = [];

export async function addTrade(trade: Trade): Promise<boolean> {
  try {
    // Add to memory
    trades.unshift(trade); // Add to beginning
    
    // Keep only last 100 trades
    if (trades.length > 100) {
      trades = trades.slice(0, 100);
    }
    
    logger.info(`Trade saved to memory: ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`, {
      context: 'TradeMemory',
      data: { symbol: trade.symbol, pnl: trade.pnl, pnlPercent: trade.pnlPercent }
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to save trade to memory', error, { context: 'TradeMemory' });
    return false;
  }
}

export async function getTrades(filters?: {
  symbol?: string;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  try {
    let filteredTrades = [...trades];
    
    if (filters?.symbol) {
      filteredTrades = filteredTrades.filter(t => t.symbol === filters.symbol);
    }
    
    if (filters?.model) {
      filteredTrades = filteredTrades.filter(t => t.model === filters.model);
    }
    
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    
    return filteredTrades.slice(offset, offset + limit);
  } catch (error) {
    logger.error('Failed to fetch trades from memory', error, { context: 'TradeMemory' });
    return [];
  }
}

export async function getTradeStats() {
  try {
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const avgDuration = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.duration, 0) / totalTrades : 0;
    const bestTrade = Math.max(...trades.map(t => t.pnl), 0);
    const worstTrade = Math.min(...trades.map(t => t.pnl), 0);
    
    return {
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnL,
      avgPnL,
      avgDuration: Math.floor(avgDuration / 60), // Convert to minutes
      bestTrade,
      worstTrade,
    };
  } catch (error) {
    logger.error('Failed to calculate trade stats', error, { context: 'TradeMemory' });
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
    };
  }
}

export async function initializeDatabase(): Promise<boolean> {
  // No initialization needed for memory storage
  logger.info('Trade memory initialized', { context: 'TradeMemory' });
  return true;
}

/**
 * Delete trades by symbol from memory
 */
export async function deleteTradesBySymbol(symbol: string): Promise<number> {
  try {
    const symbolUpper = symbol.toUpperCase();
    const beforeCount = trades.length;
    trades = trades.filter(t => t.symbol !== symbolUpper);
    const deletedCount = beforeCount - trades.length;
    
    logger.info(`Deleted ${deletedCount} trades for symbol ${symbol} from memory`, {
      context: 'TradeMemory',
      data: { symbol, deletedCount }
    });
    
    return deletedCount;
  } catch (error) {
    logger.error('Failed to delete trades by symbol from memory', error, { 
      context: 'TradeMemory',
      data: { symbol }
    });
    return 0;
  }
}