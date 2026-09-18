import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Agent } from '@/lib/types/agent';
import type { AgentEvent, AgentMessage } from '@/lib/agent/types';
import { FortressAgent } from '@/lib/agent/agent';
import { getBuiltinTools } from '@/lib/tools/registry';
import { buildSystemPromptSections, formatSystemPrompt } from '@/lib/prompt/buildSystemPrompt';
import type { streamChat } from '@/lib/llm/ollamaClient';

export interface ChatPersistence {
  loadMessages(sessionId: string): Promise<AgentMessage[]>;
  saveTurn(
    sessionId: string,
    userMessage: AgentMessage,
    turnMessages: AgentMessage[],
  ): Promise<void>;
}

// In-memory persistence used as default (replaced by DB repository in Phase 4)
class InMemoryChatPersistence implements ChatPersistence {
  private store = new Map<string, AgentMessage[]>();

  async loadMessages(sessionId: string): Promise<AgentMessage[]> {
    return [...(this.store.get(sessionId) ?? [])];
  }

  async saveTurn(
    sessionId: string,
    _userMessage: AgentMessage,
    turnMessages: AgentMessage[],
  ): Promise<void> {
    const existing = this.store.get(sessionId) ?? [];
    this.store.set(sessionId, [...existing, ...turnMessages]);
  }
}

const defaultInMemoryPersistence = new InMemoryChatPersistence();

export interface UseChatOptions {
  persistence?: ChatPersistence;
  baseUrl?: string;
  streamChatFn?: typeof streamChat;
  cwd?: string;
}

export interface UseChatReturn {
  messages: AgentMessage[];
  isStreaming: boolean;
  contextUsage: { tokens: number; limit: number };
  sendMessage: (text: string) => Promise<void>;
  steer: (text: string) => void;
  stop: () => void;
  error: Error | null;
  retry: () => Promise<void>;
}

export function useChat(
  sessionId: string,
  agentConfig: Agent,
  options: UseChatOptions = {},
): UseChatReturn {
  const persistence = options.persistence ?? defaultInMemoryPersistence;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextTokens, setContextTokens] = useState<number>(0);
  const lastPromptRef = useRef<string>('');

  const contextLimit = useMemo(() => {
    return agentConfig.contextSize > 0 ? agentConfig.contextSize : 32768;
  }, [agentConfig.contextSize]);

  // Build tools from agent's enabledBuiltinTools
  const tools = useMemo(() => {
    return getBuiltinTools(agentConfig.enabledBuiltinTools, {
      workspaceRoot: options.cwd,
    });
  }, [agentConfig.enabledBuiltinTools, options.cwd]);

  // Construct system prompt using section builder
  const systemPrompt = useMemo(() => {
    const sections = buildSystemPromptSections({
      agent: {
        systemPrompt: agentConfig.systemPrompt,
      },
      tools,
      cwd: options.cwd,
    });
    return formatSystemPrompt(sections);
  }, [agentConfig.systemPrompt, tools, options.cwd]);

  // Agent instance ref
  const agentRef = useRef<FortressAgent | null>(null);

  // Event handler for agent notifications
  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        setIsStreaming(true);
        setError(null);
        break;

      case 'message_update': {
        setMessages((prev) => {
          const lastIdx = prev.findLastIndex((m) => m.role === 'assistant');
          if (lastIdx === -1) {
            return [...prev, event.message];
          }
          const updated = [...prev];
          updated[lastIdx] = event.message;
          return updated;
        });
        break;
      }

      case 'message_end': {
        if (event.message.role === 'assistant' && event.message.usage) {
          setContextTokens(event.message.usage.total);
        }
        setMessages((prev) => {
          const lastIdx = prev.findLastIndex((m) => m.role === 'assistant');
          if (lastIdx === -1) {
            return [...prev, event.message];
          }
          const updated = [...prev];
          updated[lastIdx] = event.message;
          return updated;
        });
        break;
      }

      case 'tool_execution_end': {
        // Add toolResult message as soon as execution finishes
        const toolResultMsg: AgentMessage = {
          role: 'toolResult',
          toolCallId: event.toolCallId,
          toolName: event.toolCallId,
          content: event.result.content,
          isError: event.isError,
        };
        setMessages((prev) => [...prev, toolResultMsg]);
        break;
      }

      case 'agent_end': {
        setIsStreaming(false);
        setMessages(event.messages);
        break;
      }

      case 'error': {
        setIsStreaming(false);
        setError(event.error);
        break;
      }
    }
  }, []);

  const eventHandlerRef = useRef(handleAgentEvent);
  useEffect(() => {
    eventHandlerRef.current = handleAgentEvent;
  }, [handleAgentEvent]);

  const createAgentInstance = useCallback(
    (initial: AgentMessage[]) => {
      const newAgent = new FortressAgent({
        agent: {
          model: agentConfig.model,
          systemPrompt,
          temperature: agentConfig.temperature,
        },
        tools,
        baseUrl: options.baseUrl,
        initialMessages: initial,
        streamChatFn: options.streamChatFn,
      });

      newAgent.subscribe((e) => eventHandlerRef.current(e));
      return newAgent;
    },
    [
      agentConfig.model,
      agentConfig.temperature,
      systemPrompt,
      tools,
      options.baseUrl,
      options.streamChatFn,
    ],
  );

  // Initialize or reconfigure agent when sessionId or config changes
  useEffect(() => {
    let cancelled = false;

    // Load initial messages from persistence
    persistence.loadMessages(sessionId).then((loaded) => {
      if (cancelled) return;
      setMessages(loaded);
      agentRef.current = createAgentInstance(loaded);
    });

    return () => {
      cancelled = true;
      if (agentRef.current) {
        agentRef.current.abort();
        agentRef.current = null;
      }
    };
  }, [sessionId, createAgentInstance, persistence]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;
      lastPromptRef.current = text;
      setError(null);

      // Eagerly show user message in UI
      const userMsg: AgentMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);

      if (!agentRef.current) {
        agentRef.current = createAgentInstance(messages);
      }

      try {
        await agentRef.current.prompt(text);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [createAgentInstance, messages],
  );

  const steer = useCallback((text: string) => {
    if (agentRef.current) {
      agentRef.current.steer(text);
    }
  }, []);

  const stop = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.abort();
    }
    setIsStreaming(false);
  }, []);

  const retry = useCallback(async () => {
    if (lastPromptRef.current) {
      setError(null);
      await sendMessage(lastPromptRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    isStreaming,
    contextUsage: { tokens: contextTokens, limit: contextLimit },
    sendMessage,
    steer,
    stop,
    error,
    retry,
  };
}
