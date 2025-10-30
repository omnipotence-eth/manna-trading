'use client';

/**
 * Startup Initializer Component
 * Automatically initializes trading services when app loads
 */

import { useEffect, useState } from 'react';
import { frontendLogger } from '@/lib/frontendLogger';

export function StartupInitializer() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      try {
        frontendLogger.info('[STARTUP] Initializing trading services...', { component: 'StartupInitializer' });
        
        const response = await fetch('/api/startup?action=initialize');
        const data = await response.json();
        
        if (data.success) {
          frontendLogger.info('[STARTUP] ✅ Trading services initialized successfully', { component: 'StartupInitializer' });
          setInitialized(true);
        } else {
          frontendLogger.error('[STARTUP] ❌ Failed to initialize services', new Error(data.error || 'Unknown error'), { component: 'StartupInitializer' });
        }
      } catch (error) {
        frontendLogger.error('[STARTUP] ❌ Error initializing services', error as Error, { component: 'StartupInitializer' });
        // Retry after 5 seconds
        setTimeout(initializeServices, 5000);
      }
    }

    // Initialize on mount
    initializeServices();
  }, []);

  // This component doesn't render anything visible
  return null;
}

