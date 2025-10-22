'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ModelStats {
  rank: number;
  name: string;
  totalPnL: number;
  pnlPercent: number;
  trades: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgTradeSize: number;
}

export default function Leaderboard() {
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
  const [models, setModels] = useState<ModelStats[]>([
    {
      rank: 1,
      name: 'AlphaTrader',
      totalPnL: 15420,
      pnlPercent: 45.8,
      trades: 234,
      winRate: 68.5,
      sharpeRatio: 2.4,
      maxDrawdown: -8.2,
      avgTradeSize: 1250,
    },
    {
      rank: 2,
      name: 'QuantumAI',
      totalPnL: 12890,
      pnlPercent: 38.2,
      trades: 189,
      winRate: 71.2,
      sharpeRatio: 2.1,
      maxDrawdown: -6.5,
      avgTradeSize: 1680,
    },
    {
      rank: 3,
      name: 'NeuralNet-V2',
      totalPnL: 10950,
      pnlPercent: 32.5,
      trades: 312,
      winRate: 64.8,
      sharpeRatio: 1.9,
      maxDrawdown: -11.3,
      avgTradeSize: 890,
    },
    {
      rank: 4,
      name: 'DeepMarket',
      totalPnL: 9730,
      pnlPercent: 28.9,
      trades: 156,
      winRate: 73.5,
      sharpeRatio: 2.3,
      maxDrawdown: -5.8,
      avgTradeSize: 1950,
    },
    {
      rank: 5,
      name: 'CryptoSage',
      totalPnL: 8190,
      pnlPercent: 24.3,
      trades: 278,
      winRate: 62.1,
      sharpeRatio: 1.7,
      maxDrawdown: -13.2,
      avgTradeSize: 750,
    },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setModels(prev => prev.map(model => ({
        ...model,
        totalPnL: model.totalPnL + (Math.random() - 0.4) * 100,
        pnlPercent: model.pnlPercent + (Math.random() - 0.4) * 0.5,
      })).sort((a, b) => b.totalPnL - a.totalPnL).map((model, index) => ({
        ...model,
        rank: index + 1,
      })));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold terminal-text mb-2">LEADERBOARD</h1>
          <p className="text-green-500/60 text-sm">Real-time AI model performance rankings</p>
        </div>

        <div className="flex gap-2">
          {(['24h', '7d', '30d', 'all'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 border transition-all ${
                timeframe === tf
                  ? 'border-green-500 bg-green-500/10 text-green-500'
                  : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect p-6 rounded-lg overflow-x-auto"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-500/30 text-green-500/60">
              <th className="text-left py-3 px-2">RANK</th>
              <th className="text-left py-3 px-2">MODEL</th>
              <th className="text-right py-3 px-2">TOTAL PNL</th>
              <th className="text-right py-3 px-2">PNL %</th>
              <th className="text-right py-3 px-2">TRADES</th>
              <th className="text-right py-3 px-2">WIN RATE</th>
              <th className="text-right py-3 px-2">SHARPE</th>
              <th className="text-right py-3 px-2">MAX DD</th>
              <th className="text-right py-3 px-2">AVG SIZE</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model, index) => (
              <motion.tr
                key={model.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border-b border-green-500/20 hover:bg-green-500/5 transition-all"
              >
                <td className="py-4 px-2">
                  <div className="flex items-center gap-2">
                    {model.rank <= 3 && (
                      <span className="text-xl">
                        {model.rank === 1 && '🥇'}
                        {model.rank === 2 && '🥈'}
                        {model.rank === 3 && '🥉'}
                      </span>
                    )}
                    <span className="text-neon-blue font-bold">#{model.rank}</span>
                  </div>
                </td>
                <td className="py-4 px-2">
                  <div className="text-green-500 font-bold">{model.name}</div>
                </td>
                <td className="py-4 px-2 text-right">
                  <span className="text-neon-green font-bold">
                    ${model.totalPnL.toFixed(2)}
                  </span>
                </td>
                <td className="py-4 px-2 text-right">
                  <span className="text-neon-green">
                    +{model.pnlPercent.toFixed(2)}%
                  </span>
                </td>
                <td className="py-4 px-2 text-right text-green-500">
                  {model.trades}
                </td>
                <td className="py-4 px-2 text-right text-green-500">
                  {model.winRate.toFixed(1)}%
                </td>
                <td className="py-4 px-2 text-right text-green-500">
                  {model.sharpeRatio.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-red-500">
                  {model.maxDrawdown.toFixed(2)}%
                </td>
                <td className="py-4 px-2 text-right text-green-500">
                  ${model.avgTradeSize.toFixed(0)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <div className="glass-effect p-6 rounded-lg">
          <h3 className="text-neon-blue font-bold mb-2">TOTAL VOLUME</h3>
          <div className="text-3xl font-bold terminal-text">
            ${(models.reduce((acc, m) => acc + m.trades * m.avgTradeSize, 0)).toLocaleString()}
          </div>
          <div className="text-xs text-green-500/60 mt-1">Last 24 hours</div>
        </div>

        <div className="glass-effect p-6 rounded-lg">
          <h3 className="text-neon-blue font-bold mb-2">TOTAL TRADES</h3>
          <div className="text-3xl font-bold terminal-text">
            {models.reduce((acc, m) => acc + m.trades, 0).toLocaleString()}
          </div>
          <div className="text-xs text-green-500/60 mt-1">Across all models</div>
        </div>

        <div className="glass-effect p-6 rounded-lg">
          <h3 className="text-neon-blue font-bold mb-2">AVG WIN RATE</h3>
          <div className="text-3xl font-bold terminal-text">
            {(models.reduce((acc, m) => acc + m.winRate, 0) / models.length).toFixed(1)}%
          </div>
          <div className="text-xs text-green-500/60 mt-1">Platform average</div>
        </div>
      </motion.div>
    </div>
  );
}

