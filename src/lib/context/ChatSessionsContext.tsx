import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { ChatSession } from '@/lib/types/chat';
import * as sessionsRepo from '@/lib/db/repositories/sessionsRepo';
import * as agentsRepo from '@/lib/db/repositories/agentsRepo';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';
import { useWorkspace } from '@/lib/context/WorkspaceContext';

export interface ChatSessionsContextValue {
  sessions: ChatSession[];
  isLoading: boolean;
  activeSessionId: string | null;
  refreshSessions: () => Promise<void>;
  createSession: (opts?: {
    title?: string;
    workspaceRoot?: string;
    agentId?: string;
  }) => Promise<ChatSession>;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;
  selectSession: (id: string | null) => void;
}

const ChatSessionsContext = createContext<ChatSessionsContextValue | null>(null);

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  const { workspaceRoot } = useWorkspace();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await sessionsRepo.listSessions();
      if (workspaceRoot) {
        // Show sessions matching this workspace root, or global sessions
        const workspaceSessions = list.filter(
          (s) => s.workspaceRoot === workspaceRoot || !s.workspaceRoot,
        );
        setSessions(workspaceSessions);
      } else {
        setSessions(list);
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) {
        await refreshSessions();
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshSessions]);

  const createSession = useCallback(
    async (opts?: {
      title?: string;
      workspaceRoot?: string;
      agentId?: string;
    }): Promise<ChatSession> => {
      let agentId = opts?.agentId;
      if (!agentId) {
        try {
          const def = await agentsRepo.getDefaultAgent();
          agentId = def?.id ?? DEFAULT_AGENT.id;
        } catch {
          agentId = DEFAULT_AGENT.id;
        }
      }

      const id = crypto.randomUUID();
      const newSession = await sessionsRepo.createSession({
        id,
        agentId,
        workspaceRoot: opts?.workspaceRoot ?? workspaceRoot ?? null,
        title: opts?.title || '새로운 대화',
      });

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      return newSession;
    },
    [workspaceRoot],
  );

  const deleteSession = useCallback(
    async (id: string): Promise<void> => {
      await sessionsRepo.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setActiveSessionId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const updateSessionTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      const updated = await sessionsRepo.updateSession(id, { title });
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    },
    [],
  );

  const value = useMemo(
    () => ({
      sessions,
      isLoading,
      activeSessionId,
      refreshSessions,
      createSession,
      deleteSession,
      updateSessionTitle,
      selectSession: setActiveSessionId,
    }),
    [
      sessions,
      isLoading,
      activeSessionId,
      refreshSessions,
      createSession,
      deleteSession,
      updateSessionTitle,
    ],
  );

  return (
    <ChatSessionsContext.Provider value={value}>
      {children}
    </ChatSessionsContext.Provider>
  );
}

export function useChatSessions(): ChatSessionsContextValue {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx) {
    throw new Error('useChatSessions must be used within a ChatSessionsProvider');
  }
  return ctx;
}

export function useSafeChatSessions(): ChatSessionsContextValue | null {
  return useContext(ChatSessionsContext);
}
