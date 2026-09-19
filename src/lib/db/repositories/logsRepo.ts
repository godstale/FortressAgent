import { getDatabase, type SqlDatabase } from '@/lib/db/client';
import type { LogEntry, LogLevel, LogCategory } from '@/lib/logger/logger';

interface LogRow {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details: string | null;
  session_id: string | null;
  agent_id: string | null;
}

export async function insertLogEntry(
  entry: LogEntry,
  dbOverride?: SqlDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  const serializedDetails =
    entry.details !== undefined ? JSON.stringify(entry.details) : null;
  await db.execute(
    'INSERT INTO execution_logs (id, timestamp, level, category, message, details, session_id, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      entry.id,
      entry.timestamp,
      entry.level,
      entry.category,
      entry.message,
      serializedDetails,
      entry.sessionId ?? null,
      entry.agentId ?? null,
    ],
  );
}

export async function getLogs(
  options: { sessionId?: string; limit?: number } = {},
  dbOverride?: SqlDatabase,
): Promise<LogEntry[]> {
  const db = dbOverride ?? (await getDatabase());
  let rows: LogRow[];

  if (options.sessionId) {
    const limitClause = options.limit ? ` LIMIT ${options.limit}` : '';
    rows = await db.select<LogRow[]>(
      `SELECT id, timestamp, level, category, message, details, session_id, agent_id FROM execution_logs WHERE session_id = ? ORDER BY timestamp ASC${limitClause}`,
      [options.sessionId],
    );
  } else {
    const limitClause = options.limit ? ` LIMIT ${options.limit}` : '';
    rows = await db.select<LogRow[]>(
      `SELECT id, timestamp, level, category, message, details, session_id, agent_id FROM execution_logs ORDER BY timestamp ASC${limitClause}`,
    );
  }

  return rows.map((r) => {
    let parsedDetails: unknown = undefined;
    if (r.details) {
      try {
        parsedDetails = JSON.parse(r.details);
      } catch {
        parsedDetails = r.details;
      }
    }
    return {
      id: r.id,
      timestamp: r.timestamp,
      level: r.level,
      category: r.category,
      message: r.message,
      details: parsedDetails,
      sessionId: r.session_id ?? undefined,
      agentId: r.agent_id ?? undefined,
    };
  });
}

export async function clearLogs(
  sessionId?: string,
  dbOverride?: SqlDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  if (sessionId) {
    await db.execute('DELETE FROM execution_logs WHERE session_id = ?', [
      sessionId,
    ]);
  } else {
    await db.execute('DELETE FROM execution_logs');
  }
}
