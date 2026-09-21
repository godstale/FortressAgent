import { useRef, useEffect } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { TopMenuBar } from '@/components/layout/TopMenuBar';
import { ActivityBar } from '@/components/layout/ActivityBar';
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { SidePanel } from '@/components/sidepanel/SidePanel';
import { CenterWorkspace } from '@/components/workspace/CenterWorkspace';
import { SidePanelProvider, useSidePanel } from '@/lib/context/SidePanelContext';
import { WorkspaceTabsProvider, useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { WorkspaceProvider, useWorkspace } from '@/lib/context/WorkspaceContext';
import { SkillsProvider } from '@/lib/context/SkillsContext';
import { AgentsProvider } from '@/lib/context/AgentsContext';
import { ChatSessionsProvider } from '@/lib/context/ChatSessionsContext';
import { TrustWorkspaceDialog } from '@/components/workspace/TrustWorkspaceDialog';
import { ApprovalDialog } from '@/components/chat/ApprovalDialog';
import type { SidePanelView } from '@/lib/types/workspaceTab';

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function WorkspaceContent() {
  useKeyboardShortcuts();
  const { workspaceRoot } = useWorkspace();
  const { activeView, setActiveView } = useSidePanel();
  const { tabs, openTab, isTabsLoaded } = useWorkspaceTabs();
  const sidePanelRef = useRef<ImperativePanelHandle | null>(null);
  const autoOpenedRef = useRef(false);

  // Automatically open a default chat tab on startup if workspaceRoot exists and no tabs after restoration
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!isTabsLoaded) return;
    if (workspaceRoot && tabs.length === 0) {
      autoOpenedRef.current = true;
      const newId = `chat:${Date.now()}`;
      openTab({
        type: 'chat',
        id: newId,
        title: '새 채팅',
        meta: { sessionId: newId.slice(5) },
      });
    }
  }, [isTabsLoaded, openTab, tabs.length, workspaceRoot]);

  // When no workspaceRoot, make sure side panel is on explorer and expanded
  useEffect(() => {
    if (!workspaceRoot) {
      setActiveView('explorer');
      if (sidePanelRef.current?.isCollapsed()) {
        sidePanelRef.current.expand();
      }
    }
  }, [workspaceRoot, setActiveView]);

  const handleActivityBarSelect = (view: Exclude<SidePanelView, null>) => {
    if (!workspaceRoot) {
      // Cannot select other menus when no folder is selected
      if (view !== 'explorer') return;
      if (sidePanelRef.current?.isCollapsed()) {
        sidePanelRef.current.expand();
      }
      setActiveView('explorer');
      return;
    }
    const panel = sidePanelRef.current;
    if (!panel) return;
    if (activeView === view && !panel.isCollapsed()) {
      panel.collapse();
      setActiveView(null);
    } else {
      if (panel.isCollapsed()) {
        panel.expand();
      }
      setActiveView(view);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <TopMenuBar />
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <ActivityBar
          activeView={activeView}
          onSelect={handleActivityBarSelect}
        />
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <WorkspaceLayout
            sidePanelRef={sidePanelRef}
            sidePanel={<SidePanel activeView={activeView} />}
            centerWorkspace={<CenterWorkspace />}
          />
        </div>
      </div>
    </div>
  );
}

export function Workspace() {
  return (
    <WorkspaceProvider>
      <SkillsProvider>
        <AgentsProvider>
          <ChatSessionsProvider>
            <WorkspaceTabsProvider>
              <SidePanelProvider>
                <WorkspaceContent />
                <TrustWorkspaceDialog />
                <ApprovalDialog />
              </SidePanelProvider>
            </WorkspaceTabsProvider>
          </ChatSessionsProvider>
        </AgentsProvider>
      </SkillsProvider>
    </WorkspaceProvider>
  );
}

export default Workspace;
