/**
 * Next.js Instrumentation Hook
 * Runs on server startup to validate environment and initialize services
 * 
 * This file is automatically executed by Next.js when instrumentationHook is enabled
 * See: next.config.js -> experimental.instrumentationHook: true
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side
    const { validateEnvironmentOrThrow } = await import('./lib/envValidation');
    const { logger } = await import('./lib/logger');
    
    try {
      // Validate environment variables on startup
      validateEnvironmentOrThrow();
      
      logger.info('[STARTUP] Environment validation passed', {
        context: 'Instrumentation',
        data: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      // Log error but don't crash - allow app to start for development
      logger.error('[STARTUP] Environment validation failed', error instanceof Error ? error : new Error(String(error)), {
        context: 'Instrumentation',
        data: {
          note: 'Application will continue, but some features may not work correctly',
          timestamp: new Date().toISOString()
        }
      });
      
      // In production, you might want to throw here to prevent startup with invalid config
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }
}
