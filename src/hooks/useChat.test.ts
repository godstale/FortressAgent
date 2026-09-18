import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from './useChat';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';
import type { OllamaChunk } from '@/lib/llm/ollamaClient';

async function* mockStreamResponse(chunks: OllamaChunk[]): AsyncIterable<OllamaChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('useChat hook', () => {
  it('accumulates streaming chunks into assistant message and finishes streaming', async () => {
    const mockStream = vi.fn().mockImplementation(() => {
      return mockStreamResponse([
        { content: 'Hello', done: false },
        { content: ' there!', done: true, usage: { input: 10, output: 5, total: 15 } },
      ]);
    });

    const { result } = renderHook(() =>
      useChat('session_1', DEFAULT_AGENT, { streamChatFn: mockStream }),
    );

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2);

    const userMsg = result.current.messages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe('Hello');

    const assistantMsg = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    if (assistantMsg && assistantMsg.role === 'assistant') {
      expect(assistantMsg.content).toBe('Hello there!');
      expect(assistantMsg.usage?.total).toBe(15);
    }

    expect(result.current.contextUsage.tokens).toBe(15);
  });

  it('stops immediately when stop() is called', async () => {
    const mockStream = vi.fn().mockImplementation((_req, signal?: AbortSignal) => {
      return (async function* () {
        yield { content: 'Initial', done: false };
        for (let i = 0; i < 20; i++) {
          if (signal?.aborted) {
            throw new Error('Operation aborted');
          }
          await new Promise((r) => setTimeout(r, 10));
          yield { content: ` item ${i}`, done: false };
        }
        yield { done: true };
      })();
    });

    const { result } = renderHook(() =>
      useChat('session_2', DEFAULT_AGENT, { streamChatFn: mockStream }),
    );

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage('Count up');
    });

    // Wait a tiny bit and call stop
    await new Promise((r) => setTimeout(r, 15));
    act(() => {
      result.current.stop();
    });

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
