import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

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
    } else {
      localStorage.removeItem('fortress_current_workspace_root');
      setIsTrusted(false);
      setTrustModalOpen(false);
    }
  }, []);

  const trustCurrentWorkspace = useCallback(() => {
    if (!workspaceRoot) return;
    const map = getStoredTrustMap();
    map[workspaceRoot] = true;
    saveTrustMap(map);
    setIsTrusted(true);
    setTrustModalOpen(false);
  }, [workspaceRoot]);

  const rejectCurrentWorkspace = useCallback(() => {
    if (!workspaceRoot) return;
    const map = getStoredTrustMap();
    map[workspaceRoot] = false;
    saveTrustMap(map);
    setIsTrusted(false);
    setTrustModalOpen(false);
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
