'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface PriceChartProps {
  symbol: string;
  height?: number;
}

export default function PriceChart({ symbol, height = 300 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chart = useRef<any>(null);
  const candleSeries = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !chartContainerRef.current) {
      console.log('⏳ Waiting for mount or container...', { mounted, hasContainer: !!chartContainerRef.current });
      return;
    }

    // Wait for container to have dimensions (CSS might not be applied yet)
    const checkAndInitialize = () => {
      if (!chartContainerRef.current) return;
      
      const containerWidth = chartContainerRef.current.clientWidth;
      console.log('📐 Container dimensions:', {
        width: containerWidth,
        height: chartContainerRef.current?.clientHeight,
        offsetWidth: chartContainerRef.current?.offsetWidth,
      });

      if (containerWidth === 0) {
        console.warn('⚠️ Container width is 0, retrying in 100ms...');
        setTimeout(checkAndInitialize, 100);
        return;
      }

      console.log('📊 Loading lightweight-charts for', symbol);
      initializeChart();
    };

    checkAndInitialize();
  }, [mounted, symbol, height]);

  const initializeChart = () => {
    if (!chartContainerRef.current) return;

    // Dynamically import lightweight-charts to avoid SSR issues
    import('lightweight-charts').then((LightweightCharts) => {
      if (!chartContainerRef.current) {
        console.log('⚠️ Container ref lost');
        return;
      }
      
      if (chart.current) {
        console.log('⚠️ Chart already exists, skipping initialization');
        return;
      }

      try {
        console.log('📦 LightweightCharts loaded, version:', LightweightCharts.version || 'unknown');
        
        const containerWidth = chartContainerRef.current.clientWidth;
        if (containerWidth === 0) {
          console.error('❌ Container has 0 width!');
          setError('Chart container has invalid dimensions');
          return;
        }
        
        console.log('📐 Creating chart with dimensions:', { width: containerWidth, height });
        
        // Create chart using the default export or named export
        const createChartFn = LightweightCharts.createChart || (LightweightCharts as any).default?.createChart;
        if (!createChartFn) {
          throw new Error('createChart function not found in lightweight-charts module');
        }
        
        // Simplified configuration to avoid assertion errors
        chart.current = createChartFn(chartContainerRef.current, {
          width: containerWidth,
          height: height,
          layout: {
            background: { type: 'solid' as const, color: 'transparent' },
            textColor: '#10b981',
          },
          grid: {
            vertLines: { color: 'rgba(16, 185, 129, 0.1)' },
            horzLines: { color: 'rgba(16, 185, 129, 0.1)' },
          },
        });

        console.log('🎨 Chart created successfully');

        // Add candlestick series with multiple fallback methods
        try {
          if (typeof chart.current.addCandlestickSeries === 'function') {
            candleSeries.current = chart.current.addCandlestickSeries({
              upColor: '#10b981',
              downColor: '#ef4444',
              borderVisible: false,
              wickVisible: true,
              borderUpColor: '#10b981',
              borderDownColor: '#ef4444',
              wickUpColor: '#10b981',
              wickDownColor: '#ef4444',
            });
            console.log('✅ Candlestick series added successfully (direct method)');
          } else if (typeof chart.current.addSeries === 'function') {
            // Fallback for newer API versions
            candleSeries.current = chart.current.addSeries({
              type: 'Candlestick',
              upColor: '#10b981',
              downColor: '#ef4444',
              borderVisible: false,
              wickVisible: true,
              borderUpColor: '#10b981',
              borderDownColor: '#ef4444',
              wickUpColor: '#10b981',
              wickDownColor: '#ef4444',
            });
            console.log('✅ Candlestick series added successfully (addSeries method)');
          } else {
            throw new Error('No suitable method found to add candlestick series');
          }
        } catch (seriesErr) {
          console.error('❌ Failed to add candlestick series:', seriesErr);
          console.error('Available chart methods:', Object.keys(chart.current).filter(k => k.startsWith('add')));
          throw seriesErr;
        }
      } catch (err) {
        console.error('❌ Error initializing chart:', err);
        console.error('Error type:', typeof err);
        console.error('Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          name: err instanceof Error ? err.name : undefined,
        });
        
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Chart initialization failed: ${errorMsg}`);
        setLoading(false);
        return;
      }

      // Fetch and set data
      fetchChartData();

      // Handle resize
      const handleResize = () => {
        if (chart.current && chartContainerRef.current) {
          chart.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // Store cleanup function
      const cleanup = () => {
        window.removeEventListener('resize', handleResize);
        if (chart.current) {
          chart.current.remove();
          chart.current = null;
        }
      };

      return cleanup;
    }).catch((err) => {
      console.error('Error loading lightweight-charts:', err);
      setError('Failed to load chart library');
    });
  };

  const fetchChartData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Convert symbol format (BTC/USDT -> BTCUSDT)
      const binanceSymbol = symbol.replace('/', '');
      
      // Fetch kline data from Aster DEX (Binance-compatible API)
      const response = await fetch(
        `https://fapi.asterdex.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=5m&limit=100`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const data = await response.json();

      // Transform data to lightweight-charts format
      const chartData = data.map((kline: any[]) => ({
        time: Math.floor(kline[0] / 1000), // Convert to seconds
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
      }));

      if (candleSeries.current) {
        candleSeries.current.setData(chartData);
        chart.current?.timeScale().fitContent();
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError('Failed to load chart data');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass-effect p-4 rounded-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-neon-blue">{symbol}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => fetchChartData()}
            className="text-xs px-3 py-1 rounded bg-neon-blue/20 text-neon-blue hover:bg-neon-blue/30 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {(loading || !mounted) && !error && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="flex flex-col items-center gap-2">
            <div className="text-green-500/60 animate-pulse">Loading chart...</div>
            <div className="text-xs text-green-500/40">Initializing TradingView charts</div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center flex-col gap-3" style={{ height }}>
          <div className="text-red-500 text-center">
            <div className="text-lg mb-2">⚠️ {error}</div>
            <div className="text-xs text-red-400">Check console for details</div>
          </div>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              window.location.reload();
            }}
            className="px-4 py-2 rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors text-sm"
          >
            Reload Page
          </button>
        </div>
      )}

      <div
        ref={chartContainerRef}
        className={loading || error || !mounted ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        style={{ 
          height, 
          minHeight: height,
          width: '100%',
          minWidth: '300px',
          position: 'relative',
        }}
      />

      <div className="mt-2 text-xs text-green-500/60 text-center">
        5-minute candles • Last 100 periods
      </div>
    </motion.div>
  );
}

