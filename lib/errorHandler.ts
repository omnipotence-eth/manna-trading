/**
 * Centralized Error Handling Utilities
 * Provides consistent error handling across all API routes and services
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Error types for better error categorization
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  EXTERNAL_API = 'EXTERNAL_API_ERROR',
  DATABASE = 'DATABASE_ERROR',
  INTERNAL = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  NETWORK = 'NETWORK_ERROR'
}

/**
 * Custom error class with type and context
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly context: string;
  public readonly data?: any;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL,
    statusCode: number = 500,
    context: string = 'Unknown',
    data?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.context = context;
    this.data = data;
  }
}

/**
 * Error response interface
 */
export interface ErrorResponse {
  success: false;
  error: string;
  type: ErrorType;
  context: string;
  timestamp: string;
  data?: any;
}

/**
 * Success response interface
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * API Response type
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Handle API errors with proper logging and response formatting
 */
export function handleApiError(
  error: any,
  context: string,
  fallbackData?: any
): NextResponse<ErrorResponse> {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Error) {
    // Convert generic errors to AppError
    appError = new AppError(
      error.message,
      ErrorType.INTERNAL,
      500,
      context,
      { originalError: error.name }
    );
  } else {
    // Handle unknown error types
    appError = new AppError(
      'An unexpected error occurred',
      ErrorType.INTERNAL,
      500,
      context,
      { originalError: String(error) }
    );
  }

  // Log error with appropriate level based on type
  const logLevel = appError.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel](`API Error in ${context}`, {
    context: appError.context,
    data: {
      type: appError.type,
      statusCode: appError.statusCode,
      message: appError.message,
      ...appError.data
    }
  });

  // Return fallback data if provided and error is not critical
  if (fallbackData && appError.statusCode < 500) {
    logger.info(`Returning fallback data for ${context}`, {
      context: appError.context,
      data: { fallbackData }
    });
    return NextResponse.json(fallbackData);
  }

  // Return structured error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: appError.message,
    type: appError.type,
    context: appError.context,
    timestamp: new Date().toISOString(),
    data: appError.data
  };

  return NextResponse.json(errorResponse, { status: appError.statusCode });
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(data: T): NextResponse<SuccessResponse<T>> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(response);
}

/**
 * Validate request body against schema
 */
export function validateRequestBody<T>(
  body: any,
  schema: (data: any) => data is T,
  context: string
): T {
  if (!schema(body)) {
    throw new AppError(
      'Invalid request body',
      ErrorType.VALIDATION,
      400,
      context,
      { received: body }
    );
  }
  return body;
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: any,
  requiredFields: string[],
  context: string
): void {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new AppError(
      `Missing required fields: ${missingFields.join(', ')}`,
      ErrorType.VALIDATION,
      400,
      context,
      { missingFields, received: Object.keys(data) }
    );
  }
}

/**
 * Handle Aster DEX API errors specifically
 */
export function handleAsterApiError(
  response: Response,
  context: string,
  fallbackData?: any
): NextResponse {
  const statusCode = response.status;
  
  switch (statusCode) {
    case 429:
      logger.warn('Aster API rate limit exceeded', undefined, {
        context,
        data: { status: statusCode }
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          type: ErrorType.RATE_LIMIT,
          context,
          timestamp: new Date().toISOString()
        },
        { status: 429 }
      );
      
    case 401:
      logger.error('Aster API authentication failed', undefined, {
        context,
        data: { status: statusCode }
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed. Please check API credentials.',
          type: ErrorType.AUTHENTICATION,
          context,
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
      
    case 400:
      logger.warn('Aster API returned 400, returning fallback data', undefined, {
        context,
        data: { status: statusCode }
      });
      if (fallbackData) {
        return NextResponse.json(fallbackData);
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Bad request to Aster API',
          type: ErrorType.EXTERNAL_API,
          context,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
      
    default:
      logger.error('Aster API error', undefined, {
        context,
        data: { status: statusCode }
      });
      return NextResponse.json(
        {
          success: false,
          error: `Aster API error: ${statusCode}`,
          type: ErrorType.EXTERNAL_API,
          context,
          timestamp: new Date().toISOString()
        },
        { status: statusCode }
      );
  }
}

/**
 * Async error wrapper for API routes
 */
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  context: string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Unknown error',
        ErrorType.INTERNAL,
        500,
        context,
        { originalError: error }
      );
    }
  };
}

/**
 * Retry mechanism with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  context: string = 'Retry'
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        logger.error(`All retry attempts failed for ${context}`, error, {
          context,
          data: { attempts: maxAttempts, finalError: error }
        });
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`Retry attempt ${attempt} failed for ${context}, retrying in ${delay}ms`, undefined, {
        context,
        data: { attempt, maxAttempts, delay, error: error instanceof Error ? error.message : String(error) }
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string = 'Timeout'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new AppError(
        `Operation timed out after ${timeoutMs}ms`,
        ErrorType.TIMEOUT,
        408,
        context
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (error instanceof AppError && error.type === ErrorType.TIMEOUT) {
      logger.error(`Timeout in ${context}`, error, {
        context,
        data: { timeoutMs }
      });
    }
    throw error;
  }
}
