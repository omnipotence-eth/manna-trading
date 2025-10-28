/**
 * Performance Monitoring System
 * Tracks and reports system performance metrics
 */

import { logger } from './logger';

/**
 * Performance metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer'
}

/**
 * Performance metric interface
 */
interface PerformanceMetric {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Timer for measuring execution time
 */
export class PerformanceTimer {
  private startTime: number;
  private name: string;
  private labels?: Record<string, string>;

  constructor(name: string, labels?: Record<string, string>) {
    this.name = name;
    this.labels = labels;
    this.startTime = Date.now();
  }

  /**
   * End the timer and record the metric
   */
  end(): number {
    const duration = Date.now() - this.startTime;
    PerformanceMonitor.recordTimer(this.name, duration, this.labels);
    return duration;
  }

  /**
   * End the timer and log the result
   */
  endAndLog(threshold?: number): number {
    const duration = this.end();
    
    if (threshold && duration > threshold) {
      logger.warn(`Performance threshold exceeded`, undefined, {
        context: 'PerformanceMonitor',
        data: {
          metric: this.name,
          duration,
          threshold,
          labels: this.labels
        }
      });
    } else {
      logger.debug(`Performance metric recorded`, {
        context: 'PerformanceMonitor',
        data: {
          metric: this.name,
          duration,
          labels: this.labels
        }
      });
    }
    
    return duration;
  }
}

/**
 * Performance Monitor Class
 */
export class PerformanceMonitor {
  private static metrics: Map<string, PerformanceMetric[]> = new Map();
  private static thresholds: Map<string, number> = new Map();
  private static enabled: boolean = true;

  /**
   * Record a counter metric
   */
  static recordCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    
    this.addMetric({
      name,
      type: MetricType.COUNTER,
      value,
      timestamp: Date.now(),
      labels
    });
  }

  /**
   * Record a gauge metric
   */
  static recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    
    this.addMetric({
      name,
      type: MetricType.GAUGE,
      value,
      timestamp: Date.now(),
      labels
    });
  }

  /**
   * Record a histogram metric
   */
  static recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    
    this.addMetric({
      name,
      type: MetricType.HISTOGRAM,
      value,
      timestamp: Date.now(),
      labels
    });
  }

  /**
   * Record a timer metric
   */
  static recordTimer(name: string, duration: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;
    
    this.addMetric({
      name,
      type: MetricType.TIMER,
      value: duration,
      timestamp: Date.now(),
      labels
    });
  }

  /**
   * Create a timer instance
   */
  static startTimer(name: string, labels?: Record<string, string>): PerformanceTimer {
    return new PerformanceTimer(name, labels);
  }

  /**
   * Set threshold for a metric
   */
  static setThreshold(name: string, threshold: number): void {
    this.thresholds.set(name, threshold);
  }

  /**
   * Enable or disable monitoring
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Performance monitoring ${enabled ? 'enabled' : 'disabled'}`, {
      context: 'PerformanceMonitor'
    });
  }

  /**
   * Get metrics for a specific name
   */
  static getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get all metrics
   */
  static getAllMetrics(): Map<string, PerformanceMetric[]> {
    return new Map(this.metrics);
  }

  /**
   * Get aggregated statistics for a metric
   */
  static getStats(name: string): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    latest: number;
  } | null {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = values[values.length - 1];

    return {
      count: metrics.length,
      sum,
      avg,
      min,
      max,
      latest
    };
  }

  /**
   * Get system-wide performance summary
   */
  static getSummary(): {
    totalMetrics: number;
    metricNames: string[];
    systemHealth: 'healthy' | 'warning' | 'critical';
    topSlowOperations: Array<{ name: string; avgDuration: number }>;
    errorRate: number;
  } {
    const allMetrics = this.getAllMetrics();
    const metricNames = Array.from(allMetrics.keys());
    const totalMetrics = Array.from(allMetrics.values()).reduce((sum, metrics) => sum + metrics.length, 0);

    // Calculate system health based on thresholds
    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    const topSlowOperations: Array<{ name: string; avgDuration: number }> = [];

    for (const [name, metrics] of allMetrics) {
      const threshold = this.thresholds.get(name);
      if (threshold) {
        const stats = this.getStats(name);
        if (stats && stats.avg > threshold) {
          if (stats.avg > threshold * 2) {
            systemHealth = 'critical';
          } else if (systemHealth === 'healthy') {
            systemHealth = 'warning';
          }
        }
      }

      // Collect timer metrics for slow operations
      if (name.includes('timer') || name.includes('duration')) {
        const stats = this.getStats(name);
        if (stats && stats.avg > 1000) { // Slower than 1 second
          topSlowOperations.push({
            name,
            avgDuration: stats.avg
          });
        }
      }
    }

    // Sort by average duration
    topSlowOperations.sort((a, b) => b.avgDuration - a.avgDuration);

    // Calculate error rate (simplified)
    const errorMetrics = this.getMetrics('errors');
    const totalRequests = this.getMetrics('requests');
    const errorRate = totalRequests.length > 0 ? errorMetrics.length / totalRequests.length : 0;

    return {
      totalMetrics,
      metricNames,
      systemHealth,
      topSlowOperations: topSlowOperations.slice(0, 5),
      errorRate
    };
  }

  /**
   * Clear metrics for a specific name
   */
  static clearMetrics(name: string): void {
    this.metrics.delete(name);
    logger.debug(`Cleared metrics for ${name}`, {
      context: 'PerformanceMonitor'
    });
  }

  /**
   * Clear all metrics
   */
  static clearAllMetrics(): void {
    this.metrics.clear();
    logger.info('All performance metrics cleared', {
      context: 'PerformanceMonitor'
    });
  }

  /**
   * Add a metric to the collection
   */
  private static addMetric(metric: PerformanceMetric): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metrics = this.metrics.get(metric.name)!;
    metrics.push(metric);

    // Keep only the last 1000 metrics per name to prevent memory leaks
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }

    // Check threshold
    const threshold = this.thresholds.get(metric.name);
    if (threshold && metric.value > threshold) {
      logger.warn(`Performance threshold exceeded`, undefined, {
        context: 'PerformanceMonitor',
        data: {
          metric: metric.name,
          value: metric.value,
          threshold,
          labels: metric.labels
        }
      });
    }
  }
}

/**
 * Performance monitoring decorators
 */
export function monitorPerformance(name: string, threshold?: number) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const timer = PerformanceMonitor.startTimer(name);
      
      try {
        const result = await method.apply(this, args);
        timer.endAndLog(threshold);
        PerformanceMonitor.recordCounter(`${name}:success`);
        return result;
      } catch (error) {
        timer.endAndLog(threshold);
        PerformanceMonitor.recordCounter(`${name}:error`);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * System resource monitoring
 */
export class SystemMonitor {
  private static memoryThreshold = 100 * 1024 * 1024; // 100MB
  private static cpuThreshold = 80; // 80%

  /**
   * Monitor memory usage
   */
  static monitorMemory(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed;
      const heapTotal = memoryUsage.heapTotal;
      const external = memoryUsage.external;
      const rss = memoryUsage.rss;

      PerformanceMonitor.recordGauge('memory:heapUsed', heapUsed);
      PerformanceMonitor.recordGauge('memory:heapTotal', heapTotal);
      PerformanceMonitor.recordGauge('memory:external', external);
      PerformanceMonitor.recordGauge('memory:rss', rss);

      if (heapUsed > this.memoryThreshold) {
        logger.warn('High memory usage detected', undefined, {
          context: 'SystemMonitor',
          data: {
            heapUsed: Math.round(heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(heapTotal / 1024 / 1024) + 'MB',
            threshold: Math.round(this.memoryThreshold / 1024 / 1024) + 'MB'
          }
        });
      }
    }
  }

  /**
   * Monitor CPU usage (simplified)
   */
  static monitorCPU(): void {
    const startUsage = process.cpuUsage();
    
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const cpuPercent = (endUsage.user + endUsage.system) / 1000000; // Convert to seconds
      
      PerformanceMonitor.recordGauge('cpu:usage', cpuPercent);
      
      if (cpuPercent > this.cpuThreshold) {
        logger.warn('High CPU usage detected', undefined, {
          context: 'SystemMonitor',
          data: {
            cpuPercent: cpuPercent.toFixed(2) + '%',
            threshold: this.cpuThreshold + '%'
          }
        });
      }
    }, 1000);
  }

  /**
   * Start system monitoring
   */
  static startMonitoring(interval: number = 30000): void {
    setInterval(() => {
      this.monitorMemory();
      this.monitorCPU();
    }, interval);

    logger.info('System monitoring started', {
      context: 'SystemMonitor',
      data: {
        interval,
        memoryThreshold: Math.round(this.memoryThreshold / 1024 / 1024) + 'MB',
        cpuThreshold: this.cpuThreshold + '%'
      }
    });
  }
}

/**
 * Initialize performance monitoring
 */
export function initializePerformanceMonitoring(): void {
  // Set up default thresholds
  PerformanceMonitor.setThreshold('trading:cycle:duration', 30000); // 30 seconds
  PerformanceMonitor.setThreshold('api:response:time', 1000); // 1 second
  PerformanceMonitor.setThreshold('database:query:time', 500); // 500ms
  
  // Start system monitoring
  SystemMonitor.startMonitoring();
  
  logger.info('Performance monitoring initialized', {
    context: 'PerformanceMonitor',
    data: {
      enabled: true,
      thresholds: {
        tradingCycle: '30s',
        apiResponse: '1s',
        databaseQuery: '500ms'
      }
    }
  });
}
