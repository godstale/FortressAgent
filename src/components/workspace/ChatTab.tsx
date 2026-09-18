import { useState } from 'react';
import { Bot, Cpu, Sparkles } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useChat } from '@/hooks/useChat';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ContextGauge } from '@/components/chat/ContextGauge';
import { ErrorBanner } from '@/components/chat/ErrorBanner';
import { ApprovalDialog } from '@/components/chat/ApprovalDialog';

export interface ChatTabProps {
  tab: WorkspaceTab;
}

export function ChatTab({ tab }: ChatTabProps) {
  const { getAgent, defaultAgent } = useAgents();
  const { updateTab } = useWorkspaceTabs();

  const tabAgentId = tab.meta?.agentId as string | undefined;
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    tabAgentId || defaultAgent.id,
  );

  const activeAgent = getAgent(selectedAgentId) || defaultAgent;

  const {
    messages,
    isStreaming,
    contextUsage,
    sendMessage,
    steer,
    stop,
    error,
    retry,
    compact,
  } = useChat(tab.id, activeAgent);

  const handleSelectAgent = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    updateTab(tab.id, {
      meta: { ...tab.meta, agentId: newAgentId },
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 text-xs shrink-0">
        <div className="flex items-center gap-2 font-medium min-w-0">
          <Bot className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">{tab.title}</span>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono shrink-0">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span className="font-semibold text-foreground">{activeAgent.name}</span>
            <span className="text-muted-foreground/60">•</span>
            <Cpu className="h-3 w-3" />
            <span>{activeAgent.model}</span>
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
          onCompact={compact}
          isStreaming={isStreaming}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          isAgentLocked={messages.length > 0}
        />
      </div>

      {/* Human-in-the-loop approval dialog */}
      <ApprovalDialog />
    </div>
  );
}

export default ChatTab;
