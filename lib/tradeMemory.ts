/**
 * Local file-based trade storage for development
 * Stores trades in a JSON file when database is not available
 * Data persists across server restarts
 */

import { logger } from './logger';
import { promises as fs } from 'fs';
import { join } from 'path';

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

// Local storage file path (in project root)
const STORAGE_FILE = join(process.cwd(), 'data', 'trades.json');
const MAX_TRADES = 10000; // Store up to 10,000 trades locally

// In-memory cache (loaded from file)
let trades: Trade[] = [];
let isInitialized = false;

/**
 * Load trades from file
 */
async function loadTrades(): Promise<void> {
  try {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Try to read existing file
    try {
      const fileContent = await fs.readFile(STORAGE_FILE, 'utf-8');
      trades = JSON.parse(fileContent);
      logger.info(`Loaded ${trades.length} trades from local storage`, {
        context: 'TradeMemory',
        file: STORAGE_FILE
      });
    } catch {
      // File doesn't exist yet - start with empty array
      trades = [];
      logger.info('No existing trade data found - starting fresh', {
        context: 'TradeMemory'
      });
    }
  } catch (error) {
    logger.error('Failed to load trades from file', error, { context: 'TradeMemory' });
    trades = [];
  }
}

/**
 * Save trades to file
 */
async function saveTrades(): Promise<void> {
  try {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Write to file
    await fs.writeFile(STORAGE_FILE, JSON.stringify(trades, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save trades to file', error, { context: 'TradeMemory' });
    // Don't throw - continue with in-memory storage
  }
}

export async function addTrade(trade: Trade): Promise<boolean> {
  try {
    // Ensure initialized
    if (!isInitialized) {
      await loadTrades();
      isInitialized = true;
    }

    // Check if trade already exists (prevent duplicates)
    const exists = trades.some(t => t.id === trade.id);
    if (exists) {
      logger.debug(`Trade ${trade.id} already exists - skipping`, {
        context: 'TradeMemory',
        data: { tradeId: trade.id, symbol: trade.symbol }
      });
      return true; // Return true since it's already saved
    }

    // Add to memory (at beginning for newest first)
    trades.unshift(trade);
    
    // Keep only last MAX_TRADES trades (10,000)
    if (trades.length > MAX_TRADES) {
      trades = trades.slice(0, MAX_TRADES);
    }
    
    // Save to file (async, don't await to avoid blocking)
    saveTrades().catch(err => {
      logger.error('Failed to persist trade to file (continuing with memory)', err, {
        context: 'TradeMemory'
      });
    });
    
    logger.info(`Trade saved to local storage: ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`, {
      context: 'TradeMemory',
      data: { symbol: trade.symbol, pnl: trade.pnl, pnlPercent: trade.pnlPercent, totalTrades: trades.length }
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to save trade to local storage', error, { context: 'TradeMemory' });
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
    // Ensure initialized
    if (!isInitialized) {
      await loadTrades();
      isInitialized = true;
    }

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
    logger.error('Failed to fetch trades from local storage', error, { context: 'TradeMemory' });
    return [];
  }
}

export async function getTradeStats() {
  try {
    // Ensure initialized
    if (!isInitialized) {
      await loadTrades();
      isInitialized = true;
    }

    const totalTrades = trades.length;
    if (totalTrades === 0) {
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
  try {
    // Load existing trades from file
    await loadTrades();
    isInitialized = true;
    logger.info(`Local trade storage initialized: ${trades.length} trades loaded`, {
      context: 'TradeMemory',
      file: STORAGE_FILE,
      tradeCount: trades.length
    });
    return true;
  } catch (error) {
    logger.error('Failed to initialize local trade storage', error, { context: 'TradeMemory' });
    // Continue with empty array - system will still work
    trades = [];
    isInitialized = true;
    return true;
  }
}

/**
 * Delete trades by symbol from local storage
 */
export async function deleteTradesBySymbol(symbol: string): Promise<number> {
  try {
    // Ensure initialized
    if (!isInitialized) {
      await loadTrades();
      isInitialized = true;
    }

    const symbolUpper = symbol.toUpperCase();
    const beforeCount = trades.length;
    trades = trades.filter(t => t.symbol !== symbolUpper);
    const deletedCount = beforeCount - trades.length;
    
    // Save to file after deletion
    if (deletedCount > 0) {
      await saveTrades();
    }
    
    logger.info(`Deleted ${deletedCount} trades for symbol ${symbol} from local storage`, {
      context: 'TradeMemory',
      data: { symbol, deletedCount, remainingTrades: trades.length }
    });
    
    return deletedCount;
  } catch (error) {
    logger.error('Failed to delete trades by symbol from local storage', error, { 
      context: 'TradeMemory',
      data: { symbol }
    });
    return 0;
  }
}