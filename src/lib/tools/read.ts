import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { AgentTool, AgentToolResult } from '@/lib/agent/types';

const ReadParametersSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file to read'),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('1-based line number to start reading from. Use to read subsequent sections if truncated.'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum number of lines to read. Default reads up to output limits.'),
});

export const readTool: AgentTool<typeof ReadParametersSchema> = {
  name: 'read',
  label: 'Read File',
  description:
    'Reads content of a text file with line numbers. Output is truncated at 2000 lines or 50KB. If content is truncated, specify offset to read subsequent chunks.',
  parameters: ReadParametersSchema,
  risk: 'low',
  executionMode: 'parallel',
  async execute(
    _toolCallId: string,
    params: z.infer<typeof ReadParametersSchema>,
  ): Promise<AgentToolResult> {
    const rawContent = await invoke<string>('read_text_file', {
      path: params.path,
    });

    const lines = rawContent.split('\n');
    const totalLines = lines.length;

    const startLine = (params.offset ?? 1) - 1;
    const endLine = params.limit ? startLine + params.limit : lines.length;

    const slicedLines = lines.slice(startLine, endLine);
    const numberedLines = slicedLines.map(
      (line, idx) => `${startLine + idx + 1} | ${line}`,
    );

    const content = numberedLines.join('\n');

    return {
      content,
      details: {
        path: params.path,
        totalLines,
        startLine: startLine + 1,
        returnedLines: slicedLines.length,
      },
    };
  },
};
