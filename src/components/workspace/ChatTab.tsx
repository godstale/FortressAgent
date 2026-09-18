import { Bot, Cpu } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';
import { useChat } from '@/hooks/useChat';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ContextGauge } from '@/components/chat/ContextGauge';
import { ErrorBanner } from '@/components/chat/ErrorBanner';

export interface ChatTabProps {
  tab: WorkspaceTab;
}

export function ChatTab({ tab }: ChatTabProps) {
  const {
    messages,
    isStreaming,
    contextUsage,
    sendMessage,
    steer,
    stop,
    error,
    retry,
  } = useChat(tab.id, DEFAULT_AGENT);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 text-xs shrink-0">
        <div className="flex items-center gap-2 font-medium min-w-0">
          <Bot className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">{tab.title}</span>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono shrink-0">
            <Cpu className="h-3 w-3" />
            <span>{DEFAULT_AGENT.model}</span>
          </div>
        </div>

        <div className="shrink-0">
          <ContextGauge
            tokens={contextUsage.tokens}
            limit={contextUsage.limit}
          />
        </div>
      </div>

      {/* Error banner if present */}
      <ErrorBanner error={error} onRetry={retry} />

      {/* Message List */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Input area */}
      <div className="p-3 border-t border-border bg-card/20 shrink-0">
        <ChatInput
          onSend={sendMessage}
          onSteer={steer}
          onStop={stop}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
