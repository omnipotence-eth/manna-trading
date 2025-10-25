'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function ModelChat() {
  const modelMessages = useStore((state) => state.modelMessages);
  const thoughtsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thoughtsRef.current) {
      thoughtsRef.current.scrollTop = thoughtsRef.current.scrollHeight;
    }
  }, [modelMessages]);

  return (
    <div className="w-full h-[450px]">
      {/* Godspeed Analysis - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-lg overflow-hidden flex flex-col w-full h-[450px]"
      >
        {/* Header */}
        <div className="bg-black/50 border-b border-green-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-neon-blue">Godspeed Analysis</h3>
              <p className="text-xs text-green-500/60">Real-time AI market analysis and trading thoughts</p>
            </div>
            <span className="text-xs text-green-500/60 px-2 py-1 bg-green-500/10 rounded border border-green-500/30">
              {modelMessages.length} thoughts
            </span>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={thoughtsRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-black/20"
        >
          {modelMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-5xl mb-3"
                >
                  🤖
                </motion.div>
                <div className="text-green-500/60 text-sm font-bold mb-2">Initializing Godspeed AI...</div>
                <div className="text-green-500/40 text-xs">Analyzing market conditions and preparing trading strategies</div>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="mt-4"
                >
                  <div className="flex justify-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                </motion.div>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {modelMessages.slice().reverse().map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  className={`p-3 rounded border backdrop-blur-sm ${
                    msg.type === 'trade' 
                      ? 'bg-neon-blue/10 border-neon-blue/30 shadow-lg shadow-neon-blue/10' 
                      : msg.type === 'analysis'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-black/50 border-green-500/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg shrink-0 mt-0.5">
                      {msg.type === 'trade' ? '💼' : msg.type === 'analysis' ? '🔍' : '💭'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-neon-blue">{msg.model}</span>
                        <span className="text-xs text-green-500/50">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm text-green-500 whitespace-pre-wrap break-words leading-relaxed max-w-full overflow-hidden word-break">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
