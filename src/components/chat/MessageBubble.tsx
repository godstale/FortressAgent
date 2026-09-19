import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, ChevronDown, ChevronRight, Brain, Clock, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { AgentMessage } from '@/lib/agent/types';
import { ToolCallCard } from './ToolCallCard';
import { MermaidViewer } from './MermaidViewer';
import { RechartsViewer } from './RechartsViewer';
import { CodeViewer } from './CodeViewer';

export interface MessageBubbleProps {
  message: AgentMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const handleCopy = () => {
    let textToCopy = '';
    if ('content' in message && typeof message.content === 'string') {
      textToCopy = message.content;
    }
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const timeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.role === 'system') {
    return (
      <div className="py-2 text-center text-[11px] text-muted-foreground font-mono">
        <span className="px-2 py-0.5 rounded-full bg-muted/60">
          시스템 프롬프트 설정됨
        </span>
      </div>
    );
  }

  // ToolResult messages: render as compact tool execution cards
  if (message.role === 'toolResult') {
    return (
      <div className="max-w-3xl w-full my-1 pl-10">
        <ToolCallCard
          toolName={message.toolName || 'tool'}
          result={message.content}
          isError={message.isError}
        />
      </div>
    );
  }

  // User Message
  if (message.role === 'user') {
    return (
      <div className="flex justify-end my-3 w-full">
        <div className="flex items-start gap-2.5 max-w-[85%] md:max-w-2xl">
          <div className="flex flex-col items-end gap-1">
            <div className="p-3.5 rounded-2xl bg-primary text-primary-foreground text-sm leading-relaxed shadow-xs">
              <p className="whitespace-pre-wrap select-text">{message.content}</p>
            </div>
            {/* Bubble Footer: Time & Copy outside */}
            <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-70" />
                <span>{timeFormatted}</span>
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="복사"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? '복사됨' : '복사'}</span>
              </button>
            </div>
          </div>
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }

  const hasToolCalls = Boolean(message.toolCalls && message.toolCalls.length > 0);
  const hasContent = Boolean(message.content && message.content.trim().length > 0);
  const hasThinking = Boolean(message.thinking && message.thinking.trim().length > 0);
  const hasError = Boolean(message.errorMessage);

  // Skip rendering if assistant message is completely empty and done
  if (!hasContent && !hasThinking && !hasToolCalls && !hasError && !isStreaming) {
    return null;
  }

  // Case 1: Only tool calls, no text content yet (e.g. Turn 1 tool calling action)
  // Render tool call items OUTSIDE any bubble card as standalone agent action items
  if (hasToolCalls && !hasContent && !isStreaming && !hasError && !hasThinking) {
    return (
      <div className="max-w-3xl w-full my-1 pl-10 space-y-1.5">
        {message.toolCalls!.map((tc) => (
          <ToolCallCard
            key={tc.id}
            toolCall={tc}
            toolName={tc.name}
            args={tc.arguments}
            isLoading={false}
          />
        ))}
      </div>
    );
  }

  // Case 2: Final response content (or active streaming response)
  // Tool call items are displayed outside, and the bubble card contains only the final text result
  return (
    <div className="space-y-2 my-3 w-full">
      {/* Standalone Tool Calls outside bubble card if present */}
      {hasToolCalls && (
        <div className="max-w-3xl w-full pl-10 space-y-1.5 mb-1.5">
          {message.toolCalls!.map((tc) => (
            <ToolCallCard
              key={tc.id}
              toolCall={tc}
              toolName={tc.name}
              args={tc.arguments}
              isLoading={isStreaming && !hasContent}
            />
          ))}
        </div>
      )}

      {/* Assistant Bubble Card: Contains only user-facing final result */}
      {(hasContent || hasThinking || hasError || isStreaming) && (
        <div className="flex items-start gap-3 w-full group">
          <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
            <Bot className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0 max-w-3xl">
            <div className="p-4 rounded-xl border border-border/80 bg-card/80 shadow-xs space-y-3">
              {/* Working Progress Indicator if streaming and no content yet */}
              {isStreaming && !hasContent && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span>에이전트가 작업 중입니다... (Ollama 모델 연산 중)</span>
                </div>
              )}

              {/* Thinking collapsible if available */}
              {message.thinking && (
                <div className="border border-border/70 rounded-lg bg-muted/20 text-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowThinking((prev) => !prev)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground text-left cursor-pointer"
                  >
                    {showThinking ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Brain className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-medium text-[11px]">생각 과정 (Thinking)</span>
                  </button>
                  {showThinking && (
                    <div className="px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/50 max-h-60 overflow-y-auto">
                      {message.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Final Markdown content */}
              {message.content ? (
                <div className="relative text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1].toLowerCase() : '';
                        const codeString = String(children).replace(/\n$/, '');
                        const isInline = !match && !codeString.includes('\n');

                        if (language === 'mermaid') {
                          return <MermaidViewer code={codeString} />;
                        }
                        if (language === 'recharts') {
                          return <RechartsViewer code={codeString} />;
                        }

                        if (isInline) {
                          return (
                            <code
                              className="px-1.5 py-0.5 mx-0.5 rounded-md bg-muted/80 font-mono text-[12px] text-primary border border-border/50"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }

                        return (
                          <CodeViewer
                            code={codeString}
                            language={language || 'text'}
                          />
                        );
                      },
                      a({ href, children, ...props }) {
                        return (
                          <a
                            href={href}
                            onClick={(e) => {
                              if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                e.preventDefault();
                                invoke('open_in_browser', { url: href }).catch((err) => {
                                  console.error('Failed to open in browser:', err);
                                });
                              }
                            }}
                            className="text-primary underline hover:opacity-80 cursor-pointer"
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary animate-pulse" />
                  )}
                </div>
              ) : (
                isStreaming && (
                  <div className="text-xs text-muted-foreground italic">
                    답변을 작성하고 있습니다...
                  </div>
                )
              )}

              {/* Error Message if any */}
              {message.errorMessage && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{message.errorMessage}</span>
                </div>
              )}
            </div>

            {/* Bubble Footer outside: Time, Token stats, Copy button */}
            <div className="flex items-center justify-between px-1 pt-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground/60" />
                  <span>{timeFormatted}</span>
                </span>
                {message.usage && (
                  <span className="text-muted-foreground/60 hidden sm:inline">
                    • {message.usage.total} tokens ({message.usage.input} in / {message.usage.output} out)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-muted/70 cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? '복사됨' : '복사'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
