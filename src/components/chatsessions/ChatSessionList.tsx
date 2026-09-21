import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useChatSessions } from '@/lib/context/ChatSessionsContext';
import type { ChatSession } from '@/lib/types/chat';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 60 * 1000) return '방금 전';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
    if (diff < 24 * 60 * 60 * 1000)
      return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;

    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ChatSessionList() {
  const { openTab, closeTab, activeTabId } = useWorkspaceTabs();
  const {
    sessions,
    isLoading,
    createSession,
    deleteSession,
    selectSession,
  } = useChatSessions();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleNewChat = async () => {
    let sessionId = `${Date.now()}`;
    let title = '새로운 대화';
    try {
      const session = await createSession();
      sessionId = session.id;
      title = session.title;
    } catch (err) {
      console.error('Failed to create new chat session in DB, opening tab with fallback:', err);
    }
    openTab({
      type: 'chat',
      id: `chat:${sessionId}`,
      title,
      meta: { sessionId },
    });
  };

  const handleSelectSession = (session: ChatSession) => {
    selectSession(session.id);
    openTab({
      type: 'chat',
      id: `chat:${session.id}`,
      title: session.title,
      meta: { sessionId: session.id },
    });
  };

  const handleDeleteSession = async (
    e: React.MouseEvent,
    sessionId: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm('대화 기록을 삭제하시겠습니까? (복구할 수 없습니다)')) {
      return;
    }

    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      closeTab(`chat:${sessionId}`);
    } catch (err) {
      console.error('Failed to delete chat session:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          대화 목록
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-foreground hover:text-primary"
          onClick={() => void handleNewChat()}
          title="새 대화 시작"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>대화 목록 불러오는 중...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">대화 세션이 없습니다</p>
            <p className="text-[11px] opacity-70 mt-1">
              새 대화를 시작하여 로컬 AI와 소통해보세요.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => void handleNewChat()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />새 대화 시작
            </Button>
          </div>
        ) : (
          sessions.map((session) => {
            const isTabActive = activeTabId === `chat:${session.id}`;
            const isDeleting = deletingId === session.id;

            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectSession(session)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSelectSession(session);
                  }
                }}
                className={`group relative flex items-start justify-between rounded-lg p-2.5 text-xs transition-colors cursor-pointer border ${
                  isTabActive
                    ? 'bg-accent text-accent-foreground border-border font-medium shadow-xs'
                    : 'text-foreground hover:bg-muted/60 border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 opacity-60" />
                      {formatDate(session.updatedAt)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  onClick={(e) => void handleDeleteSession(e, session.id)}
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity shrink-0"
                  title="세션 삭제"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChatSessionList;
