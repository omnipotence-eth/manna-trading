'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

interface ChartDataPoint {
  timestamp: number;
  value: number;
}

interface ModelPerformance {
  name: string;
  color: string;
  data: ChartDataPoint[];
  currentValue: number;
  change: number;
  winRate: number;
  totalTrades: number;
}

export default function AIPerformanceChart() {
  const [timeRange, setTimeRange] = useState<'ALL' | '72H'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const accountValue = useStore((state) => state.accountValue);
  const trades = useStore((state) => state.trades);

  // AI model performance data - will be populated with real trade data
  const [modelsPerformance, setModelsPerformance] = useState<ModelPerformance[]>([
    {
      name: 'Godspeed',
      color: '#00ff41',
      data: [],
      currentValue: 0,
      change: 0,
      winRate: 0,
      totalTrades: 0,
    },
  ]);

  // Build real equity curve from actual trades
  function buildRealEquityCurve(trades: any[], currentAccountValue: number, timeRange: '72H' | 'ALL'): ChartDataPoint[] {
    const points: ChartDataPoint[] = [];
    const now = Date.now();
    const cutoffTime = timeRange === '72H' ? now - (72 * 60 * 60 * 1000) : 0;
    
    // Filter trades by time range and sort by timestamp
    // All trades from database are completed (no status field needed)
    const filteredTrades = trades
      .filter(t => (!t.status || t.status === 'completed') && new Date(t.timestamp).getTime() >= cutoffTime)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (filteredTrades.length === 0) {
      // No trades yet, show flat line at current account value
      const startTime = timeRange === '72H' ? now - (72 * 60 * 60 * 1000) : now - (168 * 60 * 60 * 1000);
      return [
        { timestamp: startTime, value: currentAccountValue },
        { timestamp: now, value: currentAccountValue }
      ];
    }
    
    // Calculate starting balance by working backwards from current value
    const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const startingBalance = currentAccountValue - totalPnL;
    
    // Add starting point
    const firstTradeTime = new Date(filteredTrades[0].timestamp).getTime();
    const startTime = timeRange === '72H' 
      ? Math.min(firstTradeTime, now - (72 * 60 * 60 * 1000))
      : firstTradeTime;
    
    points.push({ timestamp: startTime, value: startingBalance });
    
    // Build equity curve from actual trades
    let runningBalance = startingBalance;
    filteredTrades.forEach(trade => {
      runningBalance += trade.pnl || 0;
      points.push({
        timestamp: new Date(trade.timestamp).getTime(),
        value: runningBalance
      });
    });
    
    // Add current point if last trade is old
    const lastTradeTime = points[points.length - 1].timestamp;
    if (now - lastTradeTime > 60000) { // If last trade was >1 minute ago
      points.push({ timestamp: now, value: currentAccountValue });
    }
    
    return points;
  }

  useEffect(() => {
    // Update with real trading data from store
    setIsLoading(true);
    
    // Calculate real performance metrics from completed trades
    // All trades from database are completed (no status field needed)
    const completedTrades = trades.filter(t => !t.status || t.status === 'completed');
    const winningTrades = completedTrades.filter(t => t.pnl > 0);
    const realWinRate = completedTrades.length > 0 
      ? (winningTrades.length / completedTrades.length) * 100 
      : 0;
    const totalTradeCount = completedTrades.length;
    
    // Build real equity curve from actual trade history
    const realData = buildRealEquityCurve(trades, accountValue, timeRange);
    
    const currentValue = accountValue;
    const startValue = realData[0]?.value || accountValue;
    const change = startValue > 0 ? ((currentValue - startValue) / startValue) * 100 : 0;
    
    setModelsPerformance([{
      name: 'Godspeed',
      color: '#00ff41',
      data: realData,
      currentValue,
      change,
      winRate: realWinRate,
      totalTrades: totalTradeCount,
    }]);
    
    setIsLoading(false);
  }, [timeRange, accountValue, trades]);

  // Calculate chart dimensions and scales - Smaller for better fit
  const chartWidth = 1200; // Base width for full-screen chart
  const chartHeight = 450; // Reduced height to fit with model cards
  const padding = { top: 20, right: 30, bottom: 40, left: 80 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate Y-axis range centered on current account value
  const currentAccountValue = accountValue || 48.23; // Use real account value from API
  const rangePercent = 0.2; // 20% range above and below current value
  const minValue = currentAccountValue * (1 - rangePercent);
  const maxValue = currentAccountValue * (1 + rangePercent);
  const valueRange = maxValue - minValue;

  // Find time range
  const allTimestamps = modelsPerformance[0]?.data.map(d => d.timestamp) || [];
  const minTime = Math.min(...allTimestamps);
  const maxTime = Math.max(...allTimestamps);
  const timeRange_ms = maxTime - minTime;

  // Convert data point to SVG coordinates
  const getX = (timestamp: number) => padding.left + ((timestamp - minTime) / timeRange_ms) * innerWidth;
  const getY = (value: number) => padding.top + innerHeight - ((value - minValue) / valueRange) * innerHeight;

  // Generate SVG path for a model
  const generatePath = (data: ChartDataPoint[]) => {
    if (data.length === 0) return '';
    
    let path = `M ${getX(data[0].timestamp)} ${getY(data[0].value)}`;
    for (let i = 1; i < data.length; i++) {
      path += ` L ${getX(data[i].timestamp)} ${getY(data[i].value)}`;
    }
    return path;
  };

  return (
    <div className="w-full h-full flex flex-col p-2">
      {/* Godspeed Stats - Moved to TOP of chart */}
      <div className="mb-2 shrink-0" style={{ height: '65px' }}>
        <div className="bg-black/30 rounded border border-green-500/20 p-2 hover:border-green-500/40 transition-all overflow-hidden h-full">
          {/* Godspeed Header */}
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: '#00ff41', boxShadow: '0 0 8px #00ff41' }}
            />
            <div className="text-sm font-bold text-neon-green">
              Godspeed AI Trading System
            </div>
          </div>
          
          {/* Stats Grid - Horizontal Layout */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-green-500/50 leading-none">Account Value</div>
              <div className="text-sm font-bold text-green-500 leading-tight">
                ${currentAccountValue.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-green-500/50 leading-none">Change</div>
              <div className={`text-sm font-bold leading-tight ${modelsPerformance[0].change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {modelsPerformance[0].change >= 0 ? '+' : ''}{modelsPerformance[0].change.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-green-500/50 leading-none">Win Rate</div>
              <div className="text-sm font-bold text-green-500/80 leading-tight">{modelsPerformance[0].winRate.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-xs text-green-500/50 leading-none">Total Trades</div>
              <div className="text-sm font-bold text-green-500/80 leading-tight">{modelsPerformance[0].totalTrades}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart - Flex to take remaining space after model cards */}
      <div className="relative bg-black/20 rounded-lg flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-green-500/60 text-lg">Loading Chart Data...</div>
          </div>
        ) : (
          <svg width={chartWidth} height={chartHeight} className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,255,65,0.1)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} fill="url(#grid)" />

            {/* Y-axis labels - Price range centered on account value */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const value = minValue + valueRange * ratio;
              const y = padding.top + innerHeight - (ratio * innerHeight);
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + innerWidth}
                    y2={y}
                    stroke="rgba(0,255,65,0.1)"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    fill="#00ff41"
                    fontSize="10"
                    textAnchor="end"
                    opacity="0.6"
                  >
                    ${value.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* X-axis with date/time labels */}
            {allTimestamps.length > 0 && [0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const timestamp = minTime + timeRange_ms * ratio;
              const x = padding.left + (ratio * innerWidth);
              const date = new Date(timestamp);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + innerHeight}
                    stroke="rgba(0,255,65,0.1)"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={padding.top + innerHeight + 15}
                    fill="#00ff41"
                    fontSize="9"
                    textAnchor="middle"
                    opacity="0.6"
                  >
                    {date.toLocaleDateString()}
                  </text>
                  <text
                    x={x}
                    y={padding.top + innerHeight + 28}
                    fill="#00ff41"
                    fontSize="8"
                    textAnchor="middle"
                    opacity="0.5"
                  >
                    {date.toLocaleTimeString()}
                  </text>
                </g>
              );
            })}
            

            {/* Performance lines for each model */}
            {modelsPerformance.map((model, idx) => (
              <g key={model.name}>
                <motion.path
                  d={generatePath(model.data)}
                  fill="none"
                  stroke={model.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1, delay: idx * 0.2 }}
                />
                {/* End point marker */}
                {model.data.length > 0 && (
                  <circle
                    cx={getX(model.data[model.data.length - 1].timestamp)}
                    cy={getY(model.data[model.data.length - 1].value)}
                    r="4"
                    fill={model.color}
                    stroke="black"
                    strokeWidth="2"
                  />
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

