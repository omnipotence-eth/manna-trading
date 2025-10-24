'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SUPPORTED_SYMBOLS } from '@/constants';
import { useStore } from '@/store/useStore';

interface CryptoPrice {
  symbol: string;
  price: number;
  change: number;
}

export default function PriceTicker() {
  // Initialize with placeholder data so ticker renders immediately
  const [prices, setPrices] = useState<CryptoPrice[]>(
    SUPPORTED_SYMBOLS.map(symbol => ({
      symbol: symbol.split('/')[0],
      price: 0,
      change: 0,
    }))
  );
  
  const updateLivePrice = useStore((state) => state.updateLivePrice);

  useEffect(() => {
    // Fetch prices from our API (which uses CoinGecko - no geo-restrictions)
    const fetchPrices = async () => {
      try {
        console.log('🔄 Fetching prices from /api/prices...');
        const response = await fetch('/api/prices');
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Received price data:', data);
        
        // Convert to display format
        const priceArray: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
          const baseSymbol = fullSymbol.split('/')[0]; // 'BTC/USDT' -> 'BTC'
          const wsSymbol = fullSymbol.replace('/', ''); // 'BTC/USDT' -> 'BTCUSDT'
          
          const priceData = data[wsSymbol];
          
          console.log(`📊 ${baseSymbol}: $${priceData?.price || 0} (${priceData?.change || 0}%)`);
          
          // Update store for each price
          if (priceData && priceData.price > 0) {
            updateLivePrice(wsSymbol, { price: priceData.price, change: priceData.change });
          }
          
          return {
            symbol: baseSymbol,
            price: priceData?.price || 0,
            change: priceData?.change || 0,
          };
        });
        
        setPrices(priceArray);
        console.log('✅ Updated ticker with real prices + store');
      } catch (error) {
        console.error('❌ Failed to fetch prices:', error);
      }
    };

    // Fetch immediately
    fetchPrices();
    
    // Then fetch every 10 seconds
    const interval = setInterval(fetchPrices, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Debug: Show state in component
  if (typeof window !== 'undefined' && prices.length > 0 && prices[0].price === 0) {
    console.log('⚠️ PriceTicker: Prices are still 0, waiting for API...', prices);
  }
  if (typeof window !== 'undefined' && prices.length > 0 && prices[0].price > 0) {
    console.log('✅ PriceTicker: Rendering with real prices!', prices);
  }

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
            <span className="text-white">
              {crypto.price > 0 
                ? `$${crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: crypto.price < 1 ? 4 : 2 })}`
                : 'Loading...'
              }
            </span>
            {crypto.price > 0 && (
              <span className={crypto.change >= 0 ? 'text-neon-green' : 'text-red-500'}>
                {crypto.change >= 0 ? '▲' : '▼'} {Math.abs(crypto.change).toFixed(2)}%
              </span>
            )}
            <span className="text-green-500/30">|</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

