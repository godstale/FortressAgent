export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface PromptSkillItem {
  name: string;
  description: string;
  filePath?: string;
  disableModelInvocation?: boolean;
}

/**
 * Formats skills list into <available_skills> XML section according to Architecture §6.2.
 * Excludes skills with disableModelInvocation: true.
 * Returns empty string if no skills are available.
 */
export function formatSkillsForPrompt(skills: PromptSkillItem[]): string {
  const activeSkills = skills.filter((s) => !s.disableModelInvocation);

  if (activeSkills.length === 0) {
    return '';
  }

  const skillBlocks = activeSkills
    .map((s) => {
      const name = escapeXml(s.name);
      const desc = escapeXml(s.description);
      const loc = escapeXml(s.filePath || '');

      return `  <skill>\n    <name>${name}</name>\n    <description>${desc}</description>\n    <location>${loc}</location>\n  </skill>`;
    })
    .join('\n');

  return `The following skills provide specialized instructions and workflows for specific tasks:
- Skills are NOT built-in tools. Do NOT attempt to invoke skill names or slash commands (e.g. /wiki-ingest) directly as tools.
- When a task or user request matches a skill's description, triggers, or domain, you MUST first use the \`read\` tool to load and read the full skill instructions from its <location> path (SKILL.md).
- NEVER guess procedures, file formats, or output directory structures (e.g. do not invent paths like .agents/wiki/); strictly adhere to the project layout and rules specified inside the skill file.
- When a skill file references a relative path or script, resolve it against the skill directory (parent folder of SKILL.md) and use that path in commands.

<available_skills>
${skillBlocks}
</available_skills>`;
}
