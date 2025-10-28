/**
 * Enhanced AI Chat Component
 * Shows AI agent thoughts and trade logs in real-time
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';

interface AgentThought {
  id: string;
  timestamp: number;
  agent: string;
  symbol: string;
  insight: string;
  confidence: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  marketData: {
    price: number;
    volume: number;
    rsi: number;
    volatility: number;
    liquidityScore: number;
  };
}

interface TradeLog {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  pnl: number;
  leverage: number;
  reasoning: string;
}

export default function EnhancedAIChat() {
  const [agentThoughts, setAgentThoughts] = useState<AgentThought[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const trades = useStore((state) => state.trades);
  const modelMessages = useStore((state) => state.modelMessages);

  // Fetch real LLM agent insights and trade logs
  useEffect(() => {
    const fetchAIData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        // Fetch real agent insights from LLM
        const insightsResponse = await fetch('/api/agent-insights?symbol=BTC/USDT&limit=8', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (insightsResponse.ok) {
          const insightsData = await insightsResponse.json();
          
          if (insightsData.success && insightsData.data?.insights) {
            setAgentThoughts(insightsData.data.insights);
            frontendLogger.debug('Real agent insights loaded', { 
              component: 'EnhancedAIChat',
              data: {
                insightsCount: insightsData.data.insights.length,
                symbol: insightsData.data.symbol
              }
            });
            
            // Generate trade logs from actual trades only
            const generateTradeLogs = (): TradeLog[] => {
              const tradeLogs: TradeLog[] = [];
              
              // Only process real trades with valid data
              trades.filter(trade => trade.id && trade.timestamp && trade.symbol).forEach((trade) => {
                tradeLogs.push({
                  id: `trade-${trade.id}`,
                  timestamp: new Date(trade.timestamp).getTime(),
                  symbol: trade.symbol,
                  side: trade.side === 'LONG' ? 'BUY' : 'SELL',
                  size: trade.size || 0,
                  price: trade.entryPrice || 0,
                  pnl: trade.pnl || 0,
                  leverage: trade.leverage || 1,
                  reasoning: `Real trade executed: ${trade.side === 'LONG' ? 'bullish' : 'bearish'} position`
                });
              });
              
              return tradeLogs.sort((a, b) => b.timestamp - a.timestamp);
            };

            const logs = generateTradeLogs();
            setTradeLogs(logs);
            setError(null);
            
            frontendLogger.debug('AI chat data loaded', { 
              component: 'EnhancedAIChat',
              data: {
                insights: insightsData.data.insights.length,
                trades: logs.length
              }
            });
          } else {
            throw new Error('Failed to fetch insights');
          }
        } else {
          throw new Error('API request failed');
        }

      } catch (err) {
        frontendLogger.error('Failed to load AI chat data', err as Error, { 
          component: 'EnhancedAIChat' 
        });
        setError('Failed to load AI data - API unavailable');
        setAgentThoughts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAIData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchAIData, 30000);
    return () => clearInterval(interval);
  }, [trades]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case 'Technical Analyst': return 'text-blue-400';
      case 'Chief Analyst': return 'text-purple-400';
      case 'Risk Manager': return 'text-orange-400';
      case 'Execution Specialist': return 'text-green-400';
      default: return 'text-green-400';
    }
  };

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case 'Technical Analyst': return '📊';
      case 'Chief Analyst': return '🧠';
      case 'Risk Manager': return '🛡️';
      case 'Execution Specialist': return '⚡';
      default: return '🤖';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-2"></div>
          <p className="text-green-400/60 text-sm">Loading AI thoughts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-xs border border-red-500 text-red-500 hover:bg-red-500/10 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Combine and sort all messages by timestamp
  const allMessages = [
    ...agentThoughts.map(thought => ({ ...thought, type: 'thought' as const })),
    ...tradeLogs.map(log => ({ ...log, type: 'trade' as const }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-black/50 border-b border-green-400/30 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="text-xs text-green-400 uppercase tracking-wider font-bold">
          Real LLM Agent Insights & Trade Logs
        </div>
        <div className="text-xs text-green-400/60">
          {allMessages.length} messages
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
        <AnimatePresence>
          {allMessages.length === 0 ? (
            <div className="text-center py-12 text-green-400/60 px-4">
              <div className="text-4xl mb-3">🤖</div>
              <div className="text-sm font-semibold mb-2">LLM Agents Analyzing</div>
              <div className="text-xs opacity-75 leading-relaxed">
                Real LLM agents are analyzing Aster API data.<br/>
                Their insights and trade decisions will appear here.
              </div>
            </div>
          ) : (
            allMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`p-4 border rounded-lg bg-black/20 ${
                  message.type === 'trade' 
                    ? 'border-green-500/30 hover:border-green-500/50' 
                    : 'border-blue-500/20 hover:border-blue-500/40'
                } transition-all`}
              >
                {message.type === 'thought' ? (
                  <div>
                    {/* Agent Thought */}
                    <div className="flex flex-col gap-2 mb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-base shrink-0">{getAgentIcon(message.agent)}</span>
                          <span className={`text-xs font-bold ${getAgentColor(message.agent)} truncate`}>
                            {message.agent}
                          </span>
                          {message.confidence && (
                            <span className="text-xs text-green-500/60 bg-green-500/10 px-2 py-0.5 rounded shrink-0">
                              {Math.round(message.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-green-500/50 whitespace-nowrap shrink-0">
                          {formatTime(message.timestamp)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-500/60 shrink-0">Symbol:</span>
                        <span className="text-green-500 font-bold">{message.symbol}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                          message.action === 'BUY' 
                            ? 'bg-green-500/20 text-green-500' 
                            : message.action === 'SELL'
                            ? 'bg-red-500/20 text-red-500'
                            : 'bg-gray-500/20 text-gray-500'
                        }`}>
                          {message.action}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-green-400 leading-relaxed mb-3 break-words">
                      {message.insight}
                    </div>
                    
                    {/* Market Data Display */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs bg-black/20 p-2.5 rounded mb-2">
                      <div className="flex justify-between">
                        <span className="text-green-500/60">Price:</span>
                        <span className="text-green-500 font-mono font-bold">${message.marketData.price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-500/60">RSI:</span>
                        <span className="text-green-500 font-mono font-bold">{message.marketData.rsi.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-500/60">Volume:</span>
                        <span className="text-green-500 font-mono font-bold">{(message.marketData.volume / 1000000).toFixed(1)}M</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-500/60">Volatility:</span>
                        <span className="text-green-500 font-mono font-bold">{(message.marketData.volatility * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-green-500/60 italic break-words">
                      {message.reasoning}
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Trade Log */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💰</span>
                        <span className="text-xs font-bold text-green-400">
                          TRADE EXECUTED
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          message.side === 'BUY' 
                            ? 'bg-green-500/20 text-green-500' 
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {message.side}
                        </span>
                      </div>
                      <div className="text-xs text-green-500/50">
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
                      <div>
                        <span className="text-green-500/60">Symbol:</span>
                        <span className="text-green-500 ml-1 font-bold">{message.symbol}</span>
                      </div>
                      <div>
                        <span className="text-green-500/60">Price:</span>
                        <span className="text-green-500 ml-1 font-bold">${message.price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-green-500/60">Size:</span>
                        <span className="text-green-500 ml-1 font-bold">{message.size.toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-green-500/60">Leverage:</span>
                        <span className="text-green-500 ml-1 font-bold">{message.leverage}x</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-bold ${message.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        PnL: {message.pnl >= 0 ? '+' : ''}${message.pnl.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-500/60 italic">
                        {message.reasoning}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
