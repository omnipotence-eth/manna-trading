/**
 * Singleton Utility - Standardized pattern for Next.js services
 * 
 * WHY THIS EXISTS:
 * Next.js hot-reloads modules in development, which can create multiple
 * instances of services. This utility ensures only ONE instance exists
 * globally, even across hot reloads.
 * 
 * USAGE:
 * ```typescript
 * import { createSingleton } from '@/lib/singleton';
 * 
 * class MyService {
 *   // ... implementation
 * }
 * 
 * export const myService = createSingleton('myService', () => new MyService());
 * ```
 */

/**
 * Create a singleton instance that survives hot reloads
 * 
 * @param key - Unique key for this singleton (use service name)
 * @param factory - Function that creates the instance
 * @returns The singleton instance
 */
export function createSingleton<T>(key: string, factory: () => T): T {
  const globalKey = `__singleton_${key}__`;
  
  const globalWithSingletons = globalThis as typeof globalThis & {
    [K: string]: T | undefined;
  };
  
  if (!globalWithSingletons[globalKey]) {
    globalWithSingletons[globalKey] = factory();
  }
  
  return globalWithSingletons[globalKey] as T;
}

/**
 * Create a lazy singleton (only created when first accessed)
 * 
 * @param key - Unique key for this singleton
 * @param factory - Function that creates the instance
 * @returns A getter that returns the singleton instance
 */
export function createLazySingleton<T>(key: string, factory: () => T): () => T {
  const globalKey = `__lazy_singleton_${key}__`;
  
  return () => {
    const globalWithSingletons = globalThis as typeof globalThis & {
      [K: string]: T | undefined;
    };
    
    if (!globalWithSingletons[globalKey]) {
      globalWithSingletons[globalKey] = factory();
    }
    
    return globalWithSingletons[globalKey] as T;
  };
}

/**
 * Check if a singleton exists
 */
export function hasSingleton(key: string): boolean {
  const globalKey = `__singleton_${key}__`;
  return (globalThis as Record<string, unknown>)[globalKey] !== undefined;
}

/**
 * Clear a singleton (useful for testing)
 */
export function clearSingleton(key: string): void {
  const globalKey = `__singleton_${key}__`;
  delete (globalThis as Record<string, unknown>)[globalKey];
}

/**
 * Clear all singletons (useful for testing)
 */
export function clearAllSingletons(): void {
  const global = globalThis as Record<string, unknown>;
  for (const key of Object.keys(global)) {
    if (key.startsWith('__singleton_') || key.startsWith('__lazy_singleton_')) {
      delete global[key];
    }
  }
}

