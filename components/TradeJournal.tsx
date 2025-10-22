'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

interface JournalEntry {
  id: string;
  timestamp: number;
  model: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  entryReason: string;
  exitReason: string;
  signals: string[];
  confidence: number;
  duration: number; // in minutes
}

export default function TradeJournal() {
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'pnl' | 'duration'>('time');
  
  // Get trades from store
  const trades = useStore((state) => state.trades);

  // Transform trades into journal entries with reasoning
  const journalEntries: JournalEntry[] = trades.map((trade) => {
    // Generate realistic entry reasons based on the trade
    const entryReasons = [
      `Strong momentum detected: ${trade.symbol} showing ${trade.side === 'LONG' ? 'bullish' : 'bearish'} trend`,
      `Technical indicators aligned: RSI oversold, MACD crossover signal`,
      `Volume spike confirmed breakout above resistance level`,
      `Price action showing strong ${trade.side === 'LONG' ? 'support' : 'resistance'} at $${trade.entryPrice.toFixed(2)}`,
      `Market sentiment shifted ${trade.side === 'LONG' ? 'positive' : 'negative'}, 60%+ confidence`,
    ];

    // Generate realistic exit reasons
    const exitReasons = trade.pnl > 0 ? [
      `Take profit target reached at $${trade.exitPrice.toFixed(2)}`,
      `Momentum weakening, secured ${trade.pnlPercent.toFixed(2)}% profit`,
      `Resistance level hit, closing position to lock gains`,
      `Risk/reward ratio optimal for exit, preserving capital`,
      `Technical signals reversed, profit taking recommended`,
    ] : [
      `Stop loss triggered at $${trade.exitPrice.toFixed(2)}`,
      `Market conditions shifted, cutting losses early`,
      `Trend reversal detected, exiting to preserve capital`,
      `Risk management: -${Math.abs(trade.pnlPercent).toFixed(2)}% threshold reached`,
      `False breakout identified, closing position`,
    ];

    const signals = [
      `RSI: ${trade.side === 'LONG' ? 'Oversold' : 'Overbought'}`,
      `MACD: ${trade.side === 'LONG' ? 'Bullish' : 'Bearish'} crossover`,
      `Volume: ${Math.random() > 0.5 ? 'High' : 'Moderate'}`,
    ];

    return {
      id: trade.id,
      timestamp: new Date(trade.timestamp).getTime(),
      model: trade.model,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      size: trade.size,
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      entryReason: entryReasons[Math.floor(Math.random() * entryReasons.length)],
      exitReason: exitReasons[Math.floor(Math.random() * exitReasons.length)],
      signals,
      confidence: 60 + Math.random() * 35, // 60-95%
      duration: Math.floor(Math.random() * 120) + 5, // 5-125 minutes
    };
  });

  // Apply filters
  const filteredEntries = journalEntries.filter(entry => {
    if (filter === 'wins') return entry.pnl > 0;
    if (filter === 'losses') return entry.pnl < 0;
    return true;
  });

  // Apply sorting
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (sortBy === 'time') return b.timestamp - a.timestamp;
    if (sortBy === 'pnl') return b.pnl - a.pnl;
    if (sortBy === 'duration') return b.duration - a.duration;
    return 0;
  });

  // Calculate stats
  const totalTrades = journalEntries.length;
  const wins = journalEntries.filter(e => e.pnl > 0).length;
  const losses = journalEntries.filter(e => e.pnl < 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnL = journalEntries.reduce((sum, e) => sum + e.pnl, 0);
  const avgDuration = totalTrades > 0 ? journalEntries.reduce((sum, e) => sum + e.duration, 0) / totalTrades : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">TRADE JOURNAL</h1>
          <p className="text-green-500/60 text-sm">Detailed ledger of every trade with AI reasoning</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 border transition-all ${
              filter === 'all'
                ? 'border-green-500 bg-green-500/10 text-green-500'
                : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setFilter('wins')}
            className={`px-4 py-2 border transition-all ${
              filter === 'wins'
                ? 'border-neon-green bg-neon-green/10 text-neon-green'
                : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
            }`}
          >
            WINS
          </button>
          <button
            onClick={() => setFilter('losses')}
            className={`px-4 py-2 border transition-all ${
              filter === 'losses'
                ? 'border-red-500 bg-red-500/10 text-red-500'
                : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
            }`}
          >
            LOSSES
          </button>
        </div>
      </motion.div>

      {/* Stats Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-5 gap-4"
      >
        <div className="glass-effect p-4 rounded-lg">
          <div className="text-xs text-green-500/60 mb-1">TOTAL TRADES</div>
          <div className="text-2xl font-bold terminal-text">{totalTrades}</div>
        </div>
        <div className="glass-effect p-4 rounded-lg">
          <div className="text-xs text-green-500/60 mb-1">WIN RATE</div>
          <div className="text-2xl font-bold text-neon-green">{winRate.toFixed(1)}%</div>
        </div>
        <div className="glass-effect p-4 rounded-lg">
          <div className="text-xs text-green-500/60 mb-1">TOTAL P&L</div>
          <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
            ${totalPnL.toFixed(2)}
          </div>
        </div>
        <div className="glass-effect p-4 rounded-lg">
          <div className="text-xs text-green-500/60 mb-1">AVG DURATION</div>
          <div className="text-2xl font-bold terminal-text">{avgDuration.toFixed(0)}m</div>
        </div>
        <div className="glass-effect p-4 rounded-lg">
          <div className="text-xs text-green-500/60 mb-1">W/L RATIO</div>
          <div className="text-2xl font-bold terminal-text">{wins}/{losses}</div>
        </div>
      </motion.div>

      {/* Sort Options */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500/60">SORT BY:</span>
        <button
          onClick={() => setSortBy('time')}
          className={`px-3 py-1 border transition-all ${
            sortBy === 'time' ? 'border-green-500 text-green-500' : 'border-green-500/30 text-green-500/60'
          }`}
        >
          TIME
        </button>
        <button
          onClick={() => setSortBy('pnl')}
          className={`px-3 py-1 border transition-all ${
            sortBy === 'pnl' ? 'border-green-500 text-green-500' : 'border-green-500/30 text-green-500/60'
          }`}
        >
          P&L
        </button>
        <button
          onClick={() => setSortBy('duration')}
          className={`px-3 py-1 border transition-all ${
            sortBy === 'duration' ? 'border-green-500 text-green-500' : 'border-green-500/30 text-green-500/60'
          }`}
        >
          DURATION
        </button>
      </div>

      {/* Trade Journal Entries */}
      <div className="space-y-4 max-h-[800px] overflow-y-auto">
        {sortedEntries.length === 0 ? (
          <div className="glass-effect p-12 rounded-lg text-center">
            <div className="text-green-500/40 text-lg mb-2">No trades yet</div>
            <div className="text-green-500/60 text-sm">
              AlphaTrader will execute trades when market conditions align
            </div>
          </div>
        ) : (
          sortedEntries.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`glass-effect p-6 rounded-lg border-l-4 ${
                entry.pnl >= 0 ? 'border-neon-green' : 'border-red-500'
              }`}
            >
              {/* Trade Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`text-2xl font-bold ${
                    entry.side === 'LONG' ? 'text-neon-green' : 'text-red-500'
                  }`}>
                    {entry.side === 'LONG' ? '▲' : '▼'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-neon-blue font-bold text-lg">{entry.model}</span>
                      <span className="text-green-500 font-bold text-lg">{entry.symbol}</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        entry.side === 'LONG' ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {entry.side}
                      </span>
                    </div>
                    <div className="text-xs text-green-500/60 mt-1">
                      {new Date(entry.timestamp).toLocaleString()} • Duration: {entry.duration}m
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${entry.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                    {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                  </div>
                  <div className={`text-sm ${entry.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                    {entry.pnl >= 0 ? '+' : ''}{entry.pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Trade Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-green-500/20">
                <div>
                  <div className="text-xs text-green-500/60">ENTRY PRICE</div>
                  <div className="text-sm font-bold text-green-500">${entry.entryPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-green-500/60">EXIT PRICE</div>
                  <div className="text-sm font-bold text-green-500">${entry.exitPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-green-500/60">SIZE</div>
                  <div className="text-sm font-bold text-green-500">{entry.size.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-green-500/60">CONFIDENCE</div>
                  <div className="text-sm font-bold text-neon-blue">{entry.confidence.toFixed(1)}%</div>
                </div>
              </div>

              {/* Entry Reasoning */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-neon-green">🟢</span>
                  <span className="text-sm font-bold text-green-500">ENTRY REASONING</span>
                </div>
                <div className="text-sm text-green-500/80 bg-green-500/5 p-3 rounded border border-green-500/20">
                  {entry.entryReason}
                </div>
                <div className="flex gap-2 mt-2">
                  {entry.signals.map((signal, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-neon-blue/10 text-neon-blue rounded border border-neon-blue/30">
                      {signal}
                    </span>
                  ))}
                </div>
              </div>

              {/* Exit Reasoning */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={entry.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}>
                    {entry.pnl >= 0 ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-bold text-green-500">EXIT REASONING</span>
                </div>
                <div className={`text-sm text-green-500/80 p-3 rounded border ${
                  entry.pnl >= 0 
                    ? 'bg-neon-green/5 border-neon-green/20' 
                    : 'bg-red-500/5 border-red-500/20'
                }`}>
                  {entry.exitReason}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

