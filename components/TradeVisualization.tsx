'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChartBar, Target, TrendUp, TrendDown, Money, Trophy, Warning, 
  ChartLine, Brain, Radio, X
} from 'phosphor-react';

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

export default function TradeVisualization() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'WINS' | 'LOSSES' | 'OPEN'>('ALL');
  const [sortBy, setSortBy] = useState<'time' | 'pnl' | 'size'>('time');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/trades/history');
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      // Error handling - using console for client-side component
      // Frontend logger would require additional setup
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Failed to fetch trades:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = useMemo(() => {
    let filtered = [...trades];
    
    switch (filter) {
      case 'WINS':
        filtered = filtered.filter(t => t.pnl > 0);
        break;
      case 'LOSSES':
        filtered = filtered.filter(t => t.pnl < 0);
        break;
      case 'OPEN':
        filtered = filtered.filter(t => t.status === 'OPEN');
        break;
    }
    
    switch (sortBy) {
      case 'pnl':
        filtered.sort((a, b) => b.pnl - a.pnl);
        break;
      case 'size':
        filtered.sort((a, b) => b.size - a.size);
        break;
      default:
        filtered.sort((a, b) => b.entryTime - a.entryTime);
    }
    
    return filtered;
  }, [trades, filter, sortBy]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (start: number, end: number | null) => {
    if (!end) return 'Active';
    const diff = end - start;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="glass-container p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard 
            label="Total Trades" 
            value={stats.totalTrades.toString()} 
            icon={<ChartBar size={20} weight="fill" />}
          />
          <StatCard 
            label="Win Rate" 
            value={`${(stats.winRate * 100).toFixed(1)}%`}
            icon={<Target size={20} weight="fill" />}
            color={stats.winRate >= 0.5 ? 'green' : 'red'}
          />
          <StatCard 
            label="Profit Factor" 
            value={stats.profitFactor.toFixed(2)}
            icon={<TrendUp size={20} weight="fill" />}
            color={stats.profitFactor >= 1.5 ? 'green' : stats.profitFactor >= 1 ? 'yellow' : 'red'}
          />
          <StatCard 
            label="Total P&L" 
            value={`$${stats.totalPnL.toFixed(2)}`}
            icon={stats.totalPnL >= 0 ? <Money size={20} weight="fill" /> : <TrendDown size={20} weight="fill" />}
            color={stats.totalPnL >= 0 ? 'green' : 'red'}
          />
          <StatCard 
            label="Best Trade" 
            value={`+${stats.bestTrade.toFixed(1)}%`}
            icon={<Trophy size={20} weight="fill" />}
            color="green"
          />
          <StatCard 
            label="Max Drawdown" 
            value={`${stats.maxDrawdown.toFixed(1)}%`}
            icon={<Warning size={20} weight="fill" />}
            color={stats.maxDrawdown < 10 ? 'green' : stats.maxDrawdown < 20 ? 'yellow' : 'red'}
          />
        </div>
      )}

      {/* P&L Chart */}
      <div className="glass-container p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ChartLine size={20} weight="fill" className="text-[#00ff88]" />
          Cumulative P&L
        </h3>
        <div className="h-48 relative">
          <PnLChart trades={trades.filter(t => t.status === 'CLOSED')} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          {(['ALL', 'WINS', 'LOSSES', 'OPEN'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                filter === f 
                  ? 'bg-white text-black' 
                  : 'glass-container hover:bg-white/10'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="glass-container px-4 py-2 rounded-lg text-sm bg-transparent cursor-pointer"
          >
            <option value="time" className="bg-black">Recent First</option>
            <option value="pnl" className="bg-black">Highest P&L</option>
            <option value="size" className="bg-black">Largest Size</option>
          </select>
        </div>
      </div>

      {/* Trade List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredTrades.map((trade, index) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedTrade(trade)}
              className="glass-container p-4 cursor-pointer hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                {/* Symbol & Side */}
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                    trade.side === 'LONG' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {trade.side === 'LONG' ? '↗' : '↘'}
                  </div>
                  <div>
                    <div className="font-semibold">{trade.symbol}</div>
                    <div className="text-xs text-white/50">
                      {trade.leverage}x • {formatTime(trade.entryTime)}
                    </div>
                  </div>
                </div>

                {/* Entry/Exit Prices */}
                <div className="hidden md:block text-sm">
                  <div className="text-white/70">Entry: ${trade.entryPrice.toFixed(2)}</div>
                  <div className="text-white/50">
                    Exit: {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : 'Active'}
                  </div>
                </div>

                {/* Duration */}
                <div className="hidden lg:block text-sm text-white/50">
                  {formatDuration(trade.entryTime, trade.exitTime)}
                </div>

                {/* Confidence */}
                <div className="hidden lg:block">
                  <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        trade.confidence >= 0.7 ? 'bg-emerald-500' :
                        trade.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${trade.confidence * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {(trade.confidence * 100).toFixed(0)}% conf
                  </div>
                </div>

                {/* P&L */}
                <div className={`ml-auto text-right ${
                  trade.pnl > 0 ? 'text-emerald-400' : trade.pnl < 0 ? 'text-red-400' : 'text-white/50'
                }`}>
                  <div className="font-bold text-lg">
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                  </div>
                  <div className="text-sm opacity-70">
                    {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                  </div>
                </div>

                {/* Status Badge */}
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  trade.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' :
                  trade.status === 'CLOSED' && trade.pnl > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                  trade.status === 'CLOSED' && trade.pnl < 0 ? 'bg-red-500/20 text-red-400' :
                  'bg-orange-500/20 text-orange-400'
                }`}>
                  {trade.status}
                </div>

                {/* Expand Arrow */}
                <div className="text-white/30 group-hover:text-white/60 transition-colors">
                  →
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredTrades.length === 0 && (
          <div className="glass-container p-12 text-center">
            <ChartBar size={48} weight="duotone" className="text-white/30 mx-auto mb-4" />
            <div className="text-white/50">No trades found</div>
          </div>
        )}
      </div>

      {/* Trade Detail Modal */}
      <AnimatePresence>
        {selectedTrade && (
          <TradeDetailModal 
            trade={selectedTrade} 
            onClose={() => setSelectedTrade(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  color = 'white' 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode; 
  color?: 'white' | 'green' | 'red' | 'yellow' 
}) {
  const colorClasses = {
    white: 'text-white',
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400'
  };

  return (
    <motion.div 
      className="glass-container p-4"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
        <span className="text-[#00ff88]">{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {value}
      </div>
    </motion.div>
  );
}

function PnLChart({ trades }: { trades: Trade[] }) {
  const chartData = useMemo(() => {
    let cumulative = 0;
    return trades
      .sort((a, b) => a.entryTime - b.entryTime)
      .map(t => {
        cumulative += t.pnl;
        return { time: t.entryTime, pnl: cumulative, trade: t };
      });
  }, [trades]);

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-white/30">
        No closed trades yet
      </div>
    );
  }

  const maxPnL = Math.max(...chartData.map(d => d.pnl), 0);
  const minPnL = Math.min(...chartData.map(d => d.pnl), 0);
  const range = maxPnL - minPnL || 1;

  const points = chartData.map((d, i) => {
    const x = (i / (chartData.length - 1 || 1)) * 100;
    const y = 100 - ((d.pnl - minPnL) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const finalPnL = chartData[chartData.length - 1]?.pnl || 0;

  return (
    <div className="h-full w-full relative">
      {/* Zero line */}
      <div 
        className="absolute left-0 right-0 border-t border-white/10"
        style={{ top: `${100 - ((0 - minPnL) / range) * 100}%` }}
      />
      
      {/* Chart */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={finalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={finalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Area fill */}
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#pnlGradient)"
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={finalPnL >= 0 ? '#10b981' : '#ef4444'}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Labels */}
      <div className="absolute top-0 right-0 text-xs text-white/50">
        ${maxPnL.toFixed(2)}
      </div>
      <div className="absolute bottom-0 right-0 text-xs text-white/50">
        ${minPnL.toFixed(2)}
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.3, 
            ease: [0.4, 0.0, 0.2, 1]
          }}
          className="glass-container p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-xl ${
              trade.side === 'LONG' 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {trade.side === 'LONG' ? '↗' : '↘'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{trade.symbol}</h2>
              <div className="text-sm text-white/50">
                {trade.side} • {trade.leverage}x Leverage
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-lg glass-container flex items-center justify-center hover:bg-white/10 transition-all"
            aria-label="Close"
          >
            <span className="text-white/70 text-xl">×</span>
          </button>
        </div>

        {/* P&L Hero */}
        <div className={`p-6 rounded-xl mb-6 ${
          trade.pnl > 0 ? 'bg-emerald-500/10' : trade.pnl < 0 ? 'bg-red-500/10' : 'bg-white/5'
        }`}>
          <div className="text-center">
            <div className={`text-4xl font-bold ${
              trade.pnl > 0 ? 'text-emerald-400' : trade.pnl < 0 ? 'text-red-400' : 'text-white'
            }`}>
              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
            </div>
            <div className={`text-lg ${
              trade.pnlPercent > 0 ? 'text-emerald-400/70' : trade.pnlPercent < 0 ? 'text-red-400/70' : 'text-white/50'
            }`}>
              {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}% ROI
            </div>
          </div>
        </div>

        {/* Trade Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <DetailRow label="Entry Price" value={`$${trade.entryPrice.toFixed(4)}`} />
          <DetailRow label="Exit Price" value={trade.exitPrice ? `$${trade.exitPrice.toFixed(4)}` : 'Active'} />
          <DetailRow label="Position Size" value={`${trade.size.toFixed(4)}`} />
          <DetailRow label="Stop Loss" value={`$${trade.stopLoss.toFixed(4)}`} />
          <DetailRow label="Take Profit" value={`$${trade.takeProfit.toFixed(4)}`} />
          <DetailRow label="Risk/Reward" value={`${trade.riskReward.toFixed(2)}:1`} />
          <DetailRow 
            label="AI Confidence" 
            value={`${(trade.confidence * 100).toFixed(0)}%`} 
            color={trade.confidence >= 0.7 ? 'green' : trade.confidence >= 0.5 ? 'yellow' : 'red'}
          />
          <DetailRow label="Status" value={trade.status} />
        </div>

        {/* AI Reasoning */}
        <div className="glass-container p-4 mb-6">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Brain size={18} weight="fill" className="text-[#00ff88]" />
            AI Reasoning
          </h3>
          <p className="text-white/70 text-sm leading-relaxed">
            {trade.reasoning || 'No reasoning recorded for this trade.'}
          </p>
        </div>

        {/* Signals */}
        {trade.signals && trade.signals.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Radio size={18} weight="fill" className="text-[#00ff88]" />
              Entry Signals
            </h3>
            <div className="flex flex-wrap gap-2">
              {trade.signals.map((signal, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 rounded-full text-xs bg-white/10"
                >
                  {signal}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function DetailRow({ 
  label, 
  value, 
  color = 'white' 
}: { 
  label: string; 
  value: string; 
  color?: 'white' | 'green' | 'red' | 'yellow' 
}) {
  const colorClasses = {
    white: 'text-white',
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400'
  };

  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <span className="text-white/50 text-sm">{label}</span>
      <span className={`font-medium ${colorClasses[color]}`}>{value}</span>
    </div>
  );
}

