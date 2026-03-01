'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, AreaSeries } from 'lightweight-charts';
import { frontendLogger } from '@/lib/frontendLogger';

interface ChartDataPoint {
  time: UTCTimestamp;
  value: number;
}

interface LiveBalanceChartProps {
  className?: string;
  initialBalance?: number;
  onBalanceUpdate?: (balance: number) => void;
  compact?: boolean;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export default function LiveBalanceChart({
  className = '',
  initialBalance = 100,
  onBalanceUpdate,
  compact = false
}: LiveBalanceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const updateQueueRef = useRef<ChartDataPoint[]>([]);
  
  const [currentBalance, setCurrentBalance] = useState(initialBalance);
  const [displayBalance, setDisplayBalance] = useState(initialBalance);
  const [startBalance, setStartBalance] = useState<number | null>(null);
  const [changePercent, setChangePercent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  
  const dataPointsRef = useRef<ChartDataPoint[]>([]);
  const chartStartTimeRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const animationRef = useRef<{ start: number; end: number; startTime: number } | null>(null);
  
  // Smoothing state for enterprise-level chart smoothing
  const smoothedValueRef = useRef<number | null>(null);
  const lastRawValueRef = useRef<number | null>(null);
  const smoothingAlpha = 0.3; // EMA smoothing factor (0.3 = 30% new value, 70% previous)
  const maxChangePercent = 5; // Maximum allowed change per update (5% to prevent spikes)

  // Bloomberg-style smooth number animation - only animate significant changes
  const animateValue = useCallback((targetValue: number) => {
    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setDisplayBalance(current => {
      // Only animate if change is significant (> $0.01) to avoid constant micro-animations
      const difference = Math.abs(targetValue - current);
      if (difference < 0.01) {
        return targetValue; // No animation for tiny changes
      }

      const startValue = current;
      const startTime = performance.now();
      const duration = Math.min(1000, Math.max(300, difference * 10)); // Adaptive duration

      animationRef.current = { start: startValue, end: targetValue, startTime };

      const animate = (currentTime: number) => {
        if (!animationRef.current) return;
        
        const elapsed = currentTime - animationRef.current.startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Bloomberg-style easing: smooth exponential decay
        const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const animatedValue = animationRef.current.start + (animationRef.current.end - animationRef.current.start) * easeOutExpo;
        
        setDisplayBalance(animatedValue);
        
        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
      return current; // Return current during animation setup
    });
  }, []);

  // Initialize chart with Bloomberg Terminal standards
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#888888',
        fontSize: 10,
        fontFamily: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
      },
      grid: {
        vertLines: { 
          color: 'rgba(255, 255, 255, 0.02)',
          style: 0, // Solid line
          visible: true,
        },
        horzLines: { 
          color: 'rgba(255, 255, 255, 0.02)',
          style: 0, // Solid line
          visible: true,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 0,
          labelBackgroundColor: '#000000',
          labelVisible: true,
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 0,
          labelBackgroundColor: '#000000',
          labelVisible: true,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: false,
        ticksVisible: true,
        autoScale: true,
        alignLabels: true,
        textColor: '#888888',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 8,
        barSpacing: 3,
        fixLeftEdge: true,
        fixRightEdge: true,
        textColor: '#888888',
        tickMarkFormatter: (time: number, tickMarkType: any, locale: string) => {
          const date = new Date(time * 1000);
          const now = new Date();
          const isToday = date.toDateString() === now.toDateString();
          
          // Show date if not today, or if it's a major tick
          if (!isToday || tickMarkType === 2) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${month}/${day} ${hours}:${minutes}:${seconds}`;
          }
          
          // For today, show time with seconds
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${hours}:${minutes}:${seconds}`;
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: compact ? 200 : 400,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
        axisDoubleClickReset: true,
        axisTouchDrag: true,
      },
    } as Parameters<typeof createChart>[1]);

    // Industry-standard area series: professional trading chart with smooth rendering
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#00ff88',
      topColor: 'rgba(0, 255, 136, 0.12)',
      bottomColor: 'rgba(0, 255, 136, 0.005)',
      lineWidth: 2,
      lineStyle: 0, // Solid line (0 = solid, 1 = dotted, 2 = dashed)
      priceLineVisible: false, // Hide price line for cleaner look in compact mode
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      lastValueVisible: compact ? false : true, // Hide in compact mode for cleaner look
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: '#00ff88',
      crosshairMarkerBackgroundColor: '#000000',
      crosshairMarkerBorderWidth: 1.5,
      // SMOOTHING SMOOTHING: Enable line smoothing for ultra-smooth chart rendering
      // This uses anti-aliasing and interpolation for professional Bloomberg-style smoothness
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // Industry standard: Subscribe to crosshair movements for value display
    chart.subscribeCrosshairMove((param) => {
      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
        return;
      }
      // Crosshair is handled automatically by lightweight-charts
      // This subscription allows for custom tooltips if needed in the future
    });

    // Optimized resize handler
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    fetchHistoricalData();

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [compact]);

  // Process update queue continuously for smooth real-time updates
  // Optimized for cleaner, more responsive chart updates
  useEffect(() => {
    let isProcessing = false;
    let rafId: number | null = null;
    
    const processUpdates = () => {
      if (isProcessing || !seriesRef.current) return;
      
      if (updateQueueRef.current.length > 0) {
        isProcessing = true;
        const updates = updateQueueRef.current.splice(0, updateQueueRef.current.length);
        
        try {
          updates.forEach(point => {
            seriesRef.current?.update(point);
          });
        } catch {
          // On timestamp conflict, reset the full dataset
          try {
            seriesRef.current?.setData(dataPointsRef.current);
          } catch { /* ignore */ }
        }
        
        isProcessing = false;
      }
      
      // Continue processing if there are more updates
      if (updateQueueRef.current.length > 0) {
        rafId = requestAnimationFrame(processUpdates);
      }
    };

    // Use requestAnimationFrame for smoother updates
    const scheduleUpdate = () => {
      if (updateQueueRef.current.length > 0 && !isProcessing) {
        rafId = requestAnimationFrame(processUpdates);
      }
    };

    // Check for updates more frequently for real-time feel
    const interval = setInterval(scheduleUpdate, 50); // 50ms = 20fps minimum

    return () => {
      clearInterval(interval);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Fetch historical balance data
  const fetchHistoricalData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const balanceResponse = await fetch('/api/real-balance?action=current-balance', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      
      if (balanceResponse.ok) {
        const balanceResult = await balanceResponse.json();
        let balance: number | null = null;
        
        if (balanceResult.success && balanceResult.data) {
          if (balanceResult.data.data?.balance !== undefined) {
            balance = parseFloat(balanceResult.data.data.balance);
          } else if (balanceResult.data.balance !== undefined) {
            balance = parseFloat(balanceResult.data.balance);
          } else if (balanceResult.data.accountEquity !== undefined) {
            balance = parseFloat(balanceResult.data.accountEquity);
          }
        }
        
          if (balance !== null && !isNaN(balance) && Number.isFinite(balance)) {
            // Initialize smoothing refs on first load
            if (smoothedValueRef.current === null) {
              smoothedValueRef.current = balance;
              lastRawValueRef.current = balance;
            }
            
            setCurrentBalance(balance);
            setDisplayBalance(balance);
            if (startBalance === null) {
              setStartBalance(balance);
              chartStartTimeRef.current = Date.now();
            }
            onBalanceUpdate?.(balance);
          }
      }

      const historyResponse = await fetch('/api/real-balance?action=chart-data&timeRange=24H', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (historyResponse.ok) {
        const historyResult = await historyResponse.json();
        
        if (historyResult.success && historyResult.data?.data) {
          const historyData = historyResult.data.data;
          
          if (Array.isArray(historyData) && historyData.length > 0) {
            const sortedData = historyData
              .map((point: any) => ({
                time: Math.floor(new Date(point.timestamp).getTime() / 1000) as UTCTimestamp,
                value: parseFloat(point.balance || point.value || point.price || 0),
              }))
              .filter((point: ChartDataPoint) => !isNaN(point.value) && Number.isFinite(point.value))
              .sort((a: ChartDataPoint, b: ChartDataPoint) => (a.time as number) - (b.time as number));

            const deduplicated: ChartDataPoint[] = [];
            const seenTimes = new Set<number>();
            
            sortedData.forEach((point: ChartDataPoint) => {
              const timeKey = point.time as number;
              if (!seenTimes.has(timeKey)) {
                seenTimes.add(timeKey);
                deduplicated.push(point);
              }
            });

            if (deduplicated.length > 0 && startBalance === null) {
              setStartBalance(deduplicated[0].value);
              chartStartTimeRef.current = (deduplicated[0].time as number) * 1000;
            }

            dataPointsRef.current = deduplicated;
            
            if (seriesRef.current) {
              seriesRef.current.setData(deduplicated);
              
              if (chartRef.current) {
                // Industry standard: Fit content and scroll to latest
                chartRef.current.timeScale().fitContent();
                chartRef.current.timeScale().scrollToPosition(-1, false);
              }
              
              if (deduplicated.length > 0) {
                const lastPoint = deduplicated[deduplicated.length - 1];
                
                // Initialize smoothing refs from historical data
                if (smoothedValueRef.current === null) {
                  smoothedValueRef.current = lastPoint.value;
                  lastRawValueRef.current = lastPoint.value;
                }
                
                setCurrentBalance(lastPoint.value);
                setDisplayBalance(lastPoint.value);
                onBalanceUpdate?.(lastPoint.value);
              }
            }
          }
        }
      }

      setIsLoading(false);
      setConnectionStatus('connected');
      startBalanceStream();
    } catch (error) {
      frontendLogger.error('Failed to fetch historical data', error instanceof Error ? error : new Error(String(error)), {
        component: 'LiveBalanceChart',
      });
      setIsLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [startBalance, onBalanceUpdate]);

  // Start real-time balance stream
  const startBalanceStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/balance-stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'balance' && data.balance !== undefined) {
          const balance = parseFloat(data.balance);
          const timestamp = data.timestamp || Date.now();
          
          if (!isNaN(balance) && Number.isFinite(balance)) {
            const now = Math.floor(timestamp / 1000) as UTCTimestamp;
            const currentTime = Date.now();
            
            // Industry standard: Update every 2-3 seconds for balance data
            // This prevents excessive updates and provides smooth, professional chart movement
            if (currentTime - lastUpdateTimeRef.current < 2000) {
              return;
            }
            lastUpdateTimeRef.current = currentTime;
            
            // SMOOTHING SMOOTHING: Apply exponential moving average (EMA) to prevent spikes
            // This creates smooth transitions while maintaining responsiveness
            let smoothedBalance = balance;
            
            if (lastRawValueRef.current !== null && smoothedValueRef.current !== null) {
              // Calculate percentage change
              const changePercent = Math.abs((balance - lastRawValueRef.current) / lastRawValueRef.current) * 100;
              
              // If change is too large (spike), cap it to prevent sudden jumps
              if (changePercent > maxChangePercent) {
                // Cap the change to maxChangePercent
                const direction = balance > lastRawValueRef.current ? 1 : -1;
                const maxChange = lastRawValueRef.current * (maxChangePercent / 100);
                smoothedBalance = lastRawValueRef.current + (maxChange * direction);
                
                frontendLogger.debug('Capped large balance change to prevent spike', {
                  component: 'LiveBalanceChart',
                  data: {
                    rawChange: changePercent.toFixed(2) + '%',
                    cappedChange: maxChangePercent + '%',
                    previousValue: lastRawValueRef.current.toFixed(2),
                    rawValue: balance.toFixed(2),
                    smoothedValue: smoothedBalance.toFixed(2)
                  }
                });
              }
              
              // Apply EMA smoothing: smoothValue = alpha * newValue + (1 - alpha) * previousSmoothValue
              // This creates a smooth transition while still responding to real changes
              smoothedBalance = (smoothingAlpha * smoothedBalance) + ((1 - smoothingAlpha) * smoothedValueRef.current);
            }
            
            // Update refs for next iteration
            lastRawValueRef.current = balance;
            smoothedValueRef.current = smoothedBalance;
            
            // Use smoothed value for chart (prevents spikes while maintaining accuracy)
            const newPoint: ChartDataPoint = {
              time: now,
              value: smoothedBalance, // Smoothed value to prevent spikes
            };

            // SMOOTHING SMOOTHING: Add interpolation points for ultra-smooth transitions
            const previousPoint = dataPointsRef.current.length > 0 
              ? dataPointsRef.current[dataPointsRef.current.length - 1] 
              : null;
            
            if (previousPoint) {
              const timeDiff = (newPoint.time as number) - (previousPoint.time as number);
              const valueDiff = newPoint.value - previousPoint.value;
              
              // If there's a significant gap, add intermediate points for smooth interpolation
              if (timeDiff > 3 && Math.abs(valueDiff) > 0.01) {
                const numInterpolationPoints = Math.min(2, Math.floor(timeDiff / 2));
                const lastTime = dataPointsRef.current.length > 0
                  ? (dataPointsRef.current[dataPointsRef.current.length - 1].time as number)
                  : 0;
                
                for (let i = 1; i <= numInterpolationPoints; i++) {
                  const ratio = i / (numInterpolationPoints + 1);
                  const interpolatedTime = Math.floor(
                    (previousPoint.time as number) + (timeDiff * ratio)
                  ) as UTCTimestamp;
                  
                  // Skip if this timestamp already exists or is not strictly increasing
                  if ((interpolatedTime as number) <= lastTime || (interpolatedTime as number) >= (newPoint.time as number)) {
                    continue;
                  }
                  
                  const easeRatio = ratio < 0.5 
                    ? 2 * ratio * ratio 
                    : 1 - Math.pow(-2 * ratio + 2, 2) / 2;
                  
                  const interpolatedValue = previousPoint.value + (valueDiff * easeRatio);
                  
                  dataPointsRef.current.push({
                    time: interpolatedTime,
                    value: interpolatedValue
                  });
                }
              }
            }
            
            dataPointsRef.current.push(newPoint);
            if (dataPointsRef.current.length > 2000) {
              dataPointsRef.current.shift();
            }

            // Update chart immediately for real-time movement
            if (seriesRef.current) {
              try {
                const pointsToUpdate = previousPoint 
                  ? dataPointsRef.current.slice(-(previousPoint ? 3 : 1))
                  : [newPoint];
                
                pointsToUpdate.forEach(point => {
                  seriesRef.current?.update(point);
                });
              } catch {
                // If update fails (e.g. timestamp conflict), reset the full dataset
                try {
                  seriesRef.current?.setData(dataPointsRef.current);
                } catch { /* ignore */ }
              }
            }

            // Smooth balance animation - only animate if change is significant
            // This prevents the "loading from 0" bug by using current display value
            animateValue(balance);

            setCurrentBalance(balance);
            setLastUpdated(timestamp);
            onBalanceUpdate?.(balance);

            if (startBalance !== null && startBalance > 0) {
              const change = ((balance - startBalance) / startBalance) * 100;
              setChangePercent(change);
            }

            if (chartRef.current) {
              chartRef.current.timeScale().scrollToPosition(-1, false);
            }
          }
        }
      } catch (error) {
        frontendLogger.error('Failed to parse balance stream data', error instanceof Error ? error : new Error(String(error)), {
          component: 'LiveBalanceChart',
        });
      }
    };

    eventSource.onerror = () => {
      setConnectionStatus('disconnected');
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          startBalanceStream();
        }
      }, 3000);
    };
  }, [startBalance, onBalanceUpdate, displayBalance, animateValue]);

  useEffect(() => {
    if (startBalance !== null && startBalance > 0) {
      const change = ((currentBalance - startBalance) / startBalance) * 100;
      setChangePercent(change);
    }
  }, [currentBalance, startBalance]);

  // Memoized formatted values
  const formattedBalance = useMemo(() => formatCurrency(displayBalance), [displayBalance]);
  const formattedPercent = useMemo(() => formatPercent(changePercent), [changePercent]);
  const formattedTime = useMemo(() => {
    const date = new Date(lastUpdated);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }, [lastUpdated]);

  if (compact) {
    return (
      <div className={`flex flex-col h-full bg-black ${className}`}>
        {/* Minimal header for compact mode - cleaner design */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.03]">
          <div className="text-[10px] font-medium text-white/90 tabular-nums font-mono">
            {formattedBalance}
          </div>
          <div className="flex items-center gap-2 text-right">
            <div className={`text-[10px] font-medium tabular-nums font-mono ${
              changePercent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'
            }`}>
              {formattedPercent}
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1 h-1 rounded-full ${connectionStatus === 'connected' ? 'bg-[#00ff88]' : 'bg-[#666]'}`} />
            </div>
          </div>
        </div>
        {/* Clean chart area - no borders, minimal styling for cleaner look */}
        <div className="relative flex-1 min-h-0" ref={chartContainerRef} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-black border border-white/[0.05] ${className}`}>
      {/* Bloomberg-style Header */}
      <div className="flex items-baseline justify-between px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-medium tracking-tight tabular-nums text-white font-mono">
            {formattedBalance}
          </span>
          <span className={`text-sm font-medium tabular-nums px-2 py-0.5 font-mono ${
            changePercent >= 0 
              ? 'text-[#00ff88]' 
              : 'text-[#ff4444]'
          }`}>
            {formattedPercent}
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 ${connectionStatus === 'connected' ? 'bg-[#00ff88]' : 'bg-[#666]'}`} />
            <span className={`text-xs font-mono tabular-nums ${
              connectionStatus === 'connected' ? 'text-[#00ff88]' : 'text-[#666]'
            }`}>
              {connectionStatus === 'connected' ? 'LIVE' : 'OFF'}
            </span>
          </div>
          <div className="text-xs text-[#888] font-mono tabular-nums">
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative flex-1 min-h-0" ref={chartContainerRef}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/95 z-10">
            <div className="text-xs text-[#888] font-mono">LOADING...</div>
          </div>
        )}
      </div>
    </div>
  );
}
