import type { TokenUsage } from '@/lib/agent/types';

export class OllamaConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Ollama connection error: ${message}`);
    this.name = 'OllamaConnectionError';
  }
}

export class OllamaModelNotFoundError extends Error {
  constructor(public readonly model: string) {
    super(`Ollama model not found: ${model}`);
    this.name = 'OllamaModelNotFoundError';
  }
}

export class OllamaContextOverflowError extends Error {
  constructor(message: string) {
    super(`Ollama context length overflow: ${message}`);
    this.name = 'OllamaContextOverflowError';
  }
}

export class OllamaRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(`Ollama request failed with status ${status}: ${message}`);
    this.name = 'OllamaRequestError';
  }
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaChunk {
  content?: string;
  toolCalls?: OllamaToolCall[];
  done: boolean;
  usage?: TokenUsage;
}

export interface OllamaChatRequest {
  baseUrl?: string;
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  }>;
  tools?: unknown[];
  temperature?: number;
  options?: Record<string, unknown>;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

function isContextOverflowMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('context window') ||
    lower.includes('context length') ||
    lower.includes('context limit') ||
    lower.includes('exceeds context') ||
    lower.includes('maximum context')
  );
}

export async function* streamChat(
  req: OllamaChatRequest,
  signal?: AbortSignal,
): AsyncIterable<OllamaChunk> {
  const baseUrl = (req.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/api/chat`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        tools: req.tools && req.tools.length > 0 ? req.tools : undefined,
        stream: true,
        options: {
          temperature: req.temperature,
          ...req.options,
        },
      }),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw err;
    }
    throw new OllamaConnectionError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }

    if (response.status === 404) {
      throw new OllamaModelNotFoundError(req.model);
    }
    if (isContextOverflowMessage(errBody)) {
      throw new OllamaContextOverflowError(errBody);
    }
    throw new OllamaRequestError(errBody || response.statusText, response.status);
  }

  if (!response.body) {
    throw new OllamaRequestError('Response body is null', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: {
          error?: string;
          message?: {
            content?: string;
            tool_calls?: OllamaToolCall[];
          };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
        };

        try {
          parsed = JSON.parse(trimmed);
        } catch (e) {
          console.warn('Failed to parse NDJSON line from Ollama:', line, e);
          continue;
        }

        if (parsed.error) {
          if (isContextOverflowMessage(parsed.error)) {
            throw new OllamaContextOverflowError(parsed.error);
          }
          throw new OllamaRequestError(parsed.error, 500);
        }

        const chunkUsage: TokenUsage | undefined =
          parsed.prompt_eval_count !== undefined || parsed.eval_count !== undefined
            ? {
                input: parsed.prompt_eval_count ?? 0,
                output: parsed.eval_count ?? 0,
                total: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0),
              }
            : undefined;

        yield {
          content: parsed.message?.content,
          toolCalls: parsed.message?.tool_calls,
          done: !!parsed.done,
          usage: chunkUsage,
        };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function listModels(baseUrl?: string): Promise<OllamaModel[]> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new OllamaRequestError(res.statusText, res.status);
    }
    const data = (await res.json()) as { models?: OllamaModel[] };
    return data.models || [];
  } catch (err) {
    if (err instanceof OllamaRequestError) throw err;
    throw new OllamaConnectionError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

export async function showModel(
  baseUrl: string | undefined,
  model: string,
): Promise<{ contextLength: number; supportsTools: boolean }> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${host}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });

    if (!res.ok) {
      if (res.status === 404) throw new OllamaModelNotFoundError(model);
      throw new OllamaRequestError(res.statusText, res.status);
    }

    const data = (await res.json()) as {
      model_info?: Record<string, unknown>;
      capabilities?: string[];
      details?: Record<string, unknown>;
    };

    let contextLength = 4096;
    if (data.model_info) {
      for (const [key, val] of Object.entries(data.model_info)) {
        if (key.endsWith('.context_length') && typeof val === 'number') {
          contextLength = val;
          break;
        }
      }
    }

    let supportsTools = true;
    if (Array.isArray(data.capabilities)) {
      supportsTools = data.capabilities.includes('tools');
    }

    return { contextLength, supportsTools };
  } catch (err) {
    if (err instanceof OllamaRequestError || err instanceof OllamaModelNotFoundError) {
      throw err;
    }
    throw new OllamaConnectionError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}
