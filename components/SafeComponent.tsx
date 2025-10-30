'use client';

import { Component, ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Simple error boundary wrapper for catching component render errors
 */
export class SafeComponent extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    logger.error(`❌ ${this.props.name || 'Component'} error`, error, {
      context: 'SafeComponent',
      data: { componentName: this.props.name, errorInfo }
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/10 text-red-500">
          <p className="text-sm">⚠️ {this.props.name || 'Component'} failed to load</p>
          {this.state.error && (
            <p className="text-xs mt-2 text-red-500/60">{this.state.error.message}</p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

