import { describe, it, expect } from 'vitest';
import {
  resolveCompactionSettings,
  clamp,
} from './settings';
import {
  estimateMessageTokens,
  estimateContextTokens,
  shouldCompact,
} from './estimate';
import type { AgentMessage } from '@/lib/agent/types';

describe('compaction settings & token estimation (P4-06)', () => {
  describe('settings.ts', () => {
    it('clamp correctly bounds numbers', () => {
      expect(clamp(500, 1024, 16384)).toBe(1024);
      expect(clamp(20000, 1024, 16384)).toBe(16384);
      expect(clamp(5000.4, 1024, 16384)).toBe(5000);
    });

    it('derives 25% reserve and 35% keepRecent for default 8192 context', () => {
      const res = resolveCompactionSettings();
      expect(res.contextSize).toBe(8192);
      expect(res.reserveTokens).toBe(2048); // 8192 * 0.25 = 2048
      expect(res.keepRecentTokens).toBe(2867); // 8192 * 0.35 = 2867.2 -> 2867
    });

    it('preserves user-specified non-zero values', () => {
      const res = resolveCompactionSettings({
        contextSize: 16384,
        reserveTokens: 4000,
        keepRecentTokens: 6000,
      });
      expect(res.contextSize).toBe(16384);
      expect(res.reserveTokens).toBe(4000);
      expect(res.keepRecentTokens).toBe(6000);
    });

    it('clamps upper bounds for very large context models', () => {
      const res = resolveCompactionSettings({
        contextSize: 131072, // 128k
      });
      // 128k * 0.25 = 32768, clamped to 16384
      expect(res.reserveTokens).toBe(16384);
      // 128k * 0.35 = 45875, clamped to 20000
      expect(res.keepRecentTokens).toBe(20000);
    });
  });

  describe('estimate.ts', () => {
    it('estimates message tokens with ceil(chars / 4)', () => {
      const msg: AgentMessage = { role: 'user', content: 'Hello!' }; // 6 chars -> 2 tokens
      expect(estimateMessageTokens(msg)).toBe(2);
    });

    it('estimates context when no usage exists (heuristic only)', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: '12345678' }, // 8 chars -> 2 tokens
        { role: 'assistant', content: '1234', stopReason: 'stop' }, // 4 chars -> 1 token
      ];

      const est = estimateContextTokens(messages);
      expect(est.usageTokens).toBe(0);
      expect(est.lastUsageIndex).toBe(-1);
      expect(est.trailingTokens).toBe(3);
      expect(est.tokens).toBe(3);
    });

    it('uses Ollama actual usage.total and adds trailing message estimates', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Earlier question' },
        {
          role: 'assistant',
          content: 'Earlier response',
          stopReason: 'stop',
          usage: { input: 100, output: 50, total: 150 },
        },
        { role: 'user', content: '12345678' }, // 8 chars -> 2 tokens
      ];

      const est = estimateContextTokens(messages);
      expect(est.usageTokens).toBe(150);
      expect(est.lastUsageIndex).toBe(1);
      expect(est.trailingTokens).toBe(2);
      expect(est.tokens).toBe(152);
    });

    it('skips aborted and error assistant usage', () => {
      const messages: AgentMessage[] = [
        {
          role: 'assistant',
          content: 'Valid response',
          stopReason: 'stop',
          usage: { input: 50, output: 20, total: 70 },
        },
        {
          role: 'assistant',
          content: 'Aborted halfway...',
          stopReason: 'aborted',
          usage: { input: 200, output: 10, total: 210 },
        },
        { role: 'user', content: '1234' }, // 4 chars -> 1 token
      ];

      const est = estimateContextTokens(messages);
      // Should pick the first assistant message at index 0 (usage = 70)
      expect(est.lastUsageIndex).toBe(0);
      expect(est.usageTokens).toBe(70);
      // Trailing messages from index 1:
      // msg 1: 18 chars -> 5 tokens
      // msg 2: 4 chars -> 1 token
      // total trailing = 6 tokens
      expect(est.tokens).toBe(76);
    });

    it('shouldCompact checks boundary contextTokens > contextSize - reserveTokens', () => {
      const contextSize = 8192;
      const reserveTokens = 2048;
      // threshold = 8192 - 2048 = 6144

      expect(shouldCompact(6143, contextSize, reserveTokens)).toBe(false);
      expect(shouldCompact(6144, contextSize, reserveTokens)).toBe(false); // Exact boundary is false
      expect(shouldCompact(6145, contextSize, reserveTokens)).toBe(true);
    });
  });
});
