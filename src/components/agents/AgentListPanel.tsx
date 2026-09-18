import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// TODO(Phase6): wire to AgentsContext

export function AgentListPanel() {
  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          에이전트 관리
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled
          title="에이전트 추가"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center text-muted-foreground">
        <Bot className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-xs font-medium">에이전트 프리셋 목록</p>
        <p className="text-[11px] opacity-70 mt-1">
          (Phase 6에서 에이전트 관리 UI로 연결됩니다)
        </p>
      </div>
    </div>
  );
}

export default AgentListPanel;
