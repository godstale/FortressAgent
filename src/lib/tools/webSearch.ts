import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { AgentTool, AgentToolResult } from '@/lib/agent/types';

interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
}

const WebSearchParametersSchema = z.object({
  query: z.string().describe('Search query terms'),
});

export const webSearchTool: AgentTool<typeof WebSearchParametersSchema> = {
  name: 'web_search',
  label: 'Web Search',
  description:
    'Searches the web for up-to-date documentation, error solutions, or information.',
  parameters: WebSearchParametersSchema,
  risk: 'low',
  executionMode: 'parallel',
  async execute(
    _toolCallId: string,
    params: z.infer<typeof WebSearchParametersSchema>,
  ): Promise<AgentToolResult> {
    try {
      const results = await invoke<SearchResultItem[]>('web_search', {
        query: params.query,
      });

      if (!results || results.length === 0) {
        return {
          content: '검색 결과를 가져오지 못했습니다.',
          details: { query: params.query, results: [] },
        };
      }

      const formatted = results
        .map(
          (r, idx) =>
            `${idx + 1}. [${r.title}](${r.link})\n   ${r.snippet}`,
        )
        .join('\n\n');

      return {
        content: formatted,
        details: {
          query: params.query,
          total: results.length,
          results,
        },
      };
    } catch {
      return {
        content: '검색 결과를 가져오지 못했습니다.',
        details: { query: params.query, results: [] },
      };
    }
  },
};
