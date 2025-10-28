// Frontend error handling and recovery utilities
import { frontendLogger } from './frontendLogger';

export interface ErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error, errorInfo?: any) => void;
}

export class FrontendErrorHandler {
  private static instance: FrontendErrorHandler;
  private retryAttempts = new Map<string, number>();
  private maxRetries = 3;
  private retryDelay = 1000;

  static getInstance(): FrontendErrorHandler {
    if (!FrontendErrorHandler.instance) {
      FrontendErrorHandler.instance = new FrontendErrorHandler();
    }
    return FrontendErrorHandler.instance;
  }

  handleError(error: Error, context: string, options?: Partial<ErrorRecoveryOptions>): void {
    const maxRetries = options?.maxRetries || this.maxRetries;
    const retryDelay = options?.retryDelay || this.retryDelay;
    
    frontendLogger.error(`Error in ${context}`, error, { component: context });
    
    // Track retry attempts
    const currentAttempts = this.retryAttempts.get(context) || 0;
    
    if (currentAttempts < maxRetries) {
      this.retryAttempts.set(context, currentAttempts + 1);
      
      frontendLogger.warn(`Retrying ${context} (attempt ${currentAttempts + 1}/${maxRetries})`, {
        component: context,
        data: { attempt: currentAttempts + 1, maxRetries }
      });
      
      // Schedule retry
      setTimeout(() => {
        this.retryAttempts.delete(context);
      }, retryDelay * Math.pow(2, currentAttempts)); // Exponential backoff
    } else {
      frontendLogger.error(`Max retries exceeded for ${context}`, error, { component: context });
      this.retryAttempts.delete(context);
    }
  }

  resetRetryCount(context: string): void {
    this.retryAttempts.delete(context);
  }

  // API error handling with automatic retry
  async handleApiError<T>(
    apiCall: () => Promise<T>,
    context: string,
    options?: Partial<ErrorRecoveryOptions>
  ): Promise<T | null> {
    try {
      return await apiCall();
    } catch (error) {
      this.handleError(error as Error, context, options);
      
      // Return null for graceful degradation
      return null;
    }
  }

  // Network error detection and handling
  isNetworkError(error: any): boolean {
    return (
      error?.name === 'NetworkError' ||
      error?.message?.includes('fetch') ||
      error?.message?.includes('network') ||
      error?.code === 'NETWORK_ERROR'
    );
  }

  // Rate limit error detection
  isRateLimitError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.message?.includes('rate limit') ||
      error?.message?.includes('too many requests')
    );
  }

  // Get user-friendly error message
  getUserFriendlyMessage(error: Error, context: string): string {
    if (this.isNetworkError(error)) {
      return 'Network connection issue. Please check your internet connection.';
    }
    
    if (this.isRateLimitError(error)) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    
    // Default messages based on context
    switch (context) {
      case 'PriceTicker':
        return 'Unable to load price data. Prices will update when connection is restored.';
      case 'NOF1Dashboard':
        return 'Dashboard data temporarily unavailable. Refreshing...';
      case 'Positions':
        return 'Position data loading failed. Will retry automatically.';
      case 'TradeJournal':
        return 'Trade history temporarily unavailable.';
      default:
        return 'Something went wrong. The system will retry automatically.';
    }
  }
}

export const frontendErrorHandler = FrontendErrorHandler.getInstance();
export default frontendErrorHandler;
