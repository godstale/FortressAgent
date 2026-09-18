import { getDatabase, type SqlDatabase } from '@/lib/db/client';
import type { Agent, ApprovalMode, BuiltinToolId } from '@/lib/types/agent';

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  temperature: number;
  context_size: number;
  reserve_tokens: number;
  keep_recent_tokens: number;
  enabled_skills: string;
  enabled_builtin_tools: string;
  approval_mode: ApprovalMode;
  is_default: number;
  created_at: string;
  updated_at: string;
}

function parseAgentRow(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    systemPrompt: row.system_prompt,
    model: row.model,
    temperature: row.temperature,
    contextSize: row.context_size,
    reserveTokens: row.reserve_tokens,
    keepRecentTokens: row.keep_recent_tokens,
    enabledSkills: JSON.parse(row.enabled_skills || '[]') as string[],
    enabledBuiltinTools: JSON.parse(
      row.enabled_builtin_tools || '[]',
    ) as BuiltinToolId[],
    approvalMode: row.approval_mode,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAgents(dbOverride?: SqlDatabase): Promise<Agent[]> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<AgentRow[]>(
    'SELECT * FROM agents ORDER BY created_at ASC',
  );
  return rows.map(parseAgentRow);
}

export async function getAgent(
  id: string,
  dbOverride?: SqlDatabase,
): Promise<Agent | null> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<AgentRow[]>(
    'SELECT * FROM agents WHERE id = ?',
    [id],
  );
  if (rows.length === 0) return null;
  return parseAgentRow(rows[0]);
}

export async function getDefaultAgent(
  dbOverride?: SqlDatabase,
): Promise<Agent | null> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<AgentRow[]>(
    'SELECT * FROM agents WHERE is_default = 1 LIMIT 1',
  );
  if (rows.length === 0) return null;
  return parseAgentRow(rows[0]);
}

export async function createAgent(
  agent: Omit<Agent, 'createdAt' | 'updatedAt'> & {
    createdAt?: string;
    updatedAt?: string;
  },
  dbOverride?: SqlDatabase,
): Promise<Agent> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();
  const createdAt = agent.createdAt || now;
  const updatedAt = agent.updatedAt || now;

  // Check how many agents currently exist
  const countRows = await db.select<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM agents',
  );
  const existingCount = countRows[0]?.count ?? 0;

  // First agent is automatically default; or if agent explicitly requested default
  let shouldBeDefault = agent.isDefault;
  if (existingCount === 0) {
    shouldBeDefault = true;
  }

  if (shouldBeDefault) {
    await db.execute('UPDATE agents SET is_default = 0');
  }

  await db.execute(
    `INSERT INTO agents (
      id, name, description, system_prompt, model, temperature,
      context_size, reserve_tokens, keep_recent_tokens,
      enabled_skills, enabled_builtin_tools, approval_mode,
      is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.name,
      agent.description ?? null,
      agent.systemPrompt,
      agent.model,
      agent.temperature,
      agent.contextSize,
      agent.reserveTokens,
      agent.keepRecentTokens,
      JSON.stringify(agent.enabledSkills),
      JSON.stringify(agent.enabledBuiltinTools),
      agent.approvalMode,
      shouldBeDefault ? 1 : 0,
      createdAt,
      updatedAt,
    ],
  );

  return {
    ...agent,
    isDefault: shouldBeDefault,
    createdAt,
    updatedAt,
  };
}

export async function updateAgent(
  id: string,
  updates: Partial<Omit<Agent, 'id' | 'createdAt'>>,
  dbOverride?: SqlDatabase,
): Promise<Agent> {
  const db = dbOverride ?? (await getDatabase());
  const existing = await getAgent(id, db);
  if (!existing) {
    throw new Error(`Agent with id "${id}" not found.`);
  }

  const now = new Date().toISOString();
  let nextIsDefault = updates.isDefault ?? existing.isDefault;

  // If setting this agent as default, unset others
  if (updates.isDefault === true) {
    await db.execute('UPDATE agents SET is_default = 0 WHERE id != ?', [id]);
    nextIsDefault = true;
  } else if (updates.isDefault === false && existing.isDefault) {
    // Cannot unset default if it's the only agent or without promoting another
    // But if there are other agents, promote the first one
    const otherRows = await db.select<{ id: string }[]>(
      'SELECT id FROM agents WHERE id != ? ORDER BY created_at ASC LIMIT 1',
      [id],
    );
    if (otherRows.length > 0) {
      await db.execute('UPDATE agents SET is_default = 1 WHERE id = ?', [
        otherRows[0].id,
      ]);
      nextIsDefault = false;
    } else {
      nextIsDefault = true; // Still must be default if only 1 agent
    }
  }

  const merged: Agent = {
    ...existing,
    ...updates,
    isDefault: nextIsDefault,
    updatedAt: now,
  };

  await db.execute(
    `UPDATE agents SET
      name = ?, description = ?, system_prompt = ?, model = ?,
      temperature = ?, context_size = ?, reserve_tokens = ?,
      keep_recent_tokens = ?, enabled_skills = ?,
      enabled_builtin_tools = ?, approval_mode = ?,
      is_default = ?, updated_at = ?
    WHERE id = ?`,
    [
      merged.name,
      merged.description ?? null,
      merged.systemPrompt,
      merged.model,
      merged.temperature,
      merged.contextSize,
      merged.reserveTokens,
      merged.keepRecentTokens,
      JSON.stringify(merged.enabledSkills),
      JSON.stringify(merged.enabledBuiltinTools),
      merged.approvalMode,
      merged.isDefault ? 1 : 0,
      merged.updatedAt,
      id,
    ],
  );

  return merged;
}

export async function deleteAgent(
  id: string,
  dbOverride?: SqlDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  const existing = await getAgent(id, db);
  if (!existing) return;

  await db.execute('DELETE FROM agents WHERE id = ?', [id]);

  // If the deleted agent was default, promote the next agent
  if (existing.isDefault) {
    const nextRows = await db.select<{ id: string }[]>(
      'SELECT id FROM agents ORDER BY created_at ASC LIMIT 1',
    );
    if (nextRows.length > 0) {
      await db.execute('UPDATE agents SET is_default = 1 WHERE id = ?', [
        nextRows[0].id,
      ]);
    }
  }
}
