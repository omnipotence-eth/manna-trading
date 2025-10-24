'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface SimplePriceChartProps {
  symbol: string;
  height?: number;
}

interface ChartDataPoint {
  time: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M' | '1Y' | 'ALL';

const TIMEFRAME_CONFIG: Record<Timeframe, { interval: string; limit: number; label: string }> = {
  '1m': { interval: '1m', limit: 60, label: '1 Minute' },
  '5m': { interval: '5m', limit: 100, label: '5 Minutes' },
  '15m': { interval: '15m', limit: 100, label: '15 Minutes' },
  '1h': { interval: '1h', limit: 168, label: '1 Hour' }, // 1 week
  '4h': { interval: '4h', limit: 180, label: '4 Hours' }, // 30 days
  '1d': { interval: '1d', limit: 365, label: '1 Day' }, // 1 year
  '1w': { interval: '1w', limit: 104, label: '1 Week' }, // 2 years
  '1M': { interval: '1M', limit: 60, label: '1 Month' }, // 5 years
  '1Y': { interval: '1M', limit: 120, label: '1 Year' }, // 10 years (monthly candles)
  'ALL': { interval: '1M', limit: 500, label: 'All Time' }, // Max history (monthly candles)
};

export default function SimplePriceChart({ symbol, height = 300 }: SimplePriceChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');

  const formatTimeLabel = (timestamp: Date, tf: Timeframe): string => {
    const hours = timestamp.getHours().toString().padStart(2, '0');
    const minutes = timestamp.getMinutes().toString().padStart(2, '0');
    const day = timestamp.getDate();
    const month = timestamp.getMonth() + 1;
    const year = timestamp.getFullYear().toString().slice(-2);
    const fullYear = timestamp.getFullYear();
    
    if (tf === '1m' || tf === '5m' || tf === '15m') {
      // Show time for minute/hour charts
      return `${hours}:${minutes}`;
    } else if (tf === '1h' || tf === '4h') {
      // Show time and date for hour charts
      return `${month}/${day} ${hours}:${minutes}`;
    } else if (tf === '1d') {
      // Show date for daily charts
      return `${month}/${day}`;
    } else if (tf === '1w') {
      // Show week start date
      return `${month}/${day}/${year}`;
    } else if (tf === '1M') {
      // Show month/year for monthly charts
      return `${month}/${year}`;
    } else if (tf === '1Y' || tf === 'ALL') {
      // Show full year for yearly/all-time charts
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[timestamp.getMonth()]} ${fullYear}`;
    } else {
      // Default: month/year
      return `${month}/${year}`;
    }
  };

  const fetchChartData = async () => {
    try {
      setLoading(true);
      setError(null);

      const config = TIMEFRAME_CONFIG[timeframe];
      
      // Convert symbol format (BTC/USDT -> BTCUSDT)
      const binanceSymbol = symbol.replace('/', '');
      
      // Fetch kline data from Aster DEX (Binance-compatible API)
      const response = await fetch(
        `https://fapi.asterdex.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${config.interval}&limit=${config.limit}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const klines = await response.json();

      // Transform data to chart format
      const chartData: ChartDataPoint[] = klines.map((kline: any[]) => {
        const timestamp = new Date(kline[0]);
        
        return {
          time: formatTimeLabel(timestamp, timeframe),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          price: parseFloat(kline[4]), // Use close as price
        };
      });

      setData(chartData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError('Failed to load chart data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();
    
    // Refresh every 30 seconds for minute charts, less often for longer timeframes
    const refreshInterval = timeframe === '1m' || timeframe === '5m' ? 30000 : 60000;
    const interval = setInterval(fetchChartData, refreshInterval);
    
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-effect p-3 rounded-lg border border-neon-blue/30">
          <p className="text-xs text-green-500/60 mb-1">{data.time}</p>
          <div className="space-y-1">
            <p className="text-sm text-neon-blue">
              <span className="text-green-500/60">O:</span> ${data.open.toFixed(2)}
            </p>
            <p className="text-sm text-neon-blue">
              <span className="text-green-500/60">H:</span> ${data.high.toFixed(2)}
            </p>
            <p className="text-sm text-neon-blue">
              <span className="text-green-500/60">L:</span> ${data.low.toFixed(2)}
            </p>
            <p className="text-sm text-neon-blue font-bold">
              <span className="text-green-500/60">C:</span> ${data.close.toFixed(2)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass-effect p-4 rounded-lg"
    >
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-neon-blue">{symbol}</h3>
          <button
            onClick={() => fetchChartData()}
            disabled={loading}
            className="text-xs px-3 py-1 rounded bg-neon-blue/20 text-neon-blue hover:bg-neon-blue/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {/* Timeframe Selector */}
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              disabled={loading}
              className={`text-xs px-2 py-1 rounded transition-all ${
                timeframe === tf
                  ? 'bg-neon-blue text-black font-bold'
                  : 'bg-black/50 text-green-500 hover:bg-green-500/20 border border-green-500/30'
              } disabled:opacity-50`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {loading && !data.length && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="flex flex-col items-center gap-2">
            <div className="text-green-500/60 animate-pulse">Loading chart...</div>
            <div className="text-xs text-green-500/40">Fetching market data</div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center flex-col gap-3" style={{ height }}>
          <div className="text-red-500 text-center">
            <div className="text-lg mb-2">⚠️ {error}</div>
            <div className="text-xs text-red-400">Unable to load price data</div>
          </div>
          <button
            onClick={() => fetchChartData()}
            className="px-4 py-2 rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 185, 129, 0.1)" />
            <XAxis 
              dataKey="time" 
              stroke="#10b981" 
              tick={{ fill: '#10b981', fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis 
              stroke="#10b981" 
              tick={{ fill: '#10b981', fontSize: 10 }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="close" 
              stroke="#10b981" 
              strokeWidth={2}
              fill="url(#colorPrice)" 
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="high" 
              stroke="#06d6a0" 
              strokeWidth={1}
              dot={false}
              opacity={0.3}
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="low" 
              stroke="#ef4444" 
              strokeWidth={1}
              dot={false}
              opacity={0.3}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div className="mt-2 text-xs text-green-500/60 text-center">
        {TIMEFRAME_CONFIG[timeframe].label} candles • {data.length} periods • Auto-refresh: {timeframe === '1m' || timeframe === '5m' ? '30s' : '60s'}
      </div>
    </motion.div>
  );
}

