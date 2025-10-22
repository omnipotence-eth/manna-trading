'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '@/store/useStore';

export default function TradingChart() {
  const [data, setData] = useState<Array<{ time: string; value: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const accountValue = useStore((state) => state.accountValue);

  useEffect(() => {
    // Initialize with starting capital
    const initialData = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.now() - (19 - i) * 5000).toLocaleTimeString(),
      value: 100, // Starting with $100
    }));
    setData(initialData);
    
    // Loading timeout
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    // Cleanup timeout
    return () => {
      clearTimeout(loadingTimeout);
    };
  }, []);

  // Update chart when account value changes (real data from Dashboard)
  useEffect(() => {
    if (!isLoading && accountValue > 0) {
      setData(prev => {
        if (prev.length === 0) return prev;
        const newData = [...prev.slice(1), {
          time: new Date().toLocaleTimeString(),
          value: accountValue,
        }];
        return newData;
      });
    }
  }, [accountValue, isLoading]);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-green-500 font-mono cursor-blink">
          Loading Chart Data...
        </div>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00ff4120" />
          <XAxis 
            dataKey="time" 
            stroke="#00ff41"
            tick={{ fill: '#00ff4160', fontSize: 10 }}
          />
          <YAxis 
            stroke="#00ff41"
            tick={{ fill: '#00ff4160', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#000',
              border: '1px solid #00ff41',
              borderRadius: '4px',
            }}
            labelStyle={{ color: '#00ff41' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#00ff41"
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

