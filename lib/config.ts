// lib/config.ts
// Configuration and environment variables

/**
 * Get environment variable with fallback
 */
function getEnvVar(key: string, defaultValue: string = ''): string {
  if (typeof window !== 'undefined') {
    // Client-side: Only access NEXT_PUBLIC_ variables
    return (process.env[key] as string) || defaultValue;
  }
  // Server-side: Can access all variables
  return (process.env[key] as string) || defaultValue;
}

/**
 * Aster DEX API Configuration
 */
export const asterConfig = {
  // API Keys
  apiKey: getEnvVar('NEXT_PUBLIC_ASTER_API_KEY'),
  secretKey: getEnvVar('ASTER_SECRET_KEY'), // Server-only
  
  // WebSocket Configuration
  useRealWebSocket: getEnvVar('NEXT_PUBLIC_USE_REAL_WEBSOCKET', 'false') === 'true',
  websocketStreams: getEnvVar('NEXT_PUBLIC_WEBSOCKET_STREAMS', 'btcusdt@depth').split(','),
  
  // API Endpoints
  apiBaseUrl: 'https://api.asterdex.com',
  wsBaseUrl: 'wss://fstream.asterdex.com/stream',
  wsUserUrl: 'wss://fstream.asterdex.com/ws',
};

/**
 * Validate API configuration
 */
export function validateAsterConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Only validate if real WebSocket is enabled
  if (asterConfig.useRealWebSocket) {
    if (!asterConfig.apiKey) {
      errors.push('NEXT_PUBLIC_ASTER_API_KEY is required when using real WebSocket');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get safe config for client-side logging (hides sensitive data)
 */
export function getSafeConfig() {
  return {
    hasApiKey: !!asterConfig.apiKey,
    hasSecretKey: !!asterConfig.secretKey,
    useRealWebSocket: asterConfig.useRealWebSocket,
    websocketStreams: asterConfig.websocketStreams,
    apiBaseUrl: asterConfig.apiBaseUrl,
  };
}

