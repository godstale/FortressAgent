export type WorkspaceTabType =
  | 'chat'
  | 'editor'
  | 'image-viewer'
  | 'agent-editor'
  | 'agent-stats'
  | 'skill-viewer';

export type SidePanelView =
  | 'chat-sessions'
  | 'explorer'
  | 'agents'
  | 'skills'
  | null;

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, unknown>;
}
