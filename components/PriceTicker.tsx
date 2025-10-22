'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { SUPPORTED_SYMBOLS } from '@/constants';

interface CryptoPrice {
  symbol: string;
  price: number;
  change: number;
}

export default function PriceTicker() {
  // Get live prices from store (updated by WebSocket)
  const livePrices = useStore((state) => state.livePrices);

  // Map SUPPORTED_SYMBOLS to display format with real data
  const prices: CryptoPrice[] = SUPPORTED_SYMBOLS.map((fullSymbol) => {
    const baseSymbol = fullSymbol.split('/')[0]; // 'BTC/USDT' -> 'BTC'
    const wsSymbol = fullSymbol.replace('/', ''); // 'BTC/USDT' -> 'BTCUSDT'
    
    // Try multiple key formats to ensure we find the data
    const liveData = livePrices[wsSymbol] || 
                     livePrices[wsSymbol.toLowerCase()] || 
                     livePrices[wsSymbol.toUpperCase()];
    
    return {
      symbol: baseSymbol,
      price: liveData?.price || 0,
      change: liveData?.change || 0,
    };
  });

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

