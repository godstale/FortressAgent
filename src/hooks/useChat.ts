import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Agent } from '@/lib/types/agent';
import type { AgentEvent, AgentMessage } from '@/lib/agent/types';
import type { SkillManifest } from '@/lib/types/skill';
import type { ContextFileItem } from '@/lib/skills/contextFiles';
import { FortressAgent } from '@/lib/agent/agent';
import { getBuiltinTools } from '@/lib/tools/registry';
import { buildSystemPromptSections, formatSystemPrompt } from '@/lib/prompt/buildSystemPrompt';
import { getVisualizationPromptSection } from '@/lib/prompt/visualizationSection';
import { diffSections } from '@/lib/prompt/diffSections';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { useSafeWorkspace } from '@/lib/context/WorkspaceContext';
import type { streamChat } from '@/lib/llm/ollamaClient';

import {
  type ChatPersistence,
  defaultSqlitePersistence,
} from '@/lib/db/sqlitePersistence';
import { setActiveCompactionSession } from '@/lib/compaction/register';
import { resolveCompactionSettings } from '@/lib/compaction/settings';
import { prepareCompaction, executeCompact } from '@/lib/compaction/compact';
import { approvalBus } from '@/lib/approval/approvalBus';
import { setActiveApprovalMode } from '@/lib/approval/register';
import * as entriesRepo from '@/lib/db/repositories/entriesRepo';
import { buildLlmContext } from '@/lib/db/buildContext';
import { appLogger } from '@/lib/logger/logger';

export type { ChatPersistence };

export interface UseChatOptions {
  persistence?: ChatPersistence;
  baseUrl?: string;
  streamChatFn?: typeof streamChat;
  cwd?: string;
  skills?: SkillManifest[];
  contextFiles?: ContextFileItem[];
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
  compact: (customInstructions?: string) => Promise<void>;
  clearChat: () => Promise<void>;
  injectInfoMessage: (content: string) => void;
}

export function useChat(
  sessionId: string,
  agentConfig: Agent,
  options: UseChatOptions = {},
): UseChatReturn {
  const persistence = options.persistence ?? defaultSqlitePersistence;
  const skillsCtx = useSafeSkills();
  const workspaceCtx = useSafeWorkspace();
  const effectiveCwd = options.cwd ?? workspaceCtx?.workspaceRoot ?? undefined;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextTokens, setContextTokens] = useState<number>(0);
  const lastPromptRef = useRef<string>('');
  const persistedCountRef = useRef<number>(0);

  const contextLimit = useMemo(() => {
    return agentConfig.contextSize > 0 ? agentConfig.contextSize : 32768;
  }, [agentConfig.contextSize]);

  const compactionSettings = useMemo(() => {
    return resolveCompactionSettings(agentConfig);
  }, [agentConfig]);

  useEffect(() => {
    setActiveCompactionSession({
      sessionId,
      model: agentConfig.model,
      baseUrl: options.baseUrl,
      settings: compactionSettings,
    });
  }, [sessionId, agentConfig.model, options.baseUrl, compactionSettings]);

  // Build tools from agent's enabledBuiltinTools
  const tools = useMemo(() => {
    return getBuiltinTools(agentConfig.enabledBuiltinTools, {
      workspaceRoot: effectiveCwd,
    });
  }, [agentConfig.enabledBuiltinTools, effectiveCwd]);

  // Read skills and context files from options or context
  const rawSkills = useMemo(() => {
    return options.skills ?? skillsCtx?.activeSkillsForPrompt ?? [];
  }, [options.skills, skillsCtx?.activeSkillsForPrompt]);

  const rawContextFiles = useMemo(() => {
    return options.contextFiles ?? skillsCtx?.contextFiles ?? [];
  }, [options.contextFiles, skillsCtx?.contextFiles]);

  // Filter skills by agentConfig.enabledSkills if specified
  const filteredSkills = useMemo(() => {
    if (agentConfig.enabledSkills && agentConfig.enabledSkills.length > 0) {
      const allowed = new Set(agentConfig.enabledSkills);
      return rawSkills.filter((s) => allowed.has(s.name));
    }
    return rawSkills;
  }, [rawSkills, agentConfig.enabledSkills]);

  // Construct system prompt using section builder
  const currentSections = useMemo(() => {
    return buildSystemPromptSections({
      agent: {
        systemPrompt: agentConfig.systemPrompt,
      },
      tools,
      contextFiles: rawContextFiles,
      skills: filteredSkills,
      visualization: getVisualizationPromptSection(),
      cwd: effectiveCwd,
    });
  }, [agentConfig.systemPrompt, tools, rawContextFiles, filteredSkills, effectiveCwd]);

  const systemPrompt = useMemo(() => {
    return formatSystemPrompt(currentSections);
  }, [currentSections]);

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
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updated = [...prev];
            updated[lastIdx] = event.message;
            return updated;
          }
          return [...prev, event.message];
        });
        break;
      }

      case 'message_end': {
        if (event.message.role === 'assistant' && event.message.usage) {
          setContextTokens(event.message.usage.total);
        }
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updated = [...prev];
            updated[lastIdx] = event.message;
            return updated;
          }
          return [...prev, event.message];
        });
        break;
      }

      case 'tool_execution_end': {
        // Add toolResult message as soon as execution finishes
        const toolResultMsg: AgentMessage = {
          role: 'toolResult',
          toolCallId: event.toolCallId,
          toolName: event.toolName || event.toolCallId,
          content: event.result.content,
          isError: event.isError,
        };
        setMessages((prev) => [...prev, toolResultMsg]);
        break;
      }

      case 'turn_end': {
        const turnMsgs = [event.message, ...(event.toolResults || [])];
        persistedCountRef.current += turnMsgs.length;
        void persistence.saveTurn?.(sessionId, turnMsgs);
        break;
      }

      case 'agent_end': {
        setIsStreaming(false);
        const nonSystem = event.messages.filter((m) => m.role !== 'system');
        setMessages(nonSystem);
        if (nonSystem.length > persistedCountRef.current) {
          const unpersisted = nonSystem.slice(persistedCountRef.current);
          persistedCountRef.current = nonSystem.length;
          void persistence.saveTurn?.(sessionId, unpersisted);
        }
        break;
      }

      case 'compaction_end': {
        void persistence.loadMessages(sessionId).then((loaded) => {
          setMessages(loaded);
          persistedCountRef.current = loaded.length;
        });
        break;
      }

      case 'error': {
        setIsStreaming(false);
        setError(event.error);
        break;
      }
    }
  }, [persistence, sessionId]);

  const eventHandlerRef = useRef(handleAgentEvent);
  useEffect(() => {
    eventHandlerRef.current = handleAgentEvent;
  }, [handleAgentEvent]);

  // Keep latest refs to prevent tearing down the agent on parent re-renders
  const agentConfigRef = useRef(agentConfig);
  const systemPromptRef = useRef(systemPrompt);
  const toolsRef = useRef(tools);
  const optionsRef = useRef(options);

  useEffect(() => {
    agentConfigRef.current = agentConfig;
    systemPromptRef.current = systemPrompt;
    toolsRef.current = tools;
    optionsRef.current = options;
  });

  const createAgentInstance = useCallback(
    (initial: AgentMessage[]) => {
      const cfg = agentConfigRef.current;
      const opts = optionsRef.current;
      const effectiveNumCtx =
        cfg.contextSize > 0 ? cfg.contextSize : (contextLimit > 0 ? contextLimit : 8192);

      const newAgent = new FortressAgent({
        sessionId,
        agent: {
          id: cfg.id,
          model: cfg.model,
          systemPrompt: systemPromptRef.current,
          temperature: cfg.temperature,
          options: {
            num_ctx: effectiveNumCtx,
          },
          contextSize: effectiveNumCtx,
          reserveTokens: cfg.reserveTokens,
          keepRecentTokens: cfg.keepRecentTokens,
        },
        tools: toolsRef.current,
        baseUrl: opts.baseUrl,
        initialMessages: initial,
        streamChatFn: opts.streamChatFn,
      });

      newAgent.subscribe((e) => eventHandlerRef.current(e));
      return newAgent;
    },
    [sessionId, contextLimit],
  );

  // Initialize agent when sessionId changes
  useEffect(() => {
    let cancelled = false;

    // Load initial messages from persistence
    persistence.loadMessages(sessionId).then((loaded) => {
      if (cancelled) return;
      setMessages(loaded);
      persistedCountRef.current = loaded.length;
      agentRef.current = createAgentInstance(loaded);
    });

    return () => {
      cancelled = true;
      approvalBus.abortAll();
      if (agentRef.current) {
        agentRef.current.abort();
        agentRef.current = null;
      }
    };
  }, [sessionId, createAgentInstance, persistence]);

  // Sync active approval mode
  useEffect(() => {
    setActiveApprovalMode(agentConfig.approvalMode);
  }, [agentConfig.approvalMode]);

  // Inject diff updates when system prompt sections change dynamically
  const prevSectionsRef = useRef<Record<string, string>>(currentSections);
  useEffect(() => {
    const prev = prevSectionsRef.current;
    if (prev && Object.keys(prev).length > 0) {
      const diff = diffSections(prev, currentSections);
      const changedKeys = Object.keys(diff);
      if (changedKeys.length > 0 && messages.length > 0) {
        const diffText = Object.entries(diff)
          .map(([k, v]) => (v === null ? `<${k}>\n(This section has been removed)\n</${k}>` : v))
          .join('\n\n');

        if (diffText.trim()) {
          const updateMsg: AgentMessage = {
            role: 'system',
            content: `[System prompt updated]\n\n${diffText}`,
            sections: currentSections,
          };
          setMessages((prevMsgs) => [...prevMsgs, updateMsg]);
          if (agentRef.current) {
            agentRef.current.setMessages([...agentRef.current.getMessages(), updateMsg]);
          }
        }
      }
    }
    prevSectionsRef.current = currentSections;
  }, [currentSections, messages.length]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;
      lastPromptRef.current = text;
      setError(null);

      // Eagerly show user message in UI
      const userMsg: AgentMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      persistedCountRef.current += 1;
      await persistence.saveUserMessage?.(sessionId, userMsg);

      appLogger.info(
        'chat',
        `사용자 질문/요청: "${text.length > 120 ? text.slice(0, 120) + '...' : text}"`,
        { role: 'user', prompt: text, fullPrompt: text },
        sessionId,
        agentConfigRef.current.id,
      );

      if (!agentRef.current) {
        agentRef.current = createAgentInstance(messages);
      }

      try {
        await agentRef.current.prompt(text);
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        appLogger.error(
          'chat',
          `대화 처리 중 오류 발생: ${errObj.message}`,
          { error: errObj.message, stack: errObj.stack, prompt: text },
          sessionId,
          agentConfigRef.current.id,
        );
      }
    },
    [createAgentInstance, messages, persistence, sessionId],
  );

  const steer = useCallback((text: string) => {
    if (agentRef.current) {
      agentRef.current.steer(text);
    }
  }, []);

  const stop = useCallback(() => {
    approvalBus.abortAll();
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

  const compact = useCallback(
    async (customInstructions?: string): Promise<void> => {
      try {
        const entries = await entriesRepo.getEntries(sessionId);
        const prep = prepareCompaction(sessionId, entries, compactionSettings);
        if (!prep) return;
        await executeCompact(prep, {
          model: agentConfig.model,
          baseUrl: options.baseUrl,
          reason: 'manual',
          customInstructions,
          streamChatFn: options.streamChatFn,
        });
        const updated = await entriesRepo.getEntries(sessionId);
        const newMessages = buildLlmContext(updated);
        setMessages(newMessages);
        if (agentRef.current) {
          agentRef.current.setMessages(newMessages);
        }
      } catch (err) {
        console.error('Manual compaction failed:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [
      sessionId,
      compactionSettings,
      agentConfig.model,
      options.baseUrl,
      options.streamChatFn,
    ],
  );

  const clearChat = useCallback(async (): Promise<void> => {
    try {
      setMessages([]);
      if (agentRef.current) {
        agentRef.current.setMessages([]);
      }
      await entriesRepo.deleteEntriesForSession(sessionId);
      setContextTokens(0);
      appLogger.info(
        'chat',
        '대화 내역이 초기화되었습니다. (실행 상세 로그는 SQLite에 안전하게 보존됩니다.)',
        undefined,
        sessionId,
        agentConfig.id,
      );
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }, [agentConfig.id, sessionId]);

  const injectInfoMessage = useCallback((content: string): void => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content,
        stopReason: 'stop',
      },
    ]);
  }, []);

  return {
    messages,
    isStreaming,
    contextUsage: { tokens: contextTokens, limit: contextLimit },
    sendMessage,
    steer,
    stop,
    error,
    retry,
    compact,
    clearChat,
    injectInfoMessage,
  };
}
