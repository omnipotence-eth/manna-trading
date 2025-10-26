'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function Positions() {
  // Get real positions from store (populated by Aster DEX API)
  const positions = useStore((state) => state.positions);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-4 text-xs text-green-500/60 pb-3 border-b border-green-500/30 font-semibold uppercase">
        <div className="pl-1">SYMBOL</div>
        <div>SIDE</div>
        <div className="text-right">SIZE</div>
        <div className="text-right">ENTRY</div>
        <div className="text-right">CURRENT</div>
        <div className="text-right">PNL</div>
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
            className="grid grid-cols-6 gap-4 text-sm p-4 border border-green-500/20 hover:border-green-500/40 transition-all rounded bg-black/20"
          >
            <div className="font-bold pl-1">{position.symbol}</div>
            <div className={position.side === 'LONG' ? 'text-neon-green font-bold' : 'text-red-500 font-bold'}>
              {position.side}
            </div>
            <div className="text-right">{position.size.toFixed(4)}</div>
            <div className="text-right">${position.entryPrice.toFixed(2)}</div>
            <div className="text-right">${position.currentPrice.toFixed(2)}</div>
            <div className={`text-right font-bold ${position.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
              {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
              <div className="text-xs opacity-75 mt-0.5">
                {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}

