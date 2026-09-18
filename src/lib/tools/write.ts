import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { AgentTool, AgentToolResult } from '@/lib/agent/types';

const WriteParametersSchema = z.object({
  path: z.string().describe('Absolute or workspace-relative path of the file to write'),
  content: z.string().describe('Complete text content to write into the file'),
});

export const writeTool: AgentTool<typeof WriteParametersSchema> = {
  name: 'write',
  label: 'Write File',
  description:
    'Writes or overwrites content to a specified file. Parent directories are created automatically if they do not exist.',
  parameters: WriteParametersSchema,
  risk: 'high',
  executionMode: 'sequential',
  async execute(
    _toolCallId: string,
    params: z.infer<typeof WriteParametersSchema>,
  ): Promise<AgentToolResult> {
    await invoke('write_text_file', {
      path: params.path,
      contents: params.content,
    });

    const byteLength = new TextEncoder().encode(params.content).length;
    return {
      content: `Successfully wrote ${byteLength} bytes to ${params.path}`,
      details: {
        path: params.path,
        bytesWritten: byteLength,
      },
    };
  },
};
