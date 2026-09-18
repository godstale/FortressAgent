import type { Agent } from '@/lib/types/agent';
import type { AppSettings } from '@/lib/types/chat';

export interface CompactionSettings {
  contextSize: number;
  reserveTokens: number;
  keepRecentTokens: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(val), min), max);
}

/**
 * Resolves compaction budget parameters according to Architecture §9.1:
 * - contextSize defaults to global defaultContextSize (or 8192).
 * - reserveTokens defaults to clamp(contextSize * 0.25, 1024, 16384).
 * - keepRecentTokens defaults to clamp(contextSize * 0.35, 1024, 20000).
 */
export function resolveCompactionSettings(
  agent?: Partial<Agent>,
  globalDefaults?: Partial<AppSettings>,
): CompactionSettings {
  const fallbackContextSize = globalDefaults?.defaultContextSize ?? 8192;
  const contextSize =
    agent?.contextSize && agent.contextSize > 0
      ? agent.contextSize
      : fallbackContextSize;

  const reserveTokens =
    agent?.reserveTokens && agent.reserveTokens > 0
      ? agent.reserveTokens
      : clamp(contextSize * 0.25, 1024, 16384);

  const keepRecentTokens =
    agent?.keepRecentTokens && agent.keepRecentTokens > 0
      ? agent.keepRecentTokens
      : clamp(contextSize * 0.35, 1024, 20000);

  return {
    contextSize,
    reserveTokens,
    keepRecentTokens,
  };
}
