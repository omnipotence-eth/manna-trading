'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function Positions() {
  // Get real positions from store (populated by Aster DEX API)
  const positions = useStore((state) => state.positions);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-6 gap-8 text-sm text-green-500/60 pb-4 border-b border-green-500/30 font-semibold uppercase tracking-wide">
        <div className="pl-3">SYMBOL</div>
        <div className="pl-2">SIDE</div>
        <div className="text-right pr-3">SIZE</div>
        <div className="text-right pr-3">ENTRY</div>
        <div className="text-right pr-3">CURRENT</div>
        <div className="text-right pr-3">PNL</div>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-12 text-green-500/60">
          <div className="text-4xl mb-3">💤</div>
          <div className="font-semibold mb-1 text-base">No open positions</div>
          <div className="text-xs opacity-60">Godspeed will open positions when opportunities arise</div>
        </div>
      ) : (
        positions.map((position, index) => (
          <motion.div
            key={position.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="grid grid-cols-6 gap-8 text-lg p-6 border border-green-500/20 hover:border-green-500/40 transition-all rounded bg-black/20"
          >
            <div className="font-bold pl-3">{position.symbol}</div>
            <div className={`font-bold pl-2 ${position.side === 'LONG' ? 'text-neon-green' : 'text-red-500'}`}>
              {position.side}
            </div>
            <div className="text-right pr-3 tabular-nums">{position.size.toFixed(4)}</div>
            <div className="text-right pr-3 tabular-nums">${position.entryPrice.toFixed(2)}</div>
            <div className="text-right pr-3 tabular-nums">${position.currentPrice.toFixed(2)}</div>
            <div className={`text-right font-bold pr-3 tabular-nums ${position.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
              {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
              <div className="text-base opacity-80 mt-1.5">
                {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}

