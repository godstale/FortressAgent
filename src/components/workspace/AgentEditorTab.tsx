import { useState } from 'react';
import { Bot, CheckCircle2 } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { Agent } from '@/lib/types/agent';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { AgentEditorForm } from '@/components/agents/AgentEditorForm';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t } = useLanguage();

  const handleSave = (saved: Agent) => {
    updateTab(tab.id, {
      title: t('agentList.edit', { name: saved.name }),
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
                ? t('agentEditor.editTitle', { name: existingAgent.name })
                : t('agentEditor.createTitle')}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {mode === 'edit'
                ? t('agentEditor.editDesc')
                : t('agentEditor.createDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveFeedback && (
            <span className="flex items-center gap-1 text-xs text-success font-medium animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{t('agentEditor.saved')}</span>
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
