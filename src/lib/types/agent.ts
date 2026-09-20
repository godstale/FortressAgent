export type ApprovalMode = 'always' | 'dangerous-only' | 'never';

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

export type AgentConnectionStatus = 'unknown' | 'connected' | 'disconnected';

export interface Agent {
  id: string; // uuid
  name: string;
  description?: string;
  systemPrompt: string;
  model: string; // Ollama model tag, e.g. "qwen3.5:9b"
  temperature: number; // 0.0 ~ 2.0, default 0.7
  contextSize: number; // token count. 0 inherits global
  reserveTokens: number; // compaction trigger margin
  keepRecentTokens: number; // tokens to keep after compaction
  enabledSkills: string[]; // SkillManifest.name list
  enabledBuiltinTools: BuiltinToolId[];
  approvalMode: ApprovalMode;
  isDefault: boolean; // exactly one agent is true
  createdAt: string; // ISO 8601
  updatedAt: string;
}

