import { getDatabase, type SqlDatabase } from '@/lib/db/client';
import type { ChatSession } from '@/lib/types/chat';

interface SessionRow {
  id: string;
  agent_id: string;
  workspace_root: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

function parseSessionRow(row: SessionRow): ChatSession {
  return {
    id: row.id,
    agentId: row.agent_id,
    workspaceRoot: row.workspace_root,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSessions(
  dbOverride?: SqlDatabase,
): Promise<ChatSession[]> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<SessionRow[]>(
    'SELECT * FROM sessions ORDER BY updated_at DESC',
  );
  return rows.map(parseSessionRow);
}

export async function getSession(
  id: string,
  dbOverride?: SqlDatabase,
): Promise<ChatSession | null> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<SessionRow[]>(
    'SELECT * FROM sessions WHERE id = ?',
    [id],
  );
  if (rows.length === 0) return null;
  return parseSessionRow(rows[0]);
}

export async function createSession(
  session: Omit<ChatSession, 'createdAt' | 'updatedAt'> & {
    createdAt?: string;
    updatedAt?: string;
  },
  dbOverride?: SqlDatabase,
): Promise<ChatSession> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();
  const createdAt = session.createdAt || now;
  const updatedAt = session.updatedAt || now;

  await db.execute(
    'INSERT INTO sessions (id, agent_id, workspace_root, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      session.id,
      session.agentId,
      session.workspaceRoot ?? null,
      session.title,
      createdAt,
      updatedAt,
    ],
  );

  return {
    id: session.id,
    agentId: session.agentId,
    workspaceRoot: session.workspaceRoot ?? null,
    title: session.title,
    createdAt,
    updatedAt,
  };
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<ChatSession, 'title' | 'workspaceRoot' | 'agentId'>>,
  dbOverride?: SqlDatabase,
): Promise<ChatSession> {
  const db = dbOverride ?? (await getDatabase());
  const existing = await getSession(id, db);
  if (!existing) {
    throw new Error(`Session with id "${id}" not found.`);
  }

  const now = new Date().toISOString();
  const merged: ChatSession = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  await db.execute(
    'UPDATE sessions SET agent_id = ?, workspace_root = ?, title = ?, updated_at = ? WHERE id = ?',
    [
      merged.agentId,
      merged.workspaceRoot ?? null,
      merged.title,
      merged.updatedAt,
      id,
    ],
  );

  return merged;
}

export async function deleteSession(
  id: string,
  dbOverride?: SqlDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  // Cascade delete entries
  await db.execute('DELETE FROM entries WHERE session_id = ?', [id]);
  await db.execute('DELETE FROM sessions WHERE id = ?', [id]);
}
