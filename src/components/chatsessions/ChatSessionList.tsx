import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';

// TODO(Phase4): wire to ChatSessionsContext & SQLite repository

export function ChatSessionList() {
  const { openTab } = useWorkspaceTabs();

  const handleNewChat = () => {
    openTab({
      type: 'chat',
      id: `chat:${Date.now()}`,
      title: '새 채팅',
    });
  };

  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          대화 목록
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleNewChat}
          title="새 대화 시작"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-xs font-medium">대화 세션 목록</p>
        <p className="text-[11px] opacity-70 mt-1">
          (Phase 4에서 SQLite 영속 세션으로 연결됩니다)
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 text-xs"
          onClick={handleNewChat}
        >
          새 채팅 열기
        </Button>
      </div>
    </div>
  );
}

export default ChatSessionList;
