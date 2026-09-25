export type WorkspaceTabType =
  | 'chat'
  | 'editor'
  | 'image-viewer'
  | 'agent-editor'
  | 'agent-stats'
  | 'agent-monitor'
  | 'skill-viewer';

export type SidePanelView =
  | 'chat-sessions'
  | 'explorer'
  | 'agents'
  | 'monitoring'
  | null;

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, unknown>;
  pane?: 'primary' | 'secondary';
}
