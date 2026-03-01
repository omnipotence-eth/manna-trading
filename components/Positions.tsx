'use client';

/**
 * POSITIONS COMPONENT
 * Bloomberg Terminal-style position display with real-time data
 * Industry-standard formatting and professional design
 */

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

interface PositionData {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  notional: number;
  timestamp: number;
}

const Positions = memo(function Positions() {
  const positions = useStore((state) => state.positions);
  const [positionData, setPositionData] = useState<PositionData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Transform store positions to enriched position data
  useEffect(() => {
    const enriched = positions.map((p) => {
      const size = Number(p.size) || 0;
      const entryPrice = Number(p.entryPrice) || 0;
      const currentPrice = Number(p.currentPrice) || entryPrice;
      const leverage = Number(p.leverage) || 1;
      const notional = size * currentPrice * leverage;
      
      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side as 'LONG' | 'SHORT',
        size,
        entryPrice,
        currentPrice,
        pnl: Number(p.pnl) || 0,
        pnlPercent: Number(p.pnlPercent) || 0,
        leverage,
        notional,
        timestamp: Date.now(),
      };
    });
    
    setPositionData(enriched);
    setLastUpdate(new Date());
  }, [positions]);

  // Calculate portfolio metrics
  const totalPnL = positionData.reduce((sum, p) => sum + p.pnl, 0);
  const totalNotional = positionData.reduce((sum, p) => sum + p.notional, 0);
  const avgLeverage = positionData.length > 0
    ? positionData.reduce((sum, p) => sum + p.leverage, 0) / positionData.length
    : 0;

  if (positionData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="w-10 h-10 rounded border border-white/[0.08] bg-[#0a0a0a] flex items-center justify-center mb-3">
          <div className="w-2 h-2 bg-[#00ff88] rounded-full animate-pulse" />
        </div>
        <p className="text-[11px] text-[#666] font-mono uppercase tracking-wider">No Open Positions</p>
        <p className="text-[10px] text-[#444] mt-1 font-mono">
          System Active
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Bloomberg-style Header */}
      <div className="border-b border-white/[0.05] px-3 py-2 bg-[#0a0a0a]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#555] font-mono uppercase tracking-wider">Portfolio</span>
          {lastUpdate && (
            <span className="text-[9px] text-[#444] font-mono">
              {lastUpdate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[9px] text-[#555] font-mono mb-0.5">Positions</div>
            <div className="text-[12px] text-white font-mono tabular-nums">{positionData.length}</div>
          </div>
          <div>
            <div className="text-[9px] text-[#555] font-mono mb-0.5">Total P&L</div>
            <div className={`text-[12px] font-mono tabular-nums ${totalPnL >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#555] font-mono mb-0.5">Notional</div>
            <div className="text-[12px] text-white font-mono tabular-nums">
              ${totalNotional.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Position List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 space-y-1">
          {positionData.map((position, index) => {
            const priceChange = position.currentPrice - position.entryPrice;
            const priceChangePercent = (priceChange / position.entryPrice) * 100;
            
            return (
              <motion.div
                key={position.id}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="border border-white/[0.05] bg-[#0a0a0a] hover:bg-[#0f0f0f] hover:border-white/[0.08] transition-all p-2.5 rounded"
              >
                {/* Symbol & Side */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-semibold text-white">{position.symbol}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                      position.side === 'LONG' 
                        ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' 
                        : 'bg-[#ff4444]/10 text-[#ff4444] border border-[#ff4444]/20'
                    }`}>
                      {position.side}
                    </span>
                    <span className="text-[9px] text-[#555] font-mono">{position.leverage}x</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-[13px] font-mono font-semibold tabular-nums ${position.pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                    </div>
                    <div className={`text-[10px] font-mono tabular-nums ${position.pnlPercent >= 0 ? 'text-[#00ff88]/70' : 'text-[#ff4444]/70'}`}>
                      {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
                
                {/* Bloomberg-style Grid */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.03]">
                  <div>
                    <div className="text-[8px] text-[#555] font-mono mb-0.5">Entry</div>
                    <div className="text-[10px] text-[#888] font-mono tabular-nums">
                      ${position.entryPrice.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#555] font-mono mb-0.5">Mark</div>
                    <div className={`text-[10px] font-mono tabular-nums ${priceChange >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      ${position.currentPrice.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#555] font-mono mb-0.5">Size</div>
                    <div className="text-[10px] text-[#888] font-mono tabular-nums">
                      {position.size > 0 ? (position.size < 0.001 ? position.size.toExponential(2) : position.size.toFixed(4)) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#555] font-mono mb-0.5">Notional</div>
                    <div className="text-[10px] text-[#888] font-mono tabular-nums">
                      ${position.notional.toFixed(0)}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default Positions;
