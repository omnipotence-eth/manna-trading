'use client';

/**
 * Startup Initializer Component
 * Automatically initializes trading services when app loads
 */

import { useEffect, useState } from 'react';
import { frontendLogger } from '@/lib/frontendLogger';

export function StartupInitializer() {
  const [initialized, setInitialized] = useState(false);
  const [status, setStatus] = useState<'initializing' | 'success' | 'error'>('initializing');

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;

    async function initializeServices() {
      try {
        frontendLogger.info('[STARTUP] 🚀 Initializing trading services...', { component: 'StartupInitializer' });
        setStatus('initializing');
        
        // Check status first
        const statusResponse = await fetch('/api/startup?action=status');
        const statusData = await statusResponse.json();
        
        if (statusData.data?.status?.initialized) {
          frontendLogger.info('[STARTUP] ✅ Services already initialized', { component: 'StartupInitializer' });
          setInitialized(true);
          setStatus('success');
          return;
        }
        
        // Initialize services
        const response = await fetch('/api/startup?action=initialize', {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          frontendLogger.info('[STARTUP] ✅ Trading services initialized successfully', { component: 'StartupInitializer' });
          setInitialized(true);
          setStatus('success');
        } else {
          throw new Error(data.error || 'Failed to initialize services');
        }
      } catch (error) {
        retryCount++;
        frontendLogger.error(`[STARTUP] ❌ Error initializing services (attempt ${retryCount}/${maxRetries})`, error as Error, { component: 'StartupInitializer' });
        
        if (retryCount < maxRetries) {
          // Retry after 5 seconds
          setTimeout(initializeServices, 5000);
        } else {
          setStatus('error');
          frontendLogger.error('[STARTUP] ❌ Max retries reached - services may not be initialized', error as Error, { component: 'StartupInitializer' });
        }
      }
    }

    // Initialize on mount (with small delay to ensure page is loaded)
    const timer = setTimeout(initializeServices, 500);
    return () => clearTimeout(timer);
  }, []);

  // PROFESSIONAL: Show subtle loading indicator during initialization
  if (status === 'initializing') {
    return (
      <div className="fixed top-4 right-4 z-50 bg-black/90 border border-green-400/30 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
          <span className="text-xs text-green-400 font-mono uppercase tracking-wider">
            Initializing Services...
          </span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fixed top-4 right-4 z-50 bg-black/90 border border-red-400/30 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-400"></div>
          <span className="text-xs text-red-400 font-mono uppercase tracking-wider">
            Initialization Failed
          </span>
        </div>
      </div>
    );
  }

  // Success state - hide after 2 seconds
  if (status === 'success' && initialized) {
    return null;
  }

  return null;
}

