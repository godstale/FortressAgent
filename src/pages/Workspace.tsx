import { useRef, useEffect } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ActivityBar } from '@/components/layout/ActivityBar';
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { SidePanel } from '@/components/sidepanel/SidePanel';
import { CenterWorkspace } from '@/components/workspace/CenterWorkspace';
import { SidePanelProvider, useSidePanel } from '@/lib/context/SidePanelContext';
import { WorkspaceTabsProvider, useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import type { SidePanelView } from '@/lib/types/workspaceTab';

function WorkspaceContent() {
  const { activeView, setActiveView } = useSidePanel();
  const { tabs, openTab } = useWorkspaceTabs();
  const sidePanelRef = useRef<ImperativePanelHandle | null>(null);
  const autoOpenedRef = useRef(false);

  // P1-08: Automatically open a default chat tab on initial startup if no tabs are open
  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (tabs.length === 0) {
      openTab({ type: 'chat', id: 'chat:default', title: '새 채팅' });
    }
  }, [openTab, tabs.length]);

  const handleActivityBarSelect = (view: Exclude<SidePanelView, null>) => {
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
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
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
  );
}

export function Workspace() {
  return (
    <WorkspaceTabsProvider>
      <SidePanelProvider>
        <WorkspaceContent />
      </SidePanelProvider>
    </WorkspaceTabsProvider>
  );
}

export default Workspace;
