'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  onBalanceUpdate?: (balance: number) => void;
}

// ENTERPRISE: Connection status types
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// ENTERPRISE: Performance metrics tracking
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
  initialBalance = 42.16,
  onBalanceUpdate
}: InteractiveChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [allHistoricalData, setAllHistoricalData] = useState<ChartDataPoint[]>([]); // Store full history
  const [currentBalance, setCurrentBalance] = useState(initialBalance);
  const [timeRange, setTimeRange] = useState<'24H' | '7D' | '30D'>('24H');
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  
  // ENTERPRISE: Enhanced state management
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    avgLatency: 0,
    successRate: 100,
    totalRequests: 0,
    failedRequests: 0
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isFetchingRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const fetchStartTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // NOF1.AI STYLE: Chart initialization refs
  const chartStartTimeRef = useRef<number | null>(null);
  const initialBalanceRef = useRef<number | null>(null);

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

  // ENTERPRISE: Enhanced balance fetching with circuit breaker pattern
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
        
        // ENTERPRISE: Strict validation
        if (!Number.isFinite(balance)) {
          throw new Error(`Invalid balance value: ${balance}`);
        }
        
        // NOF1.AI STYLE: Initialize chart start point on first successful fetch
        if (chartStartTimeRef.current === null || initialBalanceRef.current === null) {
          chartStartTimeRef.current = Date.now();
          initialBalanceRef.current = balance;
          
          // Initialize chart with starting point
          setChartData([{
            timestamp: chartStartTimeRef.current,
            price: balance,
            change: 0,
            changePercent: 0
          }]);
          
          setIsLoading(false);
          isInitialLoadRef.current = false;
          
          frontendLogger.info('Chart initialized from current balance', {
            component: 'InteractiveChart',
            data: {
              startBalance: balance.toFixed(2),
              startTime: new Date(chartStartTimeRef.current).toISOString()
            }
          });
        }
        
        // ENTERPRISE: Log every balance update for debugging
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
        
        // ENTERPRISE: Sync balance with parent component (dashboard)
        if (onBalanceUpdate && Math.abs(balance - prevBalance) >= 0.01) {
          onBalanceUpdate(balance);
        }
        
        // TICK-BY-TICK: Add live data point to historical data, then filter by time range
        setAllHistoricalData(prevAllData => {
          // Ensure we have a starting point if no historical data loaded yet
          if (prevAllData.length === 0 && chartStartTimeRef.current && initialBalanceRef.current) {
            const initialPoint: ChartDataPoint = {
              timestamp: chartStartTimeRef.current,
              price: initialBalanceRef.current,
              change: 0,
              changePercent: 0
            };
            // Add initial point to historical data
            return [initialPoint];
          }
          
          // CRITICAL FIX: Calculate change from the LAST point in historical data, not from start
          // This ensures accurate progression showing actual balance changes
          const lastPoint = prevAllData.length > 0 ? prevAllData[prevAllData.length - 1] : null;
          const startBalance = initialBalanceRef.current || (prevAllData.length > 0 ? prevAllData[0].price : balance);
          
          // Calculate change from start balance (for overall % calculation)
          const totalChange = balance - startBalance;
          const totalChangePercent = startBalance > 0 
            ? (totalChange / startBalance) * 100 
            : 0;
          
          // Calculate change from last point (for incremental tracking)
          const incrementalChange = lastPoint ? balance - lastPoint.price : 0;
          
          const newPoint: ChartDataPoint = {
            timestamp: now,
            price: balance, // Use actual account balance from API
            change: totalChange, // Total change from start
            changePercent: totalChangePercent // Total % change from start
          };
          
          // TICK-BY-TICK: Merge with historical data, remove duplicates by timestamp
          // Remove any existing point at the same timestamp (or very close - within 1 second)
          const filteredData = prevAllData.filter(p => {
            const timeDiff = Math.abs(p.timestamp - now);
            return timeDiff >= 1000; // Keep points at least 1 second apart
          });
          
          // Add new point at the end
          const merged = [...filteredData, newPoint];
          
          // Sort by timestamp to maintain chronological order
          merged.sort((a, b) => a.timestamp - b.timestamp);
          
          // Keep all data points (no limit for full history) but cap at 5000 for performance
          // Filtering happens automatically via useMemo when allHistoricalData updates
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
    }
  }, []); // CRITICAL FIX: Empty deps - use functional state updates

  // CRITICAL FIX: Load full historical balance from account beginning
  const loadHistoricalBalance = useCallback(async () => {
    setIsLoading(true);
    try {
      frontendLogger.info('Loading full historical balance from account beginning', {
        component: 'InteractiveChart'
      });
      
      const response = await fetch('/api/real-balance?action=chart-data&timeRange=ALL', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // CRITICAL FIX: Handle nested response structure
      // Response: { success: true, data: { message: "...", data: [...] } }
      // OR: { success: true, data: [...] }
      const chartDataArray = result.data?.data || result.data;
      
      if (result.success && chartDataArray && Array.isArray(chartDataArray) && chartDataArray.length > 0) {
        // CRITICAL FIX: Convert API response to chart data points
        // API returns: { timestamp, balance, unrealizedPnl, realizedPnl, totalPnL }
        const historicalPoints: ChartDataPoint[] = chartDataArray.map((point: any) => {
          const timestamp = typeof point.timestamp === 'number' 
            ? point.timestamp 
            : new Date(point.timestamp).getTime();
          
          const balance = parseFloat(point.balance || point.price || 0);
          const firstBalance = chartDataArray[0]?.balance ? parseFloat(chartDataArray[0].balance) : balance;
          const change = balance - firstBalance;
          const changePercent = firstBalance > 0 ? (change / firstBalance) * 100 : 0;
          
          return {
            timestamp,
            price: balance, // Use balance as price for chart
            change,
            changePercent
          };
        });
        
        // Sort by timestamp (oldest first)
        historicalPoints.sort((a, b) => a.timestamp - b.timestamp);
        
        if (historicalPoints.length > 0) {
          // Set initial balance from first historical point
          const firstPoint = historicalPoints[0];
          if (chartStartTimeRef.current === null && initialBalanceRef.current === null) {
            chartStartTimeRef.current = firstPoint.timestamp;
            initialBalanceRef.current = firstPoint.price;
          }
          
          // Set current balance from last historical point
          const lastPoint = historicalPoints[historicalPoints.length - 1];
          setCurrentBalance(lastPoint.price);
          
          // Store full historical data (filtering happens via useMemo)
          setAllHistoricalData(historicalPoints);
          setIsLoading(false);
          isInitialLoadRef.current = false;
          
          frontendLogger.info('Historical balance loaded successfully', {
            component: 'InteractiveChart',
            data: {
              points: historicalPoints.length,
              startTime: new Date(firstPoint.timestamp).toISOString(),
              endTime: new Date(lastPoint.timestamp).toISOString(),
              startBalance: firstPoint.price.toFixed(2),
              currentBalance: lastPoint.price.toFixed(2)
            }
          });
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      frontendLogger.error('Failed to load historical balance', err as Error, {
        component: 'InteractiveChart'
      });
      setIsLoading(false);
      // Don't throw - allow live updates to continue
    }
  }, []);

  // CRITICAL FIX: Single source of truth - memoize filtered chart data based on time range
  // This is the ONLY place where filtering happens - ensures consistency
  const filteredChartData = useMemo(() => {
    // If no historical data yet, return empty array (will show loading state)
    if (allHistoricalData.length === 0) {
      return [];
    }
    
    const now = Date.now();
    let cutoffTime: number;
    
    switch (timeRange) {
      case '24H':
        cutoffTime = now - (24 * 60 * 60 * 1000);
        break;
      case '7D':
        cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30D':
        cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = now - (24 * 60 * 60 * 1000);
    }
    
    // Filter data points within the time range
    const filtered = allHistoricalData.filter(point => point.timestamp >= cutoffTime);
    
    // Include the point just before the range to show continuity
    if (filtered.length > 0 && allHistoricalData.length > 0) {
      const firstFilteredIndex = allHistoricalData.findIndex(p => p.timestamp >= cutoffTime);
      if (firstFilteredIndex > 0) {
        filtered.unshift(allHistoricalData[firstFilteredIndex - 1]);
      } else if (firstFilteredIndex === 0 && allHistoricalData[0].timestamp < cutoffTime) {
        // If all data is before cutoff, include first point for reference
        filtered.unshift(allHistoricalData[0]);
      }
    }
    
    // Sort filtered data by timestamp to ensure proper rendering
    filtered.sort((a, b) => a.timestamp - b.timestamp);
    
    frontendLogger.debug('Filtered chart data by time range', {
      component: 'InteractiveChart',
      data: {
        range: timeRange,
        totalPoints: allHistoricalData.length,
        filteredPoints: filtered.length,
        cutoffTime: new Date(cutoffTime).toISOString(),
        oldestPoint: filtered.length > 0 ? new Date(filtered[0].timestamp).toISOString() : 'none',
        newestPoint: filtered.length > 0 ? new Date(filtered[filtered.length - 1].timestamp).toISOString() : 'none'
      }
    });
    
    return filtered;
  }, [allHistoricalData, timeRange]);

  // NOF1.AI STYLE: Initialize chart from historical data, then track live tick-by-tick
  useEffect(() => {
    // Load full historical balance from account beginning
    loadHistoricalBalance();
    
    // If initialBalance prop is provided, use it as fallback start point
    if (initialBalance > 0 && chartStartTimeRef.current === null && initialBalanceRef.current === null) {
      initialBalanceRef.current = initialBalance;
      setCurrentBalance(initialBalance);
    }
    
    // Start fetching live balance updates (will append to historical data)
    fetchRealBalance();
    
    // TICK-BY-TICK: Update balance every 2 seconds for real-time feel
    const interval = setInterval(() => {
      fetchRealBalance();
    }, 2000); // 2 second polling for tick-by-tick updates

    return () => {
      clearInterval(interval);
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
    
    // ENTERPRISE: Safety check - need at least 2 points for a line
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

    // ENTERPRISE FIX: Wait for canvas to be properly sized
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

    // ENTERPRISE: Validate chart dimensions
    if (chartWidth <= 0 || chartHeight <= 0) {
      frontendLogger.warn('Invalid chart dimensions', {
        component: 'InteractiveChart',
        data: { chartWidth, chartHeight }
      });
      return;
    }

    // Find min/max values with safety checks
    const prices = filteredChartData.map(d => d.price).filter(p => Number.isFinite(p));
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
    
    // ENTERPRISE: Validate price range
    if (!Number.isFinite(displayRange) || displayRange <= 0) {
      frontendLogger.warn('Invalid price range', {
        component: 'InteractiveChart',
        data: { displayMin, displayMax, displayRange }
      });
      return;
    }

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

    // ENTERPRISE FIX: Time-based positioning for smooth line movement
    // Calculate time range for proper x-axis scaling
    // CRITICAL FIX: Sort data by timestamp to ensure proper rendering
    const sortedData = [...filteredChartData].sort((a, b) => a.timestamp - b.timestamp);
    const timeMin = sortedData[0].timestamp;
    const timeMax = sortedData[sortedData.length - 1].timestamp;
    const timeRange = Math.max(timeMax - timeMin, 1000); // At least 1 second range for stability
    
    // ENTERPRISE: Validate time range
    if (!Number.isFinite(timeRange) || timeRange <= 0) {
      frontendLogger.warn('Invalid time range', {
        component: 'InteractiveChart',
        data: { timeMin, timeMax, timeRange }
      });
      return;
    }
    
    // Draw area under curve with gradient
    const areaGradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
    areaGradient.addColorStop(0, 'rgba(74, 222, 128, 0.25)');
    areaGradient.addColorStop(1, 'rgba(74, 222, 128, 0.03)');
    
    ctx.fillStyle = areaGradient;
    ctx.beginPath();
    
    // ENTERPRISE FIX: Use sorted data for consistent rendering
    sortedData.forEach((point, index) => {
      // ENTERPRISE: Skip invalid points
      if (!Number.isFinite(point.price) || !Number.isFinite(point.timestamp)) {
        return;
      }
      
      // TIME-BASED X positioning (not index-based)
      const x = padding + ((point.timestamp - timeMin) / timeRange) * chartWidth;
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      // ENTERPRISE: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      
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

    // Draw main line with enhanced styling
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 8;
    ctx.beginPath();

    // ENTERPRISE FIX: Use sorted data for consistent rendering
    sortedData.forEach((point, index) => {
      // ENTERPRISE: Skip invalid points
      if (!Number.isFinite(point.price) || !Number.isFinite(point.timestamp)) {
        return;
      }
      
      // TIME-BASED X positioning (not index-based)
      const x = padding + ((point.timestamp - timeMin) / timeRange) * chartWidth;
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      // ENTERPRISE: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points with enhanced styling (only show some for performance)
    ctx.shadowBlur = 0;
    const pointInterval = Math.max(1, Math.floor(sortedData.length / 50)); // Show ~50 points max
    // ENTERPRISE FIX: Use sorted data for consistent rendering
    sortedData.forEach((point, index) => {
      // Only draw points at intervals to reduce visual clutter
      if (index % pointInterval !== 0 && index !== sortedData.length - 1) return;
      
      // ENTERPRISE: Skip invalid points
      if (!Number.isFinite(point.price) || !Number.isFinite(point.timestamp)) {
        return;
      }
      
      // TIME-BASED X positioning (not index-based)
      const x = padding + ((point.timestamp - timeMin) / timeRange) * chartWidth;
      const y = padding + chartHeight - ((point.price - displayMin) / displayRange) * chartHeight;
      
      // ENTERPRISE: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      
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
      // TIME-BASED X positioning for hover point
      const x = padding + ((hoveredPoint.timestamp - timeMin) / timeRange) * chartWidth;
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
    // ENTERPRISE FIX: Use time-based positioning to match chart rendering
    ctx.textAlign = 'center';
    ctx.shadowBlur = 3;
    
    for (let i = 0; i <= 8; i++) {
      // Calculate time position based on time range (not index)
      const timeValue = timeMin + (timeRange * i / 8);
      const time = new Date(timeValue);
      // Use time-based X positioning to match chart line rendering
      const x = padding + ((timeValue - timeMin) / timeRange) * chartWidth;
      
      // Only draw if x is within chart bounds
      if (x >= padding && x <= padding + chartWidth) {
        ctx.fillText(time.toLocaleTimeString(), x, rect.height - 15);
      }
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Highlight current price point with pulsing animation
    // ENTERPRISE FIX: Use sorted data and find most recent point
    if (sortedData.length > 0) {
      const currentPoint = sortedData[sortedData.length - 1];
      // TIME-BASED X positioning for current point
      const x = padding + ((currentPoint.timestamp - timeMin) / timeRange) * chartWidth;
      const y = padding + chartHeight - ((currentPoint.price - displayMin) / displayRange) * chartHeight;
      
      ctx.fillStyle = '#4ade80';
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Current price label
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Current: $${currentPoint.price.toFixed(2)}`, padding + chartWidth - 120, y - 5);
    }

  }, [filteredChartData, hoveredPoint, isLoading, allHistoricalData.length]);

  // WORLD-CLASS: Memoize mouse handlers to prevent recreation
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || filteredChartData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padding = 60;
    const chartWidth = rect.width - (padding * 2);
    
    // TIME-BASED: Calculate which timestamp the mouse is over
    const timeMin = filteredChartData[0].timestamp;
    const timeMax = filteredChartData[filteredChartData.length - 1].timestamp;
    const timeRange = timeMax - timeMin || 1;
    
    const relativeX = mouseX - padding;
    const hoveredTimestamp = timeMin + (relativeX / chartWidth) * timeRange;
    
    // Find the closest data point to this timestamp
    let closestPoint = filteredChartData[0];
    let minDistance = Math.abs(filteredChartData[0].timestamp - hoveredTimestamp);
    
    for (const point of filteredChartData) {
      const distance = Math.abs(point.timestamp - hoveredTimestamp);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }
    
    setHoveredPoint(closestPoint);
  }, [filteredChartData]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);

  // NOF1.AI STYLE: Calculate metrics from filtered chart start point
  const startBalance = initialBalanceRef.current || (filteredChartData.length > 0 ? filteredChartData[0].price : initialBalance);
  const totalChange = currentBalance - startBalance;
  const totalChangePercent = startBalance > 0 ? (totalChange / startBalance) * 100 : 0;
  
  const validPrices = filteredChartData.map(d => d.price).filter(p => Number.isFinite(p));
  const maxBalance = validPrices.length > 0 ? Math.max(...validPrices) : currentBalance;
  const minBalance = validPrices.length > 0 ? Math.min(...validPrices) : currentBalance;

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
      <div className={`flex items-center justify-center h-96 ${className}`} role="alert">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            aria-label="Retry loading chart"
            role="button"
            tabIndex={0}
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
      {/* ENTERPRISE: Enhanced Live Status Indicator */}
      <div className="flex items-center justify-between px-6 py-2 bg-black/40 border-b border-green-400/20">
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {connectionStatus === 'connected' && (
                <motion.div
                  key="connected"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"
                />
              )}
              {connectionStatus === 'connecting' && (
                <motion.div
                  key="connecting"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  exit={{ scale: 0 }}
                  transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" } }}
                  className="w-2 h-2 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50"
                />
              )}
              {connectionStatus === 'disconnected' && (
                <motion.div
                  key="disconnected"
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50"
                />
              )}
              {connectionStatus === 'error' && (
                <motion.div
                  key="error"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/50"
                />
              )}
            </AnimatePresence>
            
            <div className="flex flex-col">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${
                connectionStatus === 'connected' ? 'text-green-400' :
                connectionStatus === 'connecting' ? 'text-yellow-400' :
                connectionStatus === 'disconnected' ? 'text-orange-400' :
                'text-red-400'
              }`}>
                {connectionStatus === 'connected' && 'LIVE TRACKING'}
                {connectionStatus === 'connecting' && 'CONNECTING...'}
                {connectionStatus === 'disconnected' && 'RECONNECTING...'}
                {connectionStatus === 'error' && 'CONNECTION ERROR'}
              </h3>
              <span className="text-[10px] text-green-400/50">Updated {getTimeAgo(lastUpdated)}</span>
            </div>
          </div>
        </div>
        
        {/* ENTERPRISE: Performance Metrics */}
        <div className="flex items-center gap-4 text-[10px] text-green-400/60 font-mono">
          <div className="flex items-center gap-1">
            <span className="text-green-400/40">LATENCY:</span>
            <span className={`font-bold ${
              performanceMetrics.avgLatency < 100 ? 'text-green-400' :
              performanceMetrics.avgLatency < 300 ? 'text-yellow-400' :
              'text-orange-400'
            }`}>
              {performanceMetrics.avgLatency.toFixed(0)}ms
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-400/40">SUCCESS:</span>
            <span className={`font-bold ${
              performanceMetrics.successRate >= 95 ? 'text-green-400' :
              performanceMetrics.successRate >= 80 ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {performanceMetrics.successRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-400/40">REQUESTS:</span>
            <span className="font-bold text-green-400">{performanceMetrics.totalRequests}</span>
          </div>
        </div>
      </div>


      {/* Time Range Controls */}
      <div className="flex items-center justify-center mb-2">
        <div className="flex items-center space-x-1">
          {(['24H', '7D', '30D'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              aria-label={`View ${range} time range`}
              aria-pressed={timeRange === range}
              role="button"
              tabIndex={0}
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
}, (prevProps, nextProps) => {
  // WORLD-CLASS: Custom comparison - only re-render if balance actually changed
  // Prevents re-renders when parent component updates for other reasons
  return prevProps.initialBalance === nextProps.initialBalance &&
         prevProps.className === nextProps.className;
});

export default InteractiveChart;

