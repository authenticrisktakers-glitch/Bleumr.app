import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-950/20 border border-red-500/30 rounded-lg m-4">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-red-300 mb-2">
            {this.props.fallbackTitle || 'Something went wrong'}
          </h2>
          <p className="text-sm text-red-400/80 mb-4 text-center max-w-md">
            {this.props.fallbackMessage || 'An error occurred in this component. You can continue using other parts of the app.'}
          </p>
          {this.state.error && (
            <details className="text-xs text-red-300/60 mb-4 max-w-lg">
              <summary className="cursor-pointer hover:text-red-300">Error Details</summary>
              <pre className="mt-2 p-2 bg-black/30 rounded overflow-auto max-h-32">
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-300 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundaries for specific sections

export const ChatErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackTitle="Chat Error"
    fallbackMessage="The chat interface encountered an error. Your conversation may not be fully visible."
  >
    {children}
  </ErrorBoundary>
);

export const BrowserErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackTitle="Browser Error"
    fallbackMessage="The browser view encountered an error. Try refreshing the page or creating a new tab."
  >
    {children}
  </ErrorBoundary>
);

export const AgentErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackTitle="Agent Execution Error"
    fallbackMessage="The automation agent encountered an error. The task may have been interrupted."
    onError={(error) => {
      console.error('[AgentErrorBoundary] Agent execution failed:', error);
    }}
  >
    {children}
  </ErrorBoundary>
);
