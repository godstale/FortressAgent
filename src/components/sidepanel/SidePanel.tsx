import type { SidePanelView } from '@/lib/types/workspaceTab';
import { ChatSessionList } from '@/components/chatsessions/ChatSessionList';
import { AgentListPanel } from '@/components/agents/AgentListPanel';
import { SkillListPanel } from '@/components/skills/SkillListPanel';
import { FileTree } from '@/components/explorer/FileTree';

export interface SidePanelProps {
  activeView: SidePanelView;
}

export function SidePanel({ activeView }: SidePanelProps) {
  if (!activeView) {
    return null;
  }

  switch (activeView) {
    case 'chat-sessions':
      return <ChatSessionList />;
    case 'agents':
      return <AgentListPanel />;
    case 'skills':
      return <SkillListPanel />;
    case 'explorer':
      return <FileTree />;
    default:
      return null;
  }
}

export default SidePanel;
