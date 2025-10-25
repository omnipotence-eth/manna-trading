'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

export default function ModelChat() {
  const modelMessages = useStore((state) => state.modelMessages);
  const positions = useStore((state) => state.positions);
  const trades = useStore((state) => state.trades);
  const accountValue = useStore((state) => state.accountValue);
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const thoughtsRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thoughtsRef.current) {
      thoughtsRef.current.scrollTop = thoughtsRef.current.scrollHeight;
    }
  }, [modelMessages]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    const message = userInput.trim();
    setUserInput('');
    
    // Add user message to history
    const userMessage = { role: 'user' as const, content: message, timestamp: Date.now() };
    setChatHistory(prev => [...prev, userMessage]);
    
    setIsLoading(true);

    try {
      // Call Ollama chat API for interactive conversation
      const response = await fetch('/api/ollama-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: 'trading',
          positions: positions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            pnl: p.pnlPercent?.toFixed(2) || 0,
          })),
          accountValue: accountValue,
          totalTrades: trades.length
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const aiResponse = data.response || 'Sorry, I could not generate a response.';
        
        const assistantMessage = { role: 'assistant' as const, content: aiResponse, timestamp: Date.now() };
        setChatHistory(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage = { role: 'assistant' as const, content: '❌ Failed to get Godspeed response. Please try again.', timestamp: Date.now() };
        setChatHistory(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error calling Godspeed:', error);
      const errorMessage = { role: 'assistant' as const, content: '❌ Error connecting to Godspeed. Please try again.', timestamp: Date.now() };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-full h-[450px]">
      {/* AI Thought Stream (Left Side) */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-effect rounded-lg overflow-hidden flex flex-col max-w-full h-[450px]"
      >
        {/* Header */}
        <div className="bg-black/50 border-b border-green-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-neon-blue">Godspeed Analysis</h3>
              <p className="text-xs text-green-500/60">Real-time AI market analysis</p>
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
                <div className="text-green-500/60 text-sm font-bold mb-2">Initializing AI...</div>
                <div className="text-green-500/40 text-xs">Analyzing market conditions</div>
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
                  className={`p-2 rounded border backdrop-blur-sm ${
                    msg.type === 'trade' 
                      ? 'bg-neon-blue/10 border-neon-blue/30 shadow-lg shadow-neon-blue/10' 
                      : msg.type === 'analysis'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-black/50 border-green-500/20'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-base shrink-0 mt-0.5">
                      {msg.type === 'trade' ? '💼' : msg.type === 'analysis' ? '🔍' : '💭'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-xs font-bold text-neon-blue">{msg.model}</span>
                        <span className="text-xs text-green-500/50">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                             <div className="text-xs text-green-500 whitespace-pre-wrap break-words leading-snug max-w-full overflow-hidden word-break">
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

      {/* Interactive Chat (Right Side) */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-effect rounded-lg overflow-hidden flex flex-col max-w-full h-[450px]"
      >
        {/* Header */}
        <div className="bg-black/50 border-b border-neon-blue/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-neon-blue animate-pulse shadow-lg shadow-neon-blue/50"></div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-neon-blue">Ask Godspeed</h3>
              <p className="text-xs text-green-500/60">Interactive AI Chat</p>
            </div>
            <span className="text-xs text-green-500/60 px-2 py-1 bg-neon-blue/10 rounded border border-neon-blue/30">
              {chatHistory.length} messages
            </span>
          </div>
        </div>

        {/* Chat History */}
        <div 
          ref={chatRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-black/20"
        >
          {chatHistory.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md px-3">
                <div className="text-4xl mb-2">💬</div>
                <div className="text-neon-blue text-sm font-bold mb-1.5">Godspeed AI Chat</div>
                <div className="text-green-500/60 text-xs mb-3 leading-snug">
                  Ask Godspeed about markets, strategy, or trades
                </div>
                <div className="text-left bg-neon-blue/5 border border-neon-blue/30 rounded p-2.5">
                  <div className="text-xs text-neon-blue font-bold mb-1.5">💡 Try asking:</div>
                  <ul className="text-xs text-green-500/70 space-y-1">
                    <li>• &quot;What&apos;s your market outlook?&quot;</li>
                    <li>• &quot;Why that trade?&quot;</li>
                    <li>• &quot;What signals do you see?&quot;</li>
                    <li>• &quot;Explain your strategy&quot;</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {chatHistory.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-2 rounded backdrop-blur-sm ${
                    msg.role === 'user'
                      ? 'bg-neon-blue/20 border border-neon-blue/50 shadow-lg shadow-neon-blue/10'
                      : 'bg-green-500/10 border border-green-500/30'
                  }`}>
                    <div className="flex items-start gap-1.5">
                      <span className="text-sm shrink-0 mt-0.5">
                        {msg.role === 'user' ? '👤' : '🤖'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold">
                            {msg.role === 'user' ? (
                              <span className="text-neon-blue">You</span>
                            ) : (
                              <span className="text-green-400">Ollama</span>
                            )}
                          </span>
                          <span className="text-xs text-green-500/50">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                               <div className="text-xs text-green-500 whitespace-pre-wrap break-words leading-snug max-w-full overflow-hidden word-break">
                                 {msg.content}
                               </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-green-500/10 border border-green-500/30 p-2 rounded">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <motion.div 
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 bg-green-500 rounded-full"
                    ></motion.div>
                    <motion.div 
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-green-500 rounded-full"
                    ></motion.div>
                    <motion.div 
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-green-500 rounded-full"
                    ></motion.div>
                  </div>
                  <span className="text-xs text-green-500/60">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 bg-black/30 border-t border-green-500/30">
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask Godspeed about markets, strategy, trades..."
              disabled={isLoading}
              className="flex-1 bg-black/50 border border-green-500/30 rounded px-3 py-2 text-sm text-green-500 placeholder-green-500/40 focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue/20 transition-all disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={!userInput.trim() || isLoading}
              className="px-4 py-2 bg-neon-blue text-black text-sm font-bold rounded hover:bg-neon-blue/80 hover:shadow-lg hover:shadow-neon-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
              ) : (
                'Send'
              )}
            </button>
          </div>
          <div className="text-xs text-green-500/40 mt-1.5">
            💡 Enter to send • Shift+Enter for new line
          </div>
        </div>
      </motion.div>
    </div>
  );
}
