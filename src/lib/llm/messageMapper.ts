import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentMessage, AgentTool } from '@/lib/agent/types';
import type { OllamaChatRequest, OllamaToolCall } from '@/lib/llm/ollamaClient';

export interface MapMessageOptions {
  /**
   * Strip <think>...</think> blocks from assistant messages to prevent
   * previous internal scratchpads from consuming prompt tokens in subsequent turns.
   * Default: true.
   */
  stripThinking?: boolean;
  /**
   * Compact older tool results that exceed pastToolResultMaxChars
   * so working memory remains focused on the latest sub-step.
   * Default: true.
   */
  prunePastToolResults?: boolean;
  /**
   * Maximum characters to retain for older tool results (default 500).
   */
  pastToolResultMaxChars?: number;
}

export function mapAgentMessagesToOllama(
  messages: AgentMessage[],
  options: MapMessageOptions = {},
): OllamaChatRequest['messages'] {
  const {
    stripThinking = true,
    prunePastToolResults = true,
    pastToolResultMaxChars = 500,
  } = options;

  // Find the index of the most recent toolResult message
  let lastToolResultIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'toolResult') {
      lastToolResultIndex = i;
      break;
    }
  }

  return messages.map((msg, index) => {
    switch (msg.role) {
      case 'system':
        return {
          role: 'system',
          content: msg.content,
        };
      case 'user':
        return {
          role: 'user',
          content: msg.content,
        };
      case 'assistant': {
        const ollamaToolCalls: OllamaToolCall[] | undefined = msg.toolCalls?.map((tc) => ({
          function: {
            name: tc.name,
            arguments: (typeof tc.arguments === 'object' && tc.arguments !== null
              ? tc.arguments
              : {}) as Record<string, unknown>,
          },
        }));

        let content = msg.content ?? '';
        if (stripThinking && content.includes('<think>')) {
          const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          content = stripped || (ollamaToolCalls && ollamaToolCalls.length > 0 ? '' : content);
        }

        return {
          role: 'assistant',
          content,
          tool_calls: ollamaToolCalls && ollamaToolCalls.length > 0 ? ollamaToolCalls : undefined,
        };
      }
      case 'toolResult': {
        let content = msg.content;
        // If this is an older tool result and exceeds the limit, compact it to preserve context
        if (
          prunePastToolResults &&
          lastToolResultIndex >= 0 &&
          index < lastToolResultIndex &&
          content &&
          content.length > pastToolResultMaxChars
        ) {
          const truncated = content.slice(0, pastToolResultMaxChars);
          content = `${truncated}\n\n... [과거 단계 도구 결과 (${msg.content.length}자) - 최신 문맥 공간 확보를 위해 이전 내용 축약됨]`;
        }

        return {
          role: 'tool',
          content,
        };
      }
      default: {
        const exhaustCheck: never = msg;
        throw new Error(`Unhandled message role in mapping: ${JSON.stringify(exhaustCheck)}`);
      }
    }
  });
}

export function mapAgentToolsToOllama(tools: AgentTool[]): unknown[] {
  return tools.map((tool) => {
    const rawSchema = zodToJsonSchema(tool.parameters, {
      target: 'openApi3',
    }) as Record<string, unknown>;

    // If schema has definitions (e.g. from sub-schemas), ensure root parameters object is clean
    const defs =
      rawSchema.definitions && typeof rawSchema.definitions === 'object'
        ? (rawSchema.definitions as Record<string, unknown>)
        : undefined;
    const parameters = defs?.[tool.name] || rawSchema;

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}
