import { useState } from 'react';
import {
  MessageSquare,
  FileCode,
  Image as ImageIcon,
  Bot,
  Puzzle,
  Activity,
  X,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import type { WorkspaceTabType } from '@/lib/types/workspaceTab';
import { ChatTab } from '@/components/workspace/ChatTab';
import { EditorTab } from '@/components/workspace/EditorTab';
import { ImageViewerTab } from '@/components/workspace/ImageViewerTab';
import { SkillViewerTab } from '@/components/workspace/SkillViewerTab';
import { AgentEditorTab } from '@/components/workspace/AgentEditorTab';
import { AgentStatsTab } from '@/components/workspace/AgentStatsTab';
import { AgentMonitorTab } from '@/components/workspace/AgentMonitorTab';
import { WelcomeGuide } from '@/components/workspace/WelcomeGuide';
import { cn } from '@/lib/utils';

const TAB_ICONS: Record<WorkspaceTabType, LucideIcon> = {
  chat: MessageSquare,
  editor: FileCode,
  'image-viewer': ImageIcon,
  'agent-editor': Bot,
  'agent-stats': Activity,
  'agent-monitor': Activity,
  'skill-viewer': Puzzle,
};

export function CenterWorkspace() {
  const { workspaceRoot } = useWorkspace();
  const { tabs, activeTabId, setActiveTab, closeTab, closeTabs, closeAllTabs, openTab } =
    useWorkspaceTabs();

  const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenuTabId(tabId);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleNewChat = () => {
    if (!workspaceRoot) return;
    openTab({
      type: 'chat',
      id: `chat:${Date.now()}`,
      title: '새 채팅',
    });
  };

  const handleCloseOthers = (targetId: string) => {
    const otherIds = tabs.filter((t) => t.id !== targetId).map((t) => t.id);
    closeTabs(otherIds);
  };

  const handleCloseToRight = (targetId: string) => {
    const targetIdx = tabs.findIndex((t) => t.id === targetId);
    if (targetIdx !== -1) {
      const rightIds = tabs.slice(targetIdx + 1).map((t) => t.id);
      if (rightIds.length > 0) {
        closeTabs(rightIds);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-background overflow-hidden">
      {/* Tab Strip (Multi-line row wrap, no horizontal scrolling) */}
      <div className="min-h-9.5 shrink-0 flex flex-wrap items-center bg-card/60 border-b border-border select-none p-0">
        <div className="flex flex-wrap items-center min-w-0 flex-1">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.type] || FileCode;
            const isActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
                className={cn(
                  'h-9.5 flex items-center gap-2 px-3.5 text-xs border-r border-b border-border/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors max-w-[15rem] shrink-0 relative group',
                  isActive
                    ? 'bg-background text-foreground font-medium border-t-2 border-t-primary border-b-transparent shadow-xs'
                    : 'hover:bg-accent/40',
                )}
                title={tab.title}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className="truncate py-0.5">{tab.title}</span>
                <button
                  type="button"
                  aria-label="탭 닫기"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-1 p-1 rounded-sm opacity-60 hover:opacity-100 hover:bg-muted shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {/* Action button */}
          <div className="px-2 py-1 shrink-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              disabled={!workspaceRoot}
              className={cn(
                'h-7 w-7 transition-colors',
                !workspaceRoot
                  ? 'text-muted-foreground/30 cursor-not-allowed hover:bg-transparent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={handleNewChat}
              title={workspaceRoot ? '새 채팅 탭 열기' : '폴더를 먼저 선택해주세요'}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Floating Context Menu */}
      {contextMenuTabId && contextMenuPos && (
        <DropdownMenu
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setContextMenuTabId(null);
              setContextMenuPos(null);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              className="fixed w-0 h-0 pointer-events-none"
              style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-36 text-xs">
            <DropdownMenuItem onClick={() => closeTab(contextMenuTabId)}>
              닫기
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                tabs.findIndex((t) => t.id === contextMenuTabId) === tabs.length - 1
              }
              onClick={() => handleCloseToRight(contextMenuTabId)}
            >
              우측 탭 닫기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCloseOthers(contextMenuTabId)}>
              다른 탭 닫기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => closeAllTabs()}>
              모든 탭 닫기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Content Area - Mounted Tabs */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {!workspaceRoot ? (
          <WelcomeGuide />
        ) : tabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-center text-muted-foreground gap-3">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-xs">열려 있는 탭이 없습니다.</p>
            <Button size="sm" onClick={handleNewChat} className="text-xs">
              새 채팅 시작
            </Button>
          </div>
        ) : (
          tabs.map((tab) => {
            const isHidden = tab.id !== activeTabId;
            return (
              <div
                key={tab.id}
                className={cn('absolute inset-0 h-full w-full', isHidden && 'hidden')}
              >
                {tab.type === 'chat' && <ChatTab tab={tab} />}
                {tab.type === 'editor' && <EditorTab tab={tab} />}
                {tab.type === 'image-viewer' && <ImageViewerTab tab={tab} />}
                {tab.type === 'agent-editor' && <AgentEditorTab tab={tab} />}
                {tab.type === 'agent-stats' && <AgentStatsTab tab={tab} />}
                {tab.type === 'agent-monitor' && <AgentMonitorTab tab={tab} />}
                {tab.type === 'skill-viewer' && <SkillViewerTab tab={tab} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CenterWorkspace;
