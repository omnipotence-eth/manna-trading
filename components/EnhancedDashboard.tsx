'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import SimplePriceChart from './SimplePriceChart';
import ConfidenceHeatmap from './ConfidenceHeatmap';
import PnLGauge from './ui/PnLGauge';
import AIChartAnalysis from './AIChartAnalysis';
import { Skeleton, SkeletonChart, SkeletonCard } from './ui/Skeleton';
import Positions from './Positions';
import ModelChat from './ModelChat';
import { SafeComponent } from './SafeComponent';

export default function EnhancedDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const [isLoading, setIsLoading] = useState(true);
  const accountValue = useStore((state) => state.accountValue);
  const positions = useStore((state) => state.positions);
  const trades = useStore((state) => state.trades);
  const setAccountValue = useStore((state) => state.setAccountValue);
  const updatePosition = useStore((state) => state.updatePosition);
  const removePosition = useStore((state) => state.removePosition);
  const initRef = useRef(false); // Prevent double initialization in Strict Mode

  useEffect(() => {
    console.log('🔵 useEffect triggered!');
    
    // Prevent double initialization in React Strict Mode
    if (initRef.current) {
      console.log('⏭️ Skipping duplicate initialization (Strict Mode)');
      return;
    }
    initRef.current = true;
    
    // Initial loading - start with loading true, then set false after data loads
    let isMounted = true;
    
    console.log('🚀🚀🚀 EnhancedDashboard mounted - starting data fetch...');
    console.log('📍 Browser Console Check: If you see this, React is working!');
    console.log('🔍 isMounted:', isMounted);
    console.log('🔍 accountValue:', accountValue);
    console.log('🔍 positions.length:', positions.length);

    // OPTIMIZED: Fetch all data in one call for maximum speed
    const updateOptimizedData = async () => {
      if (!isMounted) return;
      try {
        console.log('🚀 Fetching optimized data...');
        const startTime = Date.now();
        const response = await fetch('/api/optimized-data');
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Optimized data fetched in ${responseTime}ms:`, data);
          
          if (isMounted && data.success) {
            const { accountValue, positions, totalPnL, unrealizedPnL } = data.data;
            
            // Update account value
            setAccountValue(accountValue);
            
            // Update positions with safety checks
            if (positions && Array.isArray(positions)) {
              positions.forEach((position: any) => {
                if (position && typeof position === 'object') {
                  updatePosition(position);
                }
              });
            }
            
            console.log(`📊 Updated: Account=${accountValue}, Positions=${positions.length}, PnL=${unrealizedPnL}`);
          }
        } else {
          console.error('❌ Failed to fetch optimized data:', response.status);
        }
      } catch (error) {
        console.error('❌ Error fetching optimized data:', error);
      }
    };

    // Fetch account value and positions
    const updateAccountValue = async () => {
      if (!isMounted) return;
      try {
        console.log('📊 Fetching account value...');
        const response = await fetch('/api/aster/account');
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Account data received:', data);
          if (data.balance !== undefined) {
            setAccountValue(data.balance);
            console.log('💰 Account value updated:', data.balance);
          }
        } else {
          console.error('❌ Account API returned', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch account value:', error);
      }
    };

    const updateTrades = async () => {
      if (!isMounted) return;
      try {
        console.log('📜 Fetching trade history from server...');
        const response = await fetch('/api/trades');
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Trade history received:', data);
          if (data.success && Array.isArray(data.trades)) {
            console.log(`📊 Found ${data.trades.length} historical trades`);
            // Load trades into store
            data.trades.forEach((trade: any) => {
              useStore.getState().addTrade(trade);
            });
            console.log(`✅ Loaded ${data.trades.length} trades into store`);
          }
        } else {
          console.error('❌ Trades API returned', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch trades:', error);
      }
    };

    const updatePositions = async () => {
      if (!isMounted) return;
      try {
        console.log('📍 Fetching positions from Aster DEX...');
        const response = await fetch('/api/aster/positions');
        console.log(`📡 Positions API response status: ${response.status}`);
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Positions data received:', data);
          console.log(`📊 Data type: ${Array.isArray(data) ? 'Array' : typeof data}, Length: ${Array.isArray(data) ? data.length : 'N/A'}`);
          // API returns array directly
          if (Array.isArray(data)) {
            console.log(`📊 Found ${data.length} positions`);
            // Update store with current positions
            const currentPositionSymbols = new Set();
            
            data.forEach((pos: any) => {
              const positionAmt = parseFloat(pos.positionAmt || 0);
              if (positionAmt === 0) return; // Skip empty positions
              
              const side = positionAmt > 0 ? 'LONG' : 'SHORT';
              const symbol = pos.symbol;
              const entryPrice = parseFloat(pos.entryPrice || 0);
              const currentPrice = parseFloat(pos.markPrice || pos.entryPrice || 0);
              const pnl = parseFloat(pos.unRealizedProfit || 0);
              const size = Math.abs(positionAmt);
              
              // Calculate P&L percentage - use DOLLAR P&L divided by MARGIN (not position value)
              // This shows your actual ROE (Return on Equity) which accounts for leverage
              const leverage = parseFloat(pos.leverage || 5);
              const marginUsed = (entryPrice * size) / leverage; // How much of YOUR money is at risk
              
              // Calculate ROE percentage: (P&L / Margin Used) * 100
              let pnlPercent = 0;
              if (marginUsed > 0) {
                pnlPercent = (pnl / marginUsed) * 100;
              }
              
              // Also calculate price-based P&L for comparison
              let pricePnlPercent = 0;
              if (entryPrice > 0) {
                if (side === 'LONG') {
                  pricePnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                  pricePnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
                }
              }
              
              console.log(`📊 Position P&L Calculation:`, {
                symbol,
                dollarPnL: pnl.toFixed(2),
                marginUsed: marginUsed.toFixed(2),
                ROE_percent: pnlPercent.toFixed(2),
                priceMove_percent: pricePnlPercent.toFixed(2),
                leverage: leverage,
              });
              
              currentPositionSymbols.add(symbol);
              
              updatePosition({
                id: symbol,
                symbol: symbol,
                side: side,
                size: size,
                entryPrice: entryPrice,
                currentPrice: currentPrice,
                pnl: pnl,
                pnlPercent: pnlPercent,
                leverage: parseFloat(pos.leverage || 1),
                model: 'DeepSeek R1',
              });
              console.log(`✅ Updated position: ${symbol} ${side} (${size.toFixed(4)} @ $${entryPrice}) P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
            });

            // Remove positions that no longer exist
            positions.forEach((pos) => {
              if (!currentPositionSymbols.has(pos.symbol)) {
                removePosition(pos.id);
                console.log(`🗑️ Removed old position: ${pos.symbol}`);
              }
            });
          }
        } else {
          console.error('❌ Positions API returned', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch positions:', error);
      }
    };

    const callTradingAPI = async () => {
      if (!isMounted) return;
      try {
        console.log('🤖 Fetching AI trading signals...');
        
        // Add timeout to fetch (90 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        
        const response = await fetch('/api/trading', {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Trading API response:', data);
          if (data.success && data.signals) {
            console.log(`🧠 Processing ${data.signals.length} AI signals`);
            // Update model messages with AI analysis
            data.signals.forEach((signal: any, index: number) => {
              const symbol = signal.symbol;
              const action = signal.action;
              const confidence = (signal.confidence * 100).toFixed(1);
              
              useStore.getState().addModelMessage({
                id: `${Date.now()}-${index}`,
                model: 'DeepSeek R1',
                message: `[${symbol}] ${action} (${confidence}%) - ${signal.reasoning}`,
                timestamp: Date.now() + index,
                type: action === 'HOLD' ? 'analysis' : 'alert',
              });
            });
            console.log(`✅ Added ${data.signals.length} messages to store`);
          }
        } else {
          console.error('❌ Trading API returned', response.status);
          // Add error message to chat
          useStore.getState().addModelMessage({
            id: `error-${Date.now()}`,
            model: 'System',
            message: `⚠️ Trading API error: ${response.status}`,
            timestamp: Date.now(),
            type: 'alert',
          });
        }
      } catch (error: any) {
        console.error('❌ Failed to call trading API:', error);
        // Add timeout/error message to chat
        if (error.name === 'AbortError') {
          console.log('⏱️ Trading API timeout (90s) - analysis still running on server');
          useStore.getState().addModelMessage({
            id: `timeout-${Date.now()}`,
            model: 'System',
            message: '⏱️ Analysis taking longer than expected... Results will appear when ready.',
            timestamp: Date.now(),
            type: 'analysis',
          });
        } else {
          useStore.getState().addModelMessage({
            id: `error-${Date.now()}`,
            model: 'System',
            message: `⚠️ Failed to fetch AI signals: ${error.message}`,
            timestamp: Date.now(),
            type: 'alert',
          });
        }
      }
    };

    // Add initial system message
    useStore.getState().addModelMessage({
      id: `init-${Date.now()}`,
      model: 'DeepSeek R1',
      message: '🟢 System initialized. Starting market analysis...',
      timestamp: Date.now(),
      type: 'analysis',
    });
    console.log('✅ Added initialization message to Model Chat');

    // Initial calls - run sequentially to avoid race conditions
    const initializeData = async () => {
      console.log('🔄 Starting initial data fetch...');
      try {
        await updateAccountValue();
        console.log('✅ Account value updated');
        await updateTrades();
        console.log('✅ Trade history loaded');
        await updatePositions();
        console.log('✅ Positions updated');
        await callTradingAPI();
        console.log('✅ Trading API called');
      } catch (error) {
        console.error('❌ Error during initialization:', error);
      } finally {
        if (isMounted) {
          console.log('🎯 Setting isLoading to FALSE');
          setIsLoading(false);
          console.log('✅ Loading complete, showing UI');
        }
      }
    };

    // Force loading to false after 3 seconds as a failsafe
    setTimeout(() => {
      if (isLoading) {
        console.warn('⚠️ Forcing isLoading to false after timeout');
        setIsLoading(false);
      }
    }, 3000);

    initializeData();

    // Set up intervals - OPTIMIZED for maximum speed and accuracy
    const optimizedInterval = setInterval(updateOptimizedData, 1000); // Every 1s - ULTRA FAST
    const tradesInterval = setInterval(updateTrades, 10000); // Every 10s (check for new trades)
    const tradingInterval = setInterval(callTradingAPI, 60000); // Every 60s (AI analysis - keep at 1 min)
    
    // REMOVED: Redundant fallback intervals that were causing conflicts
    // The optimized service now handles all account value and positions data

    return () => {
      isMounted = false;
      clearInterval(optimizedInterval);
      clearInterval(tradesInterval);
      clearInterval(tradingInterval);
      console.log('🛑 EnhancedDashboard unmounted - cleaned up intervals');
    };
  }, []);

  // Calculate total P&L
  const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const totalPnLPercent = accountValue && accountValue !== 0 ? (totalPnL / Math.abs(accountValue)) * 100 : 0;

  // Calculate win rate
  const winRate = trades.length > 0
    ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100
    : 0;

  // Popular symbols
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];

  return (
    <div className="w-full space-y-8">
      {/* Header Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Account Value Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect p-6 rounded-lg"
        >
          {isLoading ? (
            <Skeleton height="4rem" />
          ) : (
            <>
              <div className="text-sm text-green-500/60 mb-2">Account Value</div>
              <div className="text-3xl font-bold terminal-text mb-1">
                ${accountValue.toFixed(2)}
              </div>
              <div className={`text-sm ${totalPnL >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                {totalPnL >= 0 ? '▲' : '▼'} ${Math.abs(totalPnL).toFixed(2)} ({totalPnLPercent.toFixed(2)}%)
              </div>
            </>
          )}
        </motion.div>

        {/* Open Positions Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-effect p-6 rounded-lg"
        >
          {isLoading ? (
            <Skeleton height="4rem" />
          ) : (
            <>
              <div className="text-sm text-green-500/60 mb-2">Open Positions</div>
              <div className="text-3xl font-bold text-neon-blue mb-1">
                {positions.length}
              </div>
              <div className="text-sm text-green-500/60">
                Active trades
              </div>
            </>
          )}
        </motion.div>

        {/* Win Rate Gauge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-effect p-6 rounded-lg flex flex-col items-center justify-center"
        >
          {isLoading ? (
            <Skeleton variant="circular" width="100px" height="100px" />
          ) : (
            <div className="flex flex-col items-center">
              <PnLGauge value={winRate} label="Win Rate" size="sm" showPercentage={true} />
            </div>
          )}
        </motion.div>

        {/* Total Trades Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-effect p-6 rounded-lg"
        >
          {isLoading ? (
            <Skeleton height="4rem" />
          ) : (
            <>
              <div className="text-sm text-green-500/60 mb-2">Total Trades</div>
              <div className="text-3xl font-bold text-neon-green mb-1">
                {trades.length}
              </div>
              <div className="text-sm text-green-500/60">
                {trades.filter(t => t.pnl > 0).length} wins • {trades.filter(t => t.pnl <= 0).length} losses
              </div>
            </>
          )}
        </motion.div>

        {/* Overall P&L Gauge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-effect p-6 rounded-lg flex flex-col items-center justify-center"
        >
          {isLoading ? (
            <Skeleton variant="circular" width="100px" height="100px" />
          ) : (
            <div className="flex flex-col items-center">
              <PnLGauge value={totalPnLPercent} label="P&L %" size="sm" showPercentage={true} />
              <div className={`text-sm font-mono font-bold mt-2 ${totalPnL >= 0 ? 'text-neon-green' : 'text-red-500'}`}>
                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Confidence Heatmap */}
      <SafeComponent name="ConfidenceHeatmap" fallback={<SkeletonCard />}>
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <ConfidenceHeatmap />
        )}
      </SafeComponent>

      {/* Chart and P&L Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Price Chart */}
        <div className="lg:col-span-2">
          <SafeComponent name="PriceChart" fallback={<SkeletonChart />}>
            {isLoading ? (
              <SkeletonChart />
            ) : (
              <>
                {/* Symbol Selector */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {symbols.map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                        selectedSymbol === symbol
                          ? 'bg-neon-blue text-black font-bold'
                          : 'glass-effect text-green-500 hover:bg-white/10'
                      }`}
                    >
                      {symbol.split('/')[0]}
                    </button>
                  ))}
                </div>
                
                <SimplePriceChart symbol={selectedSymbol} height={350} />
              </>
            )}
          </SafeComponent>
        </div>

        {/* AI Chart Analysis */}
        <SafeComponent name="AIChartAnalysis" fallback={<SkeletonCard />}>
          {isLoading ? (
            <SkeletonCard />
          ) : (
            <AIChartAnalysis symbol={selectedSymbol} />
          )}
        </SafeComponent>
      </div>

      {/* Positions */}
      <Positions />

      {/* Model Chat */}
      <ModelChat />
    </div>
  );
}

