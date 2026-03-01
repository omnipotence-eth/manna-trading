'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';
import LiveStatusBadge from './LiveStatusBadge';

interface ChartDataPoint {
  timestamp: number;
  price: number;
  change: number;
  changePercent: number;
}

interface InteractiveChartProps {
  className?: string;
  initialBalance?: number;
  onBalanceUpdate?: (balance: number) => void;
  compact?: boolean; // embed-friendly minimal view
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatTimestampShort = (ts: number) => {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${month}/${day} ${time}`;
};

const formatTimeAgoShort = (ts: number) => {
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 10) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  const m = Math.floor(delta / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

// NOTE: Connection status types
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// NOTE: Performance metrics tracking
interface PerformanceMetrics {
  avgLatency: number;
  successRate: number;
  totalRequests: number;
  failedRequests: number;
}

// WORLD-CLASS: Memoize expensive chart component to prevent unnecessary re-renders
// Only re-renders when balance data or time range actually changes
const InteractiveChart = React.memo(function InteractiveChart({ 
  className = '', 
  initialBalance = 100, // default to a visible baseline; live fetch will override
  onBalanceUpdate,
  compact = false
}: InteractiveChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [allHistoricalData, setAllHistoricalData] = useState<ChartDataPoint[]>([]); // Store full history
  const [currentBalance, setCurrentBalance] = useState(initialBalance);
  const [smoothedPrice, setSmoothedPrice] = useState(initialBalance);
  const [timeRange, setTimeRange] = useState<'24H' | '7D' | '30D'>('24H');
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  
  // NOTE: Enhanced state management
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    avgLatency: 0,
    successRate: 100,
    totalRequests: 0,
    failedRequests: 0
  });
  
  // ANIMATION: Tick state for smooth pulse animation
  const [animationTick, setAnimationTick] = useState(0);
  
  // LIVE LINE: Track the animated line endpoint separately from data points
  const [liveLineEnd, setLiveLineEnd] = useState<{ timestamp: number; price: number } | null>(null);
  const liveRenderRef = useRef<{ timestamp: number; price: number } | null>(null);
  const smoothRafRef = useRef<number | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isFetchingRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const fetchStartTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // NOF1.AI STYLE: Chart initialization refs
  const chartStartTimeRef = useRef<number | null>(null);
  const initialBalanceRef = useRef<number | null>(null);
  // LIVE ANIMATION: Last known balance for smooth animation
  const lastKnownBalanceRef = useRef<number>(0);

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
  }, []);

  // NOTE: Enhanced balance fetching with circuit breaker pattern
  // OPTIMIZED: Uses WebSocket user data stream cache for real-time updates
  // Per Aster DEX API docs, ACCOUNT_UPDATE events provide instant balance changes
  // The /api/real-balance endpoint checks WebSocket cache first, then falls back to REST API
  const fetchRealBalance = useCallback(async () => {
    // Circuit breaker: Stop fetching if too many consecutive errors
    const MAX_CONSECUTIVE_ERRORS = 5;
    const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds
    
    // CRITICAL FIX: Check circuit breaker state using functional update
    let shouldProceed = true;
    setConsecutiveErrors(current => {
      if (current >= MAX_CONSECUTIVE_ERRORS) {
        shouldProceed = false;
        if (retryTimeoutRef.current === null) {
          frontendLogger.warn('Circuit breaker activated - too many consecutive errors', {
            component: 'InteractiveChart',
            data: { consecutiveErrors: current, nextRetry: Date.now() + CIRCUIT_BREAKER_RESET_TIME }
          });
          
          setConnectionStatus('error');
          
          // Reset after cooldown period
          retryTimeoutRef.current = setTimeout(() => {
            setConsecutiveErrors(0);
            reconnectAttemptsRef.current = 0;
            retryTimeoutRef.current = null;
            setConnectionStatus('connecting');
            frontendLogger.info('Circuit breaker reset - resuming data fetching', {
              component: 'InteractiveChart'
            });
          }, CIRCUIT_BREAKER_RESET_TIME);
        }
      }
      return current; // Always return the current value
    });
    
    // Early return if circuit breaker is active
    if (!shouldProceed || retryTimeoutRef.current !== null) {
      return;
    }
    
    // CRITICAL FIX: Prevent concurrent fetches
    if (isFetchingRef.current) {
      frontendLogger.debug('Balance fetch already in progress, skipping', {
        component: 'InteractiveChart'
      });
      return;
    }
    
    isFetchingRef.current = true;
    
    // CRITICAL FIX: Store AbortController for cleanup
    let abortController: AbortController | null = null;
    
    try {
      fetchStartTimeRef.current = Date.now();
      abortController = new AbortController();
      // CRITICAL FIX: Increased timeout to 15s to handle slow API responses
      // The account API might take longer due to rate limiting or retries
      const timeoutId = setTimeout(() => {
        if (abortController) {
          abortController.abort();
        }
      }, 15000); // 15s timeout
      
      const response = await fetch('/api/real-balance?action=current-balance', {
        signal: abortController.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      const latency = Date.now() - fetchStartTimeRef.current;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();

      // CRITICAL FIX: Handle nested response structure
      // Response: { success: true, data: { message: "...", data: { balance, timestamp, source } } }
      let balance: number | null = null;
      
      if (result.success && result.data) {
        // Handle nested structure: result.data.data.balance
        if (result.data.data && result.data.data.balance !== undefined) {
          balance = parseFloat(result.data.data.balance);
        } 
        // Handle direct structure: result.data.balance
        else if (result.data.balance !== undefined) {
          balance = parseFloat(result.data.balance);
        } 
        // Fallback to accountEquity
        else if (result.data.accountEquity !== undefined) {
          balance = parseFloat(result.data.accountEquity);
        }
        // Try top-level balance
        else if (result.balance !== undefined) {
          balance = parseFloat(result.balance);
        }
      }
      
      // CRITICAL FIX: Allow balance of 0 or very small values (don't reject)
      // Some accounts might legitimately have 0 balance
      if (balance !== null && !isNaN(balance)) {
        
        // NOTE: Strict validation
        if (!Number.isFinite(balance)) {
          throw new Error(`Invalid balance value: ${balance}`);
        }
        
        // CRITICAL: Initialize chart start point on first successful fetch with real portfolio value
        // Allow balance to be 0 (some accounts may have 0 balance)
        if (chartStartTimeRef.current === null || initialBalanceRef.current === null) {
          chartStartTimeRef.current = Date.now();
          initialBalanceRef.current = balance;
          lastKnownBalanceRef.current = balance;
          
          // Initialize chart with actual portfolio value - create minimal segment for smooth wave start
          // Use balance even if it's 0 - we need to show the chart
          const initPoint: ChartDataPoint = {
            timestamp: chartStartTimeRef.current,
            price: balance,
            change: 0,
            changePercent: 0
          };
          
          // Create a small segment (1 second back) so the line can flow smoothly
          const historicalPoints: ChartDataPoint[] = [
            { timestamp: chartStartTimeRef.current - 1000, price: balance, change: 0, changePercent: 0 },
            initPoint
          ];
          
          setAllHistoricalData(historicalPoints);
          setCurrentBalance(balance);
          setSmoothedPrice(balance);
          setLiveLineEnd({ timestamp: chartStartTimeRef.current, price: balance });
          setIsLoading(false);
          isInitialLoadRef.current = false;
          
          // Start animation loop once we have data (even if balance is 0)
          if (smoothRafRef.current === null) {
            const animateLiveLine = () => {
              const now = Date.now();
              const target = lastKnownBalanceRef.current !== null ? lastKnownBalanceRef.current : balance;
              // Allow animation even if target is 0
              setSmoothedPrice(prev => {
                const current = prev !== null ? prev : target;
                // FIXED: Smoother easing (0.08) for graceful wave movement
                const easingFactor = 0.08;
                const next = current + (target - current) * easingFactor;
                const safeNext = Number.isFinite(next) ? next : current;
                // Update live line endpoint every frame for smooth tick-by-tick tracking
                setLiveLineEnd({ timestamp: now, price: safeNext });
                return safeNext;
              });
              setAnimationTick(t => t + 1);
              smoothRafRef.current = requestAnimationFrame(animateLiveLine);
            };
            smoothRafRef.current = requestAnimationFrame(animateLiveLine);
          }
          
          frontendLogger.info('Chart initialized from portfolio value', {
            component: 'InteractiveChart',
            data: {
              startBalance: balance.toFixed(2),
              startTime: new Date(chartStartTimeRef.current).toISOString()
            }
          });
        }
        
        // NOTE: Log every balance update for debugging
            frontendLogger.debug('Balance fetched successfully', {
              component: 'InteractiveChart',
              data: {
                balance: balance.toFixed(2),
                source: result.data?.source || result.data?.data?.source || 'unknown',
                consecutiveErrors: consecutiveErrors
              }
            });
        
        const prevBalance = currentBalance || initialBalanceRef.current || balance;
        const now = Date.now();
        
        // Update metrics
        setPerformanceMetrics(prev => {
          const newTotal = prev.totalRequests + 1;
          const newAvgLatency = (prev.avgLatency * prev.totalRequests + latency) / newTotal;
          const newSuccessRate = ((newTotal - prev.failedRequests) / newTotal) * 100;
          
          return {
            avgLatency: newAvgLatency,
            successRate: newSuccessRate,
            totalRequests: newTotal,
            failedRequests: prev.failedRequests
          };
        });
        
        // Reset error counter on success
        if (consecutiveErrors > 0) {
          setConsecutiveErrors(0);
          reconnectAttemptsRef.current = 0;
        }
        
        setConnectionStatus('connected');
        setCurrentBalance(balance);
        lastKnownBalanceRef.current = balance; // Update for live animation
        
        // LIVE: Sync balance with parent component (every cent)
        if (onBalanceUpdate && Math.abs(balance - prevBalance) >= 0.001) {
          onBalanceUpdate(balance);
        }
        
        // TICK-BY-TICK: Add live data point to historical data, then filter by time range
        setAllHistoricalData(prevAllData => {
          const baseData = prevAllData.length > 0 ? prevAllData : (() => {
            if (chartStartTimeRef.current && initialBalanceRef.current) {
              return [
                { timestamp: chartStartTimeRef.current, price: initialBalanceRef.current, change: 0, changePercent: 0 },
                { timestamp: now, price: balance, change: 0, changePercent: 0 }
              ];
            }
            return [];
          })();

          const startBalance = initialBalanceRef.current || (baseData.length > 0 ? baseData[0].price : balance);
          const totalChange = balance - startBalance;
          const totalChangePercent = startBalance > 0 ? (totalChange / startBalance) * 100 : 0;

          const newPoint: ChartDataPoint = {
            timestamp: now,
            price: balance,
            change: totalChange,
            changePercent: totalChangePercent
          };

          const merged = [...baseData, newPoint]
            // Keep points spaced to avoid overdraw; allow 1s granularity for smooth tick-by-tick tracking
            .filter((p, idx, arr) => idx === 0 || (p.timestamp - arr[idx - 1].timestamp) >= 1000);

          return merged.slice(-5000);
        });
        
        setLastUpdated(now);
        setError(null);
        
        // Log significant changes
        if (prevBalance !== 0 && Math.abs(balance - prevBalance) >= 0.01) {
          frontendLogger.info('✓ Account equity updated', {
            component: 'InteractiveChart',
            data: {
              balance: balance.toFixed(2),
              change: (balance - prevBalance).toFixed(2),
              latency: `${latency}ms`,
              status: 'healthy'
            }
          });
        }
      } else {
        // No balance found in response
        throw new Error('Balance not found in API response');
      }
    } catch (err) {
      const latency = Date.now() - fetchStartTimeRef.current;
      
      // Update error metrics
      setPerformanceMetrics(prev => {
        const newTotal = prev.totalRequests + 1;
        const newFailed = prev.failedRequests + 1;
        const newSuccessRate = ((newTotal - newFailed) / newTotal) * 100;
        
        return {
          ...prev,
          totalRequests: newTotal,
          failedRequests: newFailed,
          successRate: newSuccessRate
        };
      });
      
      // CRITICAL FIX: Use functional update to get current value
      setConsecutiveErrors(current => {
        const newConsecutiveErrors = current + 1;
        return newConsecutiveErrors;
      });
      reconnectAttemptsRef.current += 1;
      
      const isAbortError = err instanceof Error && err.name === 'AbortError';
      const errorMessage = isAbortError 
        ? 'Request timeout (15s) - server may be slow' 
        : err instanceof Error ? err.message : 'Unknown error';
      
      // CRITICAL FIX: Get current error count for logging and status
      setConsecutiveErrors(current => {
        const newConsecutiveErrors = current + 1;
        
        setConnectionStatus(newConsecutiveErrors >= MAX_CONSECUTIVE_ERRORS ? 'error' : 'disconnected');
        
        frontendLogger.error('Balance fetch failed', err as Error, { 
          component: 'InteractiveChart',
          data: {
            consecutiveErrors: newConsecutiveErrors,
            reconnectAttempts: reconnectAttemptsRef.current,
            latency: `${latency}ms`,
            errorType: isAbortError ? 'timeout' : 'network',
            errorMessage
          }
        });
        
        // CRITICAL FIX: Show error immediately but with helpful message
        if (newConsecutiveErrors >= 1) {
          if (isAbortError) {
            setError('Chart loading... (timeout - server may be slow)');
          } else if (errorMessage.includes('500') || errorMessage.includes('Account API')) {
            setError('Chart loading... (server error - check API connection)');
          } else {
            setError(`Chart loading... (${errorMessage})`);
          }
        }
        
        return newConsecutiveErrors;
      });
    } finally {
      // CRITICAL: Always reset fetch flag to allow next fetch
      isFetchingRef.current = false;
    }
  }, []); // CRITICAL FIX: Empty deps - use functional state updates

  // LIVE CHART: Initialize chart structure (will be populated with real data)
  const initializeChart = useCallback(() => {
    // Initialize chart structure immediately so it can render
    // Real balance will be populated from API fetch
    const now = Date.now();
    
    // Only set start time if not already set (preserve on re-renders)
    if (chartStartTimeRef.current === null) {
      chartStartTimeRef.current = now;
    }
    
    // If we have initialBalance prop, use it as a temporary baseline
    // This allows chart to render while waiting for API data
    if (initialBalanceRef.current === null) {
      const startBalance = initialBalance > 0 ? initialBalance : 0;
      
      // Set refs even if balance is 0 - we need structure for rendering
      initialBalanceRef.current = startBalance;
      lastKnownBalanceRef.current = startBalance;
      setCurrentBalance(startBalance);
      setSmoothedPrice(startBalance);
      setLiveLineEnd({ timestamp: now, price: startBalance });

      // Seed with a minimal segment so chart can render
      const historicalPoints: ChartDataPoint[] = [
        { timestamp: now - 1000, price: startBalance, change: 0, changePercent: 0 },
        { timestamp: now, price: startBalance, change: 0, changePercent: 0 }
      ];

      setAllHistoricalData(historicalPoints);
      setIsLoading(false);
      isInitialLoadRef.current = false;

      frontendLogger.info('Chart initialized with baseline', {
        component: 'InteractiveChart',
        data: {
          startBalance: startBalance.toFixed(2),
          dataPoints: historicalPoints.length,
          willUpdateFromAPI: true
        }
      });
    }
  }, [initialBalance]);

  // CRITICAL FIX: Single source of truth - memoize filtered chart data based on time range
  // Downsample to 4h buckets and use only real balance history
  const filteredChartData = useMemo(() => {
    if (allHistoricalData.length === 0) return [];

    const now = Date.now();
    let cutoffTime: number;
    let bucketMs: number;
    switch (timeRange) {
      case '24H':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        bucketMs = 60 * 60 * 1000; // 1h buckets for 24H
        break;
      case '7D':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        bucketMs = 4 * 60 * 60 * 1000; // 4h buckets for 7D
        break;
      case '30D':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        bucketMs = 6 * 60 * 60 * 1000; // 6h buckets for 30D
        break;
      default:
        cutoffTime = now - 24 * 60 * 60 * 1000;
        bucketMs = 60 * 60 * 1000;
    }

    const inRange = allHistoricalData.filter(p => p.timestamp >= cutoffTime);

    // Include continuity point before range if exists
    const firstIdx = allHistoricalData.findIndex(p => p.timestamp >= cutoffTime);
    if (firstIdx > 0) {
      inRange.unshift(allHistoricalData[firstIdx - 1]);
    }

    // Downsample into buckets, keeping latest point per bucket
    const bucketMap = new Map<number, ChartDataPoint>();
    for (const p of inRange) {
      const bucket = Math.floor(p.timestamp / bucketMs);
      const existing = bucketMap.get(bucket);
      if (!existing || p.timestamp > existing.timestamp) {
        bucketMap.set(bucket, p);
      }
    }

    const filtered = Array.from(bucketMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    frontendLogger.debug('Filtered chart data by time range (bucketed)', {
      component: 'InteractiveChart',
      data: {
        range: timeRange,
        bucketMs,
        totalPoints: allHistoricalData.length,
        filteredPoints: filtered.length,
        cutoffTime: new Date(cutoffTime).toISOString(),
        oldestPoint: filtered.length > 0 ? new Date(filtered[0].timestamp).toISOString() : 'none',
        newestPoint: filtered.length > 0 ? new Date(filtered[filtered.length - 1].timestamp).toISOString() : 'none'
      }
    });

    return filtered;
  }, [allHistoricalData, timeRange]);

  // LIVE CHART: Initialize and track balance in real-time
  useEffect(() => {
    // CRITICAL FIX: Fetch real portfolio value FIRST before initializing chart
    // This ensures chart starts at actual portfolio value, not $100 default
    const initializeWithRealBalance = async () => {
      try {
        // Fetch real balance immediately and wait for it
        await fetchRealBalance();
        
        // Only initialize chart structure if we don't have real data yet
        // fetchRealBalance will have initialized it with real portfolio value
        if (initialBalanceRef.current === null && chartStartTimeRef.current === null) {
          // Fallback: If fetch failed, use initialBalance prop (but prefer API value)
          initializeChart();
        }
      } catch (error) {
        // If fetch fails, initialize with prop value as fallback
        frontendLogger.warn('Failed to fetch initial balance, using prop value', {
          component: 'InteractiveChart',
          data: { errorMessage: error instanceof Error ? error.message : String(error) }
        });
        if (initialBalanceRef.current === null) {
          initializeChart();
        }
      }
    };
    
    initializeWithRealBalance();
    
    // CRITICAL: Timeout loading state after 10 seconds to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isLoading && isInitialLoadRef.current) {
        setIsLoading(false);
        isInitialLoadRef.current = false;
        frontendLogger.warn('Chart loading timeout - showing available data', {
          component: 'InteractiveChart'
        });
      }
    }, 10000); // 10s timeout
    
    // OPTIMIZED: Adaptive polling based on activity
    // Poll faster when balance is changing, slower when stable
    let lastBalanceRef = { value: currentBalance };
    let balanceChangeCountRef = { value: 0 };
    let currentInterval = 2000; // Start with default 2s
    
    // LIVE: Update balance with adaptive interval
    const balanceInterval = setInterval(() => {
      const prevBalance = lastBalanceRef.value;
      fetchRealBalance().then(() => {
        // Track if balance changed (using ref to access latest value)
        const newBalance = lastKnownBalanceRef.current || prevBalance;
        if (Math.abs(newBalance - prevBalance) > 0.01) {
          balanceChangeCountRef.value = 3; // Keep fast polling for 3 cycles
          lastBalanceRef.value = newBalance;
          // Dynamically adjust interval
          if (currentInterval > 1000) {
            currentInterval = 1000; // Fast polling when balance changing
            frontendLogger.debug('Adaptive polling: switched to fast mode (1s)', {
              component: 'InteractiveChart'
            });
          }
        } else if (balanceChangeCountRef.value > 0) {
          balanceChangeCountRef.value--;
          if (balanceChangeCountRef.value === 0 && currentInterval < 2000) {
            currentInterval = 2000; // Back to normal polling
            frontendLogger.debug('Adaptive polling: switched to normal mode (2s)', {
              component: 'InteractiveChart'
            });
          }
        }
        lastBalanceRef.value = newBalance;
      });
    }, currentInterval);
    
    // LIVE LINE ANIMATION: Create smooth wave-like motion (60 FPS)
    // Use requestAnimationFrame for buttery smooth rendering
    const animateLiveLine = () => {
      const now = Date.now();
      const target = lastKnownBalanceRef.current || smoothedPrice || 0;

      // Animate if we have a target (allow 0 balance)
      if (target !== null && target !== undefined && initialBalanceRef.current !== null) {
        setSmoothedPrice(prev => {
          const current = prev !== null && prev !== undefined ? prev : target;
          // FIXED: Smoother easing (0.08 instead of 0.06) for more graceful wave movement
          // This creates a smoother, more wave-like animation as balance changes
          const easingFactor = 0.08;
          const next = current + (target - current) * easingFactor;
          const safeNext = Number.isFinite(next) ? next : current;
          // Update live endpoint every frame for smooth tick-by-tick tracking
          setLiveLineEnd({ timestamp: now, price: safeNext });
          return safeNext;
        });

        setAnimationTick(t => t + 1);
      }
      
      smoothRafRef.current = requestAnimationFrame(animateLiveLine);
    };
    
    // Start animation loop once we have initialized
    if (initialBalanceRef.current !== null || initialBalance >= 0) {
      smoothRafRef.current = requestAnimationFrame(animateLiveLine);
    }

    return () => {
      clearInterval(balanceInterval);
      if (smoothRafRef.current !== null) {
        cancelAnimationFrame(smoothRafRef.current);
        smoothRafRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // CRITICAL FIX: Cleanup AbortController if fetch is in progress
      if (isFetchingRef.current) {
        isFetchingRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // SMOOTHING: ease currentBalance into smoothedPrice for calmer visuals
  useEffect(() => {
    setSmoothedPrice((prev) => {
      const next = prev + (currentBalance - prev) * 0.5; // faster easing toward live value
      return Number.isFinite(next) ? next : currentBalance;
    });
  }, [currentBalance]);

  // Draw chart on canvas - redraw whenever filteredChartData changes (live updates)
  useEffect(() => {
    const canvas = canvasRef.current;
    
    // CRITICAL FIX: Don't render if loading or no filtered data
    if (!canvas || isLoading || filteredChartData.length === 0) {
      if (isLoading) {
        frontendLogger.debug('Chart still loading historical data', {
          component: 'InteractiveChart'
        });
      } else if (filteredChartData.length === 0) {
        frontendLogger.debug('No chart data to render for selected time range', {
          component: 'InteractiveChart',
          data: { 
            totalHistoricalPoints: allHistoricalData.length,
            filteredPoints: filteredChartData.length 
          }
        });
      }
      return;
    }
    
    // NOTE: Safety check - need at least 2 points for a line
    if (filteredChartData.length < 2) {
      frontendLogger.debug('Not enough data points to draw chart', {
        component: 'InteractiveChart',
        data: { pointCount: filteredChartData.length }
      });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      frontendLogger.warn('Could not get canvas context', { component: 'InteractiveChart' });
      return;
    }

    // NOTE FIX: Wait for canvas to be properly sized
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      frontendLogger.debug('Canvas not yet sized, skipping render', {
        component: 'InteractiveChart',
        data: { width: rect.width, height: rect.height }
      });
      return;
    }

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas with clean dark background
    ctx.fillStyle = 'rgba(9, 9, 11, 0.95)';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Chart dimensions
    const padding = 60;
    const chartWidth = rect.width - (padding * 2);
    const chartHeight = rect.height - (padding * 2);

    // NOTE: Validate chart dimensions
    if (chartWidth <= 0 || chartHeight <= 0) {
      frontendLogger.warn('Invalid chart dimensions', {
        component: 'InteractiveChart',
        data: { chartWidth, chartHeight }
      });
      return;
    }

    // Find min/max values with safety checks - INCLUDE live price!
    const prices = filteredChartData.map(d => d.price).filter(p => Number.isFinite(p));
    
    // CRITICAL: Include smoothed live endpoint in range calculation
    // Use the live endpoint directly (already eased by animation loop)
    let renderLive: { timestamp: number; price: number } | null = null;
    if (liveLineEnd && liveLineEnd.price !== null && liveLineEnd.price !== undefined && Number.isFinite(liveLineEnd.price)) {
      // Live endpoint is already smoothed by the animation loop, use it directly
      // Allow price to be 0 (some accounts may have 0 balance)
      renderLive = { timestamp: liveLineEnd.timestamp, price: liveLineEnd.price };
      liveRenderRef.current = renderLive;
      prices.push(liveLineEnd.price);
    } else if (smoothedPrice !== null && smoothedPrice !== undefined && Number.isFinite(smoothedPrice)) {
      // Fallback to smoothedPrice if liveLineEnd is not available
      const now = Date.now();
      renderLive = { timestamp: now, price: smoothedPrice };
      liveRenderRef.current = renderLive;
      prices.push(smoothedPrice);
    } else {
      liveRenderRef.current = null;
    }
    
    if (prices.length === 0) {
      frontendLogger.warn('No valid prices to display', {
        component: 'InteractiveChart'
      });
      return;
    }
    
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
    
    // NOTE: Validate price range
    if (!Number.isFinite(displayRange) || displayRange <= 0) {
      frontendLogger.warn('Invalid price range', {
        component: 'InteractiveChart',
        data: { displayMin, displayMax, displayRange }
      });
      return;
    }

    // NOTE: Ultra-minimal grid - barely visible, just guides the eye
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    
    // Horizontal grid lines (only 4 lines for ultra-clean look)
    for (let i = 1; i < 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines - dotted pattern for enterprise feel
    ctx.setLineDash([2, 8]);
    for (let i = 1; i < 6; i++) {
      const x = padding + (chartWidth / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // NOTE: Axis lines (slightly more visible)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();
    
    ctx.shadowBlur = 0;

    // NOTE FIX: Time-based positioning for smooth line movement
    // Calculate time range for proper x-axis scaling
    // CRITICAL FIX: Sort data by timestamp to ensure proper rendering
    let sortedData = [...filteredChartData].sort((a, b) => a.timestamp - b.timestamp);

    // If we have no or a single point, but we do have a live point, synthesize a line segment
    if (sortedData.length < 2 && renderLive && initialBalanceRef.current) {
      const baseTs = renderLive.timestamp - 1000; // 1s earlier for a minimal segment
      const basePrice = initialBalanceRef.current;
      sortedData = [
        { timestamp: baseTs, price: basePrice, change: 0, changePercent: 0 },
        { timestamp: renderLive.timestamp, price: renderLive.price, change: renderLive.price - basePrice, changePercent: basePrice ? ((renderLive.price - basePrice) / basePrice) * 100 : 0 }
      ];
    }
    
    // LIVE LINE: Add the eased live endpoint to extend the line in real-time
    // Always use the latest smoothed live endpoint for tick-by-tick smoothness
    // Allow price to be 0 (some accounts may have 0 balance)
    if (renderLive && renderLive.timestamp > 0 && renderLive.price !== undefined && renderLive.price !== null && Number.isFinite(renderLive.price)) {
      const lastDataPoint = sortedData[sortedData.length - 1];
      // Always include live endpoint if it's newer or if we need it for smooth rendering
      // FIXED: Ensure live endpoint is always added for continuous line rendering
      if (!lastDataPoint || renderLive.timestamp >= lastDataPoint.timestamp - 50) {
        // Remove old live endpoint if exists and add new one
        const withoutOldLive = sortedData.filter((p, idx) => 
          idx < sortedData.length - 1 || p.timestamp < renderLive!.timestamp - 500
        );
        // FIXED: Always add live endpoint to ensure line continues smoothly
        sortedData = [...withoutOldLive, {
          timestamp: renderLive.timestamp,
          price: renderLive.price,
          change: renderLive.price - (initialBalanceRef.current || renderLive.price),
          changePercent: initialBalanceRef.current ? ((renderLive.price - initialBalanceRef.current) / initialBalanceRef.current) * 100 : 0
        }];
        // Re-sort after adding live endpoint to ensure proper line order
        sortedData.sort((a, b) => a.timestamp - b.timestamp);
      }
    }
    
    // NOTE: Validate we have data to render
    if (sortedData.length === 0) {
      frontendLogger.warn('No chart data to render', {
        component: 'InteractiveChart',
        data: { filteredChartDataLength: filteredChartData.length, allHistoricalDataLength: allHistoricalData.length }
      });
      // Don't return - let it render empty state
      return;
    }
    
    const timeMin = sortedData[0].timestamp;
    const timeMax = sortedData[sortedData.length - 1].timestamp;
    const chartTimeRange = Math.max(timeMax - timeMin, 1000); // At least 1 second range for stability
    
    // NOTE: Validate time range
    if (!Number.isFinite(chartTimeRange) || chartTimeRange <= 0) {
      frontendLogger.warn('Invalid chart time range', {
        component: 'InteractiveChart',
        data: { timeMin, timeMax, chartTimeRange }
      });
      return;
    }
    
    // NOTE: Refined gradient with subtle glow effect
    const areaGradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
    areaGradient.addColorStop(0, 'rgba(34, 197, 94, 0.12)'); // green-500
    areaGradient.addColorStop(0.3, 'rgba(34, 197, 94, 0.06)');
    areaGradient.addColorStop(0.7, 'rgba(34, 197, 94, 0.02)');
    areaGradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
    
    ctx.fillStyle = areaGradient;
    ctx.beginPath();
    
    // Calculate all valid points for area fill
    const areaPoints: { x: number; y: number }[] = [];
    sortedData.forEach((point) => {
      if (!Number.isFinite(point.price) || !Number.isFinite(point.timestamp)) return;
      
      const x = padding + ((point.timestamp - timeMin) / chartTimeRange) * chartWidth;
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      if (Number.isFinite(x) && Number.isFinite(y)) {
        areaPoints.push({ x, y });
      }
    });
    
    // CLEAN AREA FILL: Use straight segments matching the line
    if (areaPoints.length >= 2) {
      ctx.moveTo(areaPoints[0].x, padding + chartHeight);
      ctx.lineTo(areaPoints[0].x, areaPoints[0].y);
      for (let i = 1; i < areaPoints.length; i++) {
        ctx.lineTo(areaPoints[i].x, areaPoints[i].y);
      }
      ctx.lineTo(areaPoints[areaPoints.length - 1].x, padding + chartHeight);
      ctx.closePath();
      ctx.fill();
    }

    // NOTE: Clean line with refined glow and gradient stroke
    const lineGradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
    lineGradient.addColorStop(0, 'rgba(34, 197, 94, 0.9)');
    lineGradient.addColorStop(1, 'rgba(34, 197, 94, 0.65)');
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(34, 197, 94, 0.45)';
    ctx.shadowBlur = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    // Calculate all valid points first
    const validPoints: { x: number; y: number }[] = [];
    sortedData.forEach((point) => {
      if (!Number.isFinite(point.price) || !Number.isFinite(point.timestamp)) return;
      
      const x = padding + ((point.timestamp - timeMin) / chartTimeRange) * chartWidth;
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      if (Number.isFinite(x) && Number.isFinite(y)) {
        validPoints.push({ x, y });
      }
    });

    // CLEAN LINE: Use straight segments for consistent, professional look
    // Bezier curves cause "swirling" when points are close together
    if (validPoints.length >= 2) {
      ctx.moveTo(validPoints[0].x, validPoints[0].y);
      
      // Draw clean straight line segments through all points
      for (let i = 1; i < validPoints.length; i++) {
        ctx.lineTo(validPoints[i].x, validPoints[i].y);
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // NOTE: Minimal live indicator at current value (smoothed)
    const livePoint = renderLive || sortedData[sortedData.length - 1];
    if (livePoint) {
      const lastX = padding + ((livePoint.timestamp - timeMin) / chartTimeRange) * chartWidth;
      const lastY = padding + chartHeight - ((livePoint.price - displayMin) / displayRange) * chartHeight;
      
      // Subtle breathing animation (very slow, elegant)
      const breathPhase = (animationTick % 240) / 240; // 0-1 over 8 seconds (slower)
      const breathOpacity = 0.12 + Math.sin(breathPhase * Math.PI * 2) * 0.1; // 0.02-0.22
      
      // Outer glow ring (very subtle)
      ctx.strokeStyle = `rgba(34, 197, 94, ${breathOpacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 10, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Inner solid dot
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = 'rgba(34, 197, 94, 0.55)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // NOTE: Minimal crosshair on hover
    if (hoveredPoint) {
      const x = padding + ((hoveredPoint.timestamp - timeMin) / chartTimeRange) * chartWidth;
      const y = padding + chartHeight - ((hoveredPoint.price - displayMin) / displayRange) * chartHeight;
      
      // Clamp Y to chart bounds
      const clampedY = Math.max(padding, Math.min(padding + chartHeight, y));
      
      // Vertical crosshair line - solid, subtle
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
      
      // Horizontal crosshair line to Y-axis - dashed
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(padding, clampedY);
      ctx.lineTo(x, clampedY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Y-axis price label - minimal pill
      const priceText = `$${hoveredPoint.price.toFixed(2)}`;
      ctx.font = '500 9px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
      const priceWidth = ctx.measureText(priceText).width + 10;
      
      // Background pill
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.roundRect(padding - priceWidth - 6, clampedY - 8, priceWidth, 16, 2);
      ctx.fill();
      
      // Price text
      ctx.fillStyle = '#000';
      ctx.textAlign = 'right';
      ctx.fillText(priceText, padding - 10, clampedY + 3);
      ctx.textAlign = 'left';
      
      // Intersection dot - clean and minimal
      ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x, clampedY, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // White center dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, clampedY, 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // NOTE: Ultra-minimal Y-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowBlur = 0;
    
    // Only 4 price labels for cleaner look (skip first and last)
    for (let i = 1; i < 4; i++) {
      const price = displayMax - (displayRange / 4) * i;
      const y = padding + (chartHeight / 4) * i + 3;
      ctx.fillText(`$${price.toFixed(2)}`, padding - 8, y);
    }

    // NOTE: Minimal X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    
    const labelCount = 5; // Fewer labels for cleaner look
    
    for (let i = 0; i <= labelCount; i++) {
      const timeValue = timeMin + (chartTimeRange * i / labelCount);
      const time = new Date(timeValue);
      const x = padding + ((timeValue - timeMin) / chartTimeRange) * chartWidth;
      
      // Format labels based on selected time range view
      let label = '';
      
      if (timeRange === '24H') {
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        label = `${hours}:${minutes}`;
      } else if (timeRange === '7D') {
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        label = days[time.getDay()];
      } else {
        const month = String(time.getMonth() + 1).padStart(2, '0');
        const day = String(time.getDate()).padStart(2, '0');
        label = `${month}/${day}`;
      }
      
      if (x >= padding && x <= padding + chartWidth) {
        ctx.fillText(label, x, rect.height - 8);
      }
    }

    // NOTE: Current price label (right side of chart)
    if (sortedData.length > 0) {
      const currentPoint = sortedData[sortedData.length - 1];
      const x = padding + ((currentPoint.timestamp - timeMin) / chartTimeRange) * chartWidth;
      const y = padding + chartHeight - ((currentPoint.price - displayMin) / displayRange) * chartHeight;
      
      // Price label on the right edge
      if (x < padding + chartWidth - 50) {
        ctx.fillStyle = '#22c55e';
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`$${currentPoint.price.toFixed(2)}`, x + 10, y + 3);
      }
    }
    
    ctx.shadowBlur = 0;

  }, [filteredChartData, hoveredPoint, isLoading, allHistoricalData.length, animationTick, liveLineEnd]);

  // ACCURATE: Mouse handler with linear interpolation for precise price at cursor position
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || filteredChartData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padding = 60;
    const chartWidth = rect.width - (padding * 2);
    
    // Include live line end point if available
    let allPoints = [...filteredChartData];
    if (liveLineEnd && liveLineEnd.timestamp > 0 && liveLineEnd.price > 0) {
      const lastPoint = allPoints[allPoints.length - 1];
      if (!lastPoint || liveLineEnd.timestamp > lastPoint.timestamp) {
        allPoints.push({
          timestamp: liveLineEnd.timestamp,
          price: liveLineEnd.price,
          change: liveLineEnd.price - (initialBalanceRef.current || liveLineEnd.price),
          changePercent: initialBalanceRef.current ? ((liveLineEnd.price - initialBalanceRef.current) / initialBalanceRef.current) * 100 : 0
        });
      }
    }
    
    // Sort by timestamp
    allPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    // Calculate time range
    const timeMin = allPoints[0].timestamp;
    const timeMax = allPoints[allPoints.length - 1].timestamp;
    const timeRange = timeMax - timeMin || 1;
    
    // Calculate hovered timestamp from mouse position
    const relativeX = mouseX - padding;
    
    // Clamp to chart bounds
    if (relativeX < 0 || relativeX > chartWidth) {
      setHoveredPoint(null);
      return;
    }
    
    const hoveredTimestamp = timeMin + (relativeX / chartWidth) * timeRange;
    
    // Find the two points that bracket the hovered timestamp for interpolation
    let leftPoint = allPoints[0];
    let rightPoint = allPoints[allPoints.length - 1];
    
    for (let i = 0; i < allPoints.length - 1; i++) {
      if (allPoints[i].timestamp <= hoveredTimestamp && allPoints[i + 1].timestamp >= hoveredTimestamp) {
        leftPoint = allPoints[i];
        rightPoint = allPoints[i + 1];
        break;
      }
    }
    
    // Linear interpolation for accurate price at cursor position
    const timeDiff = rightPoint.timestamp - leftPoint.timestamp;
    const t = timeDiff > 0 ? (hoveredTimestamp - leftPoint.timestamp) / timeDiff : 0;
    
    // Interpolate price
    const interpolatedPrice = leftPoint.price + (rightPoint.price - leftPoint.price) * t;
    const startPrice = initialBalanceRef.current || allPoints[0].price;
    const interpolatedChange = interpolatedPrice - startPrice;
    const interpolatedChangePercent = startPrice > 0 ? (interpolatedChange / startPrice) * 100 : 0;
    
    // Create interpolated point
    const interpolatedPoint: ChartDataPoint = {
      timestamp: hoveredTimestamp,
      price: interpolatedPrice,
      change: interpolatedChange,
      changePercent: interpolatedChangePercent
    };
    
    setHoveredPoint(interpolatedPoint);
  }, [filteredChartData, liveLineEnd]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);

  // NOF1.AI STYLE: Calculate metrics from filtered chart start point
  // CRITICAL: Prefer the live balance from the API over any other source
  const actualBalance = currentBalance > 0 ? currentBalance : initialBalance;
  const startBalance = initialBalanceRef.current || (filteredChartData.length > 0 ? filteredChartData[0].price : actualBalance);
  const totalChange = actualBalance - startBalance;
  const totalChangePercent = startBalance > 0 ? (totalChange / startBalance) * 100 : 0;

  const gridStyle = {
    background: `
      linear-gradient(180deg, rgba(255,255,255,0.015) 0%, rgba(0,0,0,0) 100%),
      linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
    `,
    backgroundSize: '100% 100%, 40px 40px, 40px 40px'
  };
  
  // Check if we have any data to display
  const hasData = filteredChartData.length > 0 || (initialBalanceRef.current !== null && currentBalance >= 0);
  
  const validPrices = filteredChartData.map(d => d.price).filter(p => Number.isFinite(p));
  const maxBalance = validPrices.length > 0 ? Math.max(...validPrices) : (currentBalance || initialBalance || 100);
  const minBalance = validPrices.length > 0 ? Math.min(...validPrices) : (currentBalance || initialBalance || 100);

  // NOTE: Loading state - show only briefly while fetching initial data
  // Don't block forever - allow chart to render even with 0 balance
  if (isLoading && isInitialLoadRef.current && !hasData) {
    return (
      <div className={`flex flex-col h-full bg-[#0a0a0a] ${className}`}>
        {/* Skeleton Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
            <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
          </div>
          <div className="flex gap-1">
            {[1,2,3].map(i => (
              <div key={i} className="h-6 w-10 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        </div>
        {/* Skeleton Chart */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-[11px] text-white/30 font-medium tracking-wide">LOADING CHART</span>
          </div>
        </div>
      </div>
    );
  }

  // NOTE: Error state
  if (error) {
    return (
      <div className={`flex flex-col h-full bg-[#0a0a0a] ${className}`} role="alert">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-xs text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-[13px] text-white/70 mb-1">Chart loading failed</p>
              <p className="text-[11px] text-white/30">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-1.5 text-[11px] font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-all"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latestPoint = filteredChartData[filteredChartData.length - 1] || chartData[chartData.length - 1];
  // Allow 0 balance - some accounts may have 0
  const livePrice = liveLineEnd?.price !== undefined && liveLineEnd.price !== null ? liveLineEnd.price : undefined;
  const latestPrice = smoothedPrice !== null && smoothedPrice !== undefined 
    ? smoothedPrice 
    : (livePrice !== undefined 
      ? livePrice 
      : (latestPoint?.price !== undefined 
        ? latestPoint.price 
        : (currentBalance !== null && currentBalance !== undefined ? currentBalance : initialBalance)));
  const basePrice = filteredChartData.length > 0
    ? filteredChartData[0].price
    : (initialBalanceRef.current !== null ? initialBalanceRef.current : (latestPrice || initialBalance));
  const latestPercent = basePrice > 0 ? ((latestPrice - basePrice) / basePrice) * 100 : 0;
  const isStale = Date.now() - lastUpdated > 15000;

  if (compact) {
    return (
      <div className={`flex flex-col h-full bg-[#0a0a0a] ${className}`}>
        <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-white/[0.04] flex-wrap">
          <div className="text-[11px] font-semibold text-white tabular-nums leading-tight">
            {formatCurrency(latestPrice)}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-right">
            <div className={`text-[11px] font-semibold leading-tight ${latestPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercent(latestPercent)}
            </div>
            <div className="text-[10px] text-white/40 leading-tight">
              {isStale ? 'Stale' : 'Live'} · {formatTimeAgoShort(lastUpdated)}
            </div>
          </div>
        </div>
        <div className="relative flex-1 rounded-lg overflow-hidden" style={gridStyle}>
          <div className="absolute inset-0 rounded-lg border border-white/[0.03] pointer-events-none" />
          {filteredChartData.length < 2 && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/40">
              No data yet
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#0a0a0a] ${className}`}>
      {/* NOTE: Minimal Status Bar */}
      <div className="relative flex items-center justify-between px-3 py-2 border-b border-white/[0.03]">
        {/* Left: Connection Status */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center w-4 h-4">
            <div className={`w-1.5 h-1.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-emerald-400' :
              connectionStatus === 'connecting' ? 'bg-amber-400' :
              connectionStatus === 'disconnected' ? 'bg-orange-400' :
              'bg-red-400'
            }`} />
            {connectionStatus === 'connected' && (
              <div className="absolute w-3 h-3 rounded-full bg-emerald-400/30 animate-ping" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold text-white/60 tracking-wider uppercase">
              {connectionStatus === 'connected' ? 'Live' : connectionStatus}
            </span>
            <span className="text-[9px] text-white/20">{getTimeAgo(lastUpdated)}</span>
          </div>
        </div>
        
        {/* Center: Time Range Selector */}
        <div className="flex items-center gap-0.5 p-0.5 bg-white/[0.02] rounded border border-white/[0.04]">
          {(['24H', '7D', '30D'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2.5 py-1 text-[9px] font-bold tracking-wider rounded-sm transition-all duration-150 ${
                timeRange === range
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/25 hover:text-white/40 hover:bg-white/[0.02]'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        
        {/* Right: Performance Metrics + Live/Stale */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/15 font-medium tracking-wider">LAT</span>
            <span className={`text-[9px] font-mono font-semibold tabular-nums ${
              performanceMetrics.avgLatency < 100 ? 'text-emerald-400/70' :
              performanceMetrics.avgLatency < 300 ? 'text-amber-400/70' :
              'text-orange-400/70'
            }`}>
              {performanceMetrics.avgLatency.toFixed(0)}ms
            </span>
          </div>
          <div className="h-2.5 w-px bg-white/[0.06]" />
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/15 font-medium tracking-wider">UP</span>
            <span className={`text-[9px] font-mono font-semibold tabular-nums ${
              performanceMetrics.successRate >= 95 ? 'text-emerald-400/70' :
              performanceMetrics.successRate >= 80 ? 'text-amber-400/70' :
              'text-red-400/70'
            }`}>
              {performanceMetrics.successRate.toFixed(0)}%
            </span>
          </div>
          <div className="h-2.5 w-px bg-white/[0.06]" />
          <LiveStatusBadge compact />
        </div>
      </div>

      {/* NOTE: Chart Canvas Container */}
      <div className="relative flex-1 mx-2 my-1 rounded-lg overflow-hidden" style={gridStyle}>
        {/* Subtle border frame */}
        <div className="absolute inset-0 rounded-lg border border-white/[0.03] pointer-events-none" />
        
        {filteredChartData.length < 2 && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/40 z-10 backdrop-blur-[1px] bg-black/10">
            No data yet
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />
        
        {/* NOTE: Refined Tooltip */}
        <AnimatePresence>
          {hoveredPoint && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="absolute left-1/2 top-4 -translate-x-1/2 z-20 pointer-events-none"
            >
              <div className="bg-[#141414] border border-white/[0.08] rounded-lg px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  {/* Time */}
                  <div className="text-[10px] text-white/30 font-mono tracking-wide">
                    {formatTimestampShort(hoveredPoint.timestamp)}
                  </div>
                  {/* Divider */}
                  <div className="h-3 w-px bg-white/10" />
                  {/* Price */}
                  <div className="text-[13px] text-white font-semibold tabular-nums tracking-tight">
                    {formatCurrency(hoveredPoint.price)}
                  </div>
                  {/* Change */}
                  <div className={`text-[11px] font-medium tabular-nums ${
                    hoveredPoint.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {formatPercent(hoveredPoint.changePercent)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // WORLD-CLASS: Custom comparison - only re-render if balance actually changed
  // Prevents re-renders when parent component updates for other reasons
  return prevProps.initialBalance === nextProps.initialBalance &&
         prevProps.className === nextProps.className;
});

export default InteractiveChart;

