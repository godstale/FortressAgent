import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentMessage, AgentTool } from '@/lib/agent/types';
import type { OllamaChatRequest, OllamaToolCall } from '@/lib/llm/ollamaClient';

export function mapAgentMessagesToOllama(
  messages: AgentMessage[],
): OllamaChatRequest['messages'] {
  return messages.map((msg) => {
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

        return {
          role: 'assistant',
          content: msg.content,
          tool_calls: ollamaToolCalls && ollamaToolCalls.length > 0 ? ollamaToolCalls : undefined,
        };
      }
      case 'toolResult':
        return {
          role: 'tool',
          content: msg.content,
        };
      default: {
        const exhaustCheck: never = msg;
        throw new Error(`Unhandled message role in mapping: ${JSON.stringify(exhaustCheck)}`);
      }
    }
  });
}

export function mapAgentToolsToOllama(tools: AgentTool[]): unknown[] {
  return tools.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.parameters, {
      name: tool.name,
      target: 'jsonSchema7',
      $refStrategy: 'none',
    });

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
      },
    };
  });
}
