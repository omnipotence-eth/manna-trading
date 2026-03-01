/**
 * API Key Optimizer - Re-export from unified manager
 * 
 * DEPRECATED: This file is kept for backwards compatibility only.
 * All functionality has been consolidated into lib/apiKeyManager.ts
 * 
 * Please import directly from lib/apiKeyManager.ts instead:
 * import { apiKeyManager, ASTER_RATE_LIMITS } from '@/lib/apiKeyManager';
 * 
 * @see lib/apiKeyManager.ts for the unified implementation
 */

// Re-export everything from the unified manager
export { 
  apiKeyManager as apiKeyOptimizer,
  apiKeyManager,
  ASTER_RATE_LIMITS,
  type AsterAPIKey,
  type EndpointType,
  type KeySelectionStrategy
} from '@/lib/apiKeyManager';

// Default export for backwards compatibility
export { apiKeyManager as default } from '@/lib/apiKeyManager';
