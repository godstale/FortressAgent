import Database, { type QueryResult } from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';

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
    agent_id TEXT NOT NULL,
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
    theme TEXT NOT NULL DEFAULT 'light',
    language TEXT NOT NULL DEFAULT 'ko',
    ollama_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
    default_context_size INTEGER NOT NULL DEFAULT 8192,
    default_approval_mode TEXT NOT NULL DEFAULT 'dangerous-only',
    trusted_workspaces TEXT NOT NULL DEFAULT '[]',
    last_workspace_root TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    session_id TEXT,
    agent_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_execution_logs_session ON execution_logs(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_execution_logs_agent ON execution_logs(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_execution_logs_timestamp ON execution_logs(timestamp)`,
  `CREATE TABLE IF NOT EXISTS agent_monitoring_snapshots (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    gpu_name TEXT,
    gpu_vram_total_mb INTEGER,
    gpu_vram_used_mb INTEGER,
    gpu_vram_free_mb INTEGER,
    gpu_utilization_pct REAL,
    gpu_temperature_c REAL,
    system_memory_total_mb INTEGER,
    system_memory_free_mb INTEGER,
    llm_model TEXT,
    llm_architecture TEXT,
    llm_parameter_size TEXT,
    context_size INTEGER,
    context_limit INTEGER,
    model_weight_bytes INTEGER,
    vram_allocated_bytes INTEGER,
    kv_cache_bytes INTEGER,
    gpu_offload_pct REAL,
    agent_status TEXT,
    current_task TEXT,
    prefill_tokens INTEGER,
    prefill_duration_ms REAL,
    prefill_speed REAL,
    decoding_tokens INTEGER,
    decoding_duration_ms REAL,
    decoding_speed REAL,
    total_duration_ms REAL,
    details TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_monitoring_agent_timestamp ON agent_monitoring_snapshots(agent_id, timestamp)`,
];

export class MemorySqlFallback implements SqlDatabase {
  private tables = new Map<string, Map<string, Record<string, unknown>>>();

  constructor() {
    this.tables.set('agents', new Map());
    this.tables.set('sessions', new Map());
    this.tables.set('entries', new Map());
    this.tables.set('app_settings', new Map());
    this.tables.set('execution_logs', new Map());
    this.tables.set('agent_monitoring_snapshots', new Map());
  }

  async execute(
    query: string,
    bindValues: unknown[] = [],
  ): Promise<QueryResult> {
    const q = query.trim().replace(/\s+/g, ' ');

    if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE UNIQUE INDEX')) {
      return { rowsAffected: 0 };
    }

    if (
      q.startsWith('INSERT INTO agents') ||
      q.startsWith('INSERT OR IGNORE INTO agents')
    ) {
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

    if (q.startsWith('UPDATE app_settings SET open_tabs = ?, active_tab_id = ?')) {
      const [open_tabs, active_tab_id] = bindValues;
      const settings = this.tables.get('app_settings')?.get('singleton');
      if (settings) {
        Object.assign(settings, { open_tabs, active_tab_id });
      }
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

    if (q.startsWith('INSERT INTO execution_logs')) {
      const [id, timestamp, level, category, message, details, session_id, agent_id] =
        bindValues;
      this.tables.get('execution_logs')?.set(id as string, {
        id,
        timestamp,
        level,
        category,
        message,
        details,
        session_id,
        agent_id,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('DELETE FROM execution_logs WHERE session_id = ?')) {
      const [sessionId] = bindValues;
      const logsMap = this.tables.get('execution_logs');
      let affected = 0;
      if (logsMap) {
        for (const [k, v] of logsMap) {
          if (v.session_id === sessionId) {
            logsMap.delete(k);
            affected++;
          }
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM execution_logs WHERE timestamp < ?')) {
      const [cutoff] = bindValues;
      const logsMap = this.tables.get('execution_logs');
      let affected = 0;
      if (logsMap) {
        for (const [k, v] of logsMap) {
          if ((v.timestamp as string) < (cutoff as string)) {
            logsMap.delete(k);
            affected++;
          }
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM execution_logs WHERE id NOT IN')) {
      const [maxKeep] = bindValues;
      const logsMap = this.tables.get('execution_logs');
      if (!logsMap) return { rowsAffected: 0 };
      const sorted = Array.from(logsMap.values()).sort((a, b) =>
        (b.timestamp as string).localeCompare(a.timestamp as string),
      );
      const keepIds = new Set(sorted.slice(0, maxKeep as number).map((r) => r.id as string));
      let affected = 0;
      for (const [k] of logsMap) {
        if (!keepIds.has(k)) {
          logsMap.delete(k);
          affected++;
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM execution_logs')) {
      const count = this.tables.get('execution_logs')?.size ?? 0;
      this.tables.get('execution_logs')?.clear();
      return { rowsAffected: count };
    }

    if (q.startsWith('INSERT INTO agent_monitoring_snapshots')) {
      const [
        id,
        agent_id,
        timestamp,
        gpu_name,
        gpu_vram_total_mb,
        gpu_vram_used_mb,
        gpu_vram_free_mb,
        gpu_utilization_pct,
        gpu_temperature_c,
        system_memory_total_mb,
        system_memory_free_mb,
        llm_model,
        llm_architecture,
        llm_parameter_size,
        context_size,
        context_limit,
        model_weight_bytes,
        vram_allocated_bytes,
        kv_cache_bytes,
        gpu_offload_pct,
        agent_status,
        current_task,
        prefill_tokens,
        prefill_duration_ms,
        prefill_speed,
        decoding_tokens,
        decoding_duration_ms,
        decoding_speed,
        total_duration_ms,
        details,
        created_at,
      ] = bindValues;
      this.tables.get('agent_monitoring_snapshots')?.set(id as string, {
        id,
        agent_id,
        timestamp,
        gpu_name,
        gpu_vram_total_mb,
        gpu_vram_used_mb,
        gpu_vram_free_mb,
        gpu_utilization_pct,
        gpu_temperature_c,
        system_memory_total_mb,
        system_memory_free_mb,
        llm_model,
        llm_architecture,
        llm_parameter_size,
        context_size,
        context_limit,
        model_weight_bytes,
        vram_allocated_bytes,
        kv_cache_bytes,
        gpu_offload_pct,
        agent_status,
        current_task,
        prefill_tokens,
        prefill_duration_ms,
        prefill_speed,
        decoding_tokens,
        decoding_duration_ms,
        decoding_speed,
        total_duration_ms,
        details,
        created_at,
      });
      return { rowsAffected: 1 };
    }

    if (q.startsWith('DELETE FROM agent_monitoring_snapshots WHERE agent_id = ? AND timestamp < ?')) {
      const [agentId, cutoff] = bindValues;
      const snapMap = this.tables.get('agent_monitoring_snapshots');
      let affected = 0;
      if (snapMap) {
        for (const [k, v] of snapMap) {
          if (v.agent_id === agentId && (v.timestamp as string) < (cutoff as string)) {
            snapMap.delete(k);
            affected++;
          }
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM agent_monitoring_snapshots WHERE timestamp < ?')) {
      const [cutoff] = bindValues;
      const snapMap = this.tables.get('agent_monitoring_snapshots');
      let affected = 0;
      if (snapMap) {
        for (const [k, v] of snapMap) {
          if ((v.timestamp as string) < (cutoff as string)) {
            snapMap.delete(k);
            affected++;
          }
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM agent_monitoring_snapshots WHERE agent_id = ? AND id NOT IN')) {
      const [agentId, , maxKeep] = bindValues;
      const snapMap = this.tables.get('agent_monitoring_snapshots');
      if (!snapMap) return { rowsAffected: 0 };
      const agentRows = Array.from(snapMap.values())
        .filter((r) => r.agent_id === agentId)
        .sort((a, b) => (b.timestamp as string).localeCompare(a.timestamp as string));
      const keepIds = new Set(agentRows.slice(0, maxKeep as number).map((r) => r.id as string));
      let affected = 0;
      for (const [k, v] of snapMap) {
        if (v.agent_id === agentId && !keepIds.has(k)) {
          snapMap.delete(k);
          affected++;
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM agent_monitoring_snapshots WHERE agent_id = ?')) {
      const [agentId] = bindValues;
      const snapMap = this.tables.get('agent_monitoring_snapshots');
      let affected = 0;
      if (snapMap) {
        for (const [k, v] of snapMap) {
          if (v.agent_id === agentId) {
            snapMap.delete(k);
            affected++;
          }
        }
      }
      return { rowsAffected: affected };
    }

    if (q.startsWith('DELETE FROM agent_monitoring_snapshots')) {
      const count = this.tables.get('agent_monitoring_snapshots')?.size ?? 0;
      this.tables.get('agent_monitoring_snapshots')?.clear();
      return { rowsAffected: count };
    }

    if (q === 'VACUUM') {
      return { rowsAffected: 0 };
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

    if (
      q.startsWith('SELECT * FROM agents WHERE id = ?') ||
      q.startsWith('SELECT id FROM agents WHERE id = ?')
    ) {
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

    if (q.includes('FROM execution_logs WHERE session_id = ? AND agent_id = ?')) {
      const [sessionId, agentId] = bindValues;
      const logs = Array.from(this.tables.get('execution_logs')?.values() ?? [])
        .filter((l) => l.session_id === sessionId && l.agent_id === agentId)
        .sort((a, b) => (a.timestamp as string).localeCompare(b.timestamp as string));
      return logs as unknown as T;
    }

    if (q.includes('FROM execution_logs WHERE agent_id = ?')) {
      const [agentId] = bindValues;
      const logs = Array.from(this.tables.get('execution_logs')?.values() ?? [])
        .filter((l) => l.agent_id === agentId)
        .sort((a, b) => (a.timestamp as string).localeCompare(b.timestamp as string));
      return logs as unknown as T;
    }

    if (q.includes('FROM execution_logs WHERE session_id = ?')) {
      const [sessionId] = bindValues;
      const logs = Array.from(this.tables.get('execution_logs')?.values() ?? [])
        .filter((l) => l.session_id === sessionId)
        .sort((a, b) => (a.timestamp as string).localeCompare(b.timestamp as string));
      return logs as unknown as T;
    }

    if (q.includes('FROM execution_logs ORDER BY timestamp ASC')) {
      const logs = Array.from(this.tables.get('execution_logs')?.values() ?? [])
        .sort((a, b) => (a.timestamp as string).localeCompare(b.timestamp as string));
      return logs as unknown as T;
    }

    if (q.includes('FROM agent_monitoring_snapshots WHERE agent_id = ?')) {
      const [agentId] = bindValues;
      const snaps = Array.from(this.tables.get('agent_monitoring_snapshots')?.values() ?? [])
        .filter((s) => s.agent_id === agentId)
        .sort((a, b) => (b.timestamp as string).localeCompare(a.timestamp as string));
      return snaps as unknown as T;
    }

    if (q.includes('FROM agent_monitoring_snapshots')) {
      const snaps = Array.from(this.tables.get('agent_monitoring_snapshots')?.values() ?? [])
        .sort((a, b) => (b.timestamp as string).localeCompare(a.timestamp as string));
      return snaps as unknown as T;
    }

    return [] as unknown as T;
  }
}

let mockDb: SqlDatabase | null = null;
let globalDb: SqlDatabase | null = null;
let globalMigrationDone = false;
const projectDbs = new Map<string, SqlDatabase>();

let activeWorkspaceRoot: string | null =
  typeof window !== 'undefined'
    ? localStorage.getItem('fortress_current_workspace_root')
    : null;

export function setActiveWorkspaceRoot(root: string | null): void {
  activeWorkspaceRoot = root;
}

export function getActiveWorkspaceRoot(): string | null {
  return activeWorkspaceRoot;
}

export function setDatabase(db: SqlDatabase | null): void {
  mockDb = db;
  globalDb = db;
  globalMigrationDone = false;
  if (!db) {
    projectDbs.clear();
  }
}

export async function runMigrations(db: SqlDatabase): Promise<void> {
  for (const stmt of MIGRATION_STATEMENTS) {
    await db.execute(stmt);
  }

  // Safe migration for existing DBs to add prefill & decoding columns
  const alterColumns = [
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN prefill_tokens INTEGER',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN prefill_duration_ms REAL',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN prefill_speed REAL',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN decoding_tokens INTEGER',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN decoding_duration_ms REAL',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN decoding_speed REAL',
    'ALTER TABLE agent_monitoring_snapshots ADD COLUMN total_duration_ms REAL',
  ];
  for (const alter of alterColumns) {
    try {
      await db.execute(alter);
    } catch {
      // Column may already exist or table created with it; safe to ignore
    }
  }

  // Ensure default agent exists if agents table is empty
  try {
    const countRows = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM agents',
    );
    if ((countRows[0]?.count ?? 0) === 0) {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO agents (
          id, name, description, system_prompt, model, temperature,
          context_size, reserve_tokens, keep_recent_tokens, enabled_skills,
          enabled_builtin_tools, approval_mode, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          DEFAULT_AGENT.id,
          DEFAULT_AGENT.name,
          DEFAULT_AGENT.description ?? null,
          DEFAULT_AGENT.systemPrompt,
          DEFAULT_AGENT.model,
          DEFAULT_AGENT.temperature,
          DEFAULT_AGENT.contextSize,
          DEFAULT_AGENT.reserveTokens,
          DEFAULT_AGENT.keepRecentTokens,
          JSON.stringify(DEFAULT_AGENT.enabledSkills),
          JSON.stringify(DEFAULT_AGENT.enabledBuiltinTools),
          DEFAULT_AGENT.approvalMode,
          1,
          now,
          now,
        ],
      );
    }
  } catch (err) {
    console.warn('Failed to seed default agent during migrations:', err);
  }
}

function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__,
    )
  );
}

export async function getGlobalDatabase(): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }

  if (globalDb) {
    if (!globalMigrationDone) {
      await runMigrations(globalDb);
      globalMigrationDone = true;
    }
    return globalDb;
  }

  if (!isTauriEnvironment()) {
    globalDb = new MemorySqlFallback();
    await runMigrations(globalDb);
    globalMigrationDone = true;
    return globalDb;
  }

  const db = await Database.load('sqlite:fortress.db');
  globalDb = db;
  await runMigrations(db);
  globalMigrationDone = true;
  return db;
}

export async function getProjectDatabase(
  workspaceRoot?: string | null,
): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }

  const root =
    workspaceRoot ??
    activeWorkspaceRoot ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('fortress_current_workspace_root')
      : null);

  if (!root) {
    return getGlobalDatabase();
  }

  const cached = projectDbs.get(root);
  if (cached) {
    return cached;
  }

  if (!isTauriEnvironment()) {
    const memDb = new MemorySqlFallback();
    await runMigrations(memDb);
    projectDbs.set(root, memDb);
    return memDb;
  }

  // Ensure .fortress directory exists before attempting Database.load
  try {
    await invoke('ensure_fortress_dir', { workspaceRoot: root });
  } catch (err) {
    console.warn(
      'ensure_fortress_dir invoke failed, proceeding with Database.load:',
      err,
    );
  }

  const normalized = root.replace(/\\/g, '/');
  const connUrl = `sqlite:${normalized}/.fortress/fortress.db`;
  const db = await Database.load(connUrl);
  await runMigrations(db);
  projectDbs.set(root, db);
  return db;
}

export async function getDatabase(
  workspaceRoot?: string | null,
): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }

  const root =
    workspaceRoot ??
    activeWorkspaceRoot ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('fortress_current_workspace_root')
      : null);

  if (root) {
    return getProjectDatabase(root);
  }

  return getGlobalDatabase();
}

export async function vacuumDatabase(workspaceRoot?: string | null): Promise<void> {
  const db = await getDatabase(workspaceRoot);
  try {
    await db.execute('VACUUM');
  } catch (err) {
    console.warn('Failed to VACUUM database:', err);
  }
}

