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
import { useSafeWorkspace } from './WorkspaceContext';

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
  const workspace = useSafeWorkspace();
  const hasWorkspaceContext = workspace !== null;
  const workspaceRoot = workspace?.workspaceRoot ?? null;

  const [internalTabs, setInternalTabs] = useState<WorkspaceTab[]>([]);
  const [internalActiveTabId, setInternalActiveTabId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isWithoutWorkspace = hasWorkspaceContext && !workspaceRoot;
  const tabs = isWithoutWorkspace ? [] : internalTabs;
  const activeTabId = isWithoutWorkspace ? null : internalActiveTabId;

  // Restore saved tabs from app_settings on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const settings = await settingsRepo.getSettings();
        if (active && (!hasWorkspaceContext || workspaceRoot)) {
          if (settings.openTabs && settings.openTabs.length > 0) {
            setInternalTabs(settings.openTabs);
            setInternalActiveTabId(settings.activeTabId ?? settings.openTabs[0].id);
          } else {
            setInternalTabs([]);
            setInternalActiveTabId(null);
          }
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
  }, [hasWorkspaceContext, workspaceRoot]);

  // 500ms debounced persistence to app_settings
  useEffect(() => {
    if (!isLoaded || isWithoutWorkspace) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void settingsRepo.updateSettings({
        openTabs: internalTabs,
        activeTabId: internalActiveTabId,
      });
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [internalTabs, internalActiveTabId, isLoaded, isWithoutWorkspace]);

  const openTab = useCallback(
    (tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => {
      if (hasWorkspaceContext && !workspaceRoot) {
        return '';
      }
      const targetId = tab.id ?? generateTabId(tab.type);

      setInternalTabs((prev) => {
        const existing = prev.find((t) => t.id === targetId);
        if (existing) {
          return prev;
        }
        return [...prev, { ...tab, id: targetId }];
      });

      setInternalActiveTabId(targetId);
      return targetId;
    },
    [hasWorkspaceContext, workspaceRoot],
  );

  const closeTab = useCallback((id: string) => {
    setInternalTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setInternalActiveTabId((current) => {
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
    setInternalTabs((prev) => {
      const next = prev.filter((t) => !idSet.has(t.id));
      setInternalActiveTabId((current) => {
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
    setInternalTabs([]);
    setInternalActiveTabId(null);
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setInternalActiveTabId(id);
  }, []);

  const updateTab = useCallback(
    (id: string, patch: Partial<Omit<WorkspaceTab, 'id'>>) => {
      setInternalTabs((prev) =>
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
