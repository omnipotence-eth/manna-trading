'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// OPTIMIZED: Memoize Positions component to prevent unnecessary re-renders
const Positions = memo(function Positions() {
  // Get real positions from store (populated by Aster DEX API)
  const positions = useStore((state) => state.positions);

  return (
    <div className="space-y-4">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-primary/60 font-semibold uppercase tracking-wider">SYMBOL</TableHead>
              <TableHead className="text-center text-xs text-primary/60 font-semibold uppercase tracking-wider">SIDE</TableHead>
              <TableHead className="text-right text-xs text-primary/60 font-semibold uppercase tracking-wider">SIZE</TableHead>
              <TableHead className="text-right text-xs text-primary/60 font-semibold uppercase tracking-wider">ENTRY</TableHead>
              <TableHead className="text-right text-xs text-primary/60 font-semibold uppercase tracking-wider">CURRENT</TableHead>
              <TableHead className="text-right text-xs text-primary/60 font-semibold uppercase tracking-wider">PNL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position, index) => {
              // Safe number parsing with fallback to 0
              const size = isNaN(position.size) ? 0 : position.size;
              const entryPrice = isNaN(position.entryPrice) ? 0 : position.entryPrice;
              const currentPrice = isNaN(position.currentPrice) ? 0 : position.currentPrice;
              const pnl = isNaN(position.pnl) ? 0 : position.pnl;
              const pnlPercent = isNaN(position.pnlPercent) ? 0 : position.pnlPercent;
              
              return (
                <motion.tr
                  key={position.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-border/20 hover:bg-accent/5 transition-colors"
                >
                  <TableCell className="font-bold">{position.symbol}</TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={position.side === 'LONG' ? "default" : "destructive"}
                      className="font-bold"
                    >
                      {position.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{size.toFixed(4)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">${entryPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">${currentPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className={`font-bold tabular-nums ${pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      <div className="text-sm">{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
                      <Badge 
                        variant={pnl >= 0 ? "default" : "destructive"}
                        className="text-xs mt-0.5"
                      >
                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                      </Badge>
                    </div>
                  </TableCell>
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
});

export default Positions;

