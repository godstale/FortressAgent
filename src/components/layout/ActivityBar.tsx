import { MessageSquare, Bot, Files, Puzzle, Settings, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { SidePanelView } from '@/lib/types/workspaceTab';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSafeWorkspace } from '@/lib/context/WorkspaceContext';

export interface ActivityBarProps {
  activeView: SidePanelView;
  onSelect: (view: Exclude<SidePanelView, null>) => void;
}

interface ActivityBarItem {
  view: Exclude<SidePanelView, null>;
  icon: LucideIcon;
  title: string;
}

const ITEMS: ActivityBarItem[] = [
  { view: 'explorer', icon: Files, title: '파일 탐색기' },
  { view: 'chat-sessions', icon: MessageSquare, title: '대화 목록' },
  { view: 'agents', icon: Bot, title: '에이전트 관리' },
  { view: 'skills', icon: Puzzle, title: '스킬 관리' },
];

export function ActivityBar({ activeView, onSelect }: ActivityBarProps) {
  const workspace = useSafeWorkspace();
  const hasWorkspace = workspace === null || Boolean(workspace.workspaceRoot);

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        aria-label="Activity Bar"
        className="w-12 shrink-0 h-full flex flex-col items-center justify-between bg-sidebar border-r border-border py-2 select-none"
      >
        <div className="flex flex-col items-center gap-1 w-full">
          {ITEMS.map(({ view, icon: Icon, title }) => {
            const isActive = activeView === view;
            const isItemDisabled = !hasWorkspace && view !== 'explorer';
            return (
              <Tooltip key={view}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isItemDisabled}
                    onClick={() => {
                      if (!isItemDisabled) {
                        onSelect(view);
                      }
                    }}
                    aria-label={isItemDisabled ? `${title} (폴더 선택 필요)` : title}
                    className={cn(
                      'w-10 h-10 flex items-center justify-center rounded-md transition-colors relative',
                      isItemDisabled
                        ? 'text-muted-foreground/30 cursor-not-allowed hover:bg-transparent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer',
                      isActive && 'text-primary bg-primary/10 hover:text-primary hover:bg-primary/15 font-medium',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isItemDisabled ? `${title} (폴더 선택 필요)` : title}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            {!hasWorkspace ? (
              <button
                type="button"
                disabled
                aria-label="설정 (파일 메뉴 이용)"
                className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground/30 cursor-not-allowed"
              >
                <Settings className="h-5 w-5" />
              </button>
            ) : (
              <Link
                to="/settings"
                aria-label="설정"
                className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{!hasWorkspace ? '설정 (파일 메뉴에서 사용 가능)' : '설정'}</p>
          </TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
}
