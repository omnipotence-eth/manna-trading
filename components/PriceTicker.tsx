'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SUPPORTED_SYMBOLS } from '@/constants';
import { useStore } from '@/store/useStore';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendErrorHandler } from '@/lib/frontendErrorHandler';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';
import { frontendCaches, cacheKeys } from '@/lib/frontendCache';

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
      const timer = frontendPerformanceMonitor.startComponentTimer('PriceTicker:fetchPrices');
      
      try {
        frontendLogger.debug('Fetching prices from API', { component: 'PriceTicker' });
        
        // Check cache first
        const cacheKey = cacheKeys.api('prices');
        const cachedPrices = frontendCaches.prices.get(cacheKey);
        
        if (cachedPrices) {
          frontendLogger.debug('Using cached price data', { component: 'PriceTicker' });
          const priceArray: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
            const baseSymbol = fullSymbol.split('/')[0];
            const wsSymbol = fullSymbol.replace('/', '');
            const priceData = cachedPrices[wsSymbol];
            
            if (priceData && priceData.price > 0) {
              updateLivePrice(wsSymbol, { 
                symbol: wsSymbol, 
                price: priceData.price, 
                change: priceData.change,
                lastUpdate: Date.now()
              });
            }
            
            return {
              symbol: baseSymbol,
              price: priceData?.price || 0,
              change: priceData?.change || 0,
            };
          });
          
          setPrices(priceArray);
          return;
        }
        
        const response = await frontendPerformanceMonitor.measureApiCall(
          'prices',
          () => fetch('/api/prices')
        );
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        frontendLogger.debug('Received price data', { 
          component: 'PriceTicker', 
          data: { count: Object.keys(data).length } 
        });
        
        // Cache the response
        frontendCaches.prices.set(cacheKey, data, 30000); // 30 second TTL
        
        // Convert to display format
        const priceArray: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
          const baseSymbol = fullSymbol.split('/')[0]; // 'BTC/USDT' -> 'BTC'
          const wsSymbol = fullSymbol.replace('/', ''); // 'BTC/USDT' -> 'BTCUSDT'
          
          const priceData = data[wsSymbol];
          
          // Update store for each price
          if (priceData && priceData.price > 0) {
            updateLivePrice(wsSymbol, { 
              symbol: wsSymbol, 
              price: priceData.price, 
              change: priceData.change,
              lastUpdate: Date.now()
            });
          }
          
          return {
            symbol: baseSymbol,
            price: priceData?.price || 0,
            change: priceData?.change || 0,
          };
        });
        
        setPrices(priceArray);
        frontendLogger.debug('Updated ticker with real prices', { component: 'PriceTicker' });
      } catch (error) {
        frontendErrorHandler.handleError(error as Error, 'PriceTicker', {
          maxRetries: 3,
          retryDelay: 2000,
        });
      } finally {
        timer();
      }
    };

    // Fetch immediately
    fetchPrices();
    
    // Then fetch every 3 seconds for faster price updates
    const interval = setInterval(fetchPrices, 3000);
    
    return () => clearInterval(interval);
  }, [updateLivePrice]); // OPTIMIZED: Include updateLivePrice in dependencies

  return (
    <div className="border-b border-green-400/30 bg-black/80 overflow-hidden relative">
      {/* Futuristic Background Effects */}
      <div className="absolute inset-0 opacity-10">
        {/* Moving Grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(74, 222, 128, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74, 222, 128, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '30px 30px',
          animation: 'grid-move 15s linear infinite'
        }}></div>
        
        {/* Scanning Line */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/80 to-transparent animate-pulse"></div>
      </div>
      
      {/* Terminal Status */}
      <div className="absolute top-1 left-2 text-xs text-green-400/60 font-mono z-10">
        MARKET DATA: <span className="text-green-400 animate-pulse">LIVE</span>
      </div>
      
      <motion.div
        className="flex gap-8 py-6 pl-20 pr-4 whitespace-nowrap relative z-10"
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
            <span className="text-green-400 font-bold">{crypto.symbol}</span>
            <span className="text-white">
              {crypto.price > 0 
                ? `$${crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: crypto.price < 1 ? 4 : 2 })}`
                : 'Loading...'
              }
            </span>
            {crypto.price > 0 && (
              <span className={crypto.change >= 0 ? 'text-green-400' : 'text-red-500'}>
                {crypto.change >= 0 ? '▲' : '▼'} {Math.abs(crypto.change).toFixed(2)}%
              </span>
            )}
            <span className="text-green-400/30">|</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

