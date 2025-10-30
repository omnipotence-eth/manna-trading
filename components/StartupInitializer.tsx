'use client';

/**
 * Startup Initializer Component
 * Automatically initializes trading services when app loads
 */

import { useEffect, useState } from 'react';

export function StartupInitializer() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      try {
        console.log('[STARTUP] Initializing trading services...');
        
        const response = await fetch('/api/startup?action=initialize');
        const data = await response.json();
        
        if (data.success) {
          // Use logger instead of console.log for consistency
          // logger.info('[STARTUP] ✅ Trading services initialized successfully', { context: 'StartupInitializer' });
          setInitialized(true);
        } else {
          // Use logger instead of console.error for consistency
          // logger.error('[STARTUP] ❌ Failed to initialize services', new Error(data.error || 'Unknown error'), { context: 'StartupInitializer' });
        }
      } catch (error) {
        // Use logger instead of console.error for consistency
        // logger.error('[STARTUP] ❌ Error initializing services', error as Error, { context: 'StartupInitializer' });
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

