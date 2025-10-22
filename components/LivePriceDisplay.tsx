'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PriceData {
  symbol: string;
  price: number;
  change?: number;
  lastUpdate: number;
}

export default function LivePriceDisplay() {
  const [btcData, setBtcData] = useState<PriceData>({ 
    symbol: 'BTC/USDT', 
    price: 0, 
    lastUpdate: Date.now() 
  });
  const [ethData, setEthData] = useState<PriceData>({ 
    symbol: 'ETH/USDT', 
    price: 0, 
    lastUpdate: Date.now() 
  });

  useEffect(() => {
    // Fetch prices from our CoinGecko API
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (!response.ok) throw new Error('Failed to fetch');
        
        const data = await response.json();
        
        // Update BTC
        if (data.BTCUSDT) {
          setBtcData({
            symbol: 'BTC/USDT',
            price: data.BTCUSDT.price,
            change: data.BTCUSDT.change,
            lastUpdate: Date.now(),
          });
        }
        
        // Update ETH
        if (data.ETHUSDT) {
          setEthData({
            symbol: 'ETH/USDT',
            price: data.ETHUSDT.price,
            change: data.ETHUSDT.change,
            lastUpdate: Date.now(),
          });
        }
      } catch (error) {
        console.error('Failed to fetch live prices:', error);
      }
    };

    // Fetch immediately
    fetchPrices();
    
    // Then fetch every 10 seconds
    const interval = setInterval(fetchPrices, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  const displayPrices = [btcData, ethData];

  const formatPrice = (price: number) => {
    if (price === 0) return '---';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getChangeColor = (change?: number) => {
    if (!change) return 'text-green-500/60';
    return change >= 0 ? 'text-neon-green' : 'text-red-500';
  };

  const getChangeIcon = (change?: number) => {
    if (!change) return '●';
    return change >= 0 ? '▲' : '▼';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-4 rounded-lg mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></div>
        <h3 className="text-sm font-bold text-green-500">LIVE MARKET PRICES</h3>
        <span className="text-xs text-green-500/60">• REAL-TIME DATA</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {displayPrices.map((data, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-green-500/30 p-3 rounded hover:border-green-500/60 transition-all"
          >
            <div className="text-xs text-green-500/60 mb-1">{data.symbol}</div>
            <div className="text-2xl font-bold terminal-text mb-1">
              {data.price > 0 ? (
                <span className="text-neon-green">
                  ${formatPrice(data.price)}
                </span>
              ) : (
                <span className="text-green-500/40 animate-pulse">Waiting for data...</span>
              )}
            </div>
            {data.change !== undefined && data.price > 0 && (
              <div className={`text-sm flex items-center gap-1 ${getChangeColor(data.change)}`}>
                <span>{getChangeIcon(data.change)}</span>
                <span>{Math.abs(data.change).toFixed(2)}%</span>
                <span className="text-xs text-green-500/60">
                  ({Date.now() - data.lastUpdate < 5000 ? 'Just now' : 'Live'})
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-green-500/60">
        <div className="flex items-center justify-between">
          <span>📡 Live prices from CoinGecko • Updates every 10s</span>
          <span className="text-neon-green">● LIVE</span>
        </div>
      </div>
    </motion.div>
  );
}

