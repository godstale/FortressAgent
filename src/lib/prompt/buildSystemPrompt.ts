import type { AgentTool } from '@/lib/agent/types';

export interface ContextFile {
  path: string;
  content: string;
}

export interface SkillItem {
  name: string;
  description: string;
  filePath?: string;
  disableModelInvocation?: boolean;
}

export interface BuildSystemPromptOptions {
  agent: {
    systemPrompt?: string;
    rules?: string;
    addendum?: string;
  };
  tools?: AgentTool[];
  contextFiles?: ContextFile[];
  skills?: SkillItem[];
  visualization?: string;
  cwd?: string;
}

function wrapTag(name: string, content: string): string {
  return `<${name}>\n${content.trim()}\n</${name}>`;
}

export function buildSystemPromptSections(
  options: BuildSystemPromptOptions,
): Record<string, string> {
  const sections: Record<string, string> = {};

  // 1. preamble (NOT wrapped in tag)
  const preamble =
    options.agent.systemPrompt?.trim() ||
    'You are Fortress, an AI assistant workstation for development, documents, and research.';
  sections['preamble'] = preamble;

  // 2. tools
  if (options.tools && options.tools.length > 0) {
    const toolDescriptions = options.tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    sections['tools'] = wrapTag(
      'tools',
      `You have access to the following local tools:\n${toolDescriptions}`,
    );
  }

  // 3. rules
  const rules =
    options.agent.rules?.trim() ||
    `Guidelines:
1. Always prefer precise, minimal edits over rewriting whole files.
2. Read files before editing to confirm context.
3. If an action or tool fails, diagnose and explain clearly.`;
  sections['rules'] = wrapTag('rules', rules);

  // 4. addendum (optional)
  if (options.agent.addendum && options.agent.addendum.trim()) {
    sections['addendum'] = wrapTag('addendum', options.agent.addendum.trim());
  }

  // 5. project_context (from AGENTS.md / workspace context files)
  if (options.contextFiles && options.contextFiles.length > 0) {
    const fileBlocks = options.contextFiles
      .map((cf) => `--- File: ${cf.path} ---\n${cf.content.trim()}`)
      .join('\n\n');
    sections['project_context'] = wrapTag('project_context', fileBlocks);
  }

  // 6. skills (Agent Skills standard progressive disclosure)
  if (options.skills && options.skills.length > 0) {
    const activeSkills = options.skills.filter((s) => !s.disableModelInvocation);
    if (activeSkills.length > 0) {
      const skillList = activeSkills
        .map((s) => `- ${s.name}: ${s.description}${s.filePath ? ` (file: ${s.filePath})` : ''}`)
        .join('\n');
      sections['skills'] = wrapTag(
        'skills',
        `Available skills (read full instructions using read tool when relevant):\n${skillList}`,
      );
    }
  }

  // 7. visualization (Mermaid / Recharts guidelines)
  if (options.visualization && options.visualization.trim()) {
    sections['visualization'] = wrapTag('visualization', options.visualization.trim());
  }

  // 8. cwd
  if (options.cwd && options.cwd.trim()) {
    sections['cwd'] = wrapTag('cwd', options.cwd.trim());
  }

  return sections;
}

export function formatSystemPrompt(sections: Record<string, string>): string {
  return Object.values(sections).filter(Boolean).join('\n\n');
}
