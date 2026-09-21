import { useState } from 'react';
import { Bot, CheckCircle2 } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { Agent } from '@/lib/types/agent';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { AgentEditorForm } from '@/components/agents/AgentEditorForm';

export interface AgentEditorTabProps {
  tab: WorkspaceTab;
}

export function AgentEditorTab({ tab }: AgentEditorTabProps) {
  const { getAgent } = useAgents();
  const { updateTab, closeTab } = useWorkspaceTabs();

  const rawId = (tab.meta?.agentId as string | undefined) ||
    (tab.id.startsWith('agent-editor:') ? tab.id.slice('agent-editor:'.length) : undefined);
  const isNew = !rawId || rawId.startsWith('new-');
  const existingAgent = isNew ? undefined : getAgent(rawId);
  const mode: 'create' | 'edit' = existingAgent ? 'edit' : (isNew ? 'create' : 'edit');

  const [saveFeedback, setSaveFeedback] = useState(false);

  const handleSave = (saved: Agent) => {
    updateTab(tab.id, {
      title: `${saved.name} 편집`,
      meta: { agentId: saved.id },
    });
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 3000);
  };

  const handleCancel = () => {
    closeTab(tab.id);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {mode === 'edit' && existingAgent
                ? `에이전트 편집: ${existingAgent.name}`
                : '새 에이전트 생성'}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {mode === 'edit'
                ? '페르소나 프롬프트 및 도구/스킬 구성을 수정합니다.'
                : '새로운 시스템 프롬프트와 파라미터를 가진 에이전트를 추가합니다.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveFeedback && (
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>저장되었습니다</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <AgentEditorForm
          mode={mode}
          initialAgent={existingAgent}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

export default AgentEditorTab;
