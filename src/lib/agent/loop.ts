import {
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type AgentToolCall,
  type AgentToolResult,
  type TokenUsage,
} from '@/lib/agent/types';
import type { AgentHooks } from '@/lib/agent/hooks';
import type { MessageQueue } from '@/lib/agent/queue';
import { type RetryPolicy, withRetry } from '@/lib/agent/retry';
import {
  OllamaContextOverflowError,
  streamChat as defaultStreamChat,
} from '@/lib/llm/ollamaClient';
import {
  cleanThinkingText,
  mapAgentMessagesToOllama,
  mapAgentToolsToOllama,
} from '@/lib/llm/messageMapper';
import { appLogger } from '@/lib/logger/logger';
import { recordAgentError, recordLlmCall } from '@/lib/metrics/agentMetrics';
import { monitoringCollector } from '@/lib/monitoring/monitoringCollector';
import type { LlmPerformanceMetrics } from '@/lib/types/monitoring';

export interface LoopAgentConfig {
  id?: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  options?: Record<string, unknown>;
  contextSize?: number;
  reserveTokens?: number;
  keepRecentTokens?: number;
}

export interface RunAgentLoopOptions {
  agent: LoopAgentConfig;
  sessionId?: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  hooks?: AgentHooks;
  signal: AbortSignal;
  steeringQueue: MessageQueue;
  followUpQueue: MessageQueue;
  emit: (event: AgentEvent) => void;
  baseUrl?: string;
  retryPolicy?: Partial<RetryPolicy>;
  streamChatFn?: typeof defaultStreamChat;
  onRetry?: (attempt: number, maxRetries: number, error: unknown) => void;
}

export async function runAgentLoop(options: RunAgentLoopOptions): Promise<AgentMessage[]> {
  const {
    agent,
    sessionId,
    tools,
    hooks = {},
    signal,
    steeringQueue,
    followUpQueue,
    emit,
    baseUrl,
    retryPolicy,
    streamChatFn = defaultStreamChat,
    onRetry,
  } = options;

  // Clone messages so caller's original array isn't directly mutated
  const messages: AgentMessage[] = [...options.messages];
  const toolMap = new Map<string, AgentTool>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  emit({ type: 'agent_start' });
  appLogger.info(
    'agent',
    `에이전트 루프 시작 (모델: ${agent.model}, 활성 도구: ${tools.length}개)`,
    { model: agent.model, tools: tools.map((t) => t.name), options: agent.options },
    sessionId,
    agent.id,
  );

  let turnIndex = 0;
  let hasFollowUp = true;
  let consecutiveThinkingOnlyCount = 0;

  while (hasFollowUp && !signal.aborted) {
    while (!signal.aborted) {
      turnIndex++;

      // 1. transformContext hook
      let activeMessages = messages;
      if (hooks.transformContext) {
        activeMessages = await hooks.transformContext(messages, signal);
        if (activeMessages && activeMessages.length > 0 && activeMessages !== messages) {
          if (activeMessages.length < messages.length) {
            messages.length = 0;
            messages.push(...activeMessages);
            emit({ type: 'compaction_end', entry: { compactedCount: activeMessages.length } });
          }
        }
      }

      emit({ type: 'turn_start' });
      appLogger.info(
        'agent',
        `[Turn #${turnIndex}] 턴 시작 (컨텍스트 메시지: ${activeMessages.length}개)`,
        { turnIndex, messageCount: activeMessages.length },
        sessionId,
        agent.id,
      );

      // 2. Prepare Ollama request
      const ollamaMessages = mapAgentMessagesToOllama(activeMessages);
      const ollamaTools = mapAgentToolsToOllama(tools);
      appLogger.info(
        'ollama',
        `[Turn #${turnIndex}] LLM 추론 요청 전송 (모델: ${agent.model}, 입력 메시지: ${ollamaMessages.length}개, 도구: ${ollamaTools.length}개)`,
        {
          turnIndex,
          model: agent.model,
          messages: ollamaMessages,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
          })),
          options: agent.options,
        },
        sessionId,
        agent.id,
      );

      let assistantContent = '';
      let assistantThinking = '';
      let assistantToolCalls: AgentToolCall[] = [];
      let finalUsage: TokenUsage | undefined;
      let finalMetrics: LlmPerformanceMetrics | undefined;
      let stopReason: 'stop' | 'toolUse' | 'length' | 'aborted' | 'error' = 'stop';
      let errorMessage: string | undefined;

      // Stream assistant response with retry and context overflow recovery
      let overflowRetried = false;

      const executeStreamAttempt = async (): Promise<void> => {
        const streamStartTime = performance.now();
        while (true) {
          try {
            await withRetry(
              async (attempt) => {
                if (attempt > 0) {
                  assistantContent = '';
                  assistantThinking = '';
                  assistantToolCalls = [];
                }

                const stream = streamChatFn(
                  {
                    baseUrl,
                    model: agent.model,
                    messages: ollamaMessages,
                    tools: ollamaTools.length > 0 ? ollamaTools : undefined,
                    temperature: agent.temperature,
                    options: agent.options,
                  },
                  signal,
                );

                for await (const chunk of stream) {
                  if (signal.aborted) {
                    stopReason = 'aborted';
                    break;
                  }

                  if (chunk.content) {
                    assistantContent += chunk.content;
                  }

                  if (chunk.thinking) {
                    assistantThinking += chunk.thinking;
                  }

                  if (chunk.toolCalls && chunk.toolCalls.length > 0) {
                    for (const tc of chunk.toolCalls) {
                      const existing = assistantToolCalls.find(
                        (call) => call.name === tc.function.name,
                      );
                      if (existing) {
                        existing.arguments = tc.function.arguments;
                      } else {
                        assistantToolCalls.push({
                          id: `call_${Math.random().toString(36).slice(2, 11)}`,
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        });
                      }
                    }
                  }

                  if (chunk.usage) {
                    finalUsage = chunk.usage;
                  }

                  if (chunk.metrics) {
                    finalMetrics = chunk.metrics;
                  }

                  const partialAssistant: AgentMessage = {
                    role: 'assistant',
                    content: assistantContent,
                    thinking: assistantThinking || undefined,
                    toolCalls:
                      assistantToolCalls.length > 0
                        ? [...assistantToolCalls]
                        : undefined,
                    usage: finalUsage,
                    stopReason: 'stop',
                  };

                  emit({
                    type: 'message_update',
                    message: partialAssistant,
                    delta: chunk.content || '',
                  });
                }
              },
              retryPolicy,
              signal,
              onRetry,
            );

            // Successfully finished streaming - record metrics
            const durationMs = Math.round(performance.now() - streamStartTime);

            if (agent.id && finalMetrics) {
              monitoringCollector.recordInferenceMetrics(agent.id, finalMetrics);
            }

            if (agent.id) {
              recordLlmCall({
                agentId: agent.id,
                sessionId,
                contextTokens: finalUsage?.input ?? 0,
                outputTokens: finalUsage?.output ?? 0,
                durationMs,
                toolCallsCount: assistantToolCalls.length,
                prefillTokens: finalMetrics?.promptEvalCount,
                prefillDurationMs: finalMetrics?.promptEvalDurationMs,
                prefillSpeed: finalMetrics?.prefillSpeed,
                decodingTokens: finalMetrics?.evalCount,
                decodingDurationMs: finalMetrics?.evalDurationMs,
                decodingSpeed: finalMetrics?.decodingSpeed,
              });
            }

            if (assistantThinking.trim()) {
              appLogger.info(
                'ollama',
                `[Turn #${turnIndex}] LLM 사고 과정(Thinking) 완료 (${assistantThinking.length}자)`,
                {
                  turnIndex,
                  thinking: assistantThinking,
                },
                sessionId,
                agent.id,
              );
            }

            const perfLogSuffix = finalMetrics
              ? `, Prefill: ${finalMetrics.prefillSpeed} t/s (${finalMetrics.promptEvalDurationMs}ms), 디코딩: ${finalMetrics.decodingSpeed} t/s (${finalMetrics.evalDurationMs}ms)`
              : '';

            appLogger.info(
              'ollama',
              `[Turn #${turnIndex}] LLM 응답 생성 완료 (${durationMs}ms, 토큰: 입력 ${finalUsage?.input ?? 0} / 출력 ${finalUsage?.output ?? 0}${assistantToolCalls.length > 0 ? `, 도구 호출: ${assistantToolCalls.length}건` : ''}${perfLogSuffix})`,
              {
                turnIndex,
                durationMs,
                usage: finalUsage,
                metrics: finalMetrics,
                toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
                content: assistantContent || undefined,
                thinking: assistantThinking || undefined,
              },
              sessionId,
              agent.id,
            );

            break;
          } catch (err: unknown) {
            if (signal.aborted) {
              stopReason = 'aborted';
              break;
            }

            // Check for context overflow hook
            if (
              err instanceof OllamaContextOverflowError &&
              !overflowRetried &&
              hooks.onContextOverflow
            ) {
              overflowRetried = true;
              emit({ type: 'compaction_start' });
              appLogger.warn(
                'context',
                `[Turn #${turnIndex}] Ollama 컨텍스트 초과 오류 발생. 컨텍스트 압축 후 재시도합니다.`,
                { error: err.message },
                sessionId,
                agent.id,
              );
              const compacted = await hooks.onContextOverflow(messages, signal);
              if (compacted && compacted.length > 0) {
                // Replace messages and retry turn
                messages.length = 0;
                messages.push(...compacted);
                emit({ type: 'compaction_end', entry: { compactedCount: compacted.length } });
                const newOllamaMsgs = mapAgentMessagesToOllama(messages);
                ollamaMessages.length = 0;
                ollamaMessages.push(...newOllamaMsgs);
                assistantContent = '';
                assistantThinking = '';
                assistantToolCalls = [];
                continue;
              }
            }

            stopReason = 'error';
            errorMessage = err instanceof Error ? err.message : String(err);
            emit({
              type: 'error',
              error: err instanceof Error ? err : new Error(String(err)),
            });
            throw err;
          }
        }
      };

      try {
        await executeStreamAttempt();
      } catch {
        // Stream failed, assistant message recorded as error if not aborted
        if (signal.aborted) {
          stopReason = 'aborted';
        }
      }

      if (errorMessage) {
        stopReason = 'error';
      } else if (signal.aborted) {
        stopReason = 'aborted';
      } else if (assistantToolCalls.length > 0) {
        stopReason = 'toolUse';
      }

      // Check if model emitted thinking scratchpad but halted before producing tool calls or user content
      const isThinkingOnly =
        !assistantContent.trim() &&
        assistantToolCalls.length === 0 &&
        Boolean(assistantThinking.trim());

      if (
        isThinkingOnly &&
        consecutiveThinkingOnlyCount < 2 &&
        !signal.aborted &&
        stopReason !== 'error'
      ) {
        consecutiveThinkingOnlyCount++;
        appLogger.warn(
          'agent',
          `[Turn #${turnIndex}] 모델이 도구 호출이나 최종 본문 없이 사고 과정(Thinking)만 생성하고 중단되었습니다. 도구 호출/답변 작성을 위해 자동 복구 프롬프트를 전송합니다. (시도 ${consecutiveThinkingOnlyCount}/2)`,
          { turnIndex, thinking: assistantThinking },
          sessionId,
          agent.id,
        );

        const partialAssistantMessage: AgentMessage = {
          role: 'assistant',
          content: '',
          thinking: assistantThinking,
          stopReason: 'stop',
          usage: finalUsage,
        };
        messages.push(partialAssistantMessage);
        emit({ type: 'message_end', message: partialAssistantMessage });

        const recoveryPrompt =
          '[시스템 자동 안내]: 사고 과정(Thinking)만 완료되었고 계획한 도구 호출(Tool Call)이나 최종 응답 본문이 생성되지 않았습니다. 지체 없이 계획한 도구(예: read, ls, write 등)를 호출하거나, 추가 도구가 필요 없다면 사용자의 질문에 대한 실질적인 최종 답변 전문을 즉시 작성해 주십시오.';

        messages.push({ role: 'user', content: recoveryPrompt });
        continue;
      }

      if (!isThinkingOnly) {
        consecutiveThinkingOnlyCount = 0;
      }

      // Fallback: If model finished turn with no text content and no tool calls,
      // but produced thinking text and exhausted retries, use cleaned thinking as content
      if (!assistantContent.trim() && !assistantToolCalls.length && assistantThinking.trim()) {
        assistantContent = cleanThinkingText(assistantThinking);
      }

      const completedAssistantMessage: AgentMessage = {
        role: 'assistant',
        content: assistantContent,
        thinking: assistantThinking || undefined,
        toolCalls:
          assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
        usage: finalUsage,
        stopReason,
        errorMessage,
      };

      messages.push(completedAssistantMessage);
      emit({ type: 'message_end', message: completedAssistantMessage });

      // If aborted or error, break turn loop
      if (stopReason === 'aborted' || stopReason === 'error') {
        break;
      }

      // If no tool calls, check steering or finish turns
      if (!assistantToolCalls || assistantToolCalls.length === 0) {
        const steered = steeringQueue.dequeue();
        if (steered) {
          const steerMsg: AgentMessage = { role: 'user', content: steered };
          messages.push(steerMsg);
          continue;
        }
        break;
      }

      // 3. Execute tool calls
      const toolResults: AgentMessage[] = [];
      const rawResults: AgentToolResult[] = [];

      // Determine execution mode (sequential if any tool requires sequential)
      const hasSequential = assistantToolCalls.some((tc) => {
        const tool = toolMap.get(tc.name);
        return tool?.executionMode === 'sequential';
      });

      const executeSingleTool = async (
        tc: AgentToolCall,
      ): Promise<{ toolResultMsg: AgentMessage; rawResult: AgentToolResult }> => {
        const toolStartTime = performance.now();
        emit({
          type: 'tool_execution_start',
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.arguments,
        });

        const argSummary =
          tc.arguments && typeof tc.arguments === 'object'
            ? 'query' in tc.arguments
              ? ` (검색어: "${String(tc.arguments.query)}")`
              : 'path' in tc.arguments
              ? ` (경로: "${String(tc.arguments.path)}")`
              : 'command' in tc.arguments
              ? ` (명령: "${String(tc.arguments.command)}")`
              : ''
            : '';

        appLogger.info(
          'tools',
          `[Turn #${turnIndex}] 도구 호출 시작: '${tc.name}'${argSummary}`,
          { turnIndex, toolCallId: tc.id, toolName: tc.name, arguments: tc.arguments },
          options.sessionId,
          agent.id,
        );

        const tool = toolMap.get(tc.name);
        let result: AgentToolResult;

        if (!tool) {
          result = {
            content: `Tool '${tc.name}' not found or not enabled`,
            isError: true,
          };
          appLogger.error('tools', `Tool '${tc.name}' not found`, tc.arguments, options.sessionId, agent.id);
          recordAgentError({
            agentId: agent.id || 'default',
            sessionId: options.sessionId,
            source: 'tool',
            message: `Tool '${tc.name}' not found or not enabled`,
            details: tc.arguments,
          });
        } else {
          // Validate parameters schema
          const parseResult = tool.parameters.safeParse(tc.arguments);
          if (!parseResult.success) {
            result = {
              content: `Invalid parameters for tool '${tc.name}': ${parseResult.error.message}`,
              isError: true,
            };
            appLogger.error('tools', `Tool '${tc.name}' invalid parameters: ${parseResult.error.message}`, tc.arguments, options.sessionId, agent.id);
            recordAgentError({
              agentId: agent.id || 'default',
              sessionId: options.sessionId,
              source: 'tool',
              message: `Invalid parameters for tool '${tc.name}': ${parseResult.error.message}`,
              details: tc.arguments,
            });
          } else {
            // Check beforeToolCall hook
            let blockDecision: { block?: boolean; reason?: string; terminate?: boolean } | undefined;
            if (hooks.beforeToolCall) {
              blockDecision = await hooks.beforeToolCall(
                {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  arguments: tc.arguments,
                  risk: tool.risk,
                },
                signal,
              );
            }

            if (blockDecision?.block) {
              result = {
                content:
                  blockDecision.reason ||
                  `Tool execution of '${tc.name}' was blocked by approval policy.`,
                isError: true,
                terminate: blockDecision.terminate,
              };
              appLogger.warn('approval', `Tool '${tc.name}' blocked by user or policy: ${result.content}`, tc.arguments, options.sessionId, agent.id);
            } else {
              try {
                result = await tool.execute(
                  tc.id,
                  parseResult.data,
                  signal,
                  (partial) => {
                    emit({
                      type: 'tool_execution_update',
                      toolCallId: tc.id,
                      partial,
                    });
                  },
                );
              } catch (execErr: unknown) {
                const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
                result = {
                  content: errMsg,
                  isError: true,
                };
                appLogger.error('tools', `Tool '${tc.name}' execution failed: ${errMsg}`, execErr, options.sessionId, agent.id);
                recordAgentError({
                  agentId: agent.id || 'default',
                  sessionId: options.sessionId,
                  source: 'tool',
                  message: `Tool '${tc.name}' execution error: ${errMsg}`,
                  details: execErr,
                });
              }
            }
          }

          // Check afterToolCall hook (e.g. truncation, normalization)
          if (hooks.afterToolCall) {
            const afterResult = await hooks.afterToolCall(
              {
                toolCallId: tc.id,
                toolName: tc.name,
                arguments: tc.arguments,
                result,
              },
              signal,
            );
            if (afterResult) {
              result = { ...result, ...afterResult };
            }
          }
        }

        const isError = Boolean(result.isError);
        const toolDurationMs = Math.round(performance.now() - toolStartTime);
        emit({
          type: 'tool_execution_end',
          toolCallId: tc.id,
          toolName: tc.name,
          result,
          isError,
        });

        if (isError) {
          appLogger.error(
            'tools',
            `[Turn #${turnIndex}] 도구 '${tc.name}' 실행 실패 (${toolDurationMs}ms): ${result.content?.slice(0, 200)}`,
            {
              turnIndex,
              toolCallId: tc.id,
              toolName: tc.name,
              arguments: tc.arguments,
              error: result.content,
              details: result.details,
            },
            options.sessionId,
            agent.id,
          );
        } else {
          appLogger.info(
            'tools',
            `[Turn #${turnIndex}] 도구 '${tc.name}' 실행 완료 (${toolDurationMs}ms)`,
            {
              turnIndex,
              toolCallId: tc.id,
              toolName: tc.name,
              arguments: tc.arguments,
              result: result.content,
              details: result.details,
            },
            options.sessionId,
            agent.id,
          );
        }

        const toolResultMsg: AgentMessage = {
          role: 'toolResult',
          toolCallId: tc.id,
          toolName: tc.name,
          content: result.content,
          isError,
        };

        return { toolResultMsg, rawResult: result };
      };

      if (hasSequential) {
        for (const tc of assistantToolCalls) {
          if (signal.aborted) break;
          const { toolResultMsg, rawResult } = await executeSingleTool(tc);
          toolResults.push(toolResultMsg);
          rawResults.push(rawResult);
        }
      } else {
        // Parallel execution, maintaining exact order of assistantToolCalls
        const execPromises = assistantToolCalls.map((tc) => executeSingleTool(tc));
        const executed = await Promise.all(execPromises);
        for (const item of executed) {
          toolResults.push(item.toolResultMsg);
          rawResults.push(item.rawResult);
        }
      }

      // Append all tool results to messages
      messages.push(...toolResults);

      emit({
        type: 'turn_end',
        message: completedAssistantMessage,
        toolResults,
      });

      if (toolResults.length > 0) {
        appLogger.info(
          'agent',
          `[Turn #${turnIndex}] 도구 실행 결과 ${toolResults.length}건 수집 완료 (다음 추론 턴으로 전달)`,
          {
            turnIndex,
            toolResultsCount: toolResults.length,
            results: toolResults.map((tr) => ({
              toolName: tr.role === 'toolResult' ? tr.toolName : undefined,
              content: tr.content,
              isError: tr.role === 'toolResult' ? tr.isError : false,
            })),
          },
          sessionId,
          agent.id,
        );
      }

      // Check terminate conditions
      const allTerminated =
        rawResults.length > 0 && rawResults.every((r) => r.terminate === true);
      if (allTerminated) {
        break;
      }

      if (hooks.shouldStopAfterTurn) {
        const stop = await hooks.shouldStopAfterTurn({
          messages,
          turnIndex,
        });
        if (stop) {
          break;
        }
      }

      // Check steering queue
      const steered = steeringQueue.dequeue();
      if (steered) {
        messages.push({ role: 'user', content: steered });
      }
    }

    // Check followUp queue
    if (!signal.aborted && !followUpQueue.isEmpty()) {
      const nextFollowUp = followUpQueue.dequeue();
      if (nextFollowUp) {
        messages.push({ role: 'user', content: nextFollowUp });
        hasFollowUp = true;
        continue;
      }
    }
    hasFollowUp = false;
  }

  if (signal.aborted) {
    appLogger.warn(
      'agent',
      '에이전트 실행이 사용자에 의해 중단되었습니다.',
      undefined,
      sessionId,
      agent.id,
    );
  } else {
    appLogger.info(
      'agent',
      `에이전트 실행 루프 완료 (총 ${turnIndex}턴 완료, 최종 메시지: ${messages.length}개)`,
      { totalTurns: turnIndex, totalMessages: messages.length },
      sessionId,
      agent.id,
    );
  }

  emit({ type: 'agent_end', messages });
  return messages;
}
