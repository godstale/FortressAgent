import Database, { type QueryResult } from '@tauri-apps/plugin-sql';

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close?(db?: string): Promise<boolean>;
}

export const MIGRATION_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    context_size INTEGER NOT NULL DEFAULT 0,
    reserve_tokens INTEGER NOT NULL DEFAULT 0,
    keep_recent_tokens INTEGER NOT NULL DEFAULT 0,
    enabled_skills TEXT NOT NULL DEFAULT '[]',
    enabled_builtin_tools TEXT NOT NULL DEFAULT '[]',
    approval_mode TEXT NOT NULL DEFAULT 'dangerous-only',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    workspace_root TEXT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id TEXT,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_session_seq ON entries(session_id, seq)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    open_tabs TEXT NOT NULL DEFAULT '[]',
    active_tab_id TEXT,
    theme TEXT NOT NULL DEFAULT 'dark',
    language TEXT NOT NULL DEFAULT 'ko',
    ollama_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
    default_context_size INTEGER NOT NULL DEFAULT 8192,
    default_approval_mode TEXT NOT NULL DEFAULT 'dangerous-only',
    trusted_workspaces TEXT NOT NULL DEFAULT '[]',
    last_workspace_root TEXT
  )`,
];

class MemorySqlFallback implements SqlDatabase {
  private tables = new Map<string, Map<string, Record<string, unknown>>>();

  constructor() {
    this.tables.set('agents', new Map());
    this.tables.set('sessions', new Map());
    this.tables.set('entries', new Map());
    this.tables.set('app_settings', new Map());
  }

  async execute(
    query: string,
    bindValues: unknown[] = [],
  ): Promise<QueryResult> {
    const q = query.trim();

    if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE UNIQUE INDEX')) {
      return { rowsAffected: 0 };
    }

    if (q.startsWith('INSERT INTO agents')) {
      const [
        id,
        name,
        description,
        system_prompt,
        model,
        temperature,
        context_size,
        reserve_tokens,
        keep_recent_tokens,
        enabled_skills,
        enabled_builtin_tools,
        approval_mode,
        is_default,
        created_at,
        updated_at,
      ] = bindValues;
      this.tables.get('agents')?.set(id as string, {
        id,
        name,
        description,
        system_prompt,
        model,
        temperature,
        context_size,
        reserve_tokens,
        keep_recent_tokens,
        enabled_skills,
        enabled_builtin_tools,
        approval_mode,
        is_default,
        created_at,
        updated_at,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE agents SET is_default = 0 WHERE id != ?')) {
      const [excludeId] = bindValues;
      for (const [k, a] of this.tables.get('agents') ?? []) {
        if (k !== excludeId) a.is_default = 0;
      }
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE agents SET is_default = 0')) {
      for (const a of this.tables.get('agents')?.values() ?? []) {
        a.is_default = 0;
      }
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE agents SET is_default = 1 WHERE id = ?')) {
      const [targetId] = bindValues;
      const target = this.tables.get('agents')?.get(targetId as string);
      if (target) target.is_default = 1;
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE agents SET')) {
      const [
        name,
        description,
        system_prompt,
        model,
        temperature,
        context_size,
        reserve_tokens,
        keep_recent_tokens,
        enabled_skills,
        enabled_builtin_tools,
        approval_mode,
        is_default,
        updated_at,
        id,
      ] = bindValues;
      const existing = this.tables.get('agents')?.get(id as string);
      if (existing) {
        Object.assign(existing, {
          name,
          description,
          system_prompt,
          model,
          temperature,
          context_size,
          reserve_tokens,
          keep_recent_tokens,
          enabled_skills,
          enabled_builtin_tools,
          approval_mode,
          is_default,
          updated_at,
        });
      }
      return { rowsAffected: 1 };
    }

    if (q.startsWith('DELETE FROM agents WHERE id = ?')) {
      const [id] = bindValues;
      this.tables.get('agents')?.delete(id as string);
      return { rowsAffected: 1 };
    }

    if (q.startsWith('INSERT INTO sessions')) {
      const [id, agent_id, workspace_root, title, created_at, updated_at] =
        bindValues;
      this.tables.get('sessions')?.set(id as string, {
        id,
        agent_id,
        workspace_root,
        title,
        created_at,
        updated_at,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE sessions SET')) {
      const [agent_id, workspace_root, title, updated_at, id] = bindValues;
      const existing = this.tables.get('sessions')?.get(id as string);
      if (existing) {
        Object.assign(existing, { agent_id, workspace_root, title, updated_at });
      }
      return { rowsAffected: 1 };
    }

    if (q.startsWith('DELETE FROM sessions WHERE id = ?')) {
      const [id] = bindValues;
      this.tables.get('sessions')?.delete(id as string);
      return { rowsAffected: 1 };
    }

    if (q.startsWith('INSERT INTO entries')) {
      const [id, session_id, parent_id, seq, type, payload, created_at] =
        bindValues;
      this.tables.get('entries')?.set(id as string, {
        id,
        session_id,
        parent_id,
        seq,
        type,
        payload,
        created_at,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('DELETE FROM entries WHERE session_id = ?')) {
      const [sessionId] = bindValues;
      const entriesMap = this.tables.get('entries');
      if (entriesMap) {
        for (const [k, v] of entriesMap) {
          if (v.session_id === sessionId) {
            entriesMap.delete(k);
          }
        }
      }
      return { rowsAffected: 1 };
    }

    if (q.startsWith('INSERT INTO app_settings')) {
      const [
        id,
        open_tabs,
        active_tab_id,
        theme,
        language,
        ollama_base_url,
        default_context_size,
        default_approval_mode,
        trusted_workspaces,
        last_workspace_root,
      ] = bindValues;
      this.tables.get('app_settings')?.set(id as string, {
        id,
        open_tabs,
        active_tab_id,
        theme,
        language,
        ollama_base_url,
        default_context_size,
        default_approval_mode,
        trusted_workspaces,
        last_workspace_root,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('UPDATE app_settings SET')) {
      const [
        open_tabs,
        active_tab_id,
        theme,
        language,
        ollama_base_url,
        default_context_size,
        default_approval_mode,
        trusted_workspaces,
        last_workspace_root,
      ] = bindValues;
      const settings = this.tables.get('app_settings')?.get('singleton');
      if (settings) {
        Object.assign(settings, {
          open_tabs,
          active_tab_id,
          theme,
          language,
          ollama_base_url,
          default_context_size,
          default_approval_mode,
          trusted_workspaces,
          last_workspace_root,
        });
      }
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 0 };
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    const q = query.trim();

    if (q.startsWith('SELECT COUNT(*) as count FROM agents')) {
      const count = this.tables.get('agents')?.size ?? 0;
      return [{ count }] as unknown as T;
    }

    if (q.startsWith('SELECT * FROM agents WHERE is_default = 1')) {
      const found = Array.from(this.tables.get('agents')?.values() ?? []).find(
        (a) => a.is_default === 1,
      );
      return (found ? [found] : []) as unknown as T;
    }

    if (q.startsWith('SELECT * FROM agents WHERE id = ?')) {
      const [id] = bindValues;
      const found = this.tables.get('agents')?.get(id as string);
      return (found ? [found] : []) as unknown as T;
    }

    if (
      q.startsWith(
        'SELECT id FROM agents WHERE id != ? ORDER BY created_at ASC LIMIT 1',
      )
    ) {
      const [excludeId] = bindValues;
      const sorted = Array.from(this.tables.get('agents')?.values() ?? [])
        .filter((a) => a.id !== excludeId)
        .sort((a, b) =>
          (a.created_at as string).localeCompare(b.created_at as string),
        );
      return (sorted.length > 0 ? [{ id: sorted[0].id }] : []) as unknown as T;
    }

    if (q.startsWith('SELECT id FROM agents ORDER BY created_at ASC LIMIT 1')) {
      const sorted = Array.from(
        this.tables.get('agents')?.values() ?? [],
      ).sort((a, b) =>
        (a.created_at as string).localeCompare(b.created_at as string),
      );
      return (sorted.length > 0 ? [{ id: sorted[0].id }] : []) as unknown as T;
    }

    if (q.startsWith('SELECT * FROM agents ORDER BY created_at ASC')) {
      const sorted = Array.from(
        this.tables.get('agents')?.values() ?? [],
      ).sort((a, b) =>
        (a.created_at as string).localeCompare(b.created_at as string),
      );
      return sorted as unknown as T;
    }

    if (q.startsWith('SELECT * FROM sessions ORDER BY updated_at DESC')) {
      const sorted = Array.from(
        this.tables.get('sessions')?.values() ?? [],
      ).sort((a, b) =>
        (b.updated_at as string).localeCompare(a.updated_at as string),
      );
      return sorted as unknown as T;
    }

    if (q.startsWith('SELECT * FROM sessions WHERE id = ?')) {
      const [id] = bindValues;
      const found = this.tables.get('sessions')?.get(id as string);
      return (found ? [found] : []) as unknown as T;
    }

    if (
      q.startsWith(
        'SELECT MAX(seq) as max_seq FROM entries WHERE session_id = ?',
      )
    ) {
      const [sessionId] = bindValues;
      const sessionEntries = Array.from(
        this.tables.get('entries')?.values() ?? [],
      ).filter((e) => e.session_id === sessionId);
      const maxSeq =
        sessionEntries.length > 0
          ? Math.max(...sessionEntries.map((e) => e.seq as number))
          : null;
      return [{ max_seq: maxSeq }] as unknown as T;
    }

    if (
      q.includes(
        "WHERE session_id = ? AND type = 'compaction' ORDER BY seq DESC LIMIT 1",
      )
    ) {
      const [sessionId] = bindValues;
      const compactions = Array.from(
        this.tables.get('entries')?.values() ?? [],
      )
        .filter((e) => e.session_id === sessionId && e.type === 'compaction')
        .sort((a, b) => (b.seq as number) - (a.seq as number));
      return (compactions.length > 0 ? [compactions[0]] : []) as unknown as T;
    }

    if (
      q.startsWith(
        'SELECT id, session_id, parent_id, seq, type, payload, created_at FROM entries WHERE session_id = ? ORDER BY seq ASC',
      )
    ) {
      const [sessionId] = bindValues;
      const sessionEntries = Array.from(
        this.tables.get('entries')?.values() ?? [],
      )
        .filter((e) => e.session_id === sessionId)
        .sort((a, b) => (a.seq as number) - (b.seq as number));
      return sessionEntries as unknown as T;
    }

    if (q.startsWith("SELECT * FROM app_settings WHERE id = 'singleton'")) {
      const settings = this.tables.get('app_settings')?.get('singleton');
      return (settings ? [settings] : []) as unknown as T;
    }

    return [] as unknown as T;
  }
}

let globalDb: SqlDatabase | null = null;
let migrationDone = false;

export function setDatabase(db: SqlDatabase | null): void {
  globalDb = db;
  migrationDone = false;
}

export async function runMigrations(db: SqlDatabase): Promise<void> {
  for (const stmt of MIGRATION_STATEMENTS) {
    await db.execute(stmt);
  }
}

export async function getDatabase(): Promise<SqlDatabase> {
  if (globalDb) {
    if (!migrationDone) {
      await runMigrations(globalDb);
      migrationDone = true;
    }
    return globalDb;
  }

  // Check if running in Tauri environment
  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__,
    );

  if (!isTauri) {
    globalDb = new MemorySqlFallback();
    await runMigrations(globalDb);
    migrationDone = true;
    return globalDb;
  }

  const db = await Database.load('sqlite:fortress.db');
  globalDb = db;
  await runMigrations(db);
  migrationDone = true;
  return db;
}
