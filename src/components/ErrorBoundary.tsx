import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackText?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LotLedger] Uncaught chart error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl space-y-2 text-center h-full min-h-[180px]">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <h5 className="font-bold text-sm">Chart failed to render</h5>
          <p className="text-xs text-financial-muted max-w-xs leading-relaxed">
            {this.props.fallbackText || 'The data structure could not be processed by the rendering engine.'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
