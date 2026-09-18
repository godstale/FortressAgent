import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { Agent } from '@/lib/types/agent';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';
import * as agentsRepo from '@/lib/db/repositories/agentsRepo';

export interface AgentsContextValue {
  agents: Agent[];
  defaultAgent: Agent;
  loading: boolean;
  refreshAgents: () => Promise<void>;
  createAgent: (
    agentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ) => Promise<Agent>;
  updateAgent: (
    id: string,
    updates: Partial<Omit<Agent, 'id' | 'createdAt'>>,
  ) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<boolean>;
  setDefaultAgent: (id: string) => Promise<void>;
  getAgent: (id: string) => Agent | undefined;
}

export const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([DEFAULT_AGENT]);
  const [loading, setLoading] = useState(true);

  const refreshAgents = useCallback(async () => {
    try {
      let list = await agentsRepo.listAgents();

      // If DB has 0 agents, seed DEFAULT_AGENT
      if (list.length === 0) {
        await agentsRepo.createAgent({
          ...DEFAULT_AGENT,
          isDefault: true,
        });
        list = await agentsRepo.listAgents();
      }

      setAgents(list);
    } catch (err) {
      console.error('Failed to load agents from repository:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) {
        await refreshAgents();
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshAgents]);

  const defaultAgent = useMemo(() => {
    return agents.find((a) => a.isDefault) || agents[0] || DEFAULT_AGENT;
  }, [agents]);

  const getAgent = useCallback(
    (id: string): Agent | undefined => {
      return agents.find((a) => a.id === id);
    },
    [agents],
  );

  const create = useCallback(
    async (
      agentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    ): Promise<Agent> => {
      const id = agentData.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const created = await agentsRepo.createAgent({
        ...agentData,
        id,
      });
      await refreshAgents();
      return created;
    },
    [refreshAgents],
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<Omit<Agent, 'id' | 'createdAt'>>,
    ): Promise<Agent> => {
      const updated = await agentsRepo.updateAgent(id, updates);
      await refreshAgents();
      return updated;
    },
    [refreshAgents],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (agents.length <= 1) {
        // Last remaining agent cannot be deleted
        return false;
      }
      await agentsRepo.deleteAgent(id);
      await refreshAgents();
      return true;
    },
    [agents.length, refreshAgents],
  );

  const setDefault = useCallback(
    async (id: string): Promise<void> => {
      await agentsRepo.updateAgent(id, { isDefault: true });
      await refreshAgents();
    },
    [refreshAgents],
  );

  return (
    <AgentsContext.Provider
      value={{
        agents,
        defaultAgent,
        loading,
        refreshAgents,
        createAgent: create,
        updateAgent: update,
        deleteAgent: remove,
        setDefaultAgent: setDefault,
        getAgent,
      }}
    >
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error('useAgents must be used within an AgentsProvider');
  }
  return ctx;
}
