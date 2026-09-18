import { registerHooks } from '@/lib/agent/hookRegistry';
import type { AgentMessage } from '@/lib/agent/types';
import { estimateContextTokens, shouldCompact } from './estimate';
import { resolveCompactionSettings, type CompactionSettings } from './settings';
import { prepareCompaction, executeCompact } from './compact';
import * as entriesRepo from '@/lib/db/repositories/entriesRepo';
import { buildLlmContext } from '@/lib/db/buildContext';

let currentSessionId: string | null = null;
let currentModel = 'qwen3.5:9b';
let currentBaseUrl: string | undefined;
let currentSettings: CompactionSettings = resolveCompactionSettings();

/**
 * Updates the active session metadata for compaction hooks.
 */
export function setActiveCompactionSession(opts: {
  sessionId: string;
  model: string;
  baseUrl?: string;
  settings?: CompactionSettings;
}): void {
  currentSessionId = opts.sessionId;
  currentModel = opts.model;
  currentBaseUrl = opts.baseUrl;
  if (opts.settings) {
    currentSettings = opts.settings;
  }
}

async function performCompaction(
  reason: 'threshold' | 'overflow',
  signal?: AbortSignal,
): Promise<AgentMessage[] | null> {
  if (!currentSessionId) return null;

  try {
    const entries = await entriesRepo.getEntries(currentSessionId);
    if (entries.length === 0) return null;

    const prep = prepareCompaction(currentSessionId, entries, currentSettings);
    if (!prep) return null;

    await executeCompact(
      prep,
      {
        model: currentModel,
        baseUrl: currentBaseUrl,
        reason,
      },
      signal,
    );

    const updatedEntries = await entriesRepo.getEntries(currentSessionId);
    return buildLlmContext(updatedEntries);
  } catch (err) {
    console.error(`Compaction failed (${reason}):`, err);
    return null;
  }
}

// Register compaction hooks into the runtime registry
registerHooks('compaction', {
  async transformContext(
    messages: AgentMessage[],
    signal?: AbortSignal,
  ): Promise<AgentMessage[]> {
    const est = estimateContextTokens(messages);
    if (shouldCompact(est.tokens, currentSettings.contextSize, currentSettings)) {
      const compacted = await performCompaction('threshold', signal);
      if (compacted) {
        return compacted;
      }
    }
    return messages;
  },

  async onContextOverflow(
    _messages: AgentMessage[],
    signal?: AbortSignal,
  ): Promise<AgentMessage[] | undefined> {
    const compacted = await performCompaction('overflow', signal);
    return compacted ?? undefined;
  },
});
