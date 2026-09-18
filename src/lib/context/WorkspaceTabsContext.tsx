import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
} from 'react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import * as settingsRepo from '@/lib/db/repositories/settingsRepo';

export interface WorkspaceTabsContextValue {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  openTab: (tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => string;
  closeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Omit<WorkspaceTab, 'id'>>) => void;
}

const WorkspaceTabsContext = createContext<
  WorkspaceTabsContextValue | undefined
>(undefined);

let tabCounter = 0;
function generateTabId(type: string): string {
  tabCounter += 1;
  return `${type}:${Date.now()}-${tabCounter}`;
}

export function WorkspaceTabsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Restore saved tabs from app_settings on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const settings = await settingsRepo.getSettings();
        if (active && settings.openTabs && settings.openTabs.length > 0) {
          setTabs(settings.openTabs);
          setActiveTabId(settings.activeTabId ?? settings.openTabs[0].id);
        }
      } catch (err) {
        console.error('Failed to restore workspace tabs:', err);
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 500ms debounced persistence to app_settings
  useEffect(() => {
    if (!isLoaded) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void settingsRepo.updateSettings({
        openTabs: tabs,
        activeTabId,
      });
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tabs, activeTabId, isLoaded]);

  const openTab = useCallback(
    (tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => {
      const targetId = tab.id ?? generateTabId(tab.type);

      setTabs((prev) => {
        const existing = prev.find((t) => t.id === targetId);
        if (existing) {
          return prev;
        }
        return [...prev, { ...tab, id: targetId }];
      });

      setActiveTabId(targetId);
      return targetId;
    },
    [],
  );

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        const closedIndex = prev.findIndex((t) => t.id === id);
        const fallback = next[closedIndex] ?? next[closedIndex - 1] ?? next[0];
        return fallback ? fallback.id : null;
      });
      return next;
    });
  }, []);

  const closeTabs = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTabs((prev) => {
      const next = prev.filter((t) => !idSet.has(t.id));
      setActiveTabId((current) => {
        if (!current || !idSet.has(current)) return current;
        const closedIndex = prev.findIndex((t) => t.id === current);
        let fallback: string | null = null;
        let minDiff = Infinity;
        for (let i = 0; i < prev.length; i++) {
          const tab = prev[i];
          if (!idSet.has(tab.id)) {
            const diff = Math.abs(i - closedIndex);
            if (diff < minDiff) {
              minDiff = diff;
              fallback = tab.id;
            }
          }
        }
        return fallback;
      });
      return next;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateTab = useCallback(
    (id: string, patch: Partial<Omit<WorkspaceTab, 'id'>>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  return (
    <WorkspaceTabsContext.Provider
      value={{
        tabs,
        activeTabId,
        openTab,
        closeTab,
        closeTabs,
        closeAllTabs,
        setActiveTab,
        updateTab,
      }}
    >
      {children}
    </WorkspaceTabsContext.Provider>
  );
}

export function useWorkspaceTabs(): WorkspaceTabsContextValue {
  const context = useContext(WorkspaceTabsContext);
  if (!context) {
    throw new Error(
      'useWorkspaceTabs must be used within a WorkspaceTabsProvider',
    );
  }
  return context;
}
