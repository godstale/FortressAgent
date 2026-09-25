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
  reasoning TEXT NOT NULL DEFAULT 'default',
  reasoning_effort TEXT NOT NULL DEFAULT 'medium',
  llm_provider TEXT NOT NULL DEFAULT 'ollama',
  llm_base_url TEXT,
  llm_api_key TEXT,
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
  last_workspace_root TEXT,
  monitoring_interval_ms INTEGER NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS agent_monitoring_snapshots (
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
  thinking_tokens INTEGER,
  conversation_id TEXT,
  conversation_seq INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitoring_agent_timestamp ON agent_monitoring_snapshots(agent_id, timestamp);

CREATE TABLE IF NOT EXISTS conversation_token_summaries (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT,
  seq INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  turn_count INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  thinking_tokens INTEGER NOT NULL,
  content_tokens INTEGER NOT NULL,
  status_tokens TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_tokens_agent_started ON conversation_token_summaries(agent_id, started_at);
