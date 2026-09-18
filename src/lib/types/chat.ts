import type { AgentMessage, TokenUsage } from '@/lib/agent/types';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { ApprovalMode } from '@/lib/types/agent';

export interface ChatSession {
  id: string;
  agentId: string;
  workspaceRoot: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryType = 'message' | 'compaction' | 'custom';

export interface EntryBase {
  id: string;
  sessionId: string;
  parentId: string | null;
  seq: number;
  type: EntryType;
  createdAt: string;
}

export interface MessageEntry extends EntryBase {
  type: 'message';
  message: AgentMessage;
}

export interface CompactionEntry extends EntryBase {
  type: 'compaction';
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: TokenUsage;
  details: { readFiles: string[]; modifiedFiles: string[] };
}

export interface CustomEntry extends EntryBase {
  type: 'custom';
  customType: string;
  payload?: unknown;
}

export type Entry = MessageEntry | CompactionEntry | CustomEntry;

export interface AppSettings {
  id: string;
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  theme: 'dark' | 'light' | 'system';
  language: string;
  ollamaBaseUrl: string;
  defaultContextSize: number;
  defaultApprovalMode: ApprovalMode;
  trustedWorkspaces: string[];
  lastWorkspaceRoot: string | null;
}
