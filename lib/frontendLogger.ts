// Frontend logging utility with performance monitoring
interface LogContext {
  component?: string;
  action?: string;
  data?: any;
  performance?: {
    startTime?: number;
    endTime?: number;
    duration?: number;
  };
}

class FrontendLogger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  constructor() {
    // Set log level based on environment
    this.logLevel = this.isDevelopment ? 'debug' : 'warn';
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const component = context?.component ? `[${context.component}]` : '';
    const action = context?.action ? `[${context.action}]` : '';
    const performance = context?.performance?.duration ? `(${context.performance.duration}ms)` : '';
    
    return `${timestamp} ${level.toUpperCase()} ${component}${action}${performance}: ${message}`;
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    
    const formattedMessage = this.formatMessage('debug', message, context);
    console.debug(formattedMessage, context?.data || '');
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    
    const formattedMessage = this.formatMessage('info', message, context);
    console.info(formattedMessage, context?.data || '');
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    
    const formattedMessage = this.formatMessage('warn', message, context);
    console.warn(formattedMessage, context?.data || '');
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    
    const formattedMessage = this.formatMessage('error', message, context);
    console.error(formattedMessage, error || '', context?.data || '');
    
    // In production, you might want to send errors to a monitoring service
    if (!this.isDevelopment && error) {
      this.sendToMonitoringService(error, context);
    }
  }

  private sendToMonitoringService(error: Error, context?: LogContext): void {
    // Placeholder for sending errors to monitoring service (e.g., Sentry, LogRocket)
    // This would be implemented based on your monitoring solution
    try {
      // Example: Sentry.captureException(error, { extra: context });
      console.warn('Error monitoring not configured', { error: error.message, context });
    } catch (monitoringError) {
      console.error('Failed to send error to monitoring service', monitoringError);
    }
  }

  // Performance timing utilities
  startTimer(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.debug(`Timer ${label} completed`, {
        performance: { startTime, endTime: performance.now(), duration }
      });
      return duration;
    };
  }

  measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.startTimer(label);
    return fn().finally(() => endTimer());
  }
}

export const frontendLogger = new FrontendLogger();
export default frontendLogger;
