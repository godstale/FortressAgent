import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, Square, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ChatInputProps {
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onSteer,
  onStop,
  isStreaming,
  placeholder,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (isStreaming) {
      onSteer(trimmed);
    } else {
      onSend(trimmed);
    }

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent sending during IME composition (e.g. Korean / Japanese / Chinese typing)
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const defaultPlaceholder = isStreaming
    ? '스트리밍 중입니다 (입력 후 Enter시 지시 주입 — Steering)...'
    : '메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)...';

  return (
    <div className="relative border border-border rounded-xl bg-background shadow-xs focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || defaultPlaceholder}
        className="w-full resize-none bg-transparent px-3.5 py-3 pr-20 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden max-h-44 leading-relaxed font-sans"
      />

      <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
        {isStreaming && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onStop}
            className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="중지"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title={isStreaming ? '지시 주입 (Steer)' : '전송'}
        >
          {isStreaming ? (
            <CornerDownLeft className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
