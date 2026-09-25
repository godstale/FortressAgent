import type { Agent } from '@/lib/types/agent';
import type { TokenUsage } from '@/lib/agent/types';
import type { LlmPerformanceMetrics } from '@/lib/types/monitoring';
import {
  getProviderPreset,
  resolveAgentLlmRuntime,
  type ResolvedLlmRuntime,
} from '@/lib/llm/providers';
import {
  listModels as listOllamaModels,
  showModel as showOllamaModel,
  streamChat as streamOllamaChat,
} from '@/lib/llm/ollamaClient';
import {
  listModels as listOpenAiModels,
  streamChat as streamOpenAiChat,
} from '@/lib/llm/openAiCompatibleClient';

export type { ResolvedLlmRuntime };
export { getProviderPreset, resolveAgentLlmRuntime };

/**
 * 루프/훅이 주입받는 Provider 중립 스트리밍 시그니처.
 * Ollama 네이티브 규격과 OpenAI 호환 규격의 상위 집합이며,
 * 각 클라이언트는 자신이 이해하는 필드만 읽는다.
 */
export interface LlmChatRequestMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function: { name: string; arguments: unknown };
  }>;
  tool_call_id?: string;
}

export interface LlmChatRequest {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: LlmChatRequestMessage[];
  tools?: unknown[];
  temperature?: number;
  think?: boolean | string | null;
  /** 생성 파라미터. 각 클라이언트가 자신의 규격에 맞는 필드만 읽는다. */
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  maxTokens?: number;
  options?: Record<string, unknown>;
}

export interface LlmChunk {
  content?: string;
  thinking?: string;
  toolCalls?: Array<{
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  done: boolean;
  usage?: TokenUsage;
  metrics?: LlmPerformanceMetrics;
}

/** 루프/훅이 주입받는 스트리밍 함수 시그니처 (Ollama/OpenAI 호환 공용). */
export type LlmStreamChatFn = (
  req: LlmChatRequest,
  signal?: AbortSignal,
) => AsyncIterable<LlmChunk>;

/**
 * 런타임에 맞는 스트리밍 함수를 반환한다.
 * 테스트에서 주입한 custom 함수가 있으면 그것을 우선한다.
 */
export function getStreamChatFn(
  runtime: Pick<ResolvedLlmRuntime, 'openAiCompatible'>,
  custom?: LlmStreamChatFn,
): LlmStreamChatFn {
  if (custom) return custom;
  return (runtime.openAiCompatible
    ? (streamOpenAiChat as unknown as LlmStreamChatFn)
    : (streamOllamaChat as unknown as LlmStreamChatFn));
}

export interface ProviderModelInfo {
  name: string;
  size?: number;
}

/** Provider 종류에 맞는 모델 목록 조회 (UI 드롭다운 공용). */
export async function listProviderModels(runtime: ResolvedLlmRuntime): Promise<ProviderModelInfo[]> {
  if (runtime.openAiCompatible) {
    const models = await listOpenAiModels(runtime.baseUrl, runtime.apiKey);
    return models.map((m) => ({ name: m.id }));
  }
  const models = await listOllamaModels(runtime.baseUrl);
  return models.map((m) => ({ name: m.name, size: m.size }));
}

/** 모델 존재 여부 + 서버 도달 가능성을 확인한다. */
export async function checkProviderModel(
  runtime: ResolvedLlmRuntime,
  model: string,
): Promise<'connected' | 'disconnected'> {
  try {
    if (runtime.openAiCompatible) {
      const models = await listOpenAiModels(runtime.baseUrl, runtime.apiKey);
      if (models.some((m) => m.id === model || m.id.toLowerCase() === model.toLowerCase())) {
        return 'connected';
      }
      // 목록에 없어도 실제 추론 가능 모델일 수 있으나, 호출 없이 확인할
      // 방법이 없으므로 목록 기준을 따른다 (OpenAI 규격에 /show 상당 API 없음).
      // 단, 목록 조회 자체가 성공하면 서버는 살아있는 것으로 본다.
      return models.length > 0 ? 'disconnected' : 'disconnected';
    }
    const models = await listOllamaModels(runtime.baseUrl);
    if (models.some((m) => m.name === model || m.name.toLowerCase() === model.toLowerCase())) {
      return 'connected';
    }
    await showOllamaModel(runtime.baseUrl, model);
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

/** Agent + 전역 Ollama URL에서 런타임을 해석하는 편의 함수. */
export function resolveRuntimeForAgent(
  agent: Pick<Agent, 'llmProvider' | 'llmBaseUrl' | 'llmApiKey'>,
  globalOllamaBaseUrl?: string,
): ResolvedLlmRuntime {
  return resolveAgentLlmRuntime(agent, globalOllamaBaseUrl);
}

/** 모니터링/상태 확인 등 baseUrl 문자열만 필요한 호출부용. */
export function resolveBaseUrlForAgent(
  agent: Pick<Agent, 'llmProvider' | 'llmBaseUrl'>,
  globalOllamaBaseUrl?: string,
): string {
  return resolveAgentLlmRuntime(agent, globalOllamaBaseUrl).baseUrl;
}
