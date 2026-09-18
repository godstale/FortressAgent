import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import type { AgentMessage } from '@/lib/agent/types';
import { ToolCallCard } from './ToolCallCard';

export interface MessageBubbleProps {
  message: AgentMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const handleCopy = () => {
    let textToCopy = '';
    if ('content' in message) {
      textToCopy = message.content;
    }
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (message.role === 'system') {
    return (
      <div className="py-2 text-center text-[11px] text-muted-foreground font-mono">
        <span className="px-2 py-0.5 rounded-full bg-muted/60">
          시스템 프롬프트 설정됨
        </span>
      </div>
    );
  }

  if (message.role === 'toolResult') {
    return (
      <div className="max-w-3xl w-full my-1">
        <ToolCallCard
          toolName={message.toolName || 'tool'}
          result={message.content}
          isError={message.isError}
        />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end my-3 w-full">
        <div className="flex items-start gap-2.5 max-w-[85%] md:max-w-2xl">
          <div className="relative group p-3.5 rounded-2xl bg-primary text-primary-foreground text-sm leading-relaxed shadow-sm">
            <p className="whitespace-pre-wrap select-text">{message.content}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
              title="복사"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3 my-3 w-full group">
      <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
        <Bot className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 max-w-3xl space-y-2">
        {/* Thinking collapsible if available */}
        {message.thinking && (
          <div className="border border-border/70 rounded-lg bg-muted/20 text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowThinking((prev) => !prev)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground text-left"
            >
              {showThinking ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Brain className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-medium text-[11px]">생각 과정</span>
            </button>
            {showThinking && (
              <div className="px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/50 max-h-60 overflow-y-auto">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Markdown content */}
        {message.content ? (
          <div className="relative text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary animate-pulse" />
            )}
          </div>
        ) : (
          isStreaming && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>답변을 생성하고 있습니다...</span>
            </div>
          )
        )}

        {/* Tool calls requested by assistant */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 pt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                toolName={tc.name}
                args={tc.arguments}
                isLoading={isStreaming}
              />
            ))}
          </div>
        )}

        {/* Action bar on hover */}
        {message.content && (
          <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? '복사됨' : '복사'}</span>
            </button>
            {message.usage && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                {message.usage.total} tokens ({message.usage.input} in / {message.usage.output} out)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
