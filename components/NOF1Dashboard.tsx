'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import ModelChat from './ModelChat';
import TradeJournal from './TradeJournal';
import Positions from './Positions';
import AIPerformanceChart from './AIPerformanceChart';

// Chat Tab Component with reactive state
function ChatTabContent() {
  const modelMessages = useStore((state) => state.modelMessages);
  
  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto space-y-2 px-3 py-2"
    >
      {modelMessages.length === 0 ? (
        <div className="text-center py-12 text-green-500/60 px-4">
          <div className="text-4xl mb-3">🧠</div>
          <div className="text-sm font-semibold mb-2">Analyzing Markets</div>
          <div className="text-xs opacity-75 leading-relaxed">
            Godspeed is scanning all Aster DEX markets.<br/>
            Trade decisions will appear here when executed.
          </div>
        </div>
      ) : (
        modelMessages.slice(0, 10).map((msg: any) => (
          <div key={msg.id} className="p-3 border border-green-500/20 rounded bg-black/20">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                msg.type === 'trade' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-green-500/20 text-green-500'
              }`}>
                {msg.type === 'trade' ? '💼 TRADE' : '🔍 ANALYSIS'}
              </span>
              <span className="text-xs text-green-500/50">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-xs text-green-500 whitespace-pre-wrap leading-relaxed">
              {msg.message}
            </div>
          </div>
        ))
      )}
    </motion.div>
  );
}

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
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    
    let isMounted = true;

    const updateData = async () => {
      if (!isMounted) return;
      try {
        // Fetch account data and positions
        const accountResponse = await fetch('/api/optimized-data');
        if (accountResponse.ok) {
          const data = await accountResponse.json();
          if (isMounted && data.success) {
            const { accountValue, positions } = data.data;
            setAccountValue(accountValue);
            if (positions && Array.isArray(positions) && positions.length > 0) {
              positions.forEach((position: any) => {
                if (position && typeof position === 'object') {
                  updatePosition(position);
                }
              });
            }
          }
        }
        
        // Fetch completed trades
        const tradesResponse = await fetch('/api/trades?limit=100');
        if (tradesResponse.ok) {
          const tradesData = await tradesResponse.json();
          if (isMounted && tradesData.success && tradesData.trades) {
            // Add trades to store (only if they're not already there)
            tradesData.trades.forEach((trade: any) => {
              addTrade(trade);
            });
          }
        }

        // Fetch model messages (chat)
        const messagesResponse = await fetch('/api/model-message?limit=50');
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          if (isMounted && messagesData.success && messagesData.messages) {
            // Add messages to store (newest first)
            messagesData.messages.forEach((message: any) => {
              addModelMessage(message);
            });
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    // Start data updates every 250ms for ultra real-time updates
    updateData();
    const dataIntervalId = setInterval(updateData, 1000); // 1x per second (reduced from 250ms)

    // 🤖 GODSPEED AUTO-TRADING: Trigger trading cycle every 60 seconds
    // This ensures 24/7 trading even if Vercel cron fails
    let tradingCycleCount = 0;
    const runTradingCycle = async () => {
      if (!isMounted) return;
      try {
        tradingCycleCount++;
        console.log(`🔄 Godspeed Auto-Trading Cycle #${tradingCycleCount} starting...`);
        
        const response = await fetch('/api/test-cron', {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Godspeed cycle #${tradingCycleCount} completed:`, {
            signals: data.cronResponse?.signals?.length || 0,
            bestSignal: data.cronResponse?.bestSignal?.symbol || 'none',
            confidence: data.cronResponse?.bestSignal?.confidence || 0,
          });
        }
      } catch (error) {
        console.error('❌ Godspeed trading cycle failed:', error);
      }
    };

    // Run trading cycle immediately and then every 30 seconds (more aggressive)
    runTradingCycle();
    const tradingIntervalId = setInterval(runTradingCycle, 30000); // Every 30 seconds

    return () => {
      isMounted = false;
      clearInterval(dataIntervalId);
      clearInterval(tradingIntervalId);
    };
  }, [setAccountValue, updatePosition, addTrade, addModelMessage]);

  // Calculate real PnL and account metrics
  const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const pnlPercent = accountValue > 0 ? (totalPnL / accountValue) * 100 : 0;
  
  // Calculate real high/low from completed trades
  // All trades from database are completed (no status field needed)
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

  return (
    <div className="h-full overflow-hidden">
      {/* Main Layout - Perfect Fit, No Scroll */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-2 px-2 py-2 h-full">
        
        {/* LEFT SIDE: MASSIVE Chart Area - Uses All Available Width */}
        <div className="relative h-full min-w-0">
          {/* Chart with Rounded Edges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-effect rounded-lg border border-green-500/30 overflow-hidden h-full flex flex-col"
          >
            {/* Minimal Header: TOTAL ACCOUNT VALUE */}
            <div className="bg-black/50 border-b border-green-500/30 px-4 py-1.5 flex items-center justify-between shrink-0">
              <div className="text-xs text-green-500/60 uppercase tracking-wider">
                TOTAL ACCOUNT VALUE
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setTimeRange('ALL')}
                  className={`px-3 py-1 text-xs font-bold border transition-all ${
                    timeRange === 'ALL'
                      ? 'border-green-500 bg-green-500/20 text-green-500'
                      : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setTimeRange('72H')}
                  className={`px-3 py-1 text-xs font-bold border transition-all ${
                    timeRange === '72H'
                      ? 'border-green-500 bg-green-500/20 text-green-500'
                      : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
                  }`}
                >
                  72H
                </button>
              </div>
            </div>

            {/* MASSIVE Chart Area - Fills All Available Height */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AIPerformanceChart />
            </div>

            {/* Stats Bar - Ultra Compact */}
            <div className="border-t border-green-500/30 px-4 py-1.5 bg-black/50 flex items-center justify-between shrink-0">
              <div className="flex items-baseline gap-3">
                <div className="text-xl font-bold text-neon-green">
                  ${accountValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`text-lg font-bold ${pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-green-500/60 uppercase">24h High: </span>
                  <span className="text-green-500 font-bold">${highestValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-green-500/60 uppercase">24h Low: </span>
                  <span className="text-red-500 font-bold">${lowestValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-green-500/60 uppercase">Open Positions: </span>
                  <span className="text-neon-blue font-bold">{positions.length}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* RIGHT SIDEBAR: Rounded, Fits Without Scroll */}
        <div className="flex flex-col glass-effect rounded-lg border border-green-500/30 overflow-hidden h-full">
          {/* Top: Tab Buttons - Ultra Compact */}
          <div className="flex border-b border-green-500/30 bg-black/50 shrink-0">
            <button
              onClick={() => setActiveTab('trades')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-500/30 transition-all ${
                activeTab === 'trades'
                  ? 'bg-green-500/10 text-green-500 border-b-2 border-b-green-500'
                  : 'text-green-500/60 hover:text-green-500 hover:bg-green-500/5'
              }`}
            >
              TRADES
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-500/30 transition-all ${
                activeTab === 'chat'
                  ? 'bg-green-500/10 text-green-500 border-b-2 border-b-green-500'
                  : 'text-green-500/60 hover:text-green-500 hover:bg-green-500/5'
              }`}
            >
              CHAT
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight border-r border-green-500/30 transition-all ${
                activeTab === 'positions'
                  ? 'bg-green-500/10 text-green-500 border-b-2 border-b-green-500'
                  : 'text-green-500/60 hover:text-green-500 hover:bg-green-500/5'
              }`}
            >
              POS
            </button>
            <button
              onClick={() => setActiveTab('readme')}
              className={`flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-tight transition-all ${
                activeTab === 'readme'
                  ? 'bg-green-500/10 text-green-500 border-b-2 border-b-green-500'
                  : 'text-green-500/60 hover:text-green-500 hover:bg-green-500/5'
              }`}
            >
              SYSTEM
            </button>
          </div>

          {/* Filter Header (for trades) */}
          {activeTab === 'trades' && (
            <div className="px-3 py-1 bg-black/50 border-b border-green-500/30 flex items-center justify-between shrink-0">
              <div className="text-xs text-green-500 uppercase font-bold">
                GODSPEED TRADES
              </div>
              <div className="text-xs text-green-500/60">
                Last 500
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
                  {trades.slice(-10).reverse().map((trade) => (
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
                <ChatTabContent />
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
                  <div className="text-green-500 text-xs space-y-3">
                    <div className="text-sm font-bold text-neon-green border-b border-green-500/30 pb-2">
                      GODSPEED SYSTEM INFORMATION
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-green-500/60">Status</span>
                        <span className="text-green-500 font-bold">● ACTIVE</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-500/60">Trading Mode</span>
                        <span className="text-neon-blue font-bold">MAXIMUM POWER</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-500/60">Account Value</span>
                        <span className="text-green-500 font-bold">${accountValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-500/60">Active Positions</span>
                        <span className="text-neon-blue font-bold">{positions.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-green-500/60">Completed Trades</span>
                        <span className="text-green-500 font-bold">{completedTrades.length}</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-green-500/30 pt-2 space-y-1.5">
                      <div className="text-xs font-bold text-green-500/80">TRADING PARAMETERS</div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500/60">Analysis Frequency</span>
                        <span className="text-green-500">30 seconds</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500/60">Capital Deployment</span>
                        <span className="text-green-500">100% (Full Margin)</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500/60">Leverage Range</span>
                        <span className="text-green-500">Dynamic (20x-50x)</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500/60">Stop Loss</span>
                        <span className="text-red-500">-2.0% ROE</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500/60">Take Profit</span>
                        <span className="text-green-500">+6.0% ROE</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-green-500/30 pt-2 text-xs text-green-500/60">
                      <div className="font-bold text-green-500/80 mb-1">EXCHANGE</div>
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

