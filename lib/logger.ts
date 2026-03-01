/**
 * Logging utility for the application
 * Provides structured logging with different levels
 * ENHANCED: Integrated with centralized logging configuration
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  context?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development';
  private isProd = process.env.NODE_ENV === 'production';
  private loggingConfig: any = null; // Lazy-loaded to prevent circular dependency

  private formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = new Date().toISOString();
    const context = options?.context ? `[${options.context}]` : '';
    
    // Plain text format - no colors for Windows PowerShell compatibility
    return `[${timestamp}] [${level.toUpperCase()}] ${context} ${message}`;
  }

  private log(level: LogLevel, message: string, options?: LogOptions, ...args: unknown[]) {
    // Lazy-load logging config to prevent circular dependency
    if (!this.loggingConfig) {
      try {
        const { loggingConfig } = require('@/lib/loggingConfig');
        this.loggingConfig = loggingConfig;
      } catch {
        // Logging config not available, use default behavior
        this.loggingConfig = { shouldLog: () => true };
      }
    }

    // Check if this log should be emitted
    const context = options?.context || 'Default';
    if (!this.loggingConfig.shouldLog(context, level)) {
      return; // Suppressed by logging configuration
    }

    // Skip debug logs in production (fallback)
    if (level === 'debug' && this.isProd) return;

    const formattedMessage = this.formatMessage(level, message, options);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, options?.data, ...args);
        break;
      case 'info':
        console.info(formattedMessage, options?.data, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, options?.data, ...args);
        break;
      case 'error':
        console.error(formattedMessage, options?.data, ...args);
        break;
    }
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, options?: LogOptions, ...args: unknown[]) {
    this.log('debug', message, options, ...args);
  }

  /**
   * Log informational messages
   */
  info(message: string, options?: LogOptions, ...args: unknown[]) {
    this.log('info', message, options, ...args);
  }

  /**
   * Log warnings
   */
  warn(message: string, options?: LogOptions, ...args: unknown[]) {
    this.log('warn', message, options, ...args);
  }

  /**
   * Log errors
   */
  error(message: string, error?: Error | unknown, options?: LogOptions) {
    const errorData = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: this.isDev ? error.stack : undefined,
        }
      : error;

    this.log('error', message, {
      ...options,
      data: { ...options?.data, error: errorData },
    });
  }

  /**
   * Log trading-specific events
   */
  trade(action: string, details: Record<string, unknown>) {
    this.info(`Trade: ${action}`, {
      context: 'TRADING',
      data: details,
    });
  }

  /**
   * Log API calls
   */
  api(method: string, endpoint: string, status?: number, duration?: number) {
    const message = `${method} ${endpoint}`;
    const data = { status, duration: duration ? `${duration}ms` : undefined };
    
    if (status && status >= 400) {
      this.warn(message, { context: 'API', data });
    } else {
      this.debug(message, { context: 'API', data });
    }
  }

  /**
   * Log performance metrics
   */
  performance(metric: string, value: number, unit: string = 'ms') {
    this.debug(`Performance: ${metric} = ${value}${unit}`, {
      context: 'PERFORMANCE',
      data: { metric, value, unit },
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for external use
export type { LogLevel, LogOptions };

export default logger;

