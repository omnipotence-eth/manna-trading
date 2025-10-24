'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { useState, useEffect } from 'react';

interface MarketConfidence {
  symbol: string;
  confidence: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  change24h: number;
}

export default function ConfidenceHeatmap() {
  const modelMessages = useStore((state) => state.modelMessages);
  const livePrices = useStore((state) => state.livePrices);
  const [marketData, setMarketData] = useState<MarketConfidence[]>([]);

  useEffect(() => {
    // Extract latest confidence scores from model messages
    const markets: Record<string, MarketConfidence> = {};
    
    modelMessages.slice(0, 20).forEach((msg) => {
      // Parse confidence from message
      const confidenceMatch = msg.message.match(/(\d+\.\d+)%/);
      const actionMatch = msg.message.match(/(BUY|SELL|HOLD)/);
      const symbolMatch = msg.message.match(/([A-Z]+\/[A-Z]+)/);
      
      if (confidenceMatch && actionMatch && symbolMatch) {
        const symbol = symbolMatch[1];
        const confidence = parseFloat(confidenceMatch[1]) / 100;
        const action = actionMatch[1] as 'BUY' | 'SELL' | 'HOLD';
        
        if (!markets[symbol] || markets[symbol].confidence < confidence) {
          markets[symbol] = {
            symbol,
            confidence,
            action,
            change24h: livePrices[symbol.replace('/', '')]?.change || 0,
          };
        }
      }
    });

    setMarketData(Object.values(markets));
  }, [modelMessages, livePrices]);

  const getConfidenceColor = (confidence: number, action: string) => {
    const intensity = Math.round(confidence * 100);
    
    if (action === 'HOLD') {
      return 'bg-black/80 border-2 border-green-500/30';
    }
    
    if (action === 'BUY') {
      if (intensity > 70) return 'bg-gradient-to-br from-green-500/30 to-neon-blue/30 border-2 border-green-500';
      if (intensity > 50) return 'bg-gradient-to-br from-green-500/20 to-green-400/20 border-2 border-green-500/70';
      return 'bg-green-500/10 border-2 border-green-500/50';
    } else {
      if (intensity > 70) return 'bg-gradient-to-br from-red-500/30 to-pink-500/30 border-2 border-red-500';
      if (intensity > 50) return 'bg-gradient-to-br from-red-500/20 to-red-400/20 border-2 border-red-500/70';
      return 'bg-red-500/10 border-2 border-red-500/50';
    }
  };

  const getConfidenceOpacity = (confidence: number) => {
    return Math.max(0.3, confidence);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-6 rounded-lg"
    >
      <h3 className="text-xl font-bold text-neon-blue mb-4">
        AI Confidence Heatmap
      </h3>
      
      {marketData.length === 0 ? (
        <div className="text-center py-8 text-green-500/60">
          <p>Analyzing markets...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {marketData.map((market, index) => (
            <motion.div
              key={market.symbol}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.05 }}
              className={`
                ${getConfidenceColor(market.confidence, market.action)}
                rounded-lg p-4 relative overflow-hidden
                cursor-pointer hover:scale-105 hover:shadow-xl hover:shadow-green-500/20
                transition-all duration-300
              `}
            >
              {/* Animated background glow */}
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.2, 0.4, 0.2],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className={`absolute inset-0 rounded-lg ${
                  market.action === 'BUY' 
                    ? 'bg-green-500/20' 
                    : market.action === 'SELL' 
                    ? 'bg-red-500/20' 
                    : 'bg-green-500/10'
                }`}
              />
              
              {/* Scanline effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500/5 to-transparent animate-pulse" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-bold text-sm ${
                    market.action === 'BUY' 
                      ? 'text-green-400' 
                      : market.action === 'SELL' 
                      ? 'text-red-400' 
                      : 'text-green-500/60'
                  }`}>
                    {market.symbol.split('/')[0]}
                  </span>
                  <span className="text-xl">
                    {market.action === 'BUY' ? '🚀' : market.action === 'SELL' ? '📉' : '⏸️'}
                  </span>
                </div>
                
                <div className={`font-mono text-2xl font-bold mb-1 ${
                  market.action === 'BUY' 
                    ? 'text-neon-blue' 
                    : market.action === 'SELL' 
                    ? 'text-red-400' 
                    : 'text-green-500'
                }`}>
                  {Math.round(market.confidence * 100)}%
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${
                    market.action === 'BUY' 
                      ? 'text-green-400' 
                      : market.action === 'SELL' 
                      ? 'text-red-400' 
                      : 'text-green-500/60'
                  }`}>
                    {market.action}
                  </span>
                  <span className={`font-mono font-bold ${
                    market.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      
      <div className="mt-6 flex items-center justify-center gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-br from-green-500/30 to-neon-blue/30 border-2 border-green-500 rounded animate-pulse"></div>
          <span className="text-green-400 font-semibold">Strong Buy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500/10 border-2 border-green-500/50 rounded"></div>
          <span className="text-green-400/70">Weak Buy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-br from-red-500/30 to-pink-500/30 border-2 border-red-500 rounded animate-pulse"></div>
          <span className="text-red-400 font-semibold">Strong Sell</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-black/80 border-2 border-green-500/30 rounded"></div>
          <span className="text-green-500/60">Hold</span>
        </div>
      </div>
    </motion.div>
  );
}

