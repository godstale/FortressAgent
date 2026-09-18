import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleHome = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '#/';
      window.location.reload();
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || '알 수 없는 오류가 발생했습니다.';
      const componentStack = this.state.errorInfo?.componentStack || '';

      return (
        <div className="min-h-screen w-screen flex items-center justify-center p-6 bg-background text-foreground select-none">
          <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-card p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
                <AlertOctagon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  예기치 않은 문제가 발생했습니다
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  화면을 렌더링하는 도중 오류가 발생했습니다.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive break-words">
              {errorMessage}
            </div>

            {/* Collapsible stack details */}
            {componentStack && (
              <div className="border border-border rounded-lg overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() =>
                    this.setState((prev) => ({ showDetails: !prev.showDetails }))
                  }
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground text-[11px]"
                >
                  <span>기술 상세 정보 (스택 추적)</span>
                  {this.state.showDetails ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {this.state.showDetails && (
                  <pre className="p-3 bg-background/70 font-mono text-[10px] text-muted-foreground overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                    {this.state.error?.stack}
                    {componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={this.handleHome}
                className="text-xs flex items-center gap-1"
              >
                <Home className="h-3.5 w-3.5" />
                <span>홈으로</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={this.handleReset}
                className="text-xs flex items-center gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>다시 시도</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={this.handleReload}
                className="text-xs bg-primary text-primary-foreground"
              >
                새로고침
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
