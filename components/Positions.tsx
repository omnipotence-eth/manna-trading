'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

// OPTIMIZED: Memoize Positions component to prevent unnecessary re-renders
const Positions = memo(function Positions() {
  // Get real positions from store (populated by Aster DEX API)
  const positions = useStore((state) => state.positions);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-4 text-xs text-green-500/60 pb-3 border-b border-green-500/30 font-semibold uppercase tracking-wider">
        <div className="pl-2">SYMBOL</div>
        <div className="text-center">SIDE</div>
        <div className="text-right pr-2">SIZE</div>
        <div className="text-right pr-2">ENTRY</div>
        <div className="text-right pr-2">CURRENT</div>
        <div className="text-right pr-2">PNL</div>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-12 text-green-500/60 px-4">
          <div className="text-4xl mb-3">📊</div>
          <div className="font-semibold mb-3 text-base">No Open Positions</div>
          <div className="text-xs opacity-75 space-y-2 max-w-md mx-auto">
            <div>✓ System scanning every 2 minutes</div>
            <div>✓ Waiting for high-confidence setup (≥45%)</div>
            <div>✓ Agents will auto-execute when conditions met</div>
            <div className="text-yellow-500/80 mt-3">⚠️ Add funds to start trading</div>
            <div className="text-green-500/60 text-[10px]">Recommended: $20+ for optimal trading</div>
          </div>
        </div>
      ) : (
        positions.map((position, index) => {
          // Safe number parsing with fallback to 0
          const size = isNaN(position.size) ? 0 : position.size;
          const entryPrice = isNaN(position.entryPrice) ? 0 : position.entryPrice;
          const currentPrice = isNaN(position.currentPrice) ? 0 : position.currentPrice;
          const pnl = isNaN(position.pnl) ? 0 : position.pnl;
          const pnlPercent = isNaN(position.pnlPercent) ? 0 : position.pnlPercent;
          
          return (
            <motion.div
              key={position.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="grid grid-cols-6 gap-4 text-sm p-4 border border-green-500/20 hover:border-green-500/40 transition-all rounded bg-black/20"
            >
              <div className="font-bold pl-2 truncate">{position.symbol}</div>
              <div className={`font-bold text-center ${position.side === 'LONG' ? 'text-neon-green' : 'text-red-500'}`}>
                {position.side}
              </div>
              <div className="text-right pr-2 tabular-nums text-xs">{size.toFixed(4)}</div>
              <div className="text-right pr-2 tabular-nums text-xs">${entryPrice.toFixed(2)}</div>
              <div className="text-right pr-2 tabular-nums text-xs">${currentPrice.toFixed(2)}</div>
              <div className={`text-right font-bold pr-2 tabular-nums ${pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                <div className="text-sm">{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
                <div className="text-xs opacity-70 mt-0.5">
                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                </div>
              </div>
            </motion.div>
          );
        })
  );
});

export default Positions;

