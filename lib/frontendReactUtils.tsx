// React components and hooks for frontend enterprise utilities
import React from 'react';
import { frontendErrorHandler } from './frontendErrorHandler';
import { frontendPerformanceMonitor } from './frontendPerformanceMonitor';

// React Error Boundary Component
export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
  lastRetry?: number;
}

export class FrontendErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error; retry: () => void }> },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    frontendErrorHandler.handleError(error, 'ErrorBoundary', {
      onError: (err, info) => {
        console.error('Error boundary caught error', err, info);
      }
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  retry = (): void => {
    this.setState(prevState => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: prevState.retryCount + 1,
      lastRetry: Date.now(),
    }));
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} retry={this.retry} />;
    }

    return this.props.children;
  }
}

// Default error fallback component
const DefaultErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
  const userMessage = frontendErrorHandler.getUserFriendlyMessage(error, 'ErrorBoundary');
  
  return (
    <div className="flex items-center justify-center min-h-[200px] p-8">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">⚠️</div>
        <h3 className="text-lg font-bold text-red-500 mb-2">Something went wrong</h3>
        <p className="text-sm text-green-500/60 mb-4">{userMessage}</p>
        <button
          onClick={retry}
          className="px-4 py-2 border border-green-500 text-green-500 hover:bg-green-500/10 transition-all"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

// React hook for component performance monitoring
export function useComponentPerformance(componentName: string) {
  const endTimer = frontendPerformanceMonitor.startComponentTimer(componentName);
  
  React.useEffect(() => {
    return endTimer;
  });
}

// React hook for API performance monitoring
export function useApiPerformance() {
  return React.useCallback(
    async (apiName: string, apiCall: () => Promise<any>, tags?: Record<string, string>) => {
      return frontendPerformanceMonitor.measureApiCall(apiName, apiCall, tags);
    },
    []
  );
}
