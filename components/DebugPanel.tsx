'use client';

import { useStore } from '@/store/useStore';

export default function DebugPanel() {
  const livePrices = useStore((state) => state.livePrices);
  const isConnected = useStore((state) => state.isConnected);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 glass-effect p-4 rounded-lg max-w-md max-h-96 overflow-auto z-50 text-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-neon-blue font-bold">DEBUG PANEL</h3>
        <div className={`px-2 py-1 rounded ${isConnected ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-500'}`}>
          {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="text-green-500/80">
          <strong>Live Prices in Store:</strong>
        </div>
        <div className="pl-2 space-y-1 font-mono text-green-500/60">
          {Object.keys(livePrices).length === 0 ? (
            <div className="text-yellow-500">⚠️ No prices in store yet</div>
          ) : (
            Object.entries(livePrices).map(([key, data]) => (
              <div key={key} className="border-l-2 border-green-500/30 pl-2">
                <div className="text-neon-blue">{key}:</div>
                <div className="pl-2">
                  <div>Price: ${data.price?.toFixed(2) || '0.00'}</div>
                  <div>Change: {data.change?.toFixed(2) || '0.00'}%</div>
                  <div className="text-xs text-green-500/40">
                    Updated: {new Date(data.lastUpdate).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-3 pt-3 border-t border-green-500/30">
          <div className="text-green-500/80">
            <strong>Environment:</strong>
          </div>
          <div className="pl-2 font-mono text-green-500/60">
            <div>USE_REAL_WS: {process.env.NEXT_PUBLIC_USE_REAL_WEBSOCKET}</div>
            <div>HAS_API_KEY: {process.env.NEXT_PUBLIC_ASTER_API_KEY ? 'YES' : 'NO'}</div>
          </div>
        </div>

        <div className="mt-2 text-xs text-green-500/40 italic">
          This panel only shows in development mode
        </div>
      </div>
    </div>
  );
}

