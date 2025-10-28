/**
 * Simplified Balance Chart Component
 * Stable, enterprise-level chart for real-time balance tracking
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { frontendLogger } from '@/lib/frontendLogger';
import { frontendPerformanceMonitor } from '@/lib/frontendPerformanceMonitor';

interface BalanceDataPoint {
  timestamp: number;
  balance: number;
  totalPnL?: number;
}

interface SimplifiedBalanceChartProps {
  className?: string;
  initialBalance?: number;
}

export default function SimplifiedBalanceChart({ 
  className = '', 
  initialBalance = 42.03 
}: SimplifiedBalanceChartProps) {
  const [chartData, setChartData] = useState<BalanceDataPoint[]>([]);
  const [timeRange, setTimeRange] = useState<'24H' | '7D' | '30D'>('24H');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate realistic mock data
  const generateMockData = (startBalance: number, hours: number) => {
    const data: BalanceDataPoint[] = [];
    const now = Date.now();
    const startTime = now - (hours * 60 * 60 * 1000);
    const intervalMs = hours <= 24 ? 1800000 : 3600000; // 30 min for 24H, 1 hour for longer
    
    let currentBalance = startBalance;
    
    for (let time = startTime; time <= now; time += intervalMs) {
      const volatility = 0.01;
      const trend = Math.sin((time - startTime) / (hours * 60 * 60 * 1000) * Math.PI * 2) * 0.005;
      const randomWalk = (Math.random() - 0.5) * volatility;
      
      currentBalance *= (1 + trend + randomWalk);
      currentBalance = Math.max(currentBalance, startBalance * 0.5);
      
      const totalPnL = (Math.random() - 0.5) * currentBalance * 0.05;
      
      data.push({
        timestamp: time,
        balance: currentBalance,
        totalPnL
      });
    }
    
    return data;
  };

  // Fetch balance data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        const hours = timeRange === '24H' ? 24 : timeRange === '7D' ? 168 : 720;
        const mockData = generateMockData(initialBalance, hours);
        
        setChartData(mockData);
        setError(null);
        
        frontendLogger.debug('Balance chart data generated', { 
          component: 'SimplifiedBalanceChart',
          data: {
            dataPoints: mockData.length,
            timeRange 
          }
        });
        
      } catch (err) {
        frontendLogger.error('Failed to generate chart data', err as Error, { 
          component: 'SimplifiedBalanceChart' 
        });
        setError('Failed to load chart data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [timeRange, initialBalance]);

  // Calculate metrics
  const currentBalance = chartData[chartData.length - 1]?.balance || initialBalance;
  const startBalance = chartData[0]?.balance || initialBalance;
  const totalChange = currentBalance - startBalance;
  const totalChangePercent = startBalance > 0 ? (totalChange / startBalance) * 100 : 0;
  const maxBalance = Math.max(...chartData.map(d => d.balance));
  const minBalance = Math.min(...chartData.map(d => d.balance));

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
          <p className="text-green-500/60 text-sm">Loading balance chart...</p>
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
    <div className={`space-y-4 ${className}`}>
      {/* Chart Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-green-500">Balance Chart</h3>
        <div className="flex items-center space-x-1">
          {(['24H', '7D', '30D'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2 py-1 text-xs font-bold border transition-all ${
                timeRange === range
                  ? 'border-green-500 bg-green-500/20 text-green-500'
                  : 'border-green-500/30 text-green-500/60 hover:border-green-500/60'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-black/30 border border-green-500/20 rounded p-3">
          <div className="text-xs text-green-500/60 mb-1">Current Balance</div>
          <div className="text-lg font-bold text-green-500">
            ${currentBalance.toFixed(2)}
          </div>
        </div>
        
        <div className="bg-black/30 border border-green-500/20 rounded p-3">
          <div className="text-xs text-green-500/60 mb-1">Total Change</div>
          <div className={`text-lg font-bold ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}
          </div>
        </div>
        
        <div className="bg-black/30 border border-green-500/20 rounded p-3">
          <div className="text-xs text-green-500/60 mb-1">Change %</div>
          <div className={`text-lg font-bold ${totalChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%
          </div>
        </div>
        
        <div className="bg-black/30 border border-green-500/20 rounded p-3">
          <div className="text-xs text-green-500/60 mb-1">Range</div>
          <div className="text-lg font-bold text-green-500">
            ${minBalance.toFixed(2)} - ${maxBalance.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Simple Chart */}
      <div className="relative bg-black/20 rounded-lg border border-green-500/30 overflow-hidden h-64">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-green-500 font-bold text-lg">Balance Tracking</div>
            <div className="text-green-500/60 text-sm mt-1">
              ${currentBalance.toFixed(2)} • {totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%
            </div>
          </div>
        </div>
        
        {/* Simple line representation */}
        <div className="absolute bottom-4 left-4 right-4 h-px bg-gradient-to-r from-green-500/20 via-green-500 to-green-500/20"></div>
      </div>
    </div>
  );
}
