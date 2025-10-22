'use client';

import { motion } from 'framer-motion';

interface RiskManagementPanelProps {
  balance: number;
  peakBalance: number;
  openPositions: number;
  maxPositions: number;
  portfolioRisk: number;
  maxDrawdown: number;
}

export default function RiskManagementPanel({
  balance,
  peakBalance,
  openPositions,
  maxPositions,
  portfolioRisk,
  maxDrawdown,
}: RiskManagementPanelProps) {
  const currentDrawdown = ((peakBalance - balance) / peakBalance) * 100;
  const drawdownPercentUsed = (currentDrawdown / (maxDrawdown * 100)) * 100;
  const positionSlotsUsed = (openPositions / maxPositions) * 100;
  const riskPercentUsed = (portfolioRisk / 0.10) * 100; // 10% max risk

  const getStatusColor = (percent: number) => {
    if (percent < 50) return 'text-neon-green';
    if (percent < 75) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getBarColor = (percent: number) => {
    if (percent < 50) return 'bg-neon-green';
    if (percent < 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-6 rounded-lg"
    >
      <h3 className="text-lg font-bold mb-4 terminal-text flex items-center gap-2">
        <span className="text-neon-blue">🛡️</span>
        RISK MANAGEMENT
      </h3>

      <div className="space-y-4">
        {/* Drawdown Meter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-green-500/60">DRAWDOWN</span>
            <span className={`text-xs font-bold ${getStatusColor(drawdownPercentUsed)}`}>
              {currentDrawdown.toFixed(1)}% / {(maxDrawdown * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-green-500/20 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBarColor(drawdownPercentUsed)} transition-all duration-500`}
              style={{ width: `${Math.min(drawdownPercentUsed, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Position Slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-green-500/60">POSITION SLOTS</span>
            <span className={`text-xs font-bold ${getStatusColor(positionSlotsUsed)}`}>
              {openPositions} / {maxPositions}
            </span>
          </div>
          <div className="h-2 bg-green-500/20 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBarColor(positionSlotsUsed)} transition-all duration-500`}
              style={{ width: `${Math.min(positionSlotsUsed, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Portfolio Risk */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-green-500/60">PORTFOLIO RISK</span>
            <span className={`text-xs font-bold ${getStatusColor(riskPercentUsed)}`}>
              {(portfolioRisk * 100).toFixed(1)}% / 10.0%
            </span>
          </div>
          <div className="h-2 bg-green-500/20 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBarColor(riskPercentUsed)} transition-all duration-500`}
              style={{ width: `${Math.min(riskPercentUsed, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Risk Stats */}
        <div className="pt-3 border-t border-green-500/30 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-green-500/60">Peak Balance:</span>
            <span className="text-neon-green font-mono">${peakBalance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Current Balance:</span>
            <span className="text-green-500 font-mono">${balance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Max Risk/Trade:</span>
            <span className="text-neon-green font-mono font-bold">5%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Max Position:</span>
            <span className="text-neon-green font-mono font-bold">30%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Stop Loss:</span>
            <span className="text-green-500 font-mono">3%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-500/60">Take Profit:</span>
            <span className="text-neon-green font-mono">6%</span>
          </div>
        </div>

        {/* Warning if approaching limits */}
        {(drawdownPercentUsed > 75 || positionSlotsUsed > 75 || riskPercentUsed > 75) && (
          <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <div className="text-yellow-500 text-xs font-bold mb-1">⚠️ APPROACHING LIMITS</div>
            <div className="text-yellow-500/80 text-xs">
              Risk management will prevent new trades if limits are exceeded.
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

