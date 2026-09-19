import { Bot, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useChatSessions } from '@/lib/context/ChatSessionsContext';
import { AgentCard } from './AgentCard';
import type { Agent } from '@/lib/types/agent';

export function AgentListPanel() {
  const { agents, loading, setDefaultAgent, deleteAgent } = useAgents();
  const { openTab } = useWorkspaceTabs();
  const { createSession } = useChatSessions();

  const handleCreateAgent = () => {
    openTab({
      id: `agent-editor:new-${Date.now()}`,
      type: 'agent-editor',
      title: '새 에이전트',
    });
  };

  const handleStartChat = async (agent: Agent) => {
    try {
      const session = await createSession({
        title: `${agent.name} 대화`,
        agentId: agent.id,
      });
      openTab({
        id: session.id,
        type: 'chat',
        title: session.title,
        meta: { agentId: agent.id },
      });
    } catch (err) {
      console.error('Failed to start chat with agent:', err);
    }
  };

  const handleShowStats = (agent: Agent) => {
    openTab({
      id: `agent-stats:${agent.id}`,
      type: 'agent-stats',
      title: `${agent.name} 통계`,
      meta: { agentId: agent.id, view: 'stats' },
    });
  };

  const handleShowLogs = (agent: Agent) => {
    openTab({
      id: `agent-logs:${agent.id}`,
      type: 'agent-stats',
      title: `${agent.name} 로그`,
      meta: { agentId: agent.id, view: 'logs' },
    });
  };

  const handleEditAgent = (agent: Agent) => {
    openTab({
      id: `agent-editor:${agent.id}`,
      type: 'agent-editor',
      title: `${agent.name} 편집`,
      meta: { agentId: agent.id },
    });
  };

  const handleSetDefault = async (agent: Agent) => {
    try {
      await setDefaultAgent(agent.id);
    } catch (err) {
      console.error('Failed to set default agent:', err);
    }
  };

  const handleDelete = async (agent: Agent) => {
    try {
      await deleteAgent(agent.id);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          에이전트 관리
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={handleCreateAgent}
          title="새 에이전트 추가"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            에이전트 목록 불러오는 중...
          </div>
        ) : agents.length === 0 ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Bot className="h-5 w-5 opacity-50" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">등록된 에이전트가 없습니다</p>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                나만의 페르소나와 시스템 프롬프트, 도구 구성을 갖춘 첫 에이전트를 만들어보세요.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleCreateAgent}
              className="text-xs flex items-center gap-1.5 mt-2 bg-primary text-primary-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>첫 에이전트 만들기</span>
            </Button>
          </div>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isOnlyAgent={agents.length <= 1}
              onStartChat={handleStartChat}
              onShowStats={handleShowStats}
              onShowLogs={handleShowLogs}
              onEdit={handleEditAgent}
              onSetDefault={handleSetDefault}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default AgentListPanel;
