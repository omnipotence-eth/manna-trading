'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';

interface ChartDataPoint {
  timestamp: number;
  price: number;
  change: number;
  changePercent: number;
}

interface InteractiveChartProps {
  className?: string;
  initialBalance?: number;
}

export default function InteractiveChart({ 
  className = '', 
  initialBalance = 42.16 
}: InteractiveChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [currentBalance, setCurrentBalance] = useState(initialBalance);
  const [timeRange, setTimeRange] = useState<'24H' | '7D' | '30D'>('24H');
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // OPTIMIZED: Memoize time ago calculation function
  const getTimeAgo = useCallback((timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }, []);

  // OPTIMIZED: Memoize portfolio data generation
  const generatePortfolioData = useCallback((startBalance: number, hours: number): ChartDataPoint[] => {
    const data: ChartDataPoint[] = [];
    const now = Date.now();
    const startTime = now - (hours * 60 * 60 * 1000);
    const intervalMs = hours <= 24 ? 1800000 : 3600000; // 30 min for 24H, 1 hour for longer

    let currentPrice = startBalance;
    let volatility = 0.02; // 2% volatility
    let trend = 0.001; // Slight upward trend

    for (let time = startTime; time <= now; time += intervalMs) {
      // Add some realistic market movements
      const randomWalk = (Math.random() - 0.5) * volatility;
      const trendComponent = trend * (time - startTime) / (now - startTime);
      
      currentPrice = currentPrice * (1 + randomWalk + trendComponent);
      
      // Ensure price doesn't go negative
      currentPrice = Math.max(currentPrice, startBalance * 0.1);
      
      const change = currentPrice - startBalance;
      const changePercent = (change / startBalance) * 100;

      data.push({
        timestamp: time,
        price: currentPrice,
        change,
        changePercent
      });
    }

    return data;
  };

  // Fetch real balance data
  useEffect(() => {
    const fetchRealBalance = async () => {
      try {
        const response = await fetch('/api/real-balance?action=current-balance');
        const result = await response.json();

        if (result.success && result.data && result.data.data) {
          const balance = result.data.data.balance;
          setCurrentBalance(balance);
        }
      } catch (err) {
        frontendLogger.error('Failed to fetch real balance', err as Error, { 
          component: 'InteractiveChart' 
        });
        setError('Failed to fetch real balance data');
      }
    };

    fetchRealBalance();
    const interval = setInterval(fetchRealBalance, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch real chart data from API
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setIsLoading(true);
        
        const response = await fetch(`/api/real-balance?action=chart-data&timeRange=${timeRange}`);
        const result = await response.json();

        if (result.success && result.data && result.data.data) {
          // API returns: { success: true, data: { data: [...], metadata: {...} } }
          const apiData = result.data.data;
          
          // Convert API data to chart format
          const chartData: ChartDataPoint[] = apiData.map((item: any) => ({
            timestamp: item.timestamp,
            price: item.balance,
            change: item.totalPnL || 0,
            changePercent: item.totalPnL ? (item.totalPnL / item.balance) * 100 : 0
          }));
          
          setChartData(chartData);
          setError(null);
          setLastUpdated(Date.now());
          setIsLoading(false);
          
          frontendLogger.debug('Real chart data loaded successfully', { 
            component: 'InteractiveChart',
            data: {
              dataPoints: chartData.length,
              timeRange,
              currentBalance: chartData[chartData.length - 1]?.price,
              metadata: result.data.metadata
            }
          });
        } else {
          throw new Error('No real chart data available');
        }
        
      } catch (err) {
        frontendLogger.error('Failed to fetch real chart data', err as Error, { 
          component: 'InteractiveChart' 
        });
        setError('Failed to fetch real chart data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();
  }, [timeRange]);

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, 'rgba(0, 20, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Chart dimensions
    const padding = 60;
    const chartWidth = rect.width - (padding * 2);
    const chartHeight = rect.height - (padding * 2);

    // Find min/max values
    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    // Ensure minimum range for visibility
    const minRange = 1.0; // Minimum $1.00 range
    const actualRange = Math.max(priceRange, minRange);
    const pricePadding = actualRange * 0.15; // Add padding for better visualization
    const displayMin = minPrice - pricePadding;
    const displayMax = maxPrice + pricePadding;
    const displayRange = displayMax - displayMin;

    // Draw enhanced grid with glow effect
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.12)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(74, 222, 128, 0.25)';
    ctx.shadowBlur = 2;
    
    // Horizontal grid lines (price levels)
    for (let i = 0; i <= 10; i++) {
      const y = padding + (chartHeight / 10) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines (time)
    for (let i = 0; i <= 12; i++) {
      const x = padding + (chartWidth / 12) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw area under curve with gradient
    const areaGradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
    areaGradient.addColorStop(0, 'rgba(74, 222, 128, 0.25)');
    areaGradient.addColorStop(1, 'rgba(74, 222, 128, 0.03)');
    
    ctx.fillStyle = areaGradient;
    ctx.beginPath();
    
    chartData.forEach((point, index) => {
      const x = padding + (chartWidth * index) / (chartData.length - 1);
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, padding + chartHeight);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.closePath();
    ctx.fill();

    // Draw main line with glow effect
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();

    chartData.forEach((point, index) => {
      const x = padding + (chartWidth * index) / (chartData.length - 1);
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points with enhanced styling
    ctx.shadowBlur = 0;
    chartData.forEach((point, index) => {
      const x = padding + (chartWidth * index) / (chartData.length - 1);
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      // Outer glow
      ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Inner point
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw hovered point with enhanced styling
    if (hoveredPoint) {
      const pointIndex = chartData.findIndex(p => p.timestamp === hoveredPoint.timestamp);
      if (pointIndex !== -1) {
        const x = padding + (chartWidth * pointIndex) / (chartData.length - 1);
        const y = padding + chartHeight - ((hoveredPoint.price - displayMin) / displayRange) * chartHeight;
        
        // Enhanced hover effect
        ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw Y-axis labels with enhanced styling
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(74, 222, 128, 0.4)';
    ctx.shadowBlur = 3;
    
    for (let i = 0; i <= 10; i++) {
      const price = displayMax - (displayRange / 10) * i;
      const y = padding + (chartHeight / 10) * i + 4;
      ctx.fillText(`$${price.toFixed(2)}`, padding - 15, y);
    }

    // Draw X-axis labels with enhanced styling
    ctx.textAlign = 'center';
    ctx.shadowBlur = 3;
    
    for (let i = 0; i <= 8; i++) {
      const timeIndex = Math.floor((chartData.length - 1) * i / 8);
      const time = new Date(chartData[timeIndex].timestamp);
      const x = padding + (chartWidth * timeIndex) / (chartData.length - 1);
      ctx.fillText(time.toLocaleTimeString(), x, rect.height - 15);
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw current price line
    if (chartData.length > 0) {
      const currentPrice = chartData[chartData.length - 1].price;
      const y = padding + chartHeight - ((currentPrice - displayMin) / displayRange) * chartHeight;
      
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Current price label
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Current: $${currentPrice.toFixed(2)}`, padding + chartWidth - 120, y - 5);
    }

  }, [chartData, hoveredPoint]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || chartData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 40;
    const chartWidth = rect.width - (padding * 2);
    
    const pointIndex = Math.round(((x - padding) / chartWidth) * (chartData.length - 1));
    if (pointIndex >= 0 && pointIndex < chartData.length) {
      setHoveredPoint(chartData[pointIndex]);
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoveredPoint(null);
  };

  // Calculate metrics
  const startBalance = chartData[0]?.price || initialBalance;
  const totalChange = currentBalance - startBalance;
  const totalChangePercent = startBalance > 0 ? (totalChange / startBalance) * 100 : 0;
  const maxBalance = Math.max(...chartData.map(d => d.price));
  const minBalance = Math.min(...chartData.map(d => d.price));

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
          <p className="text-green-500/60 text-sm">Loading portfolio chart...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-xs border border-red-500 text-red-500 hover:bg-red-500/10 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Live Indicator */}
      <div className="flex items-center justify-center py-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50"></div>
          <h3 className="text-lg font-bold text-red-500">LIVE</h3>
        </div>
      </div>


      {/* Time Range Controls */}
      <div className="flex items-center justify-center mb-2">
        <div className="flex items-center space-x-1">
          {(['24H', '7D', '30D'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2 py-1 text-xs font-bold border transition-all ${
                timeRange === range
                  ? 'border-green-400 bg-green-400/20 text-green-400'
                  : 'border-green-400/30 text-green-400/60 hover:border-green-400/60'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chart - Futuristic Terminal */}
      <div className="relative bg-gradient-to-br from-black/60 via-black/30 to-black/60 rounded-lg border border-green-400/40 overflow-hidden h-96 mx-4 mb-2 shadow-2xl shadow-green-400/20 backdrop-blur-sm">
        {/* Futuristic Background Effects */}
        <div className="absolute inset-0 opacity-30">
          {/* Animated Grid */}
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(74, 222, 128, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(74, 222, 128, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            animation: 'grid-move 20s linear infinite'
          }}></div>
          
          {/* Scanning Lines */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/60 to-transparent animate-pulse"></div>
            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-400/60 to-transparent animate-pulse" style={{animationDelay: '1s'}}></div>
          </div>
          
          {/* Corner Brackets */}
          <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-green-400/60"></div>
          <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-green-400/60"></div>
          <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-green-400/60"></div>
          <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-green-400/60"></div>
        </div>
        
        {/* Animated Background Glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-green-400/5 via-transparent to-blue-400/5 animate-pulse"></div>
        
        {/* Data Stream Effect */}
        <div className="absolute top-4 left-4 text-xs text-green-400/40 font-mono animate-pulse">
          <div className="animate-bounce">● LIVE DATA STREAM</div>
          <div className="text-[10px] opacity-50">Updated: {getTimeAgo(lastUpdated)}</div>
        </div>
        
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair relative z-10"
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />
        
        {/* Chart Overlay Effects */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent"></div>
        
        {/* Tooltip */}
        {hoveredPoint && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bg-black/95 border border-green-400/60 rounded-lg p-3 pointer-events-none z-20 shadow-2xl shadow-green-400/20 backdrop-blur-sm"
            style={{
              left: '50%',
              top: '20px',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="text-green-400 text-sm">
              <div className="font-bold text-green-300">{new Date(hoveredPoint.timestamp).toLocaleString()}</div>
              <div className="text-green-200">Price: <span className="text-white font-bold">${hoveredPoint.price.toFixed(2)}</span></div>
              <div className={hoveredPoint.change >= 0 ? 'text-green-300' : 'text-red-400'}>
                Change: <span className="text-white font-bold">{hoveredPoint.change >= 0 ? '+' : ''}${hoveredPoint.change.toFixed(2)} ({hoveredPoint.changePercent >= 0 ? '+' : ''}{hoveredPoint.changePercent.toFixed(2)}%)</span>
              </div>
            </div>
            {/* Tooltip Arrow */}
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-black/95 border-r border-b border-green-400/60 rotate-45"></div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
