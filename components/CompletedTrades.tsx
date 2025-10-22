'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function CompletedTrades() {
  // Get real trades from store (populated by AI trading service)
  const trades = useStore((state) => state.trades);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-2 text-xs text-green-500/60 pb-2 border-b border-green-500/30">
        <div>TIME</div>
        <div>MODEL</div>
        <div>SYMBOL</div>
        <div>SIDE</div>
        <div>SIZE</div>
        <div>ENTRY</div>
        <div>EXIT</div>
        <div>PNL</div>
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="text-center py-8 text-green-500/60">
            No completed trades yet. AlphaTrader will execute when signals trigger.
          </div>
        ) : (
          trades.map((trade, index) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="grid grid-cols-8 gap-2 text-xs p-2 border border-green-500/20 hover:border-green-500/40 transition-all"
            >
              <div className="text-green-500/60">{new Date(trade.timestamp).toLocaleTimeString()}</div>
              <div className="text-neon-blue">{trade.model}</div>
              <div>{trade.symbol}</div>
              <div className={trade.side === 'LONG' ? 'text-neon-green' : 'text-red-500'}>
                {trade.side}
              </div>
              <div>{trade.size.toFixed(4)}</div>
              <div>${trade.entryPrice.toFixed(2)}</div>
              <div>${trade.exitPrice.toFixed(2)}</div>
              <div className={trade.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}>
                ${trade.pnl.toFixed(2)} ({trade.pnlPercent.toFixed(2)}%)
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

