import type { Agent, AgentConnectionStatus } from '@/lib/types/agent';
import { listModels, showModel, type OllamaModel } from './ollamaClient';

/**
 * Checks if a candidate model tag matches a target model name.
 * Handles cases where ':latest' might be omitted or included.
 */
export function isModelMatching(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  if (candidate.toLowerCase() === target.toLowerCase()) return true;

  const normalize = (m: string) => (m.endsWith(':latest') ? m.slice(0, -7) : m);
  return normalize(candidate).toLowerCase() === normalize(target).toLowerCase();
}

/**
 * Check connection status of a single agent.
 */
export async function checkAgentConnection(
  agent: Agent,
  baseUrl?: string,
): Promise<'connected' | 'disconnected'> {
  try {
    // 1. Try listing models first to see if Ollama is accessible
    const models = await listModels(baseUrl);
    const found = models.some((m) => isModelMatching(m.name, agent.model));
    if (found) {
      return 'connected';
    }

    // 2. If not found in list, attempt showModel directly (e.g. for custom tags or newly pulled)
    await showModel(baseUrl, agent.model);
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

/**
 * Check connection status for multiple agents efficiently.
 * Fetches the model list once and evaluates all agents.
 */
export async function checkAllAgentsConnection(
  agents: Agent[],
  baseUrl?: string,
): Promise<Record<string, AgentConnectionStatus>> {
  const result: Record<string, AgentConnectionStatus> = {};

  if (agents.length === 0) {
    return result;
  }

  let models: OllamaModel[];
  try {
    models = await listModels(baseUrl);
  } catch {
    // Ollama is offline or unreachable - all agents are disconnected
    for (const agent of agents) {
      result[agent.id] = 'disconnected';
    }
    return result;
  }

  // Check each agent against the retrieved models
  const pendingChecks: Promise<void>[] = [];

  for (const agent of agents) {
    const matched = models.some((m) => isModelMatching(m.name, agent.model));
    if (matched) {
      result[agent.id] = 'connected';
    } else {
      // If not directly found in the tags list, fallback to showModel
      pendingChecks.push(
        showModel(baseUrl, agent.model)
          .then(() => {
            result[agent.id] = 'connected';
          })
          .catch(() => {
            result[agent.id] = 'disconnected';
          }),
      );
    }
  }

  if (pendingChecks.length > 0) {
    await Promise.all(pendingChecks);
  }

  return result;
}
