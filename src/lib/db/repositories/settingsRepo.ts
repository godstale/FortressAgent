import { getDatabase, type SqlDatabase } from '@/lib/db/client';
import type { AppSettings } from '@/lib/types/chat';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { ApprovalMode } from '@/lib/types/agent';

interface SettingsRow {
  id: string;
  open_tabs: string;
  active_tab_id: string | null;
  theme: 'dark' | 'light' | 'system';
  language: string;
  ollama_base_url: string;
  default_context_size: number;
  default_approval_mode: ApprovalMode;
  trusted_workspaces: string;
  last_workspace_root: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'singleton',
  openTabs: [],
  activeTabId: null,
  theme: 'dark',
  language: 'ko',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  defaultContextSize: 8192,
  defaultApprovalMode: 'dangerous-only',
  trustedWorkspaces: [],
  lastWorkspaceRoot: null,
};

function parseSettingsRow(row: SettingsRow): AppSettings {
  return {
    id: row.id,
    openTabs: JSON.parse(row.open_tabs || '[]') as WorkspaceTab[],
    activeTabId: row.active_tab_id,
    theme: row.theme,
    language: row.language,
    ollamaBaseUrl: row.ollama_base_url,
    defaultContextSize: row.default_context_size,
    defaultApprovalMode: row.default_approval_mode,
    trustedWorkspaces: JSON.parse(row.trusted_workspaces || '[]') as string[],
    lastWorkspaceRoot: row.last_workspace_root,
  };
}

export async function getSettings(
  dbOverride?: SqlDatabase,
): Promise<AppSettings> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.select<SettingsRow[]>(
    "SELECT * FROM app_settings WHERE id = 'singleton'",
  );

  if (rows.length === 0) {
    // Insert default settings
    await db.execute(
      `INSERT INTO app_settings (
        id, open_tabs, active_tab_id, theme, language,
        ollama_base_url, default_context_size, default_approval_mode,
        trusted_workspaces, last_workspace_root
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULT_APP_SETTINGS.id,
        JSON.stringify(DEFAULT_APP_SETTINGS.openTabs),
        DEFAULT_APP_SETTINGS.activeTabId,
        DEFAULT_APP_SETTINGS.theme,
        DEFAULT_APP_SETTINGS.language,
        DEFAULT_APP_SETTINGS.ollamaBaseUrl,
        DEFAULT_APP_SETTINGS.defaultContextSize,
        DEFAULT_APP_SETTINGS.defaultApprovalMode,
        JSON.stringify(DEFAULT_APP_SETTINGS.trustedWorkspaces),
        DEFAULT_APP_SETTINGS.lastWorkspaceRoot,
      ],
    );
    return DEFAULT_APP_SETTINGS;
  }

  return parseSettingsRow(rows[0]);
}

export async function updateSettings(
  updates: Partial<Omit<AppSettings, 'id'>>,
  dbOverride?: SqlDatabase,
): Promise<AppSettings> {
  const db = dbOverride ?? (await getDatabase());
  const current = await getSettings(db);

  const merged: AppSettings = {
    ...current,
    ...updates,
  };

  await db.execute(
    `UPDATE app_settings SET
      open_tabs = ?, active_tab_id = ?, theme = ?, language = ?,
      ollama_base_url = ?, default_context_size = ?, default_approval_mode = ?,
      trusted_workspaces = ?, last_workspace_root = ?
    WHERE id = 'singleton'`,
    [
      JSON.stringify(merged.openTabs),
      merged.activeTabId,
      merged.theme,
      merged.language,
      merged.ollamaBaseUrl,
      merged.defaultContextSize,
      merged.defaultApprovalMode,
      JSON.stringify(merged.trustedWorkspaces),
      merged.lastWorkspaceRoot,
    ],
  );

  return merged;
}
