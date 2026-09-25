import type { Agent, LlmProviderKind } from '@/lib/types/agent';

export interface LlmProviderPreset {
  kind: LlmProviderKind;
  /** UI 표시명 (i18n 키는 AgentEditorForm에서 매핑) */
  label: string;
  /** baseUrl 미지정 시 사용할 기본값 */
  defaultBaseUrl: string;
  /** OpenAI 호환 규격 여부 (ollama만 false) */
  openAiCompatible: boolean;
  /** apiKey 입력란을 노출할지 여부 */
  supportsApiKey: boolean;
  /** apiKey 필수 여부 (openai 클라우드는 필수, Jan은 서버 설정에 따라 선택) */
  requiresApiKey: boolean;
  /** 모델 목록 조회 지원 여부 — OpenAI 규격은 ID 목록만 반환 */
  supportsModelList: boolean;
  /** 컨텍스트 길이를 서버에서 자동 조회할 수 있는지 (Ollama /api/show만 가능) */
  supportsAutoContextSize: boolean;
  /** 짧은 설명 (설정 화면 힌트용) */
  hint: string;
}

/**
 * 로컬 런타임 기본 엔드포인트 (추가 자료조사, 2026-09-25 기준):
 * - Ollama: http://127.0.0.1:11434 (/api/chat 네이티브 + /v1 호환도 제공)
 * - LM Studio: http://localhost:1234/v1 (Server 탭, /v1/chat/completions)
 * - llama.cpp llama-server: http://127.0.0.1:8080/v1 (기본 8080 포트)
 * - vLLM: http://localhost:8000/v1 (`vllm serve`, 기본 8000 포트, --tool-call-parser 필요)
 * - Jan: http://127.0.0.1:1337/v1 (Local API Server, 임의 API 키 필요 가능)
 * - OpenAI 클라우드: https://api.openai.com/v1 (API 키 필수)
 */
export const LLM_PROVIDER_PRESETS: Record<LlmProviderKind, LlmProviderPreset> = {
  ollama: {
    kind: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    openAiCompatible: false,
    supportsApiKey: false,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: true,
    hint: 'Ollama 네이티브 API (/api/chat, NDJSON 스트리밍)',
  },
  lmstudio: {
    kind: 'lmstudio',
    label: 'LM Studio',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: 'LM Studio Local Server (OpenAI 호환, 기본 포트 1234)',
  },
  llamacpp: {
    kind: 'llamacpp',
    label: 'llama.cpp (llama-server)',
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: 'llama-server 바이너리 (OpenAI 호환, 기본 포트 8080)',
  },
  vllm: {
    kind: 'vllm',
    label: 'vLLM',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: 'vLLM OpenAI-Compatible Server (기본 포트 8000, --tool-call-parser 권장)',
  },
  jan: {
    kind: 'jan',
    label: 'Jan.ai',
    defaultBaseUrl: 'http://127.0.0.1:1337/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: 'Jan Local API Server (OpenAI 호환, 기본 포트 1337)',
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI-Compatible (Custom)',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: false,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: '기타 OpenAI 호환 서버 (LocalAI, Ollama /v1, OpenRouter, Together 등)',
  },
  openai: {
    kind: 'openai',
    label: 'OpenAI (Cloud)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    openAiCompatible: true,
    supportsApiKey: true,
    requiresApiKey: true,
    supportsModelList: true,
    supportsAutoContextSize: false,
    hint: 'OpenAI 클라우드 API (API 키 필수)',
  },
};

export const LLM_PROVIDER_ORDER: LlmProviderKind[] = [
  'ollama',
  'lmstudio',
  'llamacpp',
  'vllm',
  'jan',
  'openai-compatible',
  'openai',
];

export function getProviderPreset(kind?: LlmProviderKind): LlmProviderPreset {
  return LLM_PROVIDER_PRESETS[kind ?? 'ollama'] ?? LLM_PROVIDER_PRESETS.ollama;
}

export interface ResolvedLlmRuntime {
  kind: LlmProviderKind;
  preset: LlmProviderPreset;
  baseUrl: string;
  apiKey?: string;
  openAiCompatible: boolean;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Agent의 Provider 설정을 실제 접속 정보로 해석한다.
 * - baseUrl 미지정 시: ollama → 전역 설정값(없으면 프리셋 기본), 그 외 → 프리셋 기본
 * - apiKey는 앞뒤 공백 제거 후 빈 문자열이면 undefined
 */
export function resolveAgentLlmRuntime(
  agent: Pick<Agent, 'llmProvider' | 'llmBaseUrl' | 'llmApiKey'>,
  globalOllamaBaseUrl?: string,
): ResolvedLlmRuntime {
  const kind: LlmProviderKind = agent.llmProvider ?? 'ollama';
  const preset = getProviderPreset(kind);
  const rawBase = (agent.llmBaseUrl ?? '').trim();
  let baseUrl: string;
  if (rawBase) {
    baseUrl = normalizeBaseUrl(rawBase);
  } else if (kind === 'ollama') {
    baseUrl = normalizeBaseUrl(globalOllamaBaseUrl || preset.defaultBaseUrl);
  } else {
    baseUrl = normalizeBaseUrl(preset.defaultBaseUrl);
  }
  const apiKey = (agent.llmApiKey ?? '').trim() || undefined;
  return { kind, preset, baseUrl, apiKey, openAiCompatible: preset.openAiCompatible };
}

/** 저장 전 정규화: 기본값과 동일하면 빈 문자열로 저장해 프리셋 변경을 따라가게 한다. */
export function normalizeProviderFields(input: {
  llmProvider?: LlmProviderKind;
  llmBaseUrl?: string;
  llmApiKey?: string;
}): { llmProvider: LlmProviderKind; llmBaseUrl: string; llmApiKey: string } {
  const kind = input.llmProvider ?? 'ollama';
  const preset = getProviderPreset(kind);
  const rawBase = (input.llmBaseUrl ?? '').trim();
  const llmBaseUrl =
    rawBase && normalizeBaseUrl(rawBase) !== normalizeBaseUrl(preset.defaultBaseUrl)
      ? normalizeBaseUrl(rawBase)
      : '';
  return {
    llmProvider: kind,
    llmBaseUrl,
    llmApiKey: (input.llmApiKey ?? '').trim(),
  };
}
