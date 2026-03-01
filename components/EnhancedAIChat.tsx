'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

interface AgentThought {
  id: string;
  timestamp: number;
  agent: string;
  symbol: string;
  insight: string;
  confidence: number;
  action: 'BUY' | 'SELL' | 'HOLD';
}

const EnhancedAIChat = React.memo(function EnhancedAIChat() {
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const trades = useStore((state) => state.trades);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      const now = Date.now();
      if (now - lastFetchRef.current < 10000) return;
      lastFetchRef.current = now;
      
      if (thoughts.length === 0) setIsLoading(true);
      
      try {
        const response = await fetch(`/api/agent-insights?limit=10`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (!isMounted) return;
        
        if (data.success && data.insights?.length > 0) {
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          const recent = data.insights
            .filter((i: any) => (i.timestamp || Date.now()) >= sevenDaysAgo)
            .map((i: any) => ({
              id: i.id || `${i.symbol}-${i.timestamp}`,
              timestamp: i.timestamp || Date.now(),
              agent: i.agent || 'Analyst',
              symbol: i.symbol || 'N/A',
              insight: i.insight || i.analysis || '',
              confidence: i.confidence || 0.5,
              action: i.action || 'HOLD',
            }));
          setThoughts(recent);
        }
      } catch { /* silent */ }
      finally { if (isMounted) setIsLoading(false); }
    };

    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }, []);

  const allMessages = useMemo(() => {
    const tradeMessages = trades.slice(0, 10).map(t => ({
      id: `trade-${t.id}`,
      type: 'trade' as const,
      timestamp: new Date(t.timestamp).getTime(),
      symbol: t.symbol,
      side: t.side,
      pnl: t.pnl || 0,
    }));
    
    const thoughtMessages = thoughts.map(t => ({
      id: t.id,
      type: 'thought' as const,
      timestamp: t.timestamp,
      agent: t.agent,
      symbol: t.symbol,
      insight: t.insight,
      action: t.action,
      confidence: t.confidence,
    }));
    
    return [...tradeMessages, ...thoughtMessages]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 15);
  }, [trades, thoughts]);

  if (isLoading && allMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-10 h-10 rounded-lg bg-[#111] border border-white/[0.08] flex items-center justify-center mb-3">
          <div className="w-4 h-4 border-2 border-[#333] border-t-[#666] rounded-full animate-spin" />
        </div>
        <p className="text-[12px] text-[#555]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence mode="popLayout">
          {allMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-[#111] border border-white/[0.08] flex items-center justify-center mb-4">
                <span className="text-xl">💭</span>
              </div>
              <p className="text-[13px] text-[#888]">No Recent Activity</p>
              <p className="text-[12px] text-[#555] mt-1">Agent activity will appear here</p>
            </div>
          ) : (
            allMessages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: index * 0.02 }}
                className="card card-hover p-3"
              >
                {msg.type === 'thought' ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[#888]">{msg.agent}</span>
                        <span className="text-[11px] text-[#555]">{msg.symbol}</span>
                      </div>
                      <span className="text-[10px] text-[#444] text-mono tabular">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#666] leading-relaxed line-clamp-2 mb-2">
                      {msg.insight}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${
                        msg.action === 'BUY' ? 'badge-success' :
                        msg.action === 'SELL' ? 'badge-error' : ''
                      }`}>
                        {msg.action}
                      </span>
                      <span className="text-[10px] text-[#555] text-mono">
                        {(msg.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${msg.side === 'LONG' ? 'badge-success' : 'badge-error'}`}>
                        {msg.side}
                      </span>
                      <span className="text-[12px] text-[#888]">{msg.symbol}</span>
                    </div>
                    <span className={`text-[13px] font-medium text-mono tabular ${
                      msg.pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'
                    }`}>
                      {msg.pnl >= 0 ? '+' : ''}${msg.pnl.toFixed(2)}
                    </span>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default EnhancedAIChat;
