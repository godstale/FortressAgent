import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import * as settingsRepo from '@/lib/db/repositories/settingsRepo';

const TRUST_STORAGE_KEY = 'fortress_trusted_workspaces';

function getStoredTrustMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TRUST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTrustMap(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(TRUST_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export interface WorkspaceContextValue {
  workspaceRoot: string | null;
  setWorkspaceRoot: (root: string | null) => void;
  isTrusted: boolean;
  trustModalOpen: boolean;
  setTrustModalOpen: (open: boolean) => void;
  trustCurrentWorkspace: () => void;
  rejectCurrentWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceRoot, setWorkspaceRootState] = useState<string | null>(() => {
    return localStorage.getItem('fortress_current_workspace_root');
  });

  const [trustModalOpen, setTrustModalOpen] = useState<boolean>(() => {
    const initialRoot = localStorage.getItem('fortress_current_workspace_root');
    if (!initialRoot) return false;
    const map = getStoredTrustMap();
    return map[initialRoot] === undefined;
  });

  const [isTrusted, setIsTrusted] = useState<boolean>(() => {
    const initialRoot = localStorage.getItem('fortress_current_workspace_root');
    if (!initialRoot) return false;
    const map = getStoredTrustMap();
    return Boolean(map[initialRoot]);
  });

  // Load and sync from app_settings (P4-05 migration from localStorage)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const settings = await settingsRepo.getSettings();
        if (active && settings.trustedWorkspaces) {
          const map = getStoredTrustMap();
          let changed = false;
          for (const ws of settings.trustedWorkspaces) {
            if (!map[ws]) {
              map[ws] = true;
              changed = true;
            }
          }
          if (changed) {
            saveTrustMap(map);
          }
          if (workspaceRoot && settings.trustedWorkspaces.includes(workspaceRoot)) {
            setIsTrusted(true);
            setTrustModalOpen(false);
          }
        }
      } catch (err) {
        console.error('Failed to sync trusted workspaces from app_settings:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceRoot]);

  const setWorkspaceRoot = useCallback((root: string | null) => {
    setWorkspaceRootState(root);
    if (root) {
      localStorage.setItem('fortress_current_workspace_root', root);
      const map = getStoredTrustMap();
      if (map[root] !== undefined) {
        setIsTrusted(map[root]);
        setTrustModalOpen(false);
      } else {
        setIsTrusted(false);
        setTrustModalOpen(true);
      }
      void settingsRepo.updateSettings({ lastWorkspaceRoot: root });
    } else {
      localStorage.removeItem('fortress_current_workspace_root');
      setIsTrusted(false);
      setTrustModalOpen(false);
      void settingsRepo.updateSettings({ lastWorkspaceRoot: null });
    }
  }, []);

  const trustCurrentWorkspace = useCallback(() => {
    if (!workspaceRoot) return;
    const map = getStoredTrustMap();
    map[workspaceRoot] = true;
    saveTrustMap(map);
    setIsTrusted(true);
    setTrustModalOpen(false);

    // Sync to SQLite app_settings
    void (async () => {
      try {
        const current = await settingsRepo.getSettings();
        const next = Array.from(new Set([...current.trustedWorkspaces, workspaceRoot]));
        await settingsRepo.updateSettings({ trustedWorkspaces: next });
      } catch {
        // ignore
      }
    })();
  }, [workspaceRoot]);

  const rejectCurrentWorkspace = useCallback(() => {
    if (!workspaceRoot) return;
    const map = getStoredTrustMap();
    map[workspaceRoot] = false;
    saveTrustMap(map);
    setIsTrusted(false);
    setTrustModalOpen(false);

    // Sync to SQLite app_settings
    void (async () => {
      try {
        const current = await settingsRepo.getSettings();
        const next = current.trustedWorkspaces.filter((w) => w !== workspaceRoot);
        await settingsRepo.updateSettings({ trustedWorkspaces: next });
      } catch {
        // ignore
      }
    })();
  }, [workspaceRoot]);

  const value = useMemo(
    () => ({
      workspaceRoot,
      setWorkspaceRoot,
      isTrusted,
      trustModalOpen,
      setTrustModalOpen,
      trustCurrentWorkspace,
      rejectCurrentWorkspace,
    }),
    [
      workspaceRoot,
      setWorkspaceRoot,
      isTrusted,
      trustModalOpen,
      trustCurrentWorkspace,
      rejectCurrentWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
