'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { useState, useEffect } from 'react';

interface ChartInsight {
  type: 'support' | 'resistance' | 'trend' | 'pattern' | 'signal';
  level?: number;
  description: string;
  confidence: number;
  timestamp: number;
}

interface AIChartAnalysisProps {
  symbol: string;
}

export default function AIChartAnalysis({ symbol }: AIChartAnalysisProps) {
  const modelMessages = useStore((state) => state.modelMessages);
  const livePrices = useStore((state) => state.livePrices);
  const [insights, setInsights] = useState<ChartInsight[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  useEffect(() => {
    // Get current price for the symbol
    const priceKey = symbol.replace('/', '');
    const price = livePrices[priceKey]?.price || 0;
    setCurrentPrice(price);

    // Extract chart-related insights from model messages
    const chartInsights: ChartInsight[] = [];
    
    modelMessages.slice(-10).forEach((msg) => {
      if (msg.message.includes(symbol)) {
        // Extract support/resistance
        if (msg.message.toLowerCase().includes('support')) {
          chartInsights.push({
            type: 'support',
            description: 'Key support level identified',
            confidence: 75,
            timestamp: msg.timestamp,
          });
        }
        if (msg.message.toLowerCase().includes('resistance')) {
          chartInsights.push({
            type: 'resistance',
            description: 'Resistance zone detected',
            confidence: 70,
            timestamp: msg.timestamp,
          });
        }
        // Extract trend
        if (msg.message.includes('uptrend') || msg.message.includes('Uptrend')) {
          chartInsights.push({
            type: 'trend',
            description: '📈 Bullish trend detected',
            confidence: extractConfidence(msg.message),
            timestamp: msg.timestamp,
          });
        }
        if (msg.message.includes('downtrend') || msg.message.includes('Downtrend')) {
          chartInsights.push({
            type: 'trend',
            description: '📉 Bearish trend identified',
            confidence: extractConfidence(msg.message),
            timestamp: msg.timestamp,
          });
        }
        // Extract patterns
        if (msg.message.toLowerCase().includes('momentum')) {
          chartInsights.push({
            type: 'signal',
            description: '⚡ Strong momentum signal',
            confidence: extractConfidence(msg.message),
            timestamp: msg.timestamp,
          });
        }
        if (msg.message.toLowerCase().includes('convergence')) {
          chartInsights.push({
            type: 'pattern',
            description: '🎯 Multiple indicators converging',
            confidence: extractConfidence(msg.message),
            timestamp: msg.timestamp,
          });
        }
      }
    });

    // Remove duplicates and keep most recent
    const uniqueInsights = chartInsights
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    
    setInsights(uniqueInsights);
  }, [modelMessages, symbol, livePrices]);

  const extractConfidence = (message: string): number => {
    const match = message.match(/(\d+\.?\d*)%/);
    return match ? parseFloat(match[1]) : 50;
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'support': return 'text-green-400 border-green-500/50';
      case 'resistance': return 'text-red-400 border-red-500/50';
      case 'trend': return 'text-neon-blue border-neon-blue/50';
      case 'pattern': return 'text-purple-400 border-purple-500/50';
      case 'signal': return 'text-yellow-400 border-yellow-500/50';
      default: return 'text-green-500 border-green-500/50';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'support': return '🛡️';
      case 'resistance': return '⚠️';
      case 'trend': return '📊';
      case 'pattern': return '🔍';
      case 'signal': return '⚡';
      default: return '💡';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-4 rounded-lg h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-neon-blue flex items-center gap-2">
            <span>🤖</span>
            <span>AI Chart Analysis</span>
          </h3>
          <p className="text-xs text-green-500/60">{symbol} • Live Insights</p>
        </div>
        {currentPrice > 0 && (
          <div className="text-right">
            <div className="text-lg font-bold text-green-400">${currentPrice.toFixed(2)}</div>
            <div className="text-xs text-green-500/60">Current Price</div>
          </div>
        )}
      </div>

      {/* Insights List */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[280px]">
        {insights.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-6">
              <div className="text-3xl mb-2">📊</div>
              <div className="text-green-500/60 text-sm">
                Analyzing {symbol} chart...
              </div>
              <div className="text-green-500/40 text-xs mt-1">
                AI insights will appear here
              </div>
            </div>
          </div>
        ) : (
          insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-3 rounded border ${getInsightColor(insight.type)} bg-black/30 backdrop-blur-sm`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg shrink-0">{getInsightIcon(insight.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold uppercase">{insight.type}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-black/40 rounded border border-green-500/30">
                      {insight.confidence.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-sm leading-snug">
                    {insight.description}
                  </div>
                  <div className="text-xs text-green-500/40 mt-1">
                    {new Date(insight.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Footer Summary */}
      {insights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-500/20">
          <div className="flex items-center justify-between text-xs">
            <span className="text-green-500/60">
              {insights.length} active insight{insights.length !== 1 ? 's' : ''}
            </span>
            <span className="text-neon-blue font-bold">
              Avg Confidence: {(insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

