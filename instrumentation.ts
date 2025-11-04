/**
 * Next.js Instrumentation Hook
 * Runs automatically when the server starts
 * Initializes trading services and verifies DeepSeek R1
 * 
 * IMPORTANT: This file is ONLY executed on the server-side
 * It will NOT be bundled for the client
 */

export async function register() {
  // Immediate logging to verify this function executes
  console.log('[SERVER STARTUP] Instrumentation hook registered');
  
  // CRITICAL: Set up global error handlers to prevent unhandled rejections from crashing the server
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[SERVER STARTUP] Unhandled Promise Rejection:', reason);
    // Log to logger if available (non-blocking)
    import('@/lib/logger').then(({ logger }) => {
      logger.error('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
        context: 'Process',
        data: { promise: String(promise) }
      });
    }).catch(() => {
      // Logger not available yet, use console
      console.error('[SERVER STARTUP] Unhandled rejection details:', { reason, promise });
    });
  });

  process.on('uncaughtException', (error) => {
    console.error('[SERVER STARTUP] Uncaught Exception:', error);
    // Log to logger if available (non-blocking)
    import('@/lib/logger').then(({ logger }) => {
      logger.error('Uncaught Exception', error, { context: 'Process' });
    }).catch(() => {
      // Logger not available yet, use console
      console.error('[SERVER STARTUP] Uncaught exception details:', error);
    });
    // Don't exit - let the error be handled by Next.js error boundaries
  });
  
  // Double-check we're on server-side (instrumentation.ts only runs server-side anyway)
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    console.log('[SERVER STARTUP] Server-side detected, proceeding with initialization...');
    
    // Use dynamic import with try-catch for safety
    try {
      const { startupService } = await import('@/services/startupService');
      console.log('[SERVER STARTUP] StartupService imported successfully');
      
      // CRITICAL FIX: Wait longer for Ollama/model to be ready
      // The 18.9GB DeepSeek R1 model needs 60-120 seconds to load on first request
      // We wait 30 seconds for Ollama to start, then initialization will handle model loading
      console.log('[SERVER STARTUP] Waiting 30 seconds for Ollama to be ready...');
      console.log('[SERVER STARTUP] Note: DeepSeek R1 model loading may take additional 60-120 seconds on first request');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Auto-initialize on server startup with retry logic
      let retries = 0;
      const maxRetries = 3;
      
      async function tryInitialize() {
        try {
          console.log(`[SERVER STARTUP] Auto-initializing trading services (attempt ${retries + 1}/${maxRetries})...`);
          await startupService.initialize();
          console.log('[SERVER STARTUP] Trading services initialized successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isDeepSeekError = errorMessage.includes('DeepSeek R1 not available') || 
                                  errorMessage.includes('timeout') ||
                                  errorMessage.includes('DeepSeek');
          
          retries++;
          
          if (retries < maxRetries && isDeepSeekError) {
            // Wait longer each retry: 60s, 90s, 120s
            const waitTime = retries * 30000 + 60000; // 60s, 90s, 120s
            console.log(`[SERVER STARTUP] Initialization failed (likely model still loading)`);
            console.log(`[SERVER STARTUP] Retrying in ${waitTime/1000} seconds (attempt ${retries + 1}/${maxRetries})...`);
            console.log(`[SERVER STARTUP] Tip: Model loading can take 60-120 seconds - this is normal for 18.9GB models`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return tryInitialize();
          }
          
          // Max retries reached or non-DeepSeek error
          console.error('[SERVER STARTUP] Auto-initialization failed after retries:', error);
          console.error('[SERVER STARTUP] You can manually initialize via: GET /api/startup?action=initialize');
          console.error('[SERVER STARTUP] Or run the diagnostic script: .\diagnose_initialization.ps1');
          // Don't throw - let server continue running so user can manually initialize
        }
      }
      
      await tryInitialize();
    } catch (importError) {
      console.error('[SERVER STARTUP] ⚠️ Failed to import startupService:', importError);
      // Re-throw to make error visible
      throw importError;
    }
  } else {
    console.log('[SERVER STARTUP] ⚠️ Not server-side, skipping initialization');
  }
}

