import type { SkillManifest } from '@/lib/types/skill';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats skills list into <available_skills> XML section according to Architecture §6.2.
 * Excludes skills with disableModelInvocation: true.
 * Returns empty string if no skills are available.
 */
export function formatSkillsForPrompt(skills: SkillManifest[]): string {
  const activeSkills = skills.filter((s) => !s.disableModelInvocation);

  if (activeSkills.length === 0) {
    return '';
  }

  const skillBlocks = activeSkills
    .map((s) => {
      const name = escapeXml(s.name);
      const desc = escapeXml(s.description);
      const loc = escapeXml(s.filePath);

      return `  <skill>\n    <name>${name}</name>\n    <description>${desc}</description>\n    <location>${loc}</location>\n  </skill>`;
    })
    .join('\n');

  return `<available_skills>
When executing tasks, check if any of the following skills are relevant:
- Load the skill instructions using the \`read\` tool with the location path provided.
- Any relative paths or scripts within the skill must be resolved relative to its parent directory.

${skillBlocks}
</available_skills>`;
}
