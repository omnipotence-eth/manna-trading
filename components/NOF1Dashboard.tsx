'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import ModelChat from './ModelChat';
import TradeJournal from './TradeJournal';
import Positions from './Positions';
import AIPerformanceChart from './AIPerformanceChart';
import InteractiveChart from './InteractiveChart';
import EnhancedAIChat from './EnhancedAIChat';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendErrorHandler } from '@/lib/frontendErrorHandler';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';
import { frontendCaches, cacheKeys } from '@/lib/frontendCache';

export default function NOF1Dashboard() {
  const [activeTab, setActiveTab] = useState<'trades' | 'chat' | 'positions' | 'readme'>('trades');
  const [timeRange, setTimeRange] = useState<'ALL' | '72H'>('ALL');
  const accountValue = useStore((state) => state.accountValue);
  const positions = useStore((state) => state.positions);
  const trades = useStore((state) => state.trades);
  const setAccountValue = useStore((state) => state.setAccountValue);
  const updatePosition = useStore((state) => state.updatePosition);
  const addTrade = useStore((state) => state.addTrade);
  const addModelMessage = useStore((state) => state.addModelMessage);
  // OPTIMIZED: useRef for isMounted flag (better than let variable)
  const isMountedRef = useRef(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    
    isMountedRef.current = true;

    const updateData = async () => {
      if (!isMountedRef.current) return;
      
      const timer = frontendPerformanceMonitor.startComponentTimer('NOF1Dashboard:updateData');
      
      try {
        frontendLogger.debug('Starting data update cycle', { component: 'NOF1Dashboard' });
        
        // Fetch account data and positions with caching
        const accountCacheKey = cacheKeys.api('optimized-data');
        const cachedAccountData = frontendCaches.api.get(accountCacheKey);
        
        if (cachedAccountData) {
          frontendLogger.debug('Using cached account data', { component: 'NOF1Dashboard' });
          const { accountValue, positions } = cachedAccountData;
          if (isMountedRef.current) {
            setAccountValue(accountValue);
            if (positions && Array.isArray(positions) && positions.length > 0) {
              positions.forEach((position: any) => {
                if (position && typeof position === 'object') {
                  updatePosition(position);
                }
              });
            }
          }
        } else {
          const accountResponse = await frontendPerformanceMonitor.measureApiCall(
            'optimized-data',
            () => fetch('/api/optimized-data')
          );
          
          if (accountResponse.ok) {
            const data = await accountResponse.json();
            if (isMountedRef.current && data.success) {
              const { accountValue, positions } = data.data;
              setAccountValue(accountValue);
              if (positions && Array.isArray(positions) && positions.length > 0) {
                positions.forEach((position: any) => {
                  if (position && typeof position === 'object') {
                    updatePosition(position);
                  }
                });
              }
              // Cache the response
              frontendCaches.api.set(accountCacheKey, data.data);
            }
          }
        }
        
        // Fetch completed trades with caching
        const tradesCacheKey = cacheKeys.api('trades', { limit: 100 });
        const cachedTradesData = frontendCaches.api.get(tradesCacheKey);
        
        if (cachedTradesData) {
          frontendLogger.debug('Using cached trades data', { component: 'NOF1Dashboard' });
          if (isMountedRef.current) {
            cachedTradesData.trades.forEach((trade: any) => {
              addTrade(trade);
            });
          }
        } else {
          const tradesResponse = await frontendPerformanceMonitor.measureApiCall(
            'trades',
            () => fetch('/api/trades?limit=100')
          );
          
          if (tradesResponse.ok) {
            const tradesData = await tradesResponse.json();
            if (isMountedRef.current && tradesData.success && tradesData.trades) {
              tradesData.trades.forEach((trade: any) => {
                addTrade(trade);
              });
              // Cache the response
              frontendCaches.api.set(tradesCacheKey, tradesData);
            }
          }
        }

        // Fetch model messages with caching
        const messagesCacheKey = cacheKeys.api('model-message', { limit: 50 });
        const cachedMessagesData = frontendCaches.api.get(messagesCacheKey);
        
        if (cachedMessagesData) {
          frontendLogger.debug('Using cached messages data', { component: 'NOF1Dashboard' });
          if (isMountedRef.current) {
            cachedMessagesData.messages.forEach((message: any) => {
              addModelMessage(message);
            });
          }
        } else {
          const messagesResponse = await frontendPerformanceMonitor.measureApiCall(
            'model-message',
            () => fetch('/api/model-message?limit=50')
          );
          
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            if (isMountedRef.current && messagesData.success && messagesData.messages) {
              messagesData.messages.forEach((message: any) => {
                addModelMessage(message);
              });
              // Cache the response
              frontendCaches.api.set(messagesCacheKey, messagesData);
            }
          }
        }
        
        frontendLogger.info('Data update cycle completed successfully', { component: 'NOF1Dashboard' });
      } catch (error) {
        frontendErrorHandler.handleError(error as Error, 'NOF1Dashboard', {
          maxRetries: 3,
          retryDelay: 2000,
        });
      } finally {
        timer();
      }
    };

    // Start data updates every 3 seconds for real-time updates (optimized)
    updateData();
    const dataIntervalId = setInterval(updateData, 3000); // Every 3 seconds (optimized from 1s)

    // 🤖 GODSPEED AUTO-TRADING: Trigger trading cycle every 60 seconds
    // This ensures 24/7 trading even if Vercel cron fails
    let tradingCycleCount = 0;
    const runTradingCycle = async () => {
      if (!isMountedRef.current) return;
      
      const timer = frontendPerformanceMonitor.startComponentTimer('NOF1Dashboard:tradingCycle');
      
      try {
        tradingCycleCount++;
        frontendLogger.info(`Multi-Agent Auto-Trading Cycle #${tradingCycleCount} starting`, {
          component: 'NOF1Dashboard',
          data: { cycleNumber: tradingCycleCount }
        });
        
        const response = await frontendPerformanceMonitor.measureApiCall(
          'test-cron',
          () => fetch('/api/test-cron', { method: 'GET' })
        );
        
        if (response.ok) {
          const data = await response.json();
          frontendLogger.info(`Multi-Agent cycle #${tradingCycleCount} completed`, {
            component: 'NOF1Dashboard',
            data: {
              cycleNumber: tradingCycleCount,
              signals: data.cronResponse?.signals?.length || 0,
              bestSignal: data.cronResponse?.bestSignal?.symbol || 'none',
              confidence: data.cronResponse?.bestSignal?.confidence || 0,
            }
          });
        }
      } catch (error) {
        frontendErrorHandler.handleError(error as Error, 'NOF1Dashboard:tradingCycle', {
          maxRetries: 2,
          retryDelay: 5000,
        });
      } finally {
        timer();
      }
    };

    // Run trading cycle immediately and then every 30 seconds (more aggressive)
    runTradingCycle();
    const tradingIntervalId = setInterval(runTradingCycle, 30000); // Every 30 seconds

    // HIGH PRIORITY FIX: Cleanup intervals on unmount to prevent memory leaks
    return () => {
      isMountedRef.current = false;
      if (dataIntervalId) {
        clearInterval(dataIntervalId);
      }
      if (tradingIntervalId) {
        clearInterval(tradingIntervalId);
      }
    };
  }, [setAccountValue, updatePosition, addTrade, addModelMessage]);

  // OPTIMIZED: Memoize expensive calculations
  const dashboardMetrics = useMemo(() => {
    const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
    const pnlPercent = accountValue > 0 ? (totalPnL / accountValue) * 100 : 0;
    
    // Calculate real high/low from completed trades
    const completedTrades = trades.filter(t => !t.status || t.status === 'completed');
    let highestValue = accountValue;
    let lowestValue = accountValue;
    
    if (completedTrades.length > 0) {
      // Calculate cumulative account value at each trade
      let runningBalance = accountValue;
      completedTrades.forEach(trade => {
        runningBalance -= trade.pnl; // Go backwards
      });
      
      // Now go forward
      let currentMax = runningBalance;
      let currentMin = runningBalance;
      completedTrades.forEach(trade => {
        runningBalance += trade.pnl;
        currentMax = Math.max(currentMax, runningBalance);
        currentMin = Math.min(currentMin, runningBalance);
      });
      
      highestValue = currentMax;
      lowestValue = currentMin;
    }
    
    return { totalPnL, pnlPercent, highestValue, lowestValue, completedTrades };
  }, [positions, accountValue, trades]);

  // OPTIMIZED: Memoize displayed trades (slice + reverse)
  const displayedTrades = useMemo(() => {
    return trades.slice(-10).reverse();
  }, [trades]);

  // OPTIMIZED: Memoize tab change handler
  const handleTabChange = useCallback((tab: 'trades' | 'chat' | 'positions' | 'readme') => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="h-full overflow-hidden relative">
      {/* Futuristic Background Effects */}
      <div className="absolute inset-0 opacity-5">
        {/* Terminal Grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(74, 222, 128, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74, 222, 128, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'grid-move 30s linear infinite'
        }}></div>
        
        {/* Corner Brackets */}
        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-green-400/20"></div>
        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-green-400/20"></div>
        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-green-400/20"></div>
        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-green-400/20"></div>
      </div>
      
      {/* Main Layout - Perfect Fit, No Scroll */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-2 px-2 py-2 h-full relative z-10">
        
        {/* LEFT SIDE: MASSIVE Chart Area - Uses All Available Width */}
        <div className="relative h-full min-w-0">
          {/* Chart with Rounded Edges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-effect rounded-lg border border-green-400/30 overflow-hidden h-full flex flex-col relative"
          >
            {/* Futuristic Terminal Header */}
            <div className="bg-black/50 border-b border-green-400/30 px-4 py-1.5 flex items-center justify-center shrink-0 relative">
              <div className="text-xs text-green-400/60 uppercase tracking-wider">
                TOTAL ACCOUNT VALUE
              </div>
            </div>

            {/* Chart Area - Fixed Height */}
            <div className="overflow-hidden">
              <InteractiveChart initialBalance={accountValue} />
            </div>

            {/* Stats Bar - Ultra Compact */}
            <div className="border-t border-green-400/30 px-4 py-1.5 bg-black/50 flex items-center justify-between shrink-0">
              <div className="flex items-baseline gap-3">
                <div className="text-xl font-bold text-green-400">
                  ${accountValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`text-lg font-bold ${dashboardMetrics.pnlPercent >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                  {dashboardMetrics.pnlPercent >= 0 ? '+' : ''}{dashboardMetrics.pnlPercent.toFixed(2)}%
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-green-400/60 uppercase">24h High: </span>
                  <span className="text-green-400 font-bold">${dashboardMetrics.highestValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-green-400/60 uppercase">24h Low: </span>
                  <span className="text-red-500 font-bold">${dashboardMetrics.lowestValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-green-400/60 uppercase">Open Positions: </span>
                  <span className="text-neon-blue font-bold">{positions.length}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* RIGHT SIDEBAR: Rounded, Fits Without Scroll */}
        <div className="flex flex-col glass-effect rounded-lg border border-green-400/30 overflow-hidden h-full relative">
          {/* Futuristic Terminal Header */}
          <div className="flex border-b border-green-400/30 bg-black/50 shrink-0 relative">
            {/* Terminal Status Line */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/60 to-transparent animate-pulse"></div>
            
            <button
              onClick={() => handleTabChange('trades')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-400/30 transition-all relative ${
                activeTab === 'trades'
                  ? 'bg-green-400/10 text-green-400 border-b-2 border-b-green-400'
                  : 'text-green-400/60 hover:text-green-400 hover:bg-green-400/5'
              }`}
            >
              TRADES
            </button>
            <button
              onClick={() => handleTabChange('chat')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-400/30 transition-all ${
                activeTab === 'chat'
                  ? 'bg-green-400/10 text-green-400 border-b-2 border-b-green-400'
                  : 'text-green-400/60 hover:text-green-400 hover:bg-green-400/5'
              }`}
            >
              CHAT
            </button>
            <button
              onClick={() => handleTabChange('positions')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-400/30 transition-all ${
                activeTab === 'positions'
                  ? 'bg-green-400/10 text-green-400 border-b-2 border-b-green-400'
                  : 'text-green-400/60 hover:text-green-400 hover:bg-green-400/5'
              }`}
            >
              POS
            </button>
            <button
              onClick={() => handleTabChange('readme')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-400/30 transition-all ${
                activeTab === 'readme'
                  ? 'bg-green-400/10 text-green-400 border-b-2 border-b-green-400'
                  : 'text-green-400/60 hover:text-green-400 hover:bg-green-400/5'
              }`}
            >
              SYSTEM
            </button>
          </div>

          {/* Filter Header (for trades) */}
          {activeTab === 'trades' && (
            <div className="px-3 py-1 bg-black/50 border-b border-green-400/30 flex items-center justify-between shrink-0">
              <div className="text-xs text-green-400 uppercase font-bold">
                GODSPEED TRADES
              </div>
              <div className="text-xs text-green-400/60">
                Last 777
              </div>
            </div>
          )}

          {/* Content Area - No Scroll, Clean Layout */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <AnimatePresence mode="wait">
              {activeTab === 'trades' && (
                <motion.div
                  key="trades"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto space-y-2 px-3 py-2"
                >
                  {/* Trade List Items - Full Details */}
                  {/* OPTIMIZED: Use memoized displayedTrades */}
                  {displayedTrades.map((trade) => (
                    <div key={trade.id} className="p-3 border border-green-500/20 rounded hover:border-green-500/40 transition-all bg-black/20">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-green-500 font-bold text-sm">{trade.symbol}</span>
                          <span className={`px-2 py-0.5 text-xs rounded font-semibold ${
                            trade.side === 'LONG' ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-500'
                          }`}>
                            {trade.side}
                          </span>
                        </div>
                        <div className={`text-sm font-bold ${trade.pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </div>
                      </div>
                      
                      {/* Trade Details */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div>
                          <span className="text-green-500/60">Entry:</span>
                          <span className="text-green-500 ml-1 font-semibold">${trade.entryPrice?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Exit:</span>
                          <span className="text-green-500 ml-1 font-semibold">${trade.exitPrice?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Size:</span>
                          <span className="text-green-500 ml-1 font-semibold">{trade.size?.toFixed(4) || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-green-500/60">Leverage:</span>
                          <span className="text-green-500 ml-1 font-semibold">{trade.leverage || 'N/A'}x</span>
                        </div>
                      </div>
                      
                      {/* Timestamp */}
                      <div className="text-xs text-green-500/50 mt-2">
                        {new Date(trade.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {trades.length === 0 && (
                    <div className="text-center py-12 text-green-500/60 px-4">
                      <div className="text-4xl mb-3">📊</div>
                      <div className="text-sm font-semibold mb-2">No Trade History</div>
                      <div className="text-xs opacity-75 leading-relaxed">
                        New trades will appear here automatically.<br/>
                        Currently monitoring {positions.length} open position{positions.length !== 1 ? 's' : ''}.
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
              
              {activeTab === 'chat' && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-hidden"
                >
                  <EnhancedAIChat />
                </motion.div>
              )}
              
              {activeTab === 'positions' && (
                <motion.div
                  key="positions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto p-2"
                >
                  <Positions />
                </motion.div>
              )}
              
              {activeTab === 'readme' && (
                <motion.div
                  key="readme"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto p-2"
                >
                  <div className="text-green-400 text-xs space-y-3">
                    <div className="text-sm font-bold text-green-400 border-b border-green-400/30 pb-2">
                      GODSPEED SYSTEM INFORMATION
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-green-400/60">Status</span>
                        <span className="text-green-400 font-bold">● ACTIVE</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-400/60">Trading Mode</span>
                        <span className="text-neon-blue font-bold">MAXIMUM POWER</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-400/60">Account Value</span>
                        <span className="text-green-400 font-bold">${accountValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-400/60">Active Positions</span>
                        <span className="text-neon-blue font-bold">{positions.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-400/60">Completed Trades</span>
                        <span className="text-green-400 font-bold">{dashboardMetrics.completedTrades.length}</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-green-400/30 pt-2 space-y-1.5">
                      <div className="text-xs font-bold text-green-400/80">TRADING PARAMETERS</div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-400/60">Analysis Frequency</span>
                        <span className="text-green-400">30 seconds</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-400/60">Capital Deployment</span>
                        <span className="text-green-400">100% (Full Margin)</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-400/60">Leverage Range</span>
                        <span className="text-green-400">Dynamic (20x-50x)</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-400/60">Stop Loss</span>
                        <span className="text-red-500">-2.0% ROE</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-400/60">Take Profit</span>
                        <span className="text-green-400">+6.0% ROE</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-green-400/30 pt-2 text-xs text-green-400/60">
                      <div className="font-bold text-green-400/80 mb-1">EXCHANGE</div>
                      <div>Aster DEX Perpetual Futures</div>
                      <div>All USDT trading pairs</div>
                    </div>
                  </div>
                </motion.div>
              )}
              
              
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

