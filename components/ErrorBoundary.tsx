'use client';

import React from 'react';
import { logger } from '@/lib/logger';
import { Warning } from 'phosphor-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

/**
 * Error Boundary component to catch and handle React component errors
 * Prevents entire application from crashing when one component fails
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    logger.error('Error boundary caught an error', error, {
      context: 'ErrorBoundary',
      data: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Update state with error info
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
          <div className="glass-effect p-8 rounded-lg max-w-2xl w-full">
            <div className="flex items-center gap-3 mb-4">
              <Warning size={32} weight="fill" className="text-red-500" />
              <h2 className="text-red-500 text-2xl font-bold">
                Something went wrong
              </h2>
            </div>
            
            <p className="text-green-500/80 mb-6">
              The application encountered an unexpected error. This has been logged 
              and will be investigated. You can try refreshing the page or resetting 
              the component.
            </p>

            {this.state.error && process.env.NODE_ENV === 'development' && (
              <details className="mb-6">
                <summary className="text-neon-blue cursor-pointer hover:underline mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="glass-effect p-4 rounded text-xs overflow-auto max-h-64">
                  <div className="text-red-500 font-bold mb-2">
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <pre className="text-green-500/60 whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      <div className="text-neon-blue font-bold mt-4 mb-2">
                        Component Stack:
                      </div>
                      <pre className="text-green-500/60 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 border border-green-500 text-green-500 hover:bg-green-500/10 transition-all font-bold"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-3 border border-neon-blue text-neon-blue hover:bg-neon-blue/10 transition-all font-bold"
              >
                Reload Page
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-green-500/30">
              <p className="text-xs text-green-500/60">
                If this problem persists, please report it to the development team 
                with the error details above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

