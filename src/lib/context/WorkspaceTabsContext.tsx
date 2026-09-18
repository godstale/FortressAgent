import React, { createContext, useCallback, useContext, useState } from 'react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

// TODO(Phase4): persist to SQLite

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

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | undefined>(undefined);

let tabCounter = 0;
function generateTabId(type: string): string {
  tabCounter += 1;
  return `${type}:${Date.now()}-${tabCounter}`;
}

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback((tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => {
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
  }, []);

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

  const updateTab = useCallback((id: string, patch: Partial<Omit<WorkspaceTab, 'id'>>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

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
  const ctx = useContext(WorkspaceTabsContext);
  if (!ctx) {
    throw new Error('useWorkspaceTabs must be used within a WorkspaceTabsProvider');
  }
  return ctx;
}
