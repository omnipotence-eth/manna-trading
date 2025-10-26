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
  // Load display mode from localStorage, default to '$'
  const [displayMode, setDisplayMode] = useState<'$' | '%'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('chartDisplayMode') as '$' | '%') || '$';
    }
    return '$';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<{x: number, y: number, value: number, timestamp: number} | null>(null);
  const accountValue = useStore((state) => state.accountValue);
  const trades = useStore((state) => state.trades);

  // Persist display mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chartDisplayMode', displayMode);
    }
  }, [displayMode]);

  // AI model performance data - will be populated with real trade data
  const [modelsPerformance, setModelsPerformance] = useState<ModelPerformance[]>([
    {
      name: 'Godspeed',
      color: '#00ff41', // Consistent neon green from theme
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
    
    // ALWAYS add current point to show real-time account value changes
    // This ensures the chart updates live as open positions gain/lose value
    const lastTradeTime = points[points.length - 1]?.timestamp || now;
    
    // Add intermediate points every minute between last trade and now for smooth line
    const timeSinceLastTrade = now - lastTradeTime;
    if (timeSinceLastTrade > 60000) {
      // Add points every minute to show the progression
      const minutesSinceLastTrade = Math.floor(timeSinceLastTrade / 60000);
      const valueChange = currentAccountValue - runningBalance;
      
      // Add up to 10 intermediate points for smooth progression
      const numIntermediatePoints = Math.min(minutesSinceLastTrade, 10);
      for (let i = 1; i <= numIntermediatePoints; i++) {
        const ratio = i / (numIntermediatePoints + 1);
        points.push({
          timestamp: lastTradeTime + (timeSinceLastTrade * ratio),
          value: runningBalance + (valueChange * ratio)
        });
      }
    }
    
    // Always add the most recent point with current account value
    points.push({ timestamp: now, value: currentAccountValue });
    
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

  // Calculate Y-axis range dynamically based on actual data
  const currentAccountValue = accountValue || 48.23; // Use real account value from API
  const allValues = modelsPerformance.flatMap(model => model.data.map(d => d.value));
  
  // If we have data, use min/max with 10% padding, otherwise use current value +/- 20%
  let minValue: number;
  let maxValue: number;
  
  if (allValues.length > 0) {
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const dataRange = dataMax - dataMin;
    
    // Add 10% padding above and below
    minValue = dataMin - (dataRange * 0.1);
    maxValue = dataMax + (dataRange * 0.1);
    
    // Ensure current value is always visible
    minValue = Math.min(minValue, currentAccountValue * 0.95);
    maxValue = Math.max(maxValue, currentAccountValue * 1.05);
  } else {
    // Fallback if no data yet
    minValue = currentAccountValue * 0.8;
    maxValue = currentAccountValue * 1.2;
  }
  
  const valueRange = maxValue - minValue;

  // Find time range
  const allTimestamps = modelsPerformance[0]?.data.map(d => d.timestamp) || [];
  const minTime = Math.min(...allTimestamps);
  const maxTime = Math.max(...allTimestamps);
  const timeRange_ms = maxTime - minTime;

  // Convert data point to SVG coordinates
  const getX = (timestamp: number) => padding.left + ((timestamp - minTime) / timeRange_ms) * innerWidth;
  const getY = (value: number) => padding.top + innerHeight - ((value - minValue) / valueRange) * innerHeight;

  // Handle mouse interaction - only show tooltip when near the line
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if mouse is within chart area
    if (x >= padding.left && x <= padding.left + innerWidth && 
        y >= padding.top && y <= padding.top + innerHeight) {
      
      const model = modelsPerformance[0];
      if (model.data.length > 1) {
        // Convert x position to timestamp
        const mouseTimestamp = minTime + ((x - padding.left) / innerWidth) * timeRange_ms;
        
        // Find the two data points surrounding the mouse timestamp
        let leftPoint = model.data[0];
        let rightPoint = model.data[model.data.length - 1];
        
        for (let i = 0; i < model.data.length - 1; i++) {
          if (model.data[i].timestamp <= mouseTimestamp && model.data[i + 1].timestamp >= mouseTimestamp) {
            leftPoint = model.data[i];
            rightPoint = model.data[i + 1];
            break;
          }
        }
        
        // Interpolate value and timestamp
        const timeDiff = rightPoint.timestamp - leftPoint.timestamp;
        const valueDiff = rightPoint.value - leftPoint.value;
        const ratio = timeDiff > 0 ? (mouseTimestamp - leftPoint.timestamp) / timeDiff : 0;
        
        const interpolatedValue = leftPoint.value + (valueDiff * ratio);
        const interpolatedTimestamp = leftPoint.timestamp + ((rightPoint.timestamp - leftPoint.timestamp) * ratio);
        const lineY = getY(interpolatedValue);
        
        // Show tooltip if mouse is within 80px of the line (very generous tolerance)
        const distanceFromLine = Math.abs(y - lineY);
        if (distanceFromLine < 80) {
          setHoveredPoint({
            x: x,
            y: lineY,
            value: interpolatedValue,
            timestamp: interpolatedTimestamp
          });
        } else {
          setHoveredPoint(null);
        }
      }
    } else {
      setHoveredPoint(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

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
      <div className="mb-2 shrink-0" style={{ height: '70px' }}>
        <div className="bg-black/30 rounded border border-green-500/20 p-2.5 hover:border-green-500/40 transition-all overflow-hidden h-full">
          {/* Godspeed Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: '#00ff41', boxShadow: '0 0 8px #00ff41' }}
              />
              <div className="text-sm font-bold text-neon-green">
                Godspeed AI Trading System
              </div>
            </div>
            
            {/* Display Mode Toggle */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDisplayMode('$')}
                className={`px-2 py-1 text-xs font-bold rounded transition-all ${
                  displayMode === '$' 
                    ? 'bg-green-500 text-black' 
                    : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                }`}
              >
                $
              </button>
              <button
                onClick={() => setDisplayMode('%')}
                className={`px-2 py-1 text-xs font-bold rounded transition-all ${
                  displayMode === '%' 
                    ? 'bg-green-500 text-black' 
                    : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                }`}
              >
                %
              </button>
            </div>
          </div>
          
          {/* Stats Grid - Horizontal Layout */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-green-500/50 leading-tight mb-0.5">Account Value</div>
              <div className="text-sm font-bold text-green-500 leading-tight">
                ${currentAccountValue.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-green-500/50 leading-tight mb-0.5">Change</div>
              <div className={`text-sm font-bold leading-tight ${modelsPerformance[0].change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {modelsPerformance[0].change >= 0 ? '+' : ''}{modelsPerformance[0].change.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-green-500/50 leading-tight mb-0.5">Win Rate</div>
              <div className="text-sm font-bold text-green-500/80 leading-tight">{modelsPerformance[0].winRate.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-green-500/50 leading-tight mb-0.5">Total Trades</div>
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
          <svg 
            width={chartWidth} 
            height={chartHeight} 
            className="w-full h-full cursor-crosshair" 
            preserveAspectRatio="none" 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
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
              const displayValue = displayMode === '$' 
                ? `$${value.toFixed(2)}` 
                : `${((value - currentAccountValue) / currentAccountValue * 100).toFixed(1)}%`;
              
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
                    {displayValue}
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
                {/* Glow effect */}
                <motion.path
                  d={generatePath(model.data)}
                  fill="none"
                  stroke={model.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.2"
                  filter="blur(4px)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.2 }}
                  transition={{ duration: 1, delay: idx * 0.2 }}
                />
                {/* Main line */}
                <motion.path
                  d={generatePath(model.data)}
                  fill="none"
                  stroke={model.color}
                  strokeWidth="3"
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
                    r="5"
                    fill={model.color}
                    stroke="black"
                    strokeWidth="2"
                  />
                )}
              </g>
            ))}

            {/* Hover indicator */}
            {hoveredPoint && (
              <g>
                {/* Vertical line */}
                <line
                  x1={hoveredPoint.x}
                  y1={padding.top}
                  x2={hoveredPoint.x}
                  y2={padding.top + innerHeight}
                  stroke="#00ff88"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                {/* Horizontal line */}
                <line
                  x1={padding.left}
                  y1={hoveredPoint.y}
                  x2={padding.left + innerWidth}
                  y2={hoveredPoint.y}
                  stroke="#00ff88"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                {/* Hover point glow */}
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r="10"
                  fill="#00ff88"
                  opacity="0.2"
                />
                {/* Hover point */}
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r="6"
                  fill="#00ff88"
                  stroke="black"
                  strokeWidth="2"
                />
                {/* Tooltip */}
                <rect
                  x={hoveredPoint.x - 70}
                  y={hoveredPoint.y - 50}
                  width="140"
                  height="40"
                  fill="rgba(0,0,0,0.9)"
                  stroke="#00ff88"
                  strokeWidth="2"
                  rx="6"
                />
                <text
                  x={hoveredPoint.x}
                  y={hoveredPoint.y - 32}
                  fill="#00ff88"
                  fontSize="12"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {displayMode === '$' 
                    ? `$${hoveredPoint.value.toFixed(2)}` 
                    : `${((hoveredPoint.value - currentAccountValue) / currentAccountValue * 100).toFixed(1)}%`
                  }
                </text>
                <text
                  x={hoveredPoint.x}
                  y={hoveredPoint.y - 18}
                  fill="#00ff88"
                  fontSize="9"
                  textAnchor="middle"
                  opacity="0.8"
                >
                  {new Date(hoveredPoint.timestamp).toLocaleDateString()}
                </text>
                <text
                  x={hoveredPoint.x}
                  y={hoveredPoint.y - 6}
                  fill="#00ff88"
                  fontSize="8"
                  textAnchor="middle"
                  opacity="0.7"
                >
                  {new Date(hoveredPoint.timestamp).toLocaleTimeString()}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

