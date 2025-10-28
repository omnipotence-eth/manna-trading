// Frontend performance monitoring and optimization utilities
import { frontendLogger } from './frontendLogger';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  type: 'timing' | 'counter' | 'gauge';
  tags?: Record<string, string>;
}

interface ComponentPerformanceData {
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  mountTime: number;
  unmountTime?: number;
}

class FrontendPerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private componentData = new Map<string, ComponentPerformanceData>();
  private timers = new Map<string, number>();
  private observers: PerformanceObserver[] = [];

  constructor() {
    this.initializePerformanceObservers();
  }

  private initializePerformanceObservers(): void {
    // Only initialize on client side
    if (typeof window === 'undefined') return;
    
    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric('long_task', entry.duration, 'timing', {
              taskType: 'long_task',
              startTime: entry.startTime.toString(),
            });
            
            frontendLogger.warn(`Long task detected: ${entry.duration}ms`, {
              component: 'PerformanceMonitor',
              data: { duration: entry.duration, startTime: entry.startTime }
            });
          }
        });
        
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (error) {
        frontendLogger.warn('Long task observer not supported', { component: 'PerformanceMonitor' });
      }

      // Monitor layout shifts
      try {
        const layoutShiftObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              this.recordMetric('layout_shift', (entry as any).value, 'timing', {
                taskType: 'layout_shift',
              });
            }
          }
        });
        
        layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(layoutShiftObserver);
      } catch (error) {
        frontendLogger.warn('Layout shift observer not supported', { component: 'PerformanceMonitor' });
      }
    }
  }

  // Component performance tracking
  startComponentTimer(componentName: string): () => void {
    const startTime = performance.now();
    const timerKey = `component:${componentName}`;
    this.timers.set(timerKey, startTime);

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.recordMetric(`component_render:${componentName}`, duration, 'timing', {
        component: componentName,
      });

      // Update component data
      const existingData = this.componentData.get(componentName) || {
        renderCount: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        mountTime: startTime,
      };

      const newRenderCount = existingData.renderCount + 1;
      const newAverageRenderTime = 
        (existingData.averageRenderTime * existingData.renderCount + duration) / newRenderCount;

      this.componentData.set(componentName, {
        ...existingData,
        renderCount: newRenderCount,
        averageRenderTime: newAverageRenderTime,
        lastRenderTime: duration,
      });

      frontendLogger.debug(`Component ${componentName} rendered`, {
        component: 'PerformanceMonitor',
        data: { duration, renderCount: newRenderCount, averageRenderTime: newAverageRenderTime }
      });
    };
  }

  // API call performance tracking
  async measureApiCall<T>(
    apiName: string,
    apiCall: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await apiCall();
      const duration = performance.now() - startTime;
      
      this.recordMetric(`api_call:${apiName}`, duration, 'timing', {
        api: apiName,
        status: 'success',
        ...tags,
      });

      frontendLogger.debug(`API call ${apiName} completed`, {
        component: 'PerformanceMonitor',
        data: { duration, status: 'success' }
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric(`api_call:${apiName}`, duration, 'timing', {
        api: apiName,
        status: 'error',
        ...tags,
      });

      frontendLogger.error(`API call ${apiName} failed`, error as Error, {
        component: 'PerformanceMonitor',
        data: { duration, status: 'error' }
      });

      throw error;
    }
  }

  // Memory usage monitoring
  measureMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      
      this.recordMetric('memory_used', memory.usedJSHeapSize, 'gauge', {
        memoryType: 'used',
      });
      
      this.recordMetric('memory_total', memory.totalJSHeapSize, 'gauge', {
        memoryType: 'total',
      });
      
      this.recordMetric('memory_limit', memory.jsHeapSizeLimit, 'gauge', {
        memoryType: 'limit',
      });
    }
  }

  // Network performance monitoring
  measureNetworkRequest(url: string, method: string = 'GET'): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      
      this.recordMetric('network_request', duration, 'timing', {
        url: url.substring(0, 50), // Truncate long URLs
        method,
      });
    };
  }

  // Record custom metrics
  recordMetric(
    name: string,
    value: number,
    type: 'timing' | 'counter' | 'gauge',
    tags?: Record<string, string>
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      type,
      tags,
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  // Get performance data
  getMetrics(filter?: { name?: string; type?: string; since?: number }): PerformanceMetric[] {
    let filtered = this.metrics;

    if (filter) {
      if (filter.name) {
        filtered = filtered.filter(m => m.name.includes(filter.name!));
      }
      if (filter.type) {
        filtered = filtered.filter(m => m.type === filter.type);
      }
      if (filter.since) {
        filtered = filtered.filter(m => m.timestamp >= filter.since!);
      }
    }

    return filtered;
  }

  getComponentData(componentName?: string): ComponentPerformanceData | Map<string, ComponentPerformanceData> {
    if (componentName) {
      return this.componentData.get(componentName) || {
        renderCount: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        mountTime: 0,
      };
    }
    return new Map(this.componentData);
  }

  // Performance optimization suggestions
  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const componentData = this.getComponentData() as Map<string, ComponentPerformanceData>;

    // Check for components with high render times
    for (const [componentName, data] of componentData) {
      if (data.averageRenderTime > 16) { // More than one frame at 60fps
        suggestions.push(
          `Component "${componentName}" has high render time (${data.averageRenderTime.toFixed(2)}ms). Consider optimizing.`
        );
      }

      if (data.renderCount > 100) {
        suggestions.push(
          `Component "${componentName}" renders frequently (${data.renderCount} times). Consider memoization.`
        );
      }
    }

    // Check for long API calls
    const apiMetrics = this.getMetrics({ name: 'api_call', type: 'timing' });
    const slowApiCalls = apiMetrics.filter(m => m.value > 2000); // More than 2 seconds
    
    if (slowApiCalls.length > 0) {
      suggestions.push(
        `${slowApiCalls.length} API calls are taking longer than 2 seconds. Consider implementing caching or optimization.`
      );
    }

    // Check for long tasks
    const longTasks = this.getMetrics({ name: 'long_task', type: 'timing' });
    if (longTasks.length > 0) {
      suggestions.push(
        `${longTasks.length} long tasks detected. Consider breaking up heavy computations.`
      );
    }

    return suggestions;
  }

  // Cleanup
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics = [];
    this.componentData.clear();
    this.timers.clear();
  }
}

export const frontendPerformanceMonitor = new FrontendPerformanceMonitor();
export default frontendPerformanceMonitor;
