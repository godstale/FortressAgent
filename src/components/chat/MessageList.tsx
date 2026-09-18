import { useRef, useEffect, useState, type UIEvent } from 'react';
import { ArrowDown, Bot } from 'lucide-react';
import type { AgentMessage } from '@/lib/agent/types';
import { MessageBubble } from './MessageBubble';
import { CompactionBanner } from './CompactionBanner';
import { Button } from '@/components/ui/button';

export interface MessageListProps {
  messages: AgentMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isUserScrolledUpRef = useRef(false);

  const scrollToBottom = (smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isUserScrolledUpRef.current = false;
      setShowScrollBottom(false);
    }
  };

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    const isUp = distanceToBottom > 80;
    isUserScrolledUpRef.current = isUp;
    setShowScrollBottom(isUp);
  };

  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom(false);
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center select-none">
        <div className="max-w-md flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">Fortress Local AI Workstation</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            로컬 Ollama LLM을 사용하여 소스 코드 분석, 파일 편집, 셸 명령어 실행,
            웹 검색 등을 지원합니다. 아래 입력창에 메시지를 입력하여 작업을 시작하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 space-y-2 scroll-smooth"
      >
        {messages.map((msg, index) => {
          if (
            msg.role === 'system' &&
            msg.content.startsWith(
              'Below is a summary of the earlier conversation:',
            )
          ) {
            const summaryText = msg.content
              .replace(
                'Below is a summary of the earlier conversation:\n\n',
                '',
              )
              .trim();
            return (
              <CompactionBanner
                key={index}
                summary={summaryText}
                reason="threshold"
              />
            );
          }

          return (
            <MessageBubble
              key={index}
              message={msg}
              isStreaming={isStreaming && index === messages.length - 1}
            />
          );
        })}
      </div>

      {showScrollBottom && (
        <div className="absolute bottom-4 right-6 z-10">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => scrollToBottom(true)}
            className="rounded-full shadow-md flex items-center gap-1.5 text-xs py-1 px-3 bg-card border border-border hover:bg-muted text-foreground"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>맨 아래로</span>
          </Button>
        </div>
      )}
    </div>
  );
}
