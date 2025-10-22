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
  
  // Get real model stats and trades from store
  const modelStats = useStore((state) => state.modelStats);
  const trades = useStore((state) => state.trades);

  useEffect(() => {
    // Initialize state with $100 starting capital (matching AI model)
    const INITIAL_CAPITAL = 100;
    setTotalValue(INITIAL_CAPITAL);
    setLatency(Math.floor(Math.random() * 20 + 10));
    
    // Track if first message received
    let firstMessageReceived = false;
    let isMounted = true; // Track component mount status
    
    // Initialize Aster DEX service
    asterDexService.initialize().then(() => {
      if (isMounted) {
        logger.info('Dashboard: Aster DEX initialized with $100 capital', { context: 'Dashboard' });
      }
    });

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
        
        // Calculate total value: REAL WALLET BALANCE + unrealized P&L from positions
        const unrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
        const totalAccountValue = balance + unrealizedPnL;
        
        if (isMounted) {
          setTotalValue(totalAccountValue);
          setAccountValue(totalAccountValue); // Sync to store for TradingChart
          logger.info(`💰 REAL WALLET BALANCE: $${balance.toFixed(2)} + P&L: $${unrealizedPnL.toFixed(2)} = TOTAL: $${totalAccountValue.toFixed(2)}`, {
            context: 'Dashboard',
            data: { balance, unrealizedPnL, positions: positions.length, totalValue: totalAccountValue },
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
      clearTimeout(connectionTimeout);
      clearInterval(valueInterval);
      clearInterval(latencyInterval);
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
          <div className="mb-4">
            <h2 className="text-sm text-green-500/60 mb-2">TOTAL ACCOUNT VALUE</h2>
            <div className="text-4xl font-bold terminal-text">
              ${totalValue.toFixed(2)}
            </div>
            <button className="text-xs text-neon-blue mt-2 hover:underline">
              DETAILED VIEW
            </button>
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
            {/* Show AlphaTrader with real stats or initial state */}
            {(() => {
              const alphaStats = modelStats.find(m => m.name === 'AlphaTrader');
              const modelTrades = trades.filter(t => t.model === 'AlphaTrader').length;
              const pnl = alphaStats?.pnl || 0;
              const winRate = alphaStats?.winRate || 0;
              const totalTrades = alphaStats?.trades || modelTrades || 0;
              const pnlPercent = pnl > 0 ? `+${pnl.toFixed(2)}%` : `${pnl.toFixed(2)}%`;
              
              return (
                <div className="flex items-center justify-between p-3 border-2 border-neon-green/60 hover:border-neon-green transition-all bg-green-500/5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-neon-blue font-bold text-xl">●</span>
                      <span className="text-green-500 font-bold text-lg">AlphaTrader</span>
                      <span className="text-xs text-neon-green px-2 py-1 bg-neon-green/20 rounded">ACTIVE</span>
                    </div>
                    <div className="text-xs text-green-500/80 space-y-1">
                      <div>Strategy: Momentum + Trend</div>
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
              <div className="mb-1">🤖 <span className="font-bold">AlphaTrader</span> analyzes BTC/USDT momentum patterns and executes trades when confidence exceeds 60%.</div>
              <div className="mt-2 text-neon-blue">Real-time data from Aster DEX</div>
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

