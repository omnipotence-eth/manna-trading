/**
 * Custom hook for localStorage with type safety
 */

import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // localStorage errors are non-critical, only log in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[WARN] [useLocalStorage] Error reading ${key}:`, error);
      }
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      // localStorage errors are non-critical, only log in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[WARN] [useLocalStorage] Error setting ${key}:`, error);
      }
    }
  };

  return [storedValue, setValue] as const;
}

