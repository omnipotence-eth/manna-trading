/**
 * Environment Variable Validation
 * Validates all required environment variables on startup
 * Provides clear error messages for missing or invalid configuration
 */

import { logger } from './logger';

interface EnvValidationRule {
  key: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'url';
  defaultValue?: string | number | boolean;
  validator?: (value: string) => boolean;
  errorMessage?: string;
}

const validationRules: EnvValidationRule[] = [
  // Aster DEX API Credentials
  {
    key: 'ASTER_API_KEY',
    required: true,
    type: 'string',
    validator: (v) => v.length > 0,
    errorMessage: 'ASTER_API_KEY must be a non-empty string'
  },
  {
    key: 'ASTER_SECRET_KEY',
    required: true,
    type: 'string',
    validator: (v) => v.length > 0,
    errorMessage: 'ASTER_SECRET_KEY must be a non-empty string'
  },
  {
    key: 'NEXT_PUBLIC_ASTER_API_KEY',
    required: false,
    type: 'string',
    defaultValue: ''
  },
  
  // API Endpoints
  {
    key: 'ASTER_BASE_URL',
    required: false,
    type: 'url',
    defaultValue: 'https://fapi.asterdex.com',
    validator: (v) => {
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    errorMessage: 'ASTER_BASE_URL must be a valid URL'
  },
  {
    key: 'ASTER_WS_BASE_URL',
    required: false,
    type: 'url',
    defaultValue: 'wss://fstream.asterdex.com/stream',
    validator: (v) => {
      try {
        const url = new URL(v);
        return url.protocol === 'wss:' || url.protocol === 'ws:';
      } catch {
        return false;
      }
    },
    errorMessage: 'ASTER_WS_BASE_URL must be a valid WebSocket URL (ws:// or wss://)'
  },
  
  // Database
  {
    key: 'DATABASE_URL',
    required: false,
    type: 'string',
    defaultValue: ''
  },
  
  // Ollama Configuration
  {
    key: 'OLLAMA_BASE_URL',
    required: false,
    type: 'url',
    defaultValue: 'http://localhost:11434',
    validator: (v) => {
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    errorMessage: 'OLLAMA_BASE_URL must be a valid URL'
  },
  
  // Rate Limits
  {
    key: 'ASTER_RATE_LIMIT_RPM',
    required: false,
    type: 'number',
    defaultValue: 1200,
    validator: (v) => {
      const num = parseFloat(v);
      return !isNaN(num) && num > 0;
    },
    errorMessage: 'ASTER_RATE_LIMIT_RPM must be a positive number'
  },
  {
    key: 'ASTER_RATE_LIMIT_RPS',
    required: false,
    type: 'number',
    defaultValue: 20,
    validator: (v) => {
      const num = parseFloat(v);
      return !isNaN(num) && num > 0;
    },
    errorMessage: 'ASTER_RATE_LIMIT_RPS must be a positive number'
  },
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of validationRules) {
    const value = process.env[rule.key];
    
    // Check if required variable is missing
    if (rule.required && !value) {
      errors.push(`Required environment variable ${rule.key} is not set`);
      continue;
    }
    
    // Skip validation if value is not set and not required
    if (!value) {
      continue;
    }
    
    // Type validation
    switch (rule.type) {
      case 'number':
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${rule.key} must be a valid number, got: ${value}`);
        } else if (rule.validator && !rule.validator(value)) {
          errors.push(rule.errorMessage || `${rule.key} validation failed`);
        }
        break;
        
      case 'boolean':
        const lower = value.toLowerCase();
        if (lower !== 'true' && lower !== 'false' && lower !== '1' && lower !== '0') {
          warnings.push(`${rule.key} should be 'true' or 'false', got: ${value}`);
        }
        break;
        
      case 'url':
        if (rule.validator && !rule.validator(value)) {
          errors.push(rule.errorMessage || `${rule.key} must be a valid URL`);
        }
        break;
        
      case 'string':
        if (rule.validator && !rule.validator(value)) {
          errors.push(rule.errorMessage || `${rule.key} validation failed`);
        }
        break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate environment variables and throw if invalid
 * Call this on application startup
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();
  
  if (result.errors.length > 0) {
    logger.error('Environment validation failed', undefined, {
      context: 'EnvValidation',
      data: { errors: result.errors }
    });
    
    throw new Error(
      `Environment validation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
  
  if (result.warnings.length > 0) {
    logger.warn('Environment validation warnings', undefined, {
      context: 'EnvValidation',
      data: { warnings: result.warnings }
    });
  }
  
  if (result.valid) {
    logger.info('Environment validation passed', {
      context: 'EnvValidation',
      data: { validatedVariables: validationRules.length }
    });
  }
}

/**
 * Get validation status (for health checks)
 */
export function getValidationStatus(): ValidationResult {
  return validateEnvironment();
}

