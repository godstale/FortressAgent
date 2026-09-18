import type { AgentTool } from '@/lib/agent/types';
import type { BuiltinToolId } from '@/lib/types/agent';
import { registerHooks } from '@/lib/agent/hookRegistry';
import { truncateOutput } from './truncate';
import { readTool } from './read';
import { lsTool } from './ls';
import { grepTool } from './grep';
import { findTool } from './find';
import { writeTool } from './write';
import { editTool } from './edit';
import { shellTool } from './shell';
import { webSearchTool } from './webSearch';

export interface ToolContext {
  workspaceRoot?: string;
}

export const DEFAULT_ACTIVE_TOOLS: BuiltinToolId[] = [
  'read',
  'ls',
  'grep',
  'find',
  'write',
  'edit',
];

const toolRegistry = new Map<string, (ctx: ToolContext) => AgentTool>();

export function registerToolFactory(
  id: BuiltinToolId,
  factory: (ctx: ToolContext) => AgentTool,
): void {
  toolRegistry.set(id, factory);
}

// Register all 8 built-in tools
registerToolFactory('read', () => readTool);
registerToolFactory('ls', () => lsTool);
registerToolFactory('grep', () => grepTool);
registerToolFactory('find', () => findTool);
registerToolFactory('write', () => writeTool);
registerToolFactory('edit', () => editTool);
registerToolFactory('shell', () => shellTool);
registerToolFactory('web_search', () => webSearchTool);

export function getBuiltinTools(
  ids: BuiltinToolId[],
  ctx: ToolContext = {},
): AgentTool[] {
  const tools: AgentTool[] = [];
  for (const id of ids) {
    const factory = toolRegistry.get(id);
    if (factory) {
      tools.push(factory(ctx));
    }
  }
  return tools;
}

// Register default afterToolCall truncation hook
registerHooks('builtin:truncate', {
  async afterToolCall(ctx) {
    if (!ctx.result.content) return undefined;
    const res = truncateOutput(ctx.result.content);
    if (res.truncated) {
      return {
        content: res.content,
      };
    }
    return undefined;
  },
});
