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
  const [prices, setPrices] = useState<CryptoPrice[]>(
    SUPPORTED_SYMBOLS.map(symbol => ({
      symbol: symbol.split('/')[0],
      price: 0,
      change: 0,
    }))
  );
  
  const updateLivePrice = useStore((state) => state.updateLivePrice);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (response.ok) {
          const data = await response.json();
          const priceArray: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
            const baseSymbol = fullSymbol.split('/')[0];
            const wsSymbol = fullSymbol.replace('/', '');
            const priceData = data[wsSymbol];
            
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
        }
      } catch { /* silent */ }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    return () => clearInterval(interval);
  }, [updateLivePrice]);

  return (
    <div className="h-8 flex items-center border-b border-white/[0.05] overflow-hidden shrink-0 bg-[#0a0a0a]">
      <motion.div
        className="flex items-center gap-8 px-6 whitespace-nowrap"
        animate={{ x: [0, -1000] }}
        transition={{
          x: { repeat: Infinity, repeatType: "loop", duration: 25, ease: "linear" },
        }}
      >
        {[...prices, ...prices, ...prices].map((crypto, index) => (
          <div key={`${crypto.symbol}-${index}`} className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#555]">{crypto.symbol}</span>
            <span className="text-[12px] text-mono text-[#888] tabular">
              {crypto.price > 0 
                ? `$${crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: crypto.price < 1 ? 4 : 2 })}`
                : '—'
              }
            </span>
            {crypto.price > 0 && (
              <span className={`text-[11px] text-mono tabular ${crypto.change >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {crypto.change >= 0 ? '+' : ''}{crypto.change.toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
