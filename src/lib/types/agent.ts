export type ApprovalMode = 'always' | 'dangerous-only' | 'never';

/**
 * Reasoning (사고모드) 제어. Ollama `/api/chat`의 최상위 `think` 필드로 전달된다.
 * - 'default': think를 보내지 않음 → 모델 기본값 사용
 * - 'off': think=false → 모델이 허용하면 사고 출력 생략
 * - 'on': think=effort 문자열(low/medium/high) → 명시적 effort 지정
 */
export type ReasoningMode = 'default' | 'off' | 'on';

/** Reasoning effort 레벨. Ollama가 레벨 문자열을 지원하지 않는 모델(boolean on/off만 지원)에게는
 *  지원하지 않는 이름이 전달되며, Ollama는 그 경우 모델 기본값을 사용한다. */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/** Ollama `/api/chat` 요청에 실리는 think 값. undefined면 필드 자체를 생략한다. */
export type ThinkValue = boolean | string | undefined;

export const DEFAULT_REASONING_MODE: ReasoningMode = 'default';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

/**
 * Agent의 reasoning 설정 + 세션 오버라이드를 Ollama `think` 값으로 해석한다.
 * 메시지 배열을 건드리지 않으므로 effort를 바꿔도 프롬프트 토큰(prefill)에 변화가 없다.
 */
export function resolveThinkValue(
  reasoning?: ReasoningMode,
  effort?: ReasoningEffort,
): ThinkValue {
  const mode = reasoning ?? DEFAULT_REASONING_MODE;
  if (mode === 'off') return false;
  if (mode === 'on') return effort ?? DEFAULT_REASONING_EFFORT;
  return undefined;
}

export type BuiltinToolId =
  | 'read'
  | 'write'
  | 'edit'
  | 'ls'
  | 'grep'
  | 'find'
  | 'shell'
  | 'web_search'
  | 'web_fetch';

/**
 * LLM Provider 종류. Ollama 네이티브 규격(/api/chat, NDJSON)과
 * OpenAI 호환 규격(/v1/chat/completions, SSE)으로 나뉜다.
 * 로컬 런타임(LM Studio / llama.cpp / vLLM / Jan)은 모두 OpenAI 호환
 * 클라이언트로 동작하며 프리셋 기본 Base URL만 다르다.
 * 클라우드(OpenAI/OpenRouter/Azure 등 OpenAI 호환 게이트웨이)도
 * 'openai' 또는 'openai-compatible' + apiKey로 연동한다.
 */
export type LlmProviderKind =
  | 'ollama'
  | 'lmstudio'
  | 'llamacpp'
  | 'vllm'
  | 'jan'
  | 'openai-compatible'
  | 'openai';

export const DEFAULT_LLM_PROVIDER: LlmProviderKind = 'ollama';

export function isOpenAiCompatibleProvider(kind?: LlmProviderKind): boolean {
  return (kind ?? DEFAULT_LLM_PROVIDER) !== 'ollama';
}

export type AgentConnectionStatus = 'unknown' | 'connected' | 'disconnected';

export interface Agent {
  id: string; // uuid
  name: string;
  description?: string;
  systemPrompt: string;
  model: string; // Ollama model tag, e.g. "qwen3.5:9b" (OpenAI 호환 Provider에서는 /v1/models의 ID)
  temperature: number; // 0.0 ~ 2.0, default 0.7
  contextSize: number; // token count. 0 inherits global
  reserveTokens: number; // compaction trigger margin
  keepRecentTokens: number; // tokens to keep after compaction
  enabledSkills: string[]; // SkillManifest.name list
  enabledBuiltinTools: BuiltinToolId[];
  approvalMode: ApprovalMode;
  reasoning?: ReasoningMode; // 사고모드. 미지정 시 'default'(모델 기본값)
  reasoningEffort?: ReasoningEffort; // reasoning==='on'일 때 Ollama think 레벨. 미지정 시 'medium'
  /** LLM Provider 종류. 미지정(구 DB 행) 시 'ollama'로 해석 */
  llmProvider?: LlmProviderKind;
  /** Provider Base URL. 미지정 시 프리셋 기본값(또는 Ollama는 전역 설정) 사용 */
  llmBaseUrl?: string;
  /** 클라우드/인증 필요 서버용 API 키. 로컬 런타임은 보통 불필요(Jan은 임의 문자열 가능) */
  llmApiKey?: string;
  isDefault: boolean; // exactly one agent is true
  createdAt: string; // ISO 8601
  updatedAt: string;
}

