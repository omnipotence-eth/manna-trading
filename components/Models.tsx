'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

interface AIModel {
  name: string;
  description: string;
  strategy: string;
  status: 'active' | 'training' | 'paused';
  performance: number;
  trades: number;
  winRate: number;
}

export default function Models() {
  const trades = useStore((state) => state.trades);
  const positions = useStore((state) => state.positions);
  const accountValue = useStore((state) => state.accountValue);
  
  // Calculate real metrics
  // All trades from database are completed (no status field needed)
  const completedTrades = trades.filter(t => !t.status || t.status === 'completed');
  const winningTrades = completedTrades.filter(t => t.pnl > 0);
  const totalPnL = completedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const performancePercent = accountValue > 0 ? (totalPnL / accountValue) * 100 : 0;
  const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
  
  const model: AIModel = {
    name: 'Godspeed',
    description: 'Advanced optimized AI trading system with RSI analysis, trend detection, volume confirmation, and multi-strategy approach. Uses professional risk management with 1:3 risk/reward ratio and dynamic leverage adjustment.',
    strategy: 'RSI + Trend Following + Mean Reversion + Breakout + Dynamic Leverage',
    status: 'active',
    performance: performancePercent,
    trades: completedTrades.length,
    winRate,
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold terminal-text mb-2">GODSPEED AI SYSTEM</h1>
              <p className="text-green-500/60 text-sm">
                Advanced AI Trading System • Maximum Leverage • Trading on Aster DEX
              </p>
      </motion.div>

      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect p-6 rounded-lg hover:border-green-500/60 transition-all"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-neon-green mb-1">{model.name}</h3>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs border border-neon-green text-neon-green">
                  {model.status.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-neon-green">
                {model.performance >= 0 ? '+' : ''}{model.performance.toFixed(2)}%
              </div>
              <div className="text-xs text-green-500/60">{model.trades} trades</div>
            </div>
          </div>

            <p className="text-green-500/80 text-sm mb-4">{model.description}</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Strategy:</span>
                <span className="text-neon-blue">{model.strategy}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Win Rate:</span>
                <span className="text-green-500">{model.winRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Open Positions:</span>
                <span className="text-neon-blue">{positions.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Account Value:</span>
                <span className="text-green-500">${accountValue.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Risk Level:</span>
                <span className="text-red-500">HYPER-AGGRESSIVE</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-green-500/60">Max Leverage:</span>
                <span className="text-green-500">MAX (20x-50x per coin)</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-green-500/30">
              <div className="text-xs text-green-500/60 text-center">
                🚀 Godspeed is actively trading • Real-time metrics updated live
              </div>
            </div>
          </motion.div>
      </div>
    </div>
  );
}

