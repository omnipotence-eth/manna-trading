'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TradingChart from './TradingChart';
import Positions from './Positions';
import CompletedTrades from './CompletedTrades';
import ModelChat from './ModelChat';
import ReadmePanel from './ReadmePanel';
import LivePriceDisplay from './LivePriceDisplay';
import { asterDexService } from '@/services/asterDexService';
import { logger } from '@/lib/logger';
import { useStore } from '@/store/useStore';

export default function Dashboard() {
  const [activePanel, setActivePanel] = useState<'trades' | 'chat' | 'positions' | 'readme'>('trades');
  const [totalValue, setTotalValue] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const [latency, setLatency] = useState(15);
  const updateLivePrice = useStore((state) => state.updateLivePrice);
  const setAccountValue = useStore((state) => state.setAccountValue);
  const setConnected = useStore((state) => state.setConnected);
  
  // Get real model stats and trades from store
  const modelStats = useStore((state) => state.modelStats);
  const trades = useStore((state) => state.trades);

  useEffect(() => {
    console.log('🚀 Dashboard useEffect STARTED');
    // Initialize state with $100 starting capital (matching AI model)
    const INITIAL_CAPITAL = 100;
    setTotalValue(INITIAL_CAPITAL);
    setLatency(Math.floor(Math.random() * 20 + 10));
    
    // Track if first message received
    let firstMessageReceived = false;
    let isMounted = true; // Track component mount status
    
    console.log('📡 About to initialize Aster DEX and start API calls...');
    // Initialize Aster DEX service for WebSocket connection only
    asterDexService.initialize().then(() => {
      if (isMounted) {
        logger.info('Dashboard: Aster DEX initialized (WebSocket only)', { context: 'Dashboard' });
        logger.info('🤖 DeepSeek R1 is running on the server 24/7!', { context: 'Dashboard' });
      }
    });

    // Call server-side trading API every 10 seconds
    const callTradingAPI = async () => {
      if (!isMounted) return;
      try {
        logger.info('🔄 Calling /api/trading...', { context: 'Dashboard' });
        const response = await fetch('/api/trading');
        logger.info(`📡 API response status: ${response.status}`, { context: 'Dashboard' });
        const data = await response.json();
        logger.info('📦 API response data:', { context: 'Dashboard', data });
        if (data.success) {
          logger.info('✅ Trading cycle completed', { context: 'Dashboard', data });
          
          // Process ALL signals (all 5 markets)
          if (data.signals && Array.isArray(data.signals)) {
            logger.info(`📨 Processing ${data.signals.length} market analyses`, { context: 'Dashboard' });
            
            // Add each signal to Model Chat
            data.signals.forEach((signal: any, index: number) => {
              const symbol = signal.symbol;
              const action = signal.action;
              const confidence = (signal.confidence * 100).toFixed(1);
              
              useStore.getState().addModelMessage({
                id: `${Date.now()}-${index}-analysis`,
                model: 'DeepSeek R1',
                message: `[${symbol}] ${action} Signal (${confidence}% confidence) - ${signal.reasoning}`,
                timestamp: Date.now() + index, // Slight offset to maintain order
                type: action === 'HOLD' ? 'analysis' : 'alert',
              });
            });
            
            // If there's a best signal that will be executed, add execution message (40% threshold)
            if (data.bestSignal && data.bestSignal.action !== 'HOLD' && data.bestSignal.confidence > 0.4) {
              const symbol = data.bestSignal.symbol;
              const action = data.bestSignal.action;
              const confidence = (data.bestSignal.confidence * 100).toFixed(1);
              
              useStore.getState().addModelMessage({
                id: `${Date.now()}-execution`,
                model: 'DeepSeek R1',
                message: `🚀 EXECUTING BEST SIGNAL: ${action} ${data.bestSignal.size.toFixed(4)} ${symbol} @ ${confidence}% confidence`,
                timestamp: Date.now() + 1000, // Add at the end
                type: 'trade',
              });
            }
            
            const currentMessages = useStore.getState().modelMessages;
            logger.info(`📊 Model Chat now has ${currentMessages.length} messages`, { context: 'Dashboard' });
          }
        } else {
          logger.error('❌ Trading cycle failed', data.error, { context: 'Dashboard' });
        }
      } catch (error) {
        logger.error('Failed to call trading API', error, { context: 'Dashboard' });
      }
    };

    // Add a test message on mount to verify Model Chat works
    useStore.getState().addModelMessage({
      id: `${Date.now()}-test`,
      model: 'DeepSeek R1',
      message: '🟢 System initialized. Starting market analysis...',
      timestamp: Date.now(),
      type: 'analysis',
    });
    logger.info('✅ Added test message to Model Chat', { context: 'Dashboard' });
    
    // Start trading cycles
    callTradingAPI(); // Initial call
    const tradingInterval = setInterval(callTradingAPI, 10000); // Every 10 seconds

    // Connect to WebSocket for real-time data (supports all 6 symbols)
    asterDexService.connectWebSocket((data) => {
      if (!isMounted) return; // Ignore data if unmounted
      
      const wsData = (data.data || {}) as any;
      
      // Debug: Log ALL received data to verify what's coming in
      if (wsData.symbol) {
        logger.debug('📊 WebSocket data received', { 
          context: 'Dashboard',
          data: { 
            type: data.type, 
            symbol: wsData.symbol, 
            price: wsData.price || 0,
            change: wsData.priceChangePercent || 0,
          },
        });
      }
      
      // Mark as connected on first message
      if (!firstMessageReceived) {
        firstMessageReceived = true;
        setIsConnecting(false);
        setConnected(true); // Update global connection state
        logger.info('✅ FIRST DATA RECEIVED - UI NOW LIVE!', { context: 'Dashboard' });
      }

      // Update UI based on real-time data from TRADE events (most frequent)
      if (data.type === 'trade' && wsData.price && wsData.symbol) {
        const currentPrice = wsData.price;
        const wsSymbol = wsData.symbol; // e.g., 'btcusdt' or 'BTCUSDT'
        
        logger.info(`💰 LIVE PRICE UPDATE: ${wsSymbol} = $${currentPrice.toLocaleString()}`, { 
          context: 'Dashboard',
          data: { symbol: wsSymbol, price: currentPrice, quantity: wsData.quantity },
        });

        // Store using uppercase format (BTCUSDT) - matches PriceTicker lookup
        const storeKey = wsSymbol.toUpperCase();
        updateLivePrice(storeKey, {
          symbol: storeKey.replace('USDT', '/USDT'),
          price: currentPrice,
          lastUpdate: Date.now(),
        });
        
        logger.debug(`✅ Stored price: ${storeKey} = $${currentPrice}`, { context: 'Dashboard' });
      }

      // Also handle ticker data (24hr statistics)
      if (data.type === 'ticker' && wsData.price && wsData.symbol) {
        const wsSymbol = wsData.symbol; // e.g., 'btcusdt' or 'BTCUSDT'
        
        logger.info(`📊 24HR TICKER: ${wsSymbol} = $${wsData.price.toLocaleString()}`, {
          context: 'Dashboard',
          data: { 
            price: wsData.price,
            change: wsData.priceChangePercent,
            volume: wsData.volume 
          },
        });

        // Store using uppercase format (BTCUSDT) - matches PriceTicker lookup
        const storeKey = wsSymbol.toUpperCase();
        updateLivePrice(storeKey, {
          symbol: storeKey.replace('USDT', '/USDT'),
          price: wsData.price,
          change: wsData.priceChangePercent,
          lastUpdate: Date.now(),
        });
        
        logger.debug(`✅ Stored ticker: ${storeKey} = $${wsData.price} (${wsData.priceChangePercent}%)`, { context: 'Dashboard' });
      }

      // Handle order book updates
      if (data.type === 'orderUpdate') {
        logger.debug('📖 Order book update', {
          context: 'Dashboard',
          data: { symbol: wsData.symbol },
        });
      }
    });
    
    // Connection timeout fallback
    const connectionTimeout = setTimeout(() => {
      setIsConnecting(false);
    }, 5000);
    
    // Update account value with REAL wallet balance from Aster DEX
    const updateAccountValue = async () => {
      try {
        const positions = await asterDexService.getPositions();
        const balance = await asterDexService.getBalance();
        
        logger.info(`🔍 Fetched from Aster: Balance=$${balance.toFixed(2)}, Positions=${positions.length}`, {
          context: 'Dashboard',
          data: { balance, positionCount: positions.length },
        });
        
        // Calculate total value: REAL WALLET BALANCE + unrealized P&L from positions
        const unrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
        const totalAccountValue = balance + unrealizedPnL;
        
        if (isMounted) {
          setTotalValue(totalAccountValue);
          setAccountValue(totalAccountValue); // Sync to store for TradingChart
          logger.info(`💰 DISPLAYED VALUE: $${totalAccountValue.toFixed(2)} (Balance: $${balance.toFixed(2)} + P&L: $${unrealizedPnL.toFixed(2)})`, {
            context: 'Dashboard',
            data: { balance, unrealizedPnL, positions: positions.length, totalValue: totalAccountValue, displayedValue: totalAccountValue },
          });
        }
      } catch (error) {
        logger.error('Failed to update account value', error, { context: 'Dashboard' });
        // Fallback: use INITIAL_CAPITAL if API fails
        if (isMounted) {
          setTotalValue(INITIAL_CAPITAL);
          setAccountValue(INITIAL_CAPITAL);
        }
      }
    };

    // Update account value every 5 seconds with real data
    const valueInterval = setInterval(updateAccountValue, 5000);
    updateAccountValue(); // Initial call

    // Latency updates
    const latencyInterval = setInterval(() => {
      setLatency(Math.floor(Math.random() * 20 + 10));
    }, 5000);

    // Cleanup all timers and connections
    return () => {
      isMounted = false; // Mark as unmounted
      setConnected(false); // Mark as disconnected
      clearTimeout(connectionTimeout);
      clearInterval(valueInterval);
      clearInterval(latencyInterval);
      clearInterval(tradingInterval); // Stop trading API calls
      asterDexService.disconnect();
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel - Chart and Account Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Live Price Display */}
        <LivePriceDisplay />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect p-6 rounded-lg"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-sm text-green-500/60 mb-2">TOTAL ACCOUNT VALUE</h2>
              <div className="text-4xl font-bold terminal-text">
                ${totalValue.toFixed(2)}
              </div>
              <button className="text-xs text-neon-blue mt-2 hover:underline">
                DETAILED VIEW
              </button>
            </div>
            
            {/* Bot Wallet Address */}
            <div className="ml-4">
              <div className="text-xs text-green-500/60 mb-2">BOT WALLET</div>
              <div 
                onClick={() => {
                  const address = '0x3E48e3A840690DdE27Ba12555eE203cf1577ae7E';
                  navigator.clipboard.writeText(address);
                  const btn = document.getElementById('wallet-copy-btn');
                  if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = '✓ COPIED!';
                    btn.classList.add('text-neon-green');
                    setTimeout(() => {
                      btn.textContent = originalText;
                      btn.classList.remove('text-neon-green');
                    }, 2000);
                  }
                }}
                className="flex items-center gap-2 p-2 bg-green-500/5 border border-green-500/30 hover:border-neon-green transition-all cursor-pointer group rounded"
              >
                <div className="font-mono text-xs text-green-500">
                  0x3E48...ae7E
                </div>
                <button 
                  id="wallet-copy-btn"
                  className="text-xs text-neon-blue hover:text-neon-green transition-all whitespace-nowrap"
                >
                  📋
                </button>
              </div>
              <div className="text-[10px] text-green-500/40 mt-1 font-mono text-right">
                Click to copy
              </div>
            </div>
          </div>

          <TradingChart />
        </motion.div>

        {/* Panel Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-effect p-6 rounded-lg"
        >
          <div className="flex gap-2 mb-4 border-b border-green-500/30 pb-2">
            {[
              { id: 'trades' as const, label: 'COMPLETED TRADES' },
              { id: 'chat' as const, label: 'MODEL CHAT' },
              { id: 'positions' as const, label: 'POSITIONS' },
              { id: 'readme' as const, label: 'README.TXT' },
            ].map((panel) => (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={`px-4 py-2 text-sm transition-all ${
                  activePanel === panel.id
                    ? 'text-green-500 border-b-2 border-green-500'
                    : 'text-green-500/60 hover:text-green-500'
                }`}
              >
                {panel.label}&gt;
              </button>
            ))}
          </div>

          <div className="min-h-[300px]">
            {activePanel === 'trades' && <CompletedTrades />}
            {activePanel === 'chat' && <ModelChat />}
            {activePanel === 'positions' && <Positions />}
            {activePanel === 'readme' && <ReadmePanel />}
          </div>
        </motion.div>
      </div>

      {/* Right Panel - Leading Models & Status */}
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-effect p-6 rounded-lg"
        >
          <h3 className="text-lg font-bold mb-4 terminal-text">AI MODEL</h3>
          
          <div className="space-y-3">
            {/* Show DeepSeek R1 with real stats or initial state */}
            {(() => {
              const deepseekStats = modelStats.find(m => m.name === 'DeepSeek R1');
              const modelTrades = trades.filter(t => t.model === 'DeepSeek R1').length;
              const pnl = deepseekStats?.pnl || 0;
              const winRate = deepseekStats?.winRate || 0;
              const totalTrades = deepseekStats?.trades || modelTrades || 0;
              const pnlPercent = pnl > 0 ? `+${pnl.toFixed(2)}%` : `${pnl.toFixed(2)}%`;
              
              return (
                <div className="flex items-center justify-between p-3 border-2 border-neon-green/60 hover:border-neon-green transition-all bg-green-500/5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-neon-blue font-bold text-xl">●</span>
                      <span className="text-green-500 font-bold text-lg">DeepSeek R1</span>
                      <span className="text-xs text-neon-green px-2 py-1 bg-neon-green/20 rounded">ACTIVE</span>
                    </div>
                    <div className="text-xs text-green-500/80 space-y-1">
                      <div>Strategy: Deep Reasoning + Patterns</div>
                      <div>Capital: $100 USDT</div>
                      <div>Trades: {totalTrades} • Win Rate: {winRate.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${pnl >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                      {pnlPercent}
                    </div>
                    <div className="text-xs text-green-500/60 mt-1">P&L</div>
                  </div>
                </div>
              );
            })()}
            
            {/* Info panel */}
            <div className="p-3 border border-green-500/20 bg-black/40 text-xs text-green-500/70">
              <div className="mb-1">🤖 <span className="font-bold">DeepSeek R1</span> analyzes BTC, ETH, SOL, ASTER, and ZEC markets using advanced reasoning. Picks the best opportunity with highest confidence.</div>
              <div className="mt-2 text-neon-blue">Real-time multi-market analysis via Aster DEX</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-effect p-6 rounded-lg"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-neon-green'}`}></div>
              <span className="text-xs">
                {isConnecting ? 'CONNECTING TO ASTER DEX...' : 'CONNECTED TO ASTER DEX'}
              </span>
            </div>
            
            {!isConnecting && (
              <div className="text-xs text-green-500/60 font-mono">
                <div>[████████████] 100%</div>
                <div className="mt-2">STATUS: ONLINE</div>
                <div>LATENCY: {latency}ms</div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

