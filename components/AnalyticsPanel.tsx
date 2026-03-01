'use client';

/**
 * Analytics panel – trade table, simulation stats, export (real data)
 * Used in /trading Analytics tab and /trading/analytics page
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TradeRow {
  id: string;
  timestamp: string;
  model: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  entryReason: string;
  exitReason: string;
  duration: number;
}

interface SimulationStats {
  totalTrades?: number;
  closedTrades?: number;
  openPositions?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
  totalPnL?: number;
  unrealizedPnL?: number;
  balance?: number;
  accountValue?: number;
  initialBalance?: number;
  totalReturn?: number;
}

interface AnalyticsPanelProps {
  /** If true, hide export and header (for embedding in tab) */
  embedded?: boolean;
}

export default function AnalyticsPanel({ embedded = false }: AnalyticsPanelProps) {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [tradesRes, simRes] = await Promise.all([
          fetch('/api/export?format=json&limit=200&days=30'),
          fetch('/api/simulation?action=stats'),
        ]);
        if (cancelled) return;
        if (tradesRes.ok) {
          const j = await tradesRes.json();
          if (j.success && j.data?.trades) setTrades(j.data.trades);
        }
        if (simRes.ok) {
          const j = await simRes.json();
          if (j.success && j.data) setStats(j.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleExport = () => {
    const base = typeof window !== 'undefined' ? `${window.location.origin}/api/export` : '';
    const params = new URLSearchParams({ format: exportFormat, limit: '500', days: '30' });
    window.open(`${base}?${params.toString()}`, '_blank');
  };

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <h1 className="text-lg font-semibold">Analytics & Export</h1>
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
              className="bg-[#111] border border-white/10 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExport}
              className="px-4 py-1.5 rounded bg-[#00ff88] text-black text-sm font-medium hover:opacity-90"
            >
              Export
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 flex-1">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-[#00ff88] rounded-full" />
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"
          >
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-[#666] uppercase tracking-wider">Trades</div>
              <div className="text-xl font-mono font-semibold">{trades.length}</div>
              {stats && typeof stats.closedTrades === 'number' && (
                <div className="text-[10px] text-[#555]">Sim: {stats.closedTrades} closed</div>
              )}
            </div>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-[#666] uppercase tracking-wider">Win Rate</div>
              <div className="text-xl font-mono font-semibold">{winRate.toFixed(1)}%</div>
              <div className="text-[10px] text-[#555]">{wins}W / {losses}L</div>
            </div>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-[#666] uppercase tracking-wider">Total P&L</div>
              <div className={`text-xl font-mono font-semibold ${totalPnL >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
              </div>
              {stats && typeof stats.accountValue === 'number' && (
                <div className="text-[10px] text-[#555]">Account: ${stats.accountValue.toFixed(2)}</div>
              )}
            </div>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-[#666] uppercase tracking-wider">Simulation</div>
              <div className="text-lg font-mono font-semibold">
                {stats?.accountValue != null ? `$${Number(stats.accountValue).toFixed(2)}` : '—'}
              </div>
              {stats && typeof stats.totalReturn === 'number' && (
                <div className={`text-[10px] ${stats.totalReturn >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                  {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}% return
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex-1 min-h-0 bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden flex flex-col"
          >
            <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
              <h2 className="text-xs font-medium text-[#888]">Recent Trades (real data)</h2>
              {!embedded && (
                <div className="flex items-center gap-2">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
                    className="bg-[#111] border border-white/10 rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                  <button
                    onClick={handleExport}
                    className="px-3 py-1 rounded bg-[#00ff88] text-black text-[11px] font-medium"
                  >
                    Export
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              {trades.length === 0 ? (
                <div className="p-6 text-center text-[#666] text-sm">
                  No trades yet. Simulated trades will appear here once the agent runs.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#0a0a0a] border-b border-white/10">
                    <tr className="text-[10px] text-[#666] uppercase tracking-wider">
                      <th className="px-3 py-1.5">Time</th>
                      <th className="px-3 py-1.5">Symbol</th>
                      <th className="px-3 py-1.5">Side</th>
                      <th className="px-3 py-1.5">Size</th>
                      <th className="px-3 py-1.5">Entry</th>
                      <th className="px-3 py-1.5">Exit</th>
                      <th className="px-3 py-1.5">P&L</th>
                      <th className="px-3 py-1.5">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-1.5 font-mono text-[#888]">
                          {new Date(t.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{t.symbol}</td>
                        <td className="px-3 py-1.5">{t.side}</td>
                        <td className="px-3 py-1.5 font-mono">{t.size}</td>
                        <td className="px-3 py-1.5 font-mono">{t.entryPrice.toFixed(4)}</td>
                        <td className="px-3 py-1.5 font-mono">{t.exitPrice.toFixed(4)}</td>
                        <td className={`px-3 py-1.5 font-mono ${t.pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                          {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${t.pnlPercent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                          {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
