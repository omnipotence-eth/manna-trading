'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SUPPORTED_SYMBOLS } from '@/constants';

interface CryptoPrice {
  symbol: string;
  price: number;
  change: number;
}

export default function PriceTicker() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);

  useEffect(() => {
    // Fetch prices from our API (which uses CoinGecko - no geo-restrictions)
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (!response.ok) throw new Error('Failed to fetch');
        
        const data = await response.json();
        
        // Convert to display format
        const priceArray: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
          const baseSymbol = fullSymbol.split('/')[0]; // 'BTC/USDT' -> 'BTC'
          const wsSymbol = fullSymbol.replace('/', ''); // 'BTC/USDT' -> 'BTCUSDT'
          
          const priceData = data[wsSymbol];
          
          return {
            symbol: baseSymbol,
            price: priceData?.price || 0,
            change: priceData?.change || 0,
          };
        });
        
        setPrices(priceArray);
      } catch (error) {
        console.error('Failed to fetch prices:', error);
      }
    };

    // Fetch immediately
    fetchPrices();
    
    // Then fetch every 10 seconds
    const interval = setInterval(fetchPrices, 10000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="border-b border-green-500/30 bg-black/80 overflow-hidden">
      <motion.div
        className="flex gap-8 py-3 whitespace-nowrap"
        animate={{ x: [0, -1000] }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 20,
            ease: "linear",
          },
        }}
      >
        {[...prices, ...prices, ...prices].map((crypto, index) => (
          <div key={`${crypto.symbol}-${index}`} className="flex items-center gap-4">
            <span className="text-green-500 font-bold">{crypto.symbol}</span>
            <span className="text-white">${crypto.price.toFixed(crypto.price < 1 ? 4 : 2)}</span>
            <span className={crypto.change >= 0 ? 'text-neon-green' : 'text-red-500'}>
              {crypto.change >= 0 ? '▲' : '▼'} {Math.abs(crypto.change).toFixed(2)}%
            </span>
            <span className="text-green-500/30">|</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

