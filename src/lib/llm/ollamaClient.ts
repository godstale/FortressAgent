import type { TokenUsage } from '@/lib/agent/types';
import type { LlmPerformanceMetrics } from '@/lib/types/monitoring';
import {
  TauriHttpStatusError,
  decodeFetchBodyStream,
  isTauriRuntime,
  tauriHttpGetText,
  tauriHttpPostStreamText,
  tauriHttpPostText,
} from '@/lib/llm/tauriLlmTransport';

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
  /** OpenAI 호환 청크에서 전달되는 호출 ID (상관관계 유지용, Ollama 네이티브에는 없음) */
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaChunk {
  content?: string;
  thinking?: string;
  toolCalls?: OllamaToolCall[];
  done: boolean;
  usage?: TokenUsage;
  metrics?: LlmPerformanceMetrics;
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
  /**
   * Reasoning 제어 (최상위 필드 — 메시지/시스템 프롬프트를 바꾸지 않으므로
   * 값을 바꿔도 프롬프트 토큰과 prefill 비용에 변화가 없다).
   * - true/false: 사고 출력 요청/생략 (모델이 허용하는 경우)
   * - 'low'|'medium'|'high' 등 문자열: /api/show thinking.values의 레벨 지정
   * - undefined: 필드 생략 → 모델 기본값 사용
   */
  think?: boolean | string | null;
  /** 생성 파라미터 (12. options 병합보다 우선한다 — 명시도·검증이 명확하므로). */
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  seed?: number;
  stopSequences?: string[];
  maxOutputTokens?: number;
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

  const payload = {
    model: req.model,
    messages: req.messages,
    tools: req.tools && req.tools.length > 0 ? req.tools : undefined,
    stream: true,
    ...(req.think !== undefined ? { think: req.think } : {}),
    options: {
      temperature: req.temperature,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      ...(req.topK !== undefined ? { top_k: req.topK } : {}),
      ...(req.repeatPenalty !== undefined ? { repeat_penalty: req.repeatPenalty } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.stopSequences && req.stopSequences.length > 0
        ? { stop: req.stopSequences }
        : {}),
      ...(req.maxOutputTokens !== undefined ? { num_predict: req.maxOutputTokens } : {}),
      ...req.options,
    },
  };
  const bodyJson = JSON.stringify(payload);

  // Tauri Webview의 fetch는 CORS를 강제하므로 Tauri 안에서는 Rust 백엔드로 우회한다.
  let textChunks: AsyncIterable<string>;
  if (isTauriRuntime()) {
    textChunks = tauriHttpPostStreamText(url, bodyJson, undefined, signal);
  } else {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
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
    textChunks = decodeFetchBodyStream(response.body);
  }

  let buffer = '';

  try {
    for await (const text of textChunks) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: {
          error?: string;
          message?: {
            content?: string;
            thinking?: string;
            tool_calls?: OllamaToolCall[];
          };
          done?: boolean;
          total_duration?: number;
          load_duration?: number;
          prompt_eval_count?: number;
          prompt_eval_duration?: number;
          eval_count?: number;
          eval_duration?: number;
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

        let chunkMetrics: LlmPerformanceMetrics | undefined = undefined;
        if (
          parsed.prompt_eval_duration !== undefined ||
          parsed.eval_duration !== undefined ||
          parsed.total_duration !== undefined
        ) {
          const promptEvalCount = parsed.prompt_eval_count ?? 0;
          const promptEvalDurationMs = parsed.prompt_eval_duration
            ? Number((parsed.prompt_eval_duration / 1e6).toFixed(1))
            : 0;
          const evalCount = parsed.eval_count ?? 0;
          const evalDurationMs = parsed.eval_duration
            ? Number((parsed.eval_duration / 1e6).toFixed(1))
            : 0;
          const totalDurationMs = parsed.total_duration
            ? Number((parsed.total_duration / 1e6).toFixed(1))
            : 0;
          const loadDurationMs = parsed.load_duration
            ? Number((parsed.load_duration / 1e6).toFixed(1))
            : 0;

          // If prompt was cached or duration is extremely sub-millisecond (< 20ms with tokens),
          // avoid division by near-zero which yields absurd 120,000+ t/s spikes that skew the charts
          const isPromptCached = promptEvalDurationMs < 20 && promptEvalCount > 5;
          const prefillSpeed =
            isPromptCached
              ? 0
              : promptEvalDurationMs > 0
              ? Number(((promptEvalCount / (promptEvalDurationMs / 1000))).toFixed(1))
              : 0;
          const decodingSpeed =
            evalDurationMs > 0
              ? Number(((evalCount / (evalDurationMs / 1000))).toFixed(1))
              : 0;

          chunkMetrics = {
            totalDurationMs,
            loadDurationMs,
            promptEvalCount,
            promptEvalDurationMs,
            evalCount,
            evalDurationMs,
            prefillSpeed,
            decodingSpeed,
            completedAt: Date.now(),
          };
        }

        yield {
          content: parsed.message?.content,
          thinking: parsed.message?.thinking,
          toolCalls: parsed.message?.tool_calls,
          done: !!parsed.done,
          usage: chunkUsage,
          metrics: chunkMetrics,
        };
      }
    }
  } catch (err) {
    // Tauri 우회 경로의 상태 에러를 Ollama 타입 에러로 매핑한다.
    // (NDJSON 본문에 담긴 모델 에러는 위 루프에서 이미 Ollama* 로 던져진다)
    throw mapTauriStreamError(err, req.model);
  }
}

/** Tauri 우회 호출의 에러를 Ollama 타입 에러로 매핑한다. */
function mapTauriGetError(err: unknown): Error {
  if (err instanceof TauriHttpStatusError) {
    return new OllamaRequestError(err.body || `status ${err.status}`, err.status);
  }
  return new OllamaConnectionError(
    err instanceof Error ? err.message : String(err),
    err,
  );
}

/** Tauri 우회 스트림의 상태 에러를 Ollama 타입 에러로 매핑한다. */
function mapTauriStreamError(err: unknown, model: string): unknown {
  if (err instanceof TauriHttpStatusError) {
    if (err.status === 404) {
      return new OllamaModelNotFoundError(model);
    }
    if (isContextOverflowMessage(err.body)) {
      return new OllamaContextOverflowError(err.body);
    }
    return new OllamaRequestError(err.body || `status ${err.status}`, err.status);
  }
  return err;
}

export async function listModels(baseUrl?: string): Promise<OllamaModel[]> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  // GET에는 Content-Type을 보내지 않는다. body 없는 GET에
  // application/json을 붙이면 CORS preflight(OPTIONS)가 발생해
  // 로컬 서버 연결 확인이 실패할 수 있다.
  if (isTauriRuntime()) {
    try {
      const text = await tauriHttpGetText(`${host}/api/tags`);
      const data = JSON.parse(text) as { models?: OllamaModel[] };
      return data.models || [];
    } catch (err) {
      throw mapTauriGetError(err);
    }
  }
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: 'GET',
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

export async function getRunningModels(baseUrl?: string): Promise<import('@/lib/types/monitoring').OllamaRunningModel[]> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (isTauriRuntime()) {
    try {
      const text = await tauriHttpGetText(`${host}/api/ps`);
      const data = JSON.parse(text) as {
        models?: Array<{
          name: string;
          model: string;
          size: number;
          size_vram: number;
          details?: {
            format?: string;
            family?: string;
            parameter_size?: string;
            quantization_level?: string;
          };
          expires_at?: string;
        }>;
      };
      return data.models || [];
    } catch (err) {
      throw mapTauriGetError(err);
    }
  }
  try {
    const res = await fetch(`${host}/api/ps`, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new OllamaRequestError(res.statusText, res.status);
    }
    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        model: string;
        size: number;
        size_vram: number;
        details?: {
          format?: string;
          family?: string;
          parameter_size?: string;
          quantization_level?: string;
        };
        expires_at?: string;
      }>;
    };
    return data.models || [];
  } catch (err) {
    if (err instanceof OllamaRequestError) throw err;
    throw new OllamaConnectionError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

export interface OllamaThinkingInfo {
  /** 모델이 지원하는 think 값 목록 (boolean on/off 또는 'low'/'medium'/'high' 등 레벨) */
  values: Array<boolean | string>;
  /** think를 생략했을 때 Ollama가 사용하는 기본값 */
  default: boolean | string | null;
}

export async function showModel(
  baseUrl: string | undefined,
  model: string,
): Promise<{ contextLength: number; supportsTools: boolean; thinking?: OllamaThinkingInfo }> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  try {
    const data = await fetchShowPayload(host, model);

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

    // thinking 메타가 없으면 reasoning 미지원 구형 Ollama/모델로 간주 (undefined 유지).
    // values:[false]는 "사고 기능 자체 없음"을 의미한다.
    const thinking: OllamaThinkingInfo | undefined =
      data.thinking && Array.isArray(data.thinking.values)
        ? {
            values: data.thinking.values,
            default: data.thinking.default ?? null,
          }
        : undefined;

    return { contextLength, supportsTools, thinking };
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

/** Ollama /api/show 원시 응답 (showModel·getModelArchitectureInfo 공용). */
interface ShowPayload {
  model_info?: Record<string, unknown>;
  capabilities?: string[];
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
  thinking?: {
    values?: Array<boolean | string>;
    default?: boolean | string | null;
  };
}

/** Tauri 우회 /api/show의 상태 에러를 Ollama 타입 에러로 매핑한다. */
function mapTauriShowError(err: unknown, model: string): Error {
  if (err instanceof TauriHttpStatusError) {
    if (err.status === 404) return new OllamaModelNotFoundError(model);
    return new OllamaRequestError(err.body || `status ${err.status}`, err.status);
  }
  return new OllamaConnectionError(
    err instanceof Error ? err.message : String(err),
    err,
  );
}

/** /api/show 조회. Tauri 안에서는 Rust 백엔드로 우회한다 (CORS 회피). */
async function fetchShowPayload(host: string, model: string): Promise<ShowPayload> {
  const body = JSON.stringify({ name: model });
  if (isTauriRuntime()) {
    try {
      const text = await tauriHttpPostText(`${host}/api/show`, body);
      return JSON.parse(text) as ShowPayload;
    } catch (err) {
      throw mapTauriShowError(err, model);
    }
  }
  const res = await fetch(`${host}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    if (res.status === 404) throw new OllamaModelNotFoundError(model);
    throw new OllamaRequestError(res.statusText, res.status);
  }

  return (await res.json()) as ShowPayload;
}

export async function getModelArchitectureInfo(
  baseUrl: string | undefined,
  model: string,
): Promise<import('@/lib/types/monitoring').OllamaModelArchitectureInfo> {
  const host = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  try {
    const data = await fetchShowPayload(host, model);

    const info = data.model_info || {};
    const arch = (info['general.architecture'] as string) || data.details?.family || 'unknown';
    let paramSize = (data.details?.parameter_size as string) || (info['general.size_label'] as string) || '';
    const paramCount = (info['general.parameter_count'] as number) || 0;
    let contextLimit = 4096;
    let blockCount = 0;
    let embeddingLength = 0;
    let headCount = 0;
    let headCountKv = 0;
    let feedForwardLength = 0;
    const quantLevel = (data.details?.quantization_level as string) || '';
    const format = (data.details?.format as string) || 'gguf';

    for (const [key, val] of Object.entries(info)) {
      if (typeof val === 'number') {
        if (key.endsWith('.context_length')) contextLimit = val;
        else if (key.endsWith('.block_count')) blockCount = val;
        else if (key.endsWith('.embedding_length')) embeddingLength = val;
        else if (key.endsWith('.feed_forward_length')) feedForwardLength = val;
        else if (key.endsWith('.attention.head_count_kv')) headCountKv = val;
        else if (key.endsWith('.attention.head_count')) headCount = val;
      }
    }

    if (!headCountKv && headCount) {
      headCountKv = headCount;
    }

    if (!paramSize && paramCount > 0) {
      paramSize = `${(paramCount / 1e9).toFixed(1)}B`;
    }

    return {
      architecture: arch,
      parameterSize: paramSize,
      parameterCount: paramCount,
      contextLimit,
      blockCount,
      embeddingLength,
      headCount,
      headCountKv,
      feedForwardLength,
      quantizationLevel: quantLevel,
      format,
      rawModelInfo: info,
    };
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

export function calculateEstimatedKvCacheBytes(
  layers: number,
  headCountKv: number,
  embeddingLength: number,
  headCount: number,
  contextTokens: number,
  bytesPerElement = 2,
): number {
  if (!layers || !contextTokens) return 0;
  const hCount = headCount || 32;
  const kvHeads = headCountKv || hCount;
  const headDim = embeddingLength > 0 ? Math.round(embeddingLength / hCount) : 128;
  // 2 (key & value) * layers * kv_heads * head_dim * context_tokens * bytesPerElement
  return 2 * layers * kvHeads * headDim * contextTokens * bytesPerElement;
}

export async function getSystemGpuInfo(): Promise<import('@/lib/types/monitoring').SystemGpuInfo> {
  const isTauri =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  if (!isTauri) {
    return {
      gpuName: 'Mock GPU / Web Emulator',
      vramTotalMb: 12288,
      vramUsedMb: 3500,
      vramFreeMb: 8788,
      gpuUtilizationPct: 15.0,
      gpuTemperatureC: 45.0,
      isNvidia: true,
      systemMemoryTotalMb: 32768,
      systemMemoryFreeMb: 16384,
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    interface RawGpuResult {
      gpu_name: string;
      vram_total_mb: number;
      vram_used_mb: number;
      vram_free_mb: number;
      gpu_utilization_pct: number;
      gpu_temperature_c: number;
      is_nvidia: boolean;
      system_memory_total_mb: number;
      system_memory_free_mb: number;
    }
    const res = await invoke<RawGpuResult>('get_system_gpu_info');
    return {
      gpuName: res.gpu_name,
      vramTotalMb: res.vram_total_mb,
      vramUsedMb: res.vram_used_mb,
      vramFreeMb: res.vram_free_mb,
      gpuUtilizationPct: res.gpu_utilization_pct,
      gpuTemperatureC: res.gpu_temperature_c,
      isNvidia: res.is_nvidia,
      systemMemoryTotalMb: res.system_memory_total_mb,
      systemMemoryFreeMb: res.system_memory_free_mb,
    };
  } catch (err) {
    console.warn('Failed to invoke get_system_gpu_info:', err);
    return {
      gpuName: 'Default System Adapter',
      vramTotalMb: 0,
      vramUsedMb: 0,
      vramFreeMb: 0,
      gpuUtilizationPct: 0,
      gpuTemperatureC: 0,
      isNvidia: false,
      systemMemoryTotalMb: 0,
      systemMemoryFreeMb: 0,
    };
  }
}

