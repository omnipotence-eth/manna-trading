/**
 * Enhanced AI Chat Component
 * Shows AI agent thoughts and trade logs in real-time
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';
import { getConfidenceColor, formatConfidence } from '@/lib/confidenceColors';

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

// WORLD-CLASS: Memoize chat component to prevent unnecessary re-renders
const EnhancedAIChat = React.memo(function EnhancedAIChat() {
  const [agentThoughts, setAgentThoughts] = useState<AgentThought[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  
  // Use refs to prevent infinite loops
  const lastFetchRef = useRef<number>(0);
  const lastScanTimestampRef = useRef<number>(0);
  const fetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const trades = useStore((state) => state.trades);
  const modelMessages = useStore((state) => state.modelMessages);
  
  // Memoize toggle handler
  const toggleMessageDetails = useCallback((messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  // OPTIMIZED: Fetch insights only when needed, prevent infinite loops
  useEffect(() => {
    let isMounted = true;
    
    const fetchAIData = async () => {
      const now = Date.now();
      
      // Prevent fetching too frequently (minimum 10 seconds between fetches)
      if (now - lastFetchRef.current < 10000) {
        return;
      }
      
      lastFetchRef.current = now;
      
      // Only show loading on very first fetch
      if (agentThoughts.length === 0 && !isLoading) {
        setIsLoading(true);
      }
      
      try {
        const controller = new AbortController();
        // CRITICAL FIX: Increased timeout from 10s to 60s
        // Market Scanner takes 33s with batch processing (prevents 418 rate limits)
        // But first scan can take longer - allow 60s to be safe
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const response = await fetch(`/api/agent-insights?limit=10`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        
        clearTimeout(timeoutId);
        
        if (!isMounted) return;
        
        if (response.ok) {
          const data = await response.json();
          
          // CRITICAL FIX: Handle both response structures
          // { success: true, data: { ... } } OR { success: true, insights: [...], scanResult: {...} }
          const responseData = data.data || data;
          
          if (data.success && responseData) {
            // CRITICAL FIX: Handle nested data structure
            const scanResult = responseData.scanResult || data.data?.scanResult || responseData;
            const isInitializing = scanResult?.initializing === true;
            
            // CRITICAL FIX: Handle initializing state (first request with no cache)
            if (isInitializing) {
              // Show helpful message instead of error
              if (agentThoughts.length === 0) {
                // Don't show as error - it's a normal loading state
                setError(null); // Clear any previous errors
                setIsLoading(true); // Keep loading state
                // The UI will show "Market scanner is initializing..." message
              } else {
                // We have existing data, just keep showing it
                setIsLoading(false);
                setError(null); // Clear error if we have data
              }
              // Will retry automatically via polling (every 20 seconds)
              return;
            }
            
            // CRITICAL FIX: Always clear error and loading state when we get valid data
            setError(null);
            setIsLoading(false);
            
            // Handle insights - even if empty, we got a valid response
            const insights = responseData.insights || [];
            const scanTimestamp = responseData.timestamp || scanResult?.timestamp || Date.now();
            
            // Only update if this is a genuinely NEW scan OR if we have no data yet
            if (scanTimestamp !== lastScanTimestampRef.current || agentThoughts.length === 0) {
              lastScanTimestampRef.current = scanTimestamp;
              
              if (insights.length > 0) {
                // Append new to existing, keep last 50
                setAgentThoughts(prev => {
                  // Check if we already have these insights
                  const existingIds = new Set(prev.map(i => i.id));
                  const trulyNew = insights.filter((i: any) => !existingIds.has(i.id));
                  
                  if (trulyNew.length > 0 || prev.length === 0) {
                    const combined = [...trulyNew, ...prev];
                    return combined.slice(0, 50);
                  }
                  return prev; // No new data, don't update
                });
              } else if (agentThoughts.length === 0) {
                // No insights yet, but scan is complete - show helpful message
                setError('Market scan complete, but no trading opportunities found yet. Waiting for market conditions...');
              }
              // If we have existing thoughts and no new insights, keep showing existing data
            }
          } else {
            // FIXED: Handle case where response is ok but data structure is unexpected
            if (agentThoughts.length === 0) {
              setError('No insights available yet. Market scanner is running...');
            } else {
              // Clear error if we have existing data
              setError(null);
            }
            setIsLoading(false);
          }
        } else {
          // FIXED: Handle non-ok responses
          if (!isMounted) return;
          const errorText = response.status === 500 
            ? 'Server error - market scanner may be initializing' 
            : response.status === 408 || response.status === 504
            ? 'Request timeout - market scan in progress...'
            : `Failed to load chat: ${response.status}`;
          
          if (agentThoughts.length === 0) {
            setError(errorText);
          } else {
            // If we have data, just log the error but don't show it
            frontendLogger.warn('Failed to fetch new insights, keeping existing data', {
              component: 'EnhancedAIChat',
              data: { status: response.status }
            });
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!isMounted) return;
        
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            // Timeout - this is expected for long-running scans
            if (agentThoughts.length === 0) {
              setError('Market scan is taking longer than expected. Please wait...');
            } else {
              // If we have data, just silently continue
              frontendLogger.debug('Request aborted (timeout), keeping existing data', {
                component: 'EnhancedAIChat'
              });
            }
          } else {
            const errorMessage = err instanceof Error ? err.message : String(err);
            frontendLogger.error('Failed to fetch insights', err instanceof Error ? err : new Error(errorMessage));
            
            // CRITICAL FIX: Show helpful error messages based on error type
            if (agentThoughts.length === 0) {
              if (errorMessage.includes('timeout') || errorMessage.includes('abort')) {
                setError('Market scanner is taking longer than expected. Please wait... (This can take 30-60 seconds on first scan)');
              } else if (errorMessage.includes('500') || errorMessage.includes('server')) {
                setError('Server error - market scanner may be initializing. Please wait...');
              } else {
                setError('Connecting to market scanner... (Check server logs if this persists)');
              }
            } else {
              // Clear error if we have existing data
              setError(null);
            }
          }
        }
      } finally {
        if (isMounted && isLoading) {
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchAIData();
    
    // Set up polling interval (20 seconds)
    fetchIntervalRef.current = setInterval(fetchAIData, 20000);
    
    return () => {
      isMounted = false;
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, []); // EMPTY DEPS - only mount/unmount
  
  // Update trade logs only when trades actually change
  // FIXED: Filter out old trades (older than 30 days) to match API filtering
  useEffect(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    // Filter trades to only include recent ones (last 30 days)
    const recentTrades = trades.filter(trade => {
      const tradeTimestamp = new Date(trade.timestamp).getTime();
      return tradeTimestamp >= thirtyDaysAgo;
    });
    
    const newLogs: TradeLog[] = recentTrades.slice(0, 20).map(trade => ({
      id: `trade-${trade.id}`,
      timestamp: new Date(trade.timestamp).getTime(),
      symbol: trade.symbol,
      side: (trade.side === 'LONG' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
      size: trade.size || 0,
      price: trade.entryPrice || 0,
      pnl: trade.pnl || 0,
      leverage: trade.leverage || 1,
      reasoning: `Trade executed: ${trade.side} position`
    }));
    
    setTradeLogs(newLogs);
  }, [trades.length]); // CRITICAL: Only when length changes, not on every trade update

  // OPTIMIZED: Memoize helper functions to prevent unnecessary re-renders
  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  }, []);
  
  const getAgentColor = useCallback((agent: string) => {
    switch (agent) {
      case 'Technical Analyst': return 'text-blue-400';
      case 'Chief Analyst': return 'text-purple-400';
      case 'Risk Manager': return 'text-orange-400';
      case 'Execution Specialist': return 'text-green-400';
      case 'Market Overview': return 'text-cyan-400';
      default: return 'text-green-400';
    }
  }, []);
  
  const getAgentIcon = useCallback((agent: string) => {
    switch (agent) {
      case 'Technical Analyst': return '📊';
      case 'Chief Analyst': return '🧠';
      case 'Risk Manager': return '🛡️';
      case 'Execution Specialist': return '⚡';
      case 'Market Overview': return '🌐';
      default: return '🤖';
    }
  }, []);

  // Combine all messages - memoize with stable dependencies
  // OPTIMIZED: Show only the LATEST message per agent (one per agent)
  const allMessages = useMemo(() => {
    const allCombined = [
      ...agentThoughts.map(thought => ({ ...thought, type: 'thought' as const })),
      ...tradeLogs.map(log => ({ ...log, type: 'trade' as const }))
    ].sort((a, b) => b.timestamp - a.timestamp);
    
    // Group by agent and keep only the most recent message per agent
    const latestByAgent = new Map();
    
    allCombined.forEach(message => {
      const key = message.type === 'thought' ? message.agent : 'Trade';
      if (!latestByAgent.has(key)) {
        latestByAgent.set(key, message);
      }
    });
    
    // Convert back to array and sort by timestamp
    return Array.from(latestByAgent.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [agentThoughts.length, tradeLogs.length]); // CRITICAL: Only re-calculate when counts change

  // FIXED: Show content even while loading (non-blocking)
  // Only show loading spinner if no data at all and still loading
  if (isLoading && agentThoughts.length === 0 && tradeLogs.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          {/* Clean, modern loading animation */}
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-green-400/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-green-400 rounded-full animate-spin"></div>
            <div className="absolute inset-2 border-4 border-transparent border-t-green-400/60 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
          <p className="text-green-400 text-sm font-semibold mb-1">Analyzing Markets</p>
          <p className="text-green-400/60 text-xs">AI agents are scanning opportunities...</p>
          <p className="text-green-400/40 text-xs mt-2">This may take 30-45 seconds</p>
        </div>
      </div>
    );
  }

  // FIXED: Show error message but allow content to display if available
  if (error && agentThoughts.length === 0 && tradeLogs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-4">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-green-400 text-sm font-semibold mb-2">Market Scanner Status</p>
          <p className="text-green-400/60 text-xs mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
              // Trigger a fresh fetch by resetting last fetch time
              lastFetchRef.current = 0;
              // Manually trigger fetch
              fetch(`/api/agent-insights?limit=10`, {
                cache: 'no-store'
              }).then(() => {
                // Fetch will be handled by the useEffect
              });
            }}
            className="px-4 py-2 text-xs border border-green-500 text-green-500 hover:bg-green-500/10 transition-all rounded"
          >
            Retry Scan
          </button>
          <p className="text-green-400/40 text-xs mt-3">
            If this persists, check that the server is running and Ollama is available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-black/50 border-b border-green-400/30 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xs text-green-400 uppercase tracking-wider font-bold">
            Latest Agent Updates
          </div>
          {isLoading && allMessages.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400/60">Updating...</span>
            </div>
          )}
        </div>
        <div className="text-xs text-green-400/60">
          {allMessages.length} agent{allMessages.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Messages - Scrollable with history */}
      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* Show error banner if there's an error but we have data */}
        {error && allMessages.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mb-2">
            <p className="text-yellow-400 text-xs">{error}</p>
            <button
              onClick={() => {
                setError(null);
                lastFetchRef.current = 0;
              }}
              className="text-xs text-yellow-400/60 hover:text-yellow-400 mt-1 underline"
            >
              Dismiss
            </button>
          </div>
        )}
        
        <AnimatePresence mode="popLayout">
          {allMessages.length === 0 ? (
            <div className="text-center py-12 text-green-400/60 px-4">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 border-4 border-green-400/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-green-400 rounded-full animate-spin"></div>
              </div>
              <div className="text-sm font-semibold mb-2">Agents Scanning Markets</div>
              <div className="text-xs opacity-75 leading-relaxed">
                {isLoading ? (
                  <>
                    Market scanner is initializing...<br/>
                    First scan may take 30-60 seconds<br/>
                    Updates appear every 20 seconds
                  </>
                ) : (
                  <>
                    Market analysis in progress...<br/>
                    Updates appear every 20 seconds
                  </>
                )}
                {error && <span className="text-yellow-400/60 mt-2 block">{error}</span>}
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
                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 font-bold ${getConfidenceColor(message.confidence).text} ${getConfidenceColor(message.confidence).bg}`}>
                              {formatConfidence(message.confidence)}
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
                    
                    <div className="text-xs text-green-400 leading-relaxed mb-2 break-words">
                      {message.insight}
                    </div>
                    
                    {/* Collapsible Market Data */}
                    <button
                      onClick={() => toggleMessageDetails(message.id)}
                      className="text-xs text-green-500/60 hover:text-green-500 mb-2 flex items-center gap-1 transition-colors"
                    >
                      <span>{expandedMessages.has(message.id) ? '▼' : '▶'}</span>
                      <span>{expandedMessages.has(message.id) ? 'Hide' : 'Show'} Details</span>
                    </button>
                    
                    {expandedMessages.has(message.id) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Enhanced Market Data Display with Real Details */}
                        <div className="space-y-2">
                          {/* Basic Market Data */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs bg-black/20 p-2.5 rounded">
                            {message.marketData.price > 0 && (
                              <div className="flex justify-between">
                                <span className="text-green-500/60">Price:</span>
                                <span className="text-green-500 font-mono font-bold">${message.marketData.price.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-green-500/60">RSI:</span>
                              <span className={`font-mono font-bold ${
                                message.marketData.rsi > 70 ? 'text-red-400' :
                                message.marketData.rsi < 30 ? 'text-green-400' :
                                'text-yellow-400'
                              }`}>{message.marketData.rsi.toFixed(1)}</span>
                            </div>
                            {message.marketData.volume > 0 && (
                              <div className="flex justify-between">
                                <span className="text-green-500/60">Volume:</span>
                                <span className="text-green-500 font-mono font-bold">
                                  ${(message.marketData.volume / 1000000).toFixed(1)}M
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-green-500/60">Volatility:</span>
                              <span className={`font-mono font-bold ${
                                message.marketData.volatility > 0.1 ? 'text-red-400' :
                                message.marketData.volatility > 0.05 ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>{(message.marketData.volatility * 100).toFixed(1)}%</span>
                            </div>
                            {message.marketData.liquidityScore > 0 && (
                              <div className="flex justify-between col-span-2">
                                <span className="text-green-500/60">Liquidity Score:</span>
                                <span className={`font-mono font-bold ${
                                  message.marketData.liquidityScore > 0.7 ? 'text-green-400' :
                                  message.marketData.liquidityScore > 0.4 ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>{(message.marketData.liquidityScore * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>
                          
                          {/* ATR & Risk Levels (NEW!) */}
                          {(message as any).atrLevels && (
                            <div className="bg-blue-500/10 border border-blue-500/30 p-2.5 rounded">
                              <div className="text-xs font-bold text-blue-400 mb-1.5">ATR-Based Levels (NEW!)</div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-blue-400/60">ATR:</span>
                                  <span className="text-blue-400 font-mono">{(message as any).atrLevels.atrPercent?.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-400/60">Volatility:</span>
                                  <span className="text-blue-400 font-mono capitalize">{(message as any).atrLevels.volatilityLevel}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-red-400/60">Stop Loss:</span>
                                  <span className="text-red-400 font-mono font-bold">
                                    ${(message as any).atrLevels.recommendedStopLoss?.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-green-400/60">Take Profit:</span>
                                  <span className="text-green-400 font-mono font-bold">
                                    ${(message as any).atrLevels.recommendedTakeProfit?.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Divergence Signals (NEW!) */}
                          {(message as any).divergences && (message as any).divergences.length > 0 && (
                            <div className="bg-purple-500/10 border border-purple-500/30 p-2.5 rounded">
                              <div className="text-xs font-bold text-purple-400 mb-1.5">
                                Divergence Signals (NEW!)
                              </div>
                              {(message as any).divergences.map((div: any, idx: number) => (
                                <div key={idx} className="text-xs mb-1">
                                  <span className={`font-bold ${
                                    div.type === 'bullish' ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {div.type.toUpperCase()} {div.indicator}
                                  </span>
                                  <span className="text-purple-400/60 ml-2">
                                    Strength: {(div.strength * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* All Opportunities Found (NEW!) */}
                          {(message as any).opportunities && (message as any).opportunities.length > 0 && (
                            <div className="bg-cyan-500/10 border border-cyan-500/30 p-2.5 rounded">
                              <div className="text-xs font-bold text-cyan-400 mb-1.5">
                                All Opportunities in This Scan ({(message as any).opportunities.length})
                              </div>
                              <div className="space-y-1.5">
                                {(message as any).opportunities.map((opp: any, idx: number) => (
                                  <div key={idx} className="text-xs bg-black/20 p-2 rounded">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-cyan-400">{opp.symbol}</span>
                                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                        opp.recommendation === 'STRONG_BUY' || opp.recommendation === 'BUY'
                                          ? 'bg-green-500/20 text-green-500'
                                          : opp.recommendation === 'SELL' || opp.recommendation === 'STRONG_SELL'
                                          ? 'bg-red-500/20 text-red-500'
                                          : 'bg-gray-500/20 text-gray-500'
                                      }`}>
                                        {opp.recommendation}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                                      <div>
                                        <span className="text-cyan-400/60">Score: </span>
                                        <span className="text-cyan-400 font-mono">{opp.score}/100</span>
                                      </div>
                                      <div>
                                        <span className="text-cyan-400/60">Confidence: </span>
                                        <span className="text-cyan-400 font-mono">{(opp.confidence * 100).toFixed(0)}%</span>
                                      </div>
                                      <div>
                                        <span className="text-cyan-400/60">Price: </span>
                                        <span className="text-cyan-400 font-mono">${opp.price?.toFixed(4) || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-cyan-400/60">Vol: </span>
                                        <span className="text-cyan-400 font-mono">${(opp.volume / 1000000).toFixed(1)}M</span>
                                      </div>
                                      <div>
                                        <span className="text-cyan-400/60">RSI: </span>
                                        <span className="text-cyan-400 font-mono">{opp.rsi?.toFixed(1) || 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-cyan-400/60">ATR: </span>
                                        <span className="text-cyan-400 font-mono">{opp.atrPercent?.toFixed(2)}%</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Analysis Reasoning */}
                          <div className="text-xs text-green-500/60 italic break-words bg-black/10 p-2 rounded">
                            {message.reasoning}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ) : message.type === 'trade' ? (
                  <div>
                    {/* Trade Log */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💰</span>
                        <span className="text-xs font-bold text-green-400">
                          TRADE EXECUTED
                        </span>
                        {(
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            message.side === 'BUY' 
                              ? 'bg-green-500/20 text-green-500' 
                              : 'bg-red-500/20 text-red-500'
                          }`}>
                            {(message as any).side}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-green-500/50">
                        {formatTime((message as any).timestamp || Date.now())}
                      </div>
                    </div>
                    
                    <>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
                        <div>
                          <span className="text-green-500/60">Symbol:</span>
                          <span className="text-green-500 ml-1 font-bold">{(message as any).symbol}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Price:</span>
                          <span className="text-green-500 ml-1 font-bold">${((message as any).price || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Size:</span>
                          <span className="text-green-500 ml-1 font-bold">{((message as any).size || 0).toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Leverage:</span>
                          <span className="text-green-500 ml-1 font-bold">{(message as any).leverage || 1}x</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className={`text-sm font-bold ${((message as any).pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          PnL: {((message as any).pnl || 0) >= 0 ? '+' : ''}${((message as any).pnl || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-green-500/60 italic">
                          {(message as any).reasoning || ''}
                        </div>
                      </div>
                    </>
                  </div>
                ) : null}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default EnhancedAIChat;
