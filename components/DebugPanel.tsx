'use client';

import { useStore } from '@/store/useStore';
import { useState, useEffect } from 'react';

export default function DebugPanel() {
  const livePrices = useStore((state) => state.livePrices);
  const isConnected = useStore((state) => state.isConnected);
  const positions = useStore((state) => state.positions);
  const trades = useStore((state) => state.trades);
  const accountValue = useStore((state) => state.accountValue);
  const modelMessages = useStore((state) => state.modelMessages);
  const [mounted, setMounted] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');

  // Fix hydration issues
  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setLastUpdate(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (!mounted) {
    return null; // Prevent hydration mismatch
  }

  return (
    <div className="fixed bottom-4 right-4 glass-effect p-4 rounded-lg max-w-md max-h-96 overflow-auto z-50 text-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-neon-blue font-bold">REAL-TIME DEBUG</h3>
        <div className={`px-2 py-1 rounded ${isConnected ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-500'}`}>
          {isConnected ? '●' : '○'} {isConnected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>
      
      <div className="space-y-2">
        {/* Account Stats */}
        <div className="border border-neon-blue/30 p-2 rounded">
          <div className="text-neon-blue font-bold mb-1">ACCOUNT</div>
          <div className="pl-2 space-y-1 text-green-500/80">
            <div>Balance: ${(accountValue || 0).toFixed(2)}</div>
            <div>Open Positions: {positions.length}</div>
            <div>Total Trades: {trades.length}</div>
            <div>Messages: {modelMessages.length}</div>
            <div className="text-yellow-500/60 text-[10px]">
              Status: {accountValue && accountValue !== 100 ? '✅ Valid' : '⚠️ Check API'}
            </div>
            <div className="text-blue-500/60 text-[10px]">
              Rate Limit: {positions.length > 0 ? '✅ Data Fresh' : '⏳ Updating...'}
            </div>
            <div className="text-purple-500/60 text-[10px]">
              API Status: {accountValue && accountValue !== 100 ? '✅ Connected' : '⚠️ Rate Limited'}
            </div>
          </div>
        </div>

        {/* Current Positions */}
        {positions.length > 0 && (
          <div className="border border-green-500/30 p-2 rounded">
            <div className="text-green-500/80 font-bold mb-1">POSITIONS ({positions.length})</div>
            {positions.map((pos, i) => (
              <div key={i} className="pl-2 text-green-500/60 text-[10px]">
                <div className="text-neon-blue">{pos.symbol} {pos.side}</div>
                <div>Entry: ${(pos.entryPrice || 0).toFixed(2)} | Current: ${(pos.currentPrice || 0).toFixed(2)}</div>
                <div className={(pos.pnl || 0) >= 0 ? 'text-neon-green' : 'text-red-500'}>
                  P&L: ${(pos.pnl || 0).toFixed(2)} ({((pos.pnl || 0) / (pos.entryPrice || 1) * 100).toFixed(2)}%)
                </div>
                <div className="text-yellow-500/60">Size: {(pos.size || 0).toFixed(4)} | Lev: {pos.leverage || 1}x</div>
              </div>
            ))}
          </div>
        )}
        
        {/* Live Prices */}
        <div className="border border-green-500/30 p-2 rounded max-h-40 overflow-auto">
          <div className="text-green-500/80 font-bold mb-1">LIVE PRICES</div>
          <div className="pl-2 space-y-1 text-[10px] text-green-500/60">
            {Object.keys(livePrices).length === 0 ? (
              <div className="text-yellow-500">⚠️ Waiting for data...</div>
            ) : (
              Object.entries(livePrices).map(([key, data]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-neon-blue">{key.replace('USDT', '')}</span>
                  <span>${data.price?.toLocaleString() || '0'}</span>
                  <span className={data.change && data.change > 0 ? 'text-neon-green' : 'text-red-500'}>
                    {data.change ? (data.change > 0 ? '+' : '') + (data.change || 0).toFixed(2) + '%' : 'N/A'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-2 text-[10px] text-green-500/40 italic">
          Dev Mode • Last Update: {lastUpdate || 'Starting...'}
        </div>
      </div>
    </div>
  );
}

