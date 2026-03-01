/**
 * Trade History API
 * 
 * Returns detailed trade history with analytics
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  entryTime: number;
  exitTime: number | null;
  confidence: number;
  signals: string[];
  reasoning: string;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  riskReward: number;
  stopLoss: number;
  takeProfit: number;
}

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  expectancy: number;
}

export async function GET() {
  try {
    const trades: Trade[] = [];
    let stats: TradeStats | null = null;
    
    // Fetch from database
    try {
      const { db } = await import('@/lib/db');
      
      const result = await db.execute(`
        SELECT 
          id,
          symbol,
          side,
          entry_price,
          exit_price,
          quantity,
          leverage,
          pnl,
          pnl_percent,
          timestamp as entry_time,
          exit_timestamp as exit_time,
          entry_confidence,
          entry_signals,
          reasoning,
          status,
          stop_loss,
          take_profit
        FROM trades
        ORDER BY timestamp DESC
        LIMIT 100
      `);
      
      for (const row of result.rows || []) {
        const entryPrice = parseFloat(row.entry_price) || 0;
        const exitPrice = row.exit_price ? parseFloat(row.exit_price) : null;
        const stopLoss = parseFloat(row.stop_loss) || entryPrice * 0.97;
        const takeProfit = parseFloat(row.take_profit) || entryPrice * 1.06;
        
        // Calculate R:R
        const riskReward = stopLoss && takeProfit && entryPrice
          ? Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss)
          : 2;
        
        trades.push({
          id: row.id,
          symbol: row.symbol,
          side: row.side as 'LONG' | 'SHORT',
          entryPrice,
          exitPrice,
          size: parseFloat(row.quantity) || 0,
          leverage: parseInt(row.leverage) || 10,
          pnl: parseFloat(row.pnl) || 0,
          pnlPercent: parseFloat(row.pnl_percent) || 0,
          entryTime: new Date(row.entry_time).getTime(),
          exitTime: row.exit_time ? new Date(row.exit_time).getTime() : null,
          confidence: parseFloat(row.entry_confidence) || 0.5,
          signals: row.entry_signals ? JSON.parse(row.entry_signals) : [],
          reasoning: row.reasoning || '',
          status: row.status as 'OPEN' | 'CLOSED' | 'LIQUIDATED',
          riskReward,
          stopLoss,
          takeProfit
        });
      }
      
      // Calculate stats
      const closedTrades = trades.filter(t => t.status === 'CLOSED');
      const winningTrades = closedTrades.filter(t => t.pnl > 0);
      const losingTrades = closedTrades.filter(t => t.pnl < 0);
      
      const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
      
      // Calculate max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let cumPnL = 0;
      for (const trade of closedTrades.sort((a, b) => a.entryTime - b.entryTime)) {
        cumPnL += trade.pnl;
        if (cumPnL > peak) peak = cumPnL;
        const drawdown = peak > 0 ? ((peak - cumPnL) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
      
      // Calculate Sharpe ratio (simplified)
      const returns = closedTrades.map(t => t.pnlPercent);
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const stdDev = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
        : 1;
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
      
      stats = {
        totalTrades: closedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0,
        profitFactor: totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 10 : 0),
        avgWin: winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnlPercent, 0) / winningTrades.length : 0,
        avgLoss: losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnlPercent, 0) / losingTrades.length) : 0,
        bestTrade: closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnlPercent)) : 0,
        worstTrade: closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnlPercent)) : 0,
        totalPnL: closedTrades.reduce((sum, t) => sum + t.pnl, 0),
        maxDrawdown,
        sharpeRatio,
        expectancy: closedTrades.length > 0
          ? ((winningTrades.length / closedTrades.length) * (winningTrades.length > 0 ? totalWins / winningTrades.length : 0)) -
            ((losingTrades.length / closedTrades.length) * (losingTrades.length > 0 ? totalLosses / losingTrades.length : 0))
          : 0
      };
      
    } catch (dbError) {
      logger.warn('Database query failed, using empty data', {
        context: 'TradeHistoryAPI',
        error: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
    
    // If no trades, add some example data for UI
    if (trades.length === 0) {
      // No mock data - return empty for honest display
    }
    
    return NextResponse.json({
      success: true,
      trades,
      stats,
      openPositions: trades.filter(t => t.status === 'OPEN').length
    });
    
  } catch (error) {
    logger.error('Failed to get trade history', error, { context: 'TradeHistoryAPI' });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      trades: [],
      stats: null
    }, { status: 500 });
  }
}

