'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { frontendLogger } from '@/lib/frontendLogger';
import Positions from './Positions';
import LiveBalanceChart from './LiveBalanceChart';
import AgentInsights from './AgentInsights';

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
  duration?: number;
}

interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  avgDuration: number;
  bestTrade: number;
  worstTrade: number;
}

// Info Tab Component with Real Trade Data
function InfoTab() {
  const [tradeData, setTradeData] = useState<{
    trades: Trade[];
    stats: {
      totalTrades: number;
      wins: number;
      losses: number;
      winRate: number;
      totalPnL: number;
      avgPnL: number;
      avgDuration: number;
      bestTrade: number;
      worstTrade: number;
    };
    loading: boolean;
    lastUpdate: Date | null;
  }>({
    trades: [],
    stats: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
    },
    loading: true,
    lastUpdate: null,
  });

  const accountValue = useStore((state) => state.accountValue);
  const positions = useStore((state) => state.positions);
  const [config, setConfig] = useState<{ stopLoss: number; takeProfit: number; scanInterval: number } | null>(null);
  const [infrastructure, setInfrastructure] = useState<{
    database: string;
    websocket: string;
    apiKeys: string;
  } | null>(null);
  const [whyNoTrades, setWhyNoTrades] = useState<{
    message: string;
    runner?: { isRunning: boolean; activeWorkflowCount: number; config?: { intervalMinutes: number; enabled: boolean; symbolsCount: number } };
    lastCycleDiagnostic?: { at: string; hadOpportunities: boolean; reason?: string; totalOpportunities: number; minScoreUsed: number; confidenceThresholdUsed: number } | null;
    strategySummary?: Record<string, unknown>;
  } | null>(null);

  // Fetch real trade data from database and config
  useEffect(() => {
    const fetchTradeData = async () => {
      try {
        const response = await fetch('/api/trades?limit=100&days=30', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Recalculate stats from actual trades to ensure accuracy
            const trades = data.trades || [];
            const calculatedStats = {
              totalTrades: trades.length,
              wins: trades.filter((t: any) => (t.pnl ?? 0) > 0).length,
              losses: trades.filter((t: any) => (t.pnl ?? 0) < 0).length,
              winRate: trades.length > 0 
                ? (trades.filter((t: any) => (t.pnl ?? 0) > 0).length / trades.length) * 100 
                : 0,
              totalPnL: trades.reduce((sum: number, t: any) => sum + (Number(t.pnl) || 0), 0),
              avgPnL: trades.length > 0 
                ? trades.reduce((sum: number, t: any) => sum + (Number(t.pnl) || 0), 0) / trades.length 
                : 0,
              avgDuration: trades.length > 0 && trades.some((t: any) => t.duration)
                ? Math.floor(trades.reduce((sum: number, t: any) => sum + (Number(t.duration) || 0), 0) / trades.length / 60)
                : 0,
              bestTrade: trades.length > 0 
                ? Math.max(...trades.map((t: any) => Number(t.pnl) || 0), 0) 
                : 0,
              worstTrade: trades.length > 0 
                ? Math.min(...trades.map((t: any) => Number(t.pnl) || 0), 0) 
                : 0,
            };
            
            setTradeData({
              trades: trades,
              stats: calculatedStats,
              loading: false,
              lastUpdate: new Date(),
            });
          } else {
            // If API returns unsuccessful, still set loading to false
            setTradeData(prev => ({ ...prev, loading: false }));
          }
        } else {
          setTradeData(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        frontendLogger.error('[InfoTab] Failed to fetch trades', error instanceof Error ? error : new Error(String(error)), {
          component: 'InfoTab',
          action: 'fetchTradeData',
        });
        setTradeData(prev => ({ ...prev, loading: false }));
      }
    };

    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/trading-status', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.config) {
            setConfig({
              stopLoss: data.data.config.stopLoss || 4.0,
              takeProfit: data.data.config.takeProfit || 12.0,
              scanInterval: data.data.config.scanInterval || 60,
            });
          }
        }
      } catch { /* silent */ }
    };

    const fetchInfrastructure = async () => {
      try {
        const res = await fetch('/api/health', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.health) {
            setInfrastructure({
              database: data.health.database === 'connected' ? 'PostgreSQL' : 
                       data.health.database === 'skipped' ? 'Not Configured' : 'Disconnected',
              websocket: data.health.websocket === 'connected' ? 'Connected' : 'Disconnected',
              apiKeys: data.health.exchange === 'available' ? 'Active' : 'Not Configured',
            });
          }
        }
      } catch { 
        // Fallback to default values if health check fails
        setInfrastructure({
          database: 'Unknown',
          websocket: 'Unknown',
          apiKeys: 'Unknown',
        });
      }
    };

    const fetchWhyNoTrades = async () => {
      try {
        const res = await fetch('/api/diagnostics/why-no-trades', { headers: { 'Cache-Control': 'no-cache' } });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.message) {
            setWhyNoTrades({
              message: data.message,
              runner: data.runner,
              lastCycleDiagnostic: data.lastCycleDiagnostic ?? null,
              strategySummary: data.strategySummary ?? {},
            });
          }
        }
      } catch { /* ignore */ }
    };

    fetchTradeData();
    fetchConfig();
    fetchInfrastructure();
    fetchWhyNoTrades();
    const interval = setInterval(() => {
      fetchTradeData();
      fetchInfrastructure();
      fetchWhyNoTrades();
    }, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Calculate current positions P&L
  const currentPnL = useMemo(() => {
    return positions.reduce((sum, pos) => sum + (Number(pos.pnl) || 0), 0);
  }, [positions]);

  // Calculate total P&L (realized from trades + unrealized from positions)
  // Add null checks to prevent errors when stats are not yet loaded
  const totalPnL = (tradeData.stats?.totalPnL ?? 0) + (currentPnL ?? 0);
  const totalPnLPercent = accountValue > 0 ? (totalPnL / accountValue) * 100 : 0;

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  if (tradeData.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-[#00ff88] rounded-full mx-auto mb-3" />
          <p className="text-[12px] text-[#666]">Loading trade data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-3 p-3">
      {/* Bloomberg-style Performance Header */}
      <div className="border-b border-white/[0.05] pb-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-mono text-[#555] uppercase tracking-wider">Performance</h3>
          {tradeData.lastUpdate && (
            <span className="text-[9px] text-[#444] font-mono">
              {tradeData.lastUpdate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Performance Stats - Bloomberg Grid */}
      <div className="space-y-2">
        <div className="border border-white/[0.05] bg-[#0a0a0a] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Total P&L</div>
              <div className={`text-[12px] font-mono font-semibold tabular-nums ${(totalPnL ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {(totalPnL ?? 0) >= 0 ? '+' : ''}${(totalPnL ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">P&L %</div>
              <div className={`text-[12px] font-mono font-semibold tabular-nums ${(totalPnLPercent ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {(totalPnLPercent ?? 0) >= 0 ? '+' : ''}{(totalPnLPercent ?? 0).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Realized</div>
              <div className={`text-[11px] font-mono tabular-nums ${(tradeData.stats?.totalPnL ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {(tradeData.stats?.totalPnL ?? 0) >= 0 ? '+' : ''}${(tradeData.stats?.totalPnL ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Unrealized</div>
              <div className={`text-[11px] font-mono tabular-nums ${(currentPnL ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {(currentPnL ?? 0) >= 0 ? '+' : ''}${(currentPnL ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Win Rate</div>
              <div className="text-[11px] font-mono tabular-nums text-white">
                {(tradeData.stats?.totalTrades ?? 0) > 0 
                  ? `${(tradeData.stats?.winRate ?? 0).toFixed(1)}%` 
                  : '—'
                }
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Trades</div>
              <div className="text-[11px] font-mono tabular-nums text-white">{tradeData.stats?.totalTrades ?? 0}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Wins</div>
              <div className="text-[11px] font-mono tabular-nums text-[#00ff88]">{tradeData.stats?.wins ?? 0}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Losses</div>
              <div className="text-[11px] font-mono tabular-nums text-[#ff4444]">{tradeData.stats?.losses ?? 0}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Avg P&L</div>
              <div className={`text-[11px] font-mono tabular-nums ${(tradeData.stats?.avgPnL ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {(tradeData.stats?.avgPnL ?? 0) >= 0 ? '+' : ''}${(tradeData.stats?.avgPnL ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Best</div>
              <div className="text-[11px] font-mono tabular-nums text-[#00ff88]">
                +${(tradeData.stats?.bestTrade ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Worst</div>
              <div className="text-[11px] font-mono tabular-nums text-[#ff4444]">
                ${(tradeData.stats?.worstTrade ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Avg Duration</div>
              <div className="text-[11px] font-mono tabular-nums text-white">
                {tradeData.stats.avgDuration > 0 ? `${tradeData.stats.avgDuration}m` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Trades - Bloomberg Style */}
      <div className="space-y-2">
        <div className="border-b border-white/[0.05] pb-1">
          <h3 className="text-[10px] font-mono text-[#555] uppercase tracking-wider">Trade History</h3>
        </div>
        <div className="border border-white/[0.05] bg-[#0a0a0a] p-2">
          {tradeData.trades.length === 0 ? (
            <div className="text-center py-8 text-[#555] text-[10px] font-mono">No trades</div>
          ) : (
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {tradeData.trades.slice(0, 20).map((trade: any) => (
                <motion.div
                  key={trade.id}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-2 border border-white/[0.03] bg-[#0a0a0a] hover:bg-[#0f0f0f] hover:border-white/[0.06] transition-all rounded"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-1 h-1 rounded-full ${(trade.pnl ?? 0) >= 0 ? 'bg-[#00ff88]' : 'bg-[#ff4444]'}`} />
                      <span className="text-[10px] font-mono font-semibold text-white">{trade.symbol}</span>
                      <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${
                        trade.side === 'LONG' 
                          ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' 
                          : 'bg-[#ff4444]/10 text-[#ff4444] border border-[#ff4444]/20'
                      }`}>
                        {trade.side}
                      </span>
                      {trade.leverage && (
                        <span className="text-[8px] text-[#555] font-mono">{trade.leverage}x</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-[11px] font-mono font-semibold tabular-nums ${(trade.pnl ?? 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                        {(trade.pnl ?? 0) >= 0 ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
                      </div>
                      {trade.pnlPercent && (
                        <div className={`text-[9px] font-mono tabular-nums ${(trade.pnlPercent ?? 0) >= 0 ? 'text-[#00ff88]/70' : 'text-[#ff4444]/70'}`}>
                          {(trade.pnlPercent ?? 0) >= 0 ? '+' : ''}{(trade.pnlPercent ?? 0).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[8px] text-[#666] font-mono">
                    <div className="flex items-center gap-2">
                      <span>E: ${(trade.entryPrice ?? 0).toFixed(4)}</span>
                      {trade.exitPrice != null && (
                        <span>X: ${(Number(trade.exitPrice) || 0).toFixed(4)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {trade.duration && (
                        <span>{formatDuration(trade.duration)}</span>
                      )}
                      <span>{formatTime(trade.timestamp)}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Risk Management - Bloomberg Style */}
      <div className="space-y-2">
        <div className="border-b border-white/[0.05] pb-1">
          <h3 className="text-[10px] font-mono text-[#555] uppercase tracking-wider">Risk Parameters</h3>
        </div>
        <div className="border border-white/[0.05] bg-[#0a0a0a] p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Stop Loss</div>
              <div className="text-[11px] text-[#ff4444] font-mono tabular-nums">
                -{config?.stopLoss ? config.stopLoss.toFixed(1) : '4.0'}%
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Take Profit</div>
              <div className="text-[11px] text-[#00ff88] font-mono tabular-nums">
                +{config?.takeProfit ? config.takeProfit.toFixed(1) : '12.0'}%
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">R:R Ratio</div>
              <div className="text-[11px] text-white font-mono tabular-nums">
                {config?.stopLoss && config?.takeProfit 
                  ? (config.takeProfit / config.stopLoss).toFixed(1) 
                  : '3.0'}:1
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Positions</div>
              <div className="text-[11px] text-white font-mono tabular-nums">
                {positions.length} / 2
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Status - Bloomberg Style */}
      <div className="space-y-2">
        <div className="border-b border-white/[0.05] pb-1">
          <h3 className="text-[10px] font-mono text-[#555] uppercase tracking-wider">System Status</h3>
        </div>
        <div className="border border-white/[0.05] bg-[#0a0a0a] p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Status</div>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-[#00ff88] rounded-full animate-pulse" />
                <span className="text-[11px] text-[#00ff88] font-mono">Active</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Trading Mode</div>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-yellow-400 rounded-full" />
                <span className="text-[11px] text-yellow-400 font-mono">SIMULATION</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">AI Model</div>
              <div className="text-[11px] text-white font-mono">DeepSeek R1 14B</div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Exchange</div>
              <div className="text-[11px] text-white font-mono">Aster DEX</div>
            </div>
            <div>
              <div className="text-[9px] text-[#555] font-mono mb-0.5">Scan Rate</div>
              <div className="text-[11px] text-white font-mono tabular-nums">
                {config?.scanInterval ? `${config.scanInterval}s` : '60s'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why no trades? / Strategy summary */}
      {whyNoTrades && (
        <div className="space-y-2">
          <div className="border-b border-white/[0.05] pb-1">
            <h3 className="text-[10px] font-mono text-[#555] uppercase tracking-wider">Why no trades? / Strategy</h3>
          </div>
          <div className="border border-white/[0.05] bg-[#0a0a0a] p-3 space-y-2">
            <p className="text-[11px] text-[#aaa] font-mono">{whyNoTrades.message}</p>
            {whyNoTrades.runner && (
              <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-[#666]">
                <span>Runner: {whyNoTrades.runner.isRunning ? 'Running' : 'Stopped'}</span>
                <span>Workflows: {whyNoTrades.runner.activeWorkflowCount}</span>
                {whyNoTrades.runner.config && (
                  <>
                    <span>Interval: {whyNoTrades.runner.config.intervalMinutes}m</span>
                    <span>Symbols: {whyNoTrades.runner.config.symbolsCount ?? 0}</span>
                  </>
                )}
              </div>
            )}
            {whyNoTrades.strategySummary && Object.keys(whyNoTrades.strategySummary).length > 0 && (
              <div className="pt-1 border-t border-white/[0.04] grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-mono text-[#555]">
                {Object.entries(whyNoTrades.strategySummary).map(([k, v]) => (
                  <span key={k}>{k.replace(/([A-Z])/g, ' $1').trim()}: {String(v)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Infrastructure */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Infrastructure</h3>
        <div className="rounded-lg bg-[#0f0f0f] border border-white/[0.06] p-3 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#888]">API Keys</span>
            <span className={`text-[12px] ${
              infrastructure?.apiKeys === 'Active' ? 'text-[#00ff88]' : 
              infrastructure?.apiKeys === 'Not Configured' ? 'text-[#ff4444]' : 
              'text-[#888]'
            }`}>
              {infrastructure?.apiKeys || 'Checking...'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#888]">WebSocket</span>
            <span className={`text-[12px] ${
              infrastructure?.websocket === 'Connected' ? 'text-[#00ff88]' : 
              infrastructure?.websocket === 'Disconnected' ? 'text-[#ff4444]' : 
              'text-[#888]'
            }`}>
              {infrastructure?.websocket || 'Checking...'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[#888]">Database</span>
            <span className={`text-[12px] ${
              infrastructure?.database === 'PostgreSQL' ? 'text-[#00ff88]' : 
              infrastructure?.database === 'Not Configured' ? 'text-[#666]' : 
              'text-[#ff4444]'
            }`}>
              {infrastructure?.database || 'Checking...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NOF1Dashboard() {
  const [activeTab, setActiveTab] = useState<'positions' | 'activity' | 'settings'>('positions');
  const accountValue = useStore((state) => state.accountValue);
  const positions = useStore((state) => state.positions);
  const trades = useStore((state) => state.trades);
  const setAccountValue = useStore((state) => state.setAccountValue);
  const updatePosition = useStore((state) => state.updatePosition);
  const addTrade = useStore((state) => state.addTrade);
  const clearOldTrades = useStore((state) => state.clearOldTrades);
  const addModelMessage = useStore((state) => state.addModelMessage);
  const initRef = useRef(false);
  const removePosition = useStore((state) => state.removePosition);
  const [isSimulationMode, setIsSimulationMode] = useState<boolean | null>(null);

  // Fetch real config from API
  const [config, setConfig] = useState<{ stopLoss: number; takeProfit: number; scanInterval: number } | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const updateData = async () => {
      try {
        // CRITICAL: Only fetch from exchange API for accurate data
        // The /api/positions endpoint (local monitor) often has stale data
        const optimizedResponse = await fetch('/api/optimized-data', { 
          headers: { 'Cache-Control': 'no-cache' } 
        });
        
        const activePositionIds = new Set<string>();
        
        if (optimizedResponse.ok) {
          const data = await optimizedResponse.json();
          if (data.success) {
            const newValue = data.data.accountValue;
            // Prevent glitch: don't overwrite a positive account value with 0 (stale/error responses)
            const current = useStore.getState().accountValue;
            if (typeof newValue === 'number' && (newValue > 0 || current <= 0)) {
              frontendLogger.debug('[Dashboard] Account value updated', {
                component: 'NOF1Dashboard',
                action: 'updateData',
                data: { accountValue: newValue },
              });
              setAccountValue(newValue);
            }
            
            if (data.data.positions?.length > 0) {
              interface PositionData {
                symbol: string;
                side?: 'LONG' | 'SHORT';
                positionAmt?: string | number;
                size?: string | number;
                entryPrice: string | number;
                unRealizedProfit?: string | number;
                unrealizedPnl?: string | number;
                pnl?: string | number;
                leverage?: string | number;
                markPrice?: string | number;
                currentPrice?: string | number;
              }

              data.data.positions.forEach((p: PositionData) => {
                let positionAmt = 0;
                if (typeof p.positionAmt === 'string') {
                  positionAmt = parseFloat(p.positionAmt);
                } else if (typeof p.size === 'number') {
                  positionAmt = p.side === 'LONG' ? p.size : -p.size;
                } else if (typeof p.size === 'string') {
                  positionAmt = parseFloat(p.size);
                }
                
                const entryPrice = parseFloat(String(p.entryPrice)) || 0;
                const unrealizedPnl = parseFloat(String(p.unRealizedProfit || p.unrealizedPnl || p.pnl || '0'));
                const leverage = parseInt(String(p.leverage || '1'), 10);
                const markPrice = parseFloat(String(p.markPrice || p.currentPrice || entryPrice)) || entryPrice;
                const size = Math.abs(positionAmt);
                
                if (size === 0) return;
                
                // CRITICAL FIX: Calculate PnL% correctly based on position direction and leverage
                // For LONG: profit when price goes UP -> ((current - entry) / entry) * 100 * leverage
                // For SHORT: profit when price goes DOWN -> ((entry - current) / entry) * 100 * leverage
                const side = p.side || (positionAmt >= 0 ? 'LONG' : 'SHORT');
                let pnlPercent = 0;
                
                // If markPrice differs from entryPrice, calculate from price difference
                if (entryPrice > 0 && Math.abs(markPrice - entryPrice) > 0.0001) {
                  if (side === 'LONG') {
                    pnlPercent = ((markPrice - entryPrice) / entryPrice) * 100 * leverage;
                  } else {
                    pnlPercent = ((entryPrice - markPrice) / entryPrice) * 100 * leverage;
                  }
                } 
                // Fallback: Calculate from P&L value if prices are same but P&L exists
                else if (unrealizedPnl !== 0 && size > 0 && entryPrice > 0) {
                  const notionalValue = entryPrice * size;
                  pnlPercent = (unrealizedPnl / notionalValue) * 100;
                }
                
                // Use symbol + side as unique ID to prevent duplicates
                const posId = `${p.symbol}_${side}`;
                activePositionIds.add(posId);
                
                updatePosition({
                  id: posId,
                  symbol: p.symbol,
                  side: side,
                  size: size,
                  entryPrice: entryPrice,
                  currentPrice: markPrice,
                  pnl: unrealizedPnl,
                  pnlPercent: pnlPercent,
                  model: 'DeepSeek R1',
                  leverage: leverage,
                });
              });
            }
          }
        }
        
        // Clean up positions that are no longer active on exchange
        const currentPositions = useStore.getState().positions;
        currentPositions.forEach((pos) => {
          if (!activePositionIds.has(pos.id)) {
            removePosition(pos.id);
          }
        });
      } catch (error) {
        frontendLogger.error('[Dashboard] Error updating data', error instanceof Error ? error : new Error(String(error)), {
          component: 'NOF1Dashboard',
          action: 'updateData',
        });
      }
    };

    // Also fetch config
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/trading-status');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.config) {
            setConfig({
              stopLoss: data.data.config.stopLoss || 4.0,
              takeProfit: data.data.config.takeProfit || 12.0,
              scanInterval: data.data.config.scanInterval || 60,
            });
          }
          // Check simulation mode status
          if (data.success && data.data?.simulationMode !== undefined) {
            setIsSimulationMode(data.data.simulationMode);
          }
        }
      } catch { /* silent */ }
    };

    updateData();
    fetchConfig();
    
    const dataInterval = setInterval(updateData, 2000);

    const runTradingCycle = async () => {
      try {
        await fetch('/api/test-cron', { method: 'GET' });
      } catch { /* silent */ }
    };

    const initTrading = async () => {
      try {
        const response = await fetch('/api/startup?action=status');
        const data = await response.json();
        if (!data.data?.status?.initialized) {
          await fetch('/api/startup?action=initialize');
        }
      } catch { /* silent */ }
      runTradingCycle();
    };
    
    initTrading();
    const tradingInterval = setInterval(runTradingCycle, 30000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(tradingInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAccountValue, updatePosition, removePosition, addTrade, addModelMessage, clearOldTrades]);

  const pnl = useMemo(() => {
    const total = positions.reduce((sum, pos) => sum + (Number(pos.pnl) || 0), 0);
    const percent = accountValue > 0 ? (total / accountValue) * 100 : 0;
    return { total, percent };
  }, [positions, accountValue]);

  // Get actual exchange position count from the store
  const actualPositionCount = positions.length;

  const tabs = [
    { id: 'positions' as const, label: 'Positions', count: actualPositionCount },
    { id: 'activity' as const, label: 'Insights' },
    { id: 'settings' as const, label: 'Info' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Simulation Mode Banner */}
      {isSimulationMode === true && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-yellow-500/20 via-yellow-400/20 to-yellow-500/20 border-b border-yellow-400/30 px-6 py-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <div>
                <div className="text-sm font-semibold text-yellow-400 font-mono">SIMULATION MODE ACTIVE</div>
                <div className="text-xs text-yellow-400/70 font-mono">All trades are simulated - No real funds at risk. Data logged for ML/LLM training.</div>
              </div>
            </div>
            <div className="text-xs text-yellow-400/50 font-mono">
              Portfolio Demo Mode
            </div>
          </div>
        </motion.div>
      )}
      
      <div className="h-full flex flex-1">
        {/* Main Chart Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Value Display - Vercel Style */}
          <div className="px-6 py-5 border-b border-white/[0.05]">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-4">
                <span className="text-[42px] font-semibold tracking-tight tabular text-white">
                  ${accountValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-sm font-medium tabular px-2 py-1 rounded ${
                  pnl.total >= 0 
                    ? 'text-[#00ff88] bg-[#00ff88]/10' 
                    : 'text-[#ff4444] bg-[#ff4444]/10'
                }`}>
                  {(pnl.total ?? 0) >= 0 ? '+' : ''}{(pnl.total ?? 0).toFixed(2)} ({(pnl.percent ?? 0) >= 0 ? '+' : ''}{(pnl.percent ?? 0).toFixed(2)}%)
                </span>
              </div>
              <p className="text-[13px] text-[#666] mt-1">Portfolio Value</p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[13px] text-[#666]">Positions</div>
                <div className="text-lg font-medium text-white tabular">{positions.length}</div>
              </div>
              <div className="text-right">
                <div className="text-[13px] text-[#666]">Trades</div>
                <div className="text-lg font-medium text-white tabular">{trades.length}</div>
              </div>
            </div>
          </div>
          </div>

          {/* Chart */}
          <div className="flex-1 min-h-0 p-4">
          <div className="h-full card overflow-hidden">
            <LiveBalanceChart 
              initialBalance={accountValue}
              onBalanceUpdate={(balance) => {
                if (Math.abs(balance - accountValue) > 0.001) {
                  // Don't overwrite positive value with 0 (prevents glitch from balance stream/API errors)
                  const cur = useStore.getState().accountValue;
                  if (balance > 0 || cur <= 0) setAccountValue(balance);
                }
              }}
            />
          </div>
        </div>
        </div>

        {/* Sidebar - Vercel Style */}
        <div className="w-[340px] border-l border-white/[0.05] flex flex-col shrink-0 bg-[#0a0a0a]">
        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-white/[0.05]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-[#666] hover:text-[#888] hover:bg-[#111]'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-[11px] text-[#00ff88]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'positions' && (
              <motion.div
                key="positions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto p-3"
              >
                <Positions />
              </motion.div>
            )}
            
            {activeTab === 'activity' && (
              <motion.div
                key="insights"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <AgentInsights />
              </motion.div>
            )}
            
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-y-auto p-3"
              >
                <InfoTab />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>
      </div>
    </div>
  );
}
