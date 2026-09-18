import type { Agent } from '@/lib/types/agent';
import { DEFAULT_ACTIVE_TOOLS } from '@/lib/tools/registry';

export const DEFAULT_AGENT: Agent = {
  id: 'default-agent-fortress',
  name: 'Fortress Default',
  description: 'Default local AI assistant for software engineering, documentation, and analysis',
  systemPrompt:
    'You are Fortress, an intelligent local AI workstation assistant. Help the user write code, read files, edit documents, and navigate their workspace efficiently.',
  model: 'qwen3.5:9b',
  temperature: 0.7,
  contextSize: 0,
  reserveTokens: 1024,
  keepRecentTokens: 2048,
  enabledSkills: [],
  enabledBuiltinTools: [...DEFAULT_ACTIVE_TOOLS],
  approvalMode: 'dangerous-only',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
