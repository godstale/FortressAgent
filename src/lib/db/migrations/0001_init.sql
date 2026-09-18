CREATE TABLE IF NOT EXISTS agents (
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
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  workspace_root TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- append-only entries table
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id TEXT,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_session_seq ON entries(session_id, seq);

CREATE TABLE IF NOT EXISTS app_settings (
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
);
