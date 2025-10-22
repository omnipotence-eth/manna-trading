'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function ModelChat() {
  // Get real messages from store (populated by AI trading service)
  const messages = useStore((state) => state.modelMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="space-y-2">
      <div className="max-h-[400px] overflow-y-auto space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-green-500/60">
            No model activity yet. AlphaTrader will post analysis and trade decisions here.
          </div>
        ) : (
          messages.map((msg, index) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="border border-green-500/20 p-3 hover:border-green-500/40 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-neon-blue text-sm font-bold">{msg.model}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    msg.type === 'trade' ? 'bg-neon-green/20 text-neon-green' :
                    msg.type === 'alert' ? 'bg-red-500/20 text-red-500' :
                    'bg-green-500/20 text-green-500'
                  }`}>
                    {msg.type.toUpperCase()}
                  </span>
                </div>
                <span className="text-green-500/60 text-xs">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-green-500 text-xs font-mono">{msg.message}</div>
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

