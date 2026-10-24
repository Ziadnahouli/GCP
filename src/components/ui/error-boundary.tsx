'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * A7: Component-level Error Boundary to isolate render errors in chat, voice, or modals
 * preventing full-page white-screens.
 */
export class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ComponentErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-center m-2 space-y-3">
          <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center text-destructive">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {this.props.fallbackTitle || (this.props.sectionName ? `Error in ${this.props.sectionName}` : 'Component Error')}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {this.props.fallbackDescription || `A problem occurred while rendering ${this.props.sectionName || 'this section'}.`}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
