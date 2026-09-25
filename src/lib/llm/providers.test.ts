import { describe, it, expect } from 'vitest';
import {
  LLM_PROVIDER_PRESETS,
  getProviderPreset,
  normalizeProviderFields,
  resolveAgentLlmRuntime,
} from './providers';

describe('llm providers', () => {
  it('exposes researched default endpoints for local runtimes', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.defaultBaseUrl).toBe('http://127.0.0.1:11434');
    expect(LLM_PROVIDER_PRESETS.lmstudio.defaultBaseUrl).toBe('http://127.0.0.1:1234/v1');
    expect(LLM_PROVIDER_PRESETS.llamacpp.defaultBaseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(LLM_PROVIDER_PRESETS.vllm.defaultBaseUrl).toBe('http://127.0.0.1:8000/v1');
    expect(LLM_PROVIDER_PRESETS.jan.defaultBaseUrl).toBe('http://127.0.0.1:1337/v1');
    expect(LLM_PROVIDER_PRESETS.openai.defaultBaseUrl).toBe('https://api.openai.com/v1');
  });

  it('marks only ollama as native, everything else OpenAI-compatible', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.openAiCompatible).toBe(false);
    for (const kind of ['lmstudio', 'llamacpp', 'vllm', 'jan', 'openai-compatible', 'openai'] as const) {
      expect(LLM_PROVIDER_PRESETS[kind].openAiCompatible).toBe(true);
    }
  });

  it('requires apiKey only for OpenAI cloud', () => {
    expect(LLM_PROVIDER_PRESETS.openai.requiresApiKey).toBe(true);
    expect(LLM_PROVIDER_PRESETS.lmstudio.requiresApiKey).toBe(false);
    expect(LLM_PROVIDER_PRESETS.jan.requiresApiKey).toBe(false);
    expect(LLM_PROVIDER_PRESETS.ollama.supportsApiKey).toBe(false);
  });

  it('falls back to ollama preset for unknown kinds', () => {
    expect(getProviderPreset(undefined).kind).toBe('ollama');
  });

  it('resolveAgentLlmRuntime uses global Ollama URL for legacy agents', () => {
    const runtime = resolveAgentLlmRuntime({}, 'http://192.168.0.2:11434');
    expect(runtime.kind).toBe('ollama');
    expect(runtime.baseUrl).toBe('http://192.168.0.2:11434');
    expect(runtime.openAiCompatible).toBe(false);
  });

  it('resolveAgentLlmRuntime uses preset defaults when agent has no baseUrl', () => {
    const runtime = resolveAgentLlmRuntime({ llmProvider: 'lmstudio' }, 'http://127.0.0.1:11434');
    expect(runtime.baseUrl).toBe('http://127.0.0.1:1234/v1');
    expect(runtime.openAiCompatible).toBe(true);
  });

  it('resolveAgentLlmRuntime prefers agent-specific baseUrl and trims apiKey', () => {
    const runtime = resolveAgentLlmRuntime(
      { llmProvider: 'vllm', llmBaseUrl: 'http://gpu-server:8000/v1/', llmApiKey: '  secret ' },
      undefined,
    );
    expect(runtime.baseUrl).toBe('http://gpu-server:8000/v1');
    expect(runtime.apiKey).toBe('secret');
  });

  it('normalizeProviderFields stores empty baseUrl when equal to preset default', () => {
    const normalized = normalizeProviderFields({
      llmProvider: 'jan',
      llmBaseUrl: 'http://127.0.0.1:1337/v1',
      llmApiKey: '  x  ',
    });
    expect(normalized).toEqual({ llmProvider: 'jan', llmBaseUrl: '', llmApiKey: 'x' });
  });

  it('normalizeProviderFields keeps custom baseUrl', () => {
    const normalized = normalizeProviderFields({
      llmProvider: 'openai-compatible',
      llmBaseUrl: 'http://nas:8000/v1',
    });
    expect(normalized.llmBaseUrl).toBe('http://nas:8000/v1');
  });
});
