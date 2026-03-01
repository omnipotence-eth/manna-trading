/**
 * Custom hook for polling API endpoints
 * Optimized with proper cleanup and error handling
 */

import { useEffect, useRef, useState } from 'react';
import { frontendLogger } from '@/lib/frontendLogger';

interface UseApiPollingOptions {
  url: string;
  interval?: number;
  enabled?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  transform?: (data: any) => any;
}

export function useApiPolling<T = any>(options: UseApiPollingOptions) {
  const {
    url,
    interval = 5000,
    enabled = true,
    onSuccess,
    onError,
    transform,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = async () => {
    if (!enabled) return;

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const jsonData = await response.json();
      const transformedData = transform ? transform(jsonData) : jsonData;

      setData(transformedData);
      setError(null);
      onSuccess?.(transformedData);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }

      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
      
      frontendLogger.error('API polling error', error, {
        component: 'useApiPolling',
        action: 'fetchData',
        data: { url },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchData();

    // Set up polling interval
    intervalRef.current = setInterval(fetchData, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [url, interval, enabled]);

  return { data, loading, error, refetch: fetchData };
}

