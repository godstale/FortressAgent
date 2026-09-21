import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamChat,
  OllamaModelNotFoundError,
  OllamaConnectionError,
  OllamaContextOverflowError,
} from './ollamaClient';
import {
  cleanThinkingText,
  mapAgentMessagesToOllama,
  mapAgentToolsToOllama,
} from './messageMapper';
import { z } from 'zod';
import type { AgentMessage, AgentTool } from '@/lib/agent/types';

describe('ollamaClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('streams NDJSON chunks and parses usage', async () => {
    const streamData = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }) + '\n',
      JSON.stringify({ message: { content: ' world' }, done: false }) + '\n',
      JSON.stringify({
        message: { content: '!' },
        done: true,
        prompt_eval_count: 20,
        eval_count: 10,
      }) + '\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of streamData) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks = [];
    for await (const chunk of streamChat({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[1].content).toBe(' world');
    expect(chunks[2].content).toBe('!');
    expect(chunks[2].done).toBe(true);
    expect(chunks[2].usage).toEqual({
      input: 20,
      output: 10,
      total: 30,
    });
  });

  it('throws OllamaModelNotFoundError on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('model not found', { status: 404, statusText: 'Not Found' }),
    );

    const gen = streamChat({
      model: 'non-existent-model',
      messages: [],
    });

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of gen) {
        /* empty */
      }
    }).rejects.toThrow(OllamaModelNotFoundError);
  });

  it('throws OllamaConnectionError on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const gen = streamChat({
      model: 'test-model',
      messages: [],
    });

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of gen) {
        /* empty */
      }
    }).rejects.toThrow(OllamaConnectionError);
  });

  it('throws OllamaContextOverflowError when response contains context window exceeded', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('context length exceeded the maximum context limit', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const gen = streamChat({
      model: 'test-model',
      messages: [],
    });

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of gen) {
        /* empty */
      }
    }).rejects.toThrow(OllamaContextOverflowError);
  });
});

describe('messageMapper', () => {
  it('correctly maps AgentMessages to Ollama format', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'System instruction' },
      { role: 'user', content: 'User question' },
      {
        role: 'assistant',
        content: 'I will call a tool',
        stopReason: 'toolUse',
        toolCalls: [
          {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'test.txt' },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read_file',
        content: 'file contents',
        isError: false,
      },
    ];

    const mapped = mapAgentMessagesToOllama(messages);
    expect(mapped).toEqual([
      { role: 'system', content: 'System instruction' },
      { role: 'user', content: 'User question' },
      {
        role: 'assistant',
        content: 'I will call a tool',
        tool_calls: [
          {
            function: {
              name: 'read_file',
              arguments: { path: 'test.txt' },
            },
          },
        ],
      },
      { role: 'tool', content: 'file contents' },
    ]);
  });

  it('maps AgentTools to Ollama tools definition with schema', () => {
    const tool: AgentTool = {
      name: 'read_file',
      label: 'Read File',
      description: 'Read file contents',
      risk: 'low',
      parameters: z.object({
        path: z.string().describe('Path to file'),
      }),
      execute: vi.fn(),
    };

    const mapped = mapAgentToolsToOllama([tool]);
    expect(mapped).toHaveLength(1);
    expect((mapped[0] as { function: { name: string } }).function.name).toBe('read_file');
  });

  it('strips <think> blocks and prunes older tool results to preserve context', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'What is the weather?' },
      {
        role: 'assistant',
        content: '<think>I should search for weather first.</think>I am searching now.',
        toolCalls: [{ id: 'tc-1', name: 'web_search', arguments: { query: 'weather' } }],
        stopReason: 'toolUse',
      },
      {
        role: 'toolResult',
        toolCallId: 'tc-1',
        toolName: 'web_search',
        content: 'A'.repeat(800), // long past tool result
        isError: false,
      },
      {
        role: 'assistant',
        content: '<think>Now I will fetch the details.</think>',
        toolCalls: [{ id: 'tc-2', name: 'web_fetch', arguments: { url: 'https://weather.com' } }],
        stopReason: 'toolUse',
      },
      {
        role: 'toolResult',
        toolCallId: 'tc-2',
        toolName: 'web_fetch',
        content: 'B'.repeat(800), // latest tool result
        isError: false,
      },
    ];

    const mapped = mapAgentMessagesToOllama(messages, {
      pastToolResultMaxChars: 100,
      keepRecentToolCount: 1,
    });

    // 1. Check thinking stripped from assistant messages
    expect(mapped[1].content).toBe('I am searching now.');
    expect(mapped[3].content).toBe(''); // Only contained thinking and had tool_calls

    // 2. Check older toolResult (index 2) was pruned
    expect(mapped[2].content).toContain('과거 단계 도구 결과');
    expect(mapped[2].content.length).toBeLessThan(300);

    // 3. Check latest toolResult (index 4) was NOT pruned
    expect(mapped[4].content).toBe('B'.repeat(800));
  });

  it('cleanThinkingText removes all variants of thinking tags and standalone tags', () => {
    const raw1 = '<think>some internal thoughts</think>Actual response';
    expect(cleanThinkingText(raw1)).toBe('Actual response');

    const raw2 = '<thinking>\nPlanning next steps...\n</thinking>\n\nHere is the answer';
    expect(cleanThinkingText(raw2)).toBe('Here is the answer');

    const raw3 = 'I will now read the file.\n</thinking>';
    expect(cleanThinkingText(raw3)).toBe('I will now read the file.');
  });
});
