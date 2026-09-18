import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorBannerProps {
  error: Error | null;
  onRetry: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  let title = '오류가 발생했습니다';
  let message = error.message;

  if (error.name === 'OllamaConnectionError' || error.message.includes('Ollama connection')) {
    title = 'Ollama 서버에 연결할 수 없습니다';
    message = '로컬 Ollama 서비스가 실행 중인지 확인해 주세요. (http://127.0.0.1:11434)';
  } else if (error.name === 'OllamaModelNotFoundError' || error.message.includes('model not found')) {
    title = '요청한 모델을 찾을 수 없습니다';
    message = '해당 모델이 Ollama에 설치되어 있는지 확인하세요. (`ollama pull <model>`)';
  } else if (error.name === 'OllamaContextOverflowError' || error.message.includes('context')) {
    title = '컨텍스트 윈도우 초과';
    message = '대화 길이가 모델의 컨텍스트 한도를 초과했습니다. 세션을 정리하거나 압축해 주세요.';
  }

  return (
    <div className="mx-4 my-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start justify-between gap-3 shadow-xs">
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
        <div className="space-y-0.5">
          <p className="font-semibold text-[13px]">{title}</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed break-words">
            {message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="h-7 px-2.5 text-xs flex items-center gap-1 border-destructive/30 hover:bg-destructive/10 text-destructive"
        >
          <RefreshCw className="h-3 w-3" />
          <span>재시도</span>
        </Button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
