/**
 * Next.js Instrumentation Hook
 * Runs automatically when the server starts
 * Initializes trading services and verifies DeepSeek R1
 * 
 * IMPORTANT: This file is ONLY executed on the server-side
 * It will NOT be bundled for the client
 * 
 * CRITICAL: All imports are dynamic to prevent Next.js from analyzing
 * the import chain during build time (which causes stream module errors)
 */

// CRITICAL FIX: Track if error handlers are already registered (prevents duplicates in dev mode)
let errorHandlersRegistered = false;
let initializationStarted = false;

export async function register() {
  // Immediate logging to verify this function executes
  console.log('[SERVER STARTUP] Instrumentation hook registered');
  
  // CRITICAL FIX: Prevent duplicate error handler registration (Next.js dev mode can call register() multiple times)
  if (!errorHandlersRegistered) {
    errorHandlersRegistered = true;
    
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
    
    // CRITICAL FIX: Set up graceful shutdown handler
    process.on('SIGTERM', async () => {
      console.log('[SERVER SHUTDOWN] SIGTERM received - shutting down gracefully...');
      try {
        const { startupService } = await import('@/services/startupService');
        await startupService.shutdown();
        console.log('[SERVER SHUTDOWN] ✅ Services shut down gracefully');
      } catch (error) {
        console.error('[SERVER SHUTDOWN] ❌ Error during shutdown:', error);
      }
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('[SERVER SHUTDOWN] SIGINT received - shutting down gracefully...');
      try {
        const { startupService } = await import('@/services/startupService');
        await startupService.shutdown();
        console.log('[SERVER SHUTDOWN] ✅ Services shut down gracefully');
      } catch (error) {
        console.error('[SERVER SHUTDOWN] ❌ Error during shutdown:', error);
      }
      process.exit(0);
    });
  }
  
  // CRITICAL FIX: Prevent duplicate initialization (Next.js dev mode can call register() multiple times)
  if (initializationStarted) {
    console.log('[SERVER STARTUP] ⚠️ Initialization already started, skipping duplicate call');
    return;
  }
  
  // Double-check we're on server-side (instrumentation.ts only runs server-side anyway)
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    initializationStarted = true;
    console.log('[SERVER STARTUP] ✅ Server-side detected, auto-initialization starting...');
    
    // CRITICAL FIX: Initialize immediately in background without blocking
    // Don't await - let it run in parallel while server starts
    // This prevents the 30+ second wait that was blocking startup
    import('@/services/startupService').then(async ({ startupService }) => {
      console.log('[SERVER STARTUP] ✅ StartupService imported successfully');
      
      // Small delay to let server finish starting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('[SERVER STARTUP] 🚀 Auto-initializing trading services...');
      console.log('[SERVER STARTUP] Note: This happens in the background. Server is ready now.');
      
      try {
        await startupService.initialize();
        console.log('[SERVER STARTUP] ✅✅✅ TRADING SERVICES INITIALIZED SUCCESSFULLY! ✅✅✅');
        console.log('[SERVER STARTUP] 🎊 Agent Runner should now be running!');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[SERVER STARTUP] ❌ Auto-initialization FAILED:', errorMessage);
        console.error('[SERVER STARTUP] ⚠️ THIS IS WHY AGENT RUNNER IS NOT RUNNING!');
        console.error('[SERVER STARTUP] Error details:', error);
        console.error('');
        console.error('[SERVER STARTUP] 🔧 MANUAL FIX REQUIRED:');
        console.error('[SERVER STARTUP] Run this command in PowerShell:');
        console.error('[SERVER STARTUP] Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=initialize"');
        console.error('');
        console.error('[SERVER STARTUP] OR check if Ollama is running:');
        console.error('[SERVER STARTUP] ollama serve');
      }
    }).catch((importError) => {
      console.error('[SERVER STARTUP] ❌ CRITICAL: Failed to import startupService:', importError);
      console.error('[SERVER STARTUP] This should never happen - check your code!');
    });
    
    console.log('[SERVER STARTUP] ✅ Server is ready (initialization running in background)');
  } else {
    console.log('[SERVER STARTUP] ⚠️ Not server-side, skipping initialization');
  }
}
