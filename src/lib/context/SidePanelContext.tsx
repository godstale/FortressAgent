import React, { createContext, useCallback, useContext, useState } from 'react';
import type { SidePanelView } from '@/lib/types/workspaceTab';

export interface SidePanelContextValue {
  activeView: SidePanelView;
  setActiveView: (view: SidePanelView) => void;
  toggleView: (view: Exclude<SidePanelView, null>) => void;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(undefined);

export function SidePanelProvider({
  children,
  initialView = 'chat-sessions',
}: {
  children: React.ReactNode;
  initialView?: SidePanelView;
}) {
  const [activeView, setActiveView] = useState<SidePanelView>(initialView);

  const toggleView = useCallback((view: Exclude<SidePanelView, null>) => {
    setActiveView((prev) => (prev === view ? null : view));
  }, []);

  return (
    <SidePanelContext.Provider value={{ activeView, setActiveView, toggleView }}>
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext);
  if (!ctx) {
    throw new Error('useSidePanel must be used within a SidePanelProvider');
  }
  return ctx;
}
