/**
 * Centralized Logging Configuration
 * Controls verbosity of all logging to prevent terminal overflow
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
export type LogContext = 
  | 'AgentRunner'
  | 'AgentCoordinator'
  | 'MarketScanner'
  | 'HealthMonitor'
  | 'CriticalMonitor'
  | 'DataIngestion'
  | 'RiskManager'
  | 'AsterDEX'
  | 'DeepSeek'
  | 'Startup'
  | 'Process'
  | 'Default';

interface LoggingRules {
  globalLevel: LogLevel;
  contextLevels: Partial<Record<LogContext, LogLevel>>;
  enableDebugInDevelopment: boolean;
  maxLogsPerMinute: number;
  silentContexts: LogContext[]; // Contexts to suppress entirely
}

class LoggingConfigService {
  private config: LoggingRules;
  private logCounts: Map<string, number[]> = new Map(); // Track logs per minute

  constructor() {
    // Default configuration based on environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? 'info' : 'warn');

    this.config = {
      globalLevel: logLevel,
      contextLevels: {
        // CRITICAL contexts: Always log at info level
        AgentRunner: 'info',
        CriticalMonitor: 'warn',
        Startup: 'info',
        
        // VERBOSE contexts: Reduce to warn in production
        MarketScanner: isDevelopment ? 'info' : 'warn',
        DataIngestion: isDevelopment ? 'info' : 'warn',
        AgentCoordinator: isDevelopment ? 'info' : 'warn',
        
        // NOISY contexts: Only errors unless debugging
        HealthMonitor: 'warn',
        AsterDEX: 'warn',
        DeepSeek: isDevelopment ? 'info' : 'warn',
      },
      enableDebugInDevelopment: isDevelopment,
      maxLogsPerMinute: isDevelopment ? 500 : 100, // Prevent log floods
      silentContexts: [] // Add contexts here to suppress entirely
    };

    console.log('[LoggingConfig] Initialized with profile:', {
      environment: isDevelopment ? 'development' : 'production',
      globalLevel: this.config.globalLevel,
      maxLogsPerMinute: this.config.maxLogsPerMinute
    });
  }

  /**
   * Check if a log should be emitted based on context and level
   */
  shouldLog(context: string, level: LogLevel): boolean {
    // Never log if level is 'none'
    if (level === 'none') return false;

    // Check if context is silenced
    if (this.config.silentContexts.includes(context as LogContext)) {
      return false;
    }

    // Check rate limiting
    if (!this.checkRateLimit(context)) {
      return false;
    }

    // Get effective level for this context
    const effectiveLevel = this.getEffectiveLevel(context as LogContext);
    
    // Compare log levels
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const requiredIndex = levels.indexOf(effectiveLevel);
    const messageIndex = levels.indexOf(level);

    return messageIndex >= requiredIndex;
  }

  /**
   * Get effective log level for a context
   */
  private getEffectiveLevel(context: LogContext): LogLevel {
    // Context-specific level takes precedence
    if (this.config.contextLevels[context]) {
      return this.config.contextLevels[context]!;
    }

    // Fall back to global level
    return this.config.globalLevel;
  }

  /**
   * Check if log is within rate limit
   */
  private checkRateLimit(context: string): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Get or create log timestamps for this context
    let timestamps = this.logCounts.get(context) || [];
    
    // Remove timestamps older than 1 minute
    timestamps = timestamps.filter(t => t > oneMinuteAgo);
    
    // Check if we're over the limit
    if (timestamps.length >= this.config.maxLogsPerMinute) {
      // Rate limit exceeded - suppress this log
      return false;
    }

    // Add current timestamp and update
    timestamps.push(now);
    this.logCounts.set(context, timestamps);

    return true;
  }

  /**
   * Update logging configuration
   */
  updateConfig(newConfig: Partial<LoggingRules>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      contextLevels: {
        ...this.config.contextLevels,
        ...(newConfig.contextLevels || {})
      }
    };

    console.log('[LoggingConfig] Configuration updated:', {
      globalLevel: this.config.globalLevel,
      silentContexts: this.config.silentContexts
    });
  }

  /**
   * Set log level for specific context
   */
  setContextLevel(context: LogContext, level: LogLevel): void {
    this.config.contextLevels[context] = level;
    console.log(`[LoggingConfig] Set ${context} to ${level}`);
  }

  /**
   * Silence a noisy context completely
   */
  silenceContext(context: LogContext): void {
    if (!this.config.silentContexts.includes(context)) {
      this.config.silentContexts.push(context);
      console.log(`[LoggingConfig] Silenced context: ${context}`);
    }
  }

  /**
   * Un-silence a context
   */
  unsilenceContext(context: LogContext): void {
    this.config.silentContexts = this.config.silentContexts.filter(c => c !== context);
    console.log(`[LoggingConfig] Un-silenced context: ${context}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggingRules {
    return { ...this.config };
  }

  /**
   * Get rate limit statistics
   */
  getRateLimitStats(): { context: string; logsPerMinute: number }[] {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    return Array.from(this.logCounts.entries()).map(([context, timestamps]) => ({
      context,
      logsPerMinute: timestamps.filter(t => t > oneMinuteAgo).length
    }));
  }

  /**
   * Preset: Quiet Mode (minimal logging)
   */
  setQuietMode(): void {
    this.config.globalLevel = 'warn';
    this.config.contextLevels = {
      AgentRunner: 'info',
      CriticalMonitor: 'warn',
      Startup: 'info',
      HealthMonitor: 'error',
      MarketScanner: 'warn',
      DataIngestion: 'error',
      AgentCoordinator: 'info',  // CRITICAL: Show trade decisions and workflow progress
      AsterDEX: 'error',
      DeepSeek: 'error'
    };
    console.log('[LoggingConfig] QUIET MODE activated');
  }

  /**
   * Preset: Verbose Mode (detailed logging for debugging)
   */
  setVerboseMode(): void {
    this.config.globalLevel = 'debug';
    this.config.contextLevels = {};
    this.config.silentContexts = [];
    console.log('[LoggingConfig] VERBOSE MODE activated');
  }

  /**
   * Preset: Production Mode (errors and critical warnings only)
   */
  setProductionMode(): void {
    this.config.globalLevel = 'warn';
    this.config.contextLevels = {
      AgentRunner: 'info',      // Keep Agent Runner visible
      CriticalMonitor: 'warn',  // Keep critical alerts visible
      Startup: 'info',          // Keep startup sequence visible
      HealthMonitor: 'error',   // Only show health monitor errors
      MarketScanner: 'error',   // Only show scanner errors
      DataIngestion: 'error',   // Only show data errors
      AgentCoordinator: 'warn', // Show workflow warnings
      AsterDEX: 'error',        // Only show API errors
      DeepSeek: 'error'         // Only show AI errors
    };
    this.config.silentContexts = [];
    console.log('[LoggingConfig] PRODUCTION MODE activated');
  }
}

// Export singleton
export const loggingConfig = new LoggingConfigService();

// Environment-based auto-configuration
if (process.env.LOGGING_PRESET === 'quiet') {
  loggingConfig.setQuietMode();
} else if (process.env.LOGGING_PRESET === 'verbose') {
  loggingConfig.setVerboseMode();
} else if (process.env.LOGGING_PRESET === 'production' || process.env.NODE_ENV === 'production') {
  loggingConfig.setProductionMode();
}

