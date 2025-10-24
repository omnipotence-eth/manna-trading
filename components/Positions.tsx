'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function Positions() {
  // Get real positions from store (populated by Aster DEX API)
  const positions = useStore((state) => state.positions);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2 text-xs text-green-500/60 pb-2 border-b border-green-500/30">
        <div>MODEL</div>
        <div>SYMBOL</div>
        <div>SIDE</div>
        <div>SIZE</div>
        <div>ENTRY</div>
        <div>CURRENT</div>
        <div>PNL</div>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-8 text-green-500/60">
          No open positions. DeepSeek R1 will open positions when opportunities arise.
        </div>
      ) : (
        positions.map((position, index) => (
          <motion.div
            key={position.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="grid grid-cols-7 gap-2 text-xs p-2 border border-green-500/20 hover:border-green-500/40 transition-all"
          >
            <div className="text-neon-blue">{position.model}</div>
            <div>{position.symbol}</div>
            <div className={position.side === 'LONG' ? 'text-neon-green' : 'text-red-500'}>
              {position.side}
            </div>
            <div>{position.size.toFixed(4)}</div>
            <div>${position.entryPrice.toFixed(2)}</div>
            <div>${position.currentPrice.toFixed(2)}</div>
            <div className={position.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}>
              ${position.pnl.toFixed(2)} ({position.pnlPercent.toFixed(2)}%)
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}

