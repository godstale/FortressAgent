import {
  Layers,
  Trash2,
  X,
  Terminal,
  Puzzle,
  MessageSquare,
  Play,
  Pause,
} from 'lucide-react';
import type { QueuedItem } from '@/lib/agent/chatQueueManager';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChatQueueFloatingDockProps {
  items: QueuedItem[];
  isPaused?: boolean;
  onRemoveItem: (itemId: string) => void;
  onClearQueue: () => void;
  onResumeQueue?: () => void;
  onRunItem?: (itemId: string) => void;
}

export function ChatQueueFloatingDock({
  items,
  isPaused = false,
  onRemoveItem,
  onClearQueue,
  onResumeQueue,
  onRunItem,
}: ChatQueueFloatingDockProps) {
  if (items.length === 0) return null;

  return (
    <div className="px-3 py-1.5 z-20 shrink-0 select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div
        className={cn(
          'rounded-xl border backdrop-blur-md shadow-md p-2.5 space-y-2 transition-colors',
          isPaused
            ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20'
            : 'border-primary/30 bg-card/95',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'h-5 w-5 rounded-md flex items-center justify-center shrink-0',
                isPaused
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {isPaused ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Layers className="h-3.5 w-3.5 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-semibold text-foreground">
                대기 큐
              </span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold',
                  isPaused
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-primary/15 text-primary',
                )}
              >
                {items.length}건 {isPaused ? '일시 중단됨' : '대기 중'}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate hidden md:inline">
              {isPaused
                ? '• 실행이 중단되었습니다. 항목을 클릭하여 실행하거나 재개하세요.'
                : '• 현재 작업 완료 후 순서대로 실행됩니다.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Resume button when paused */}
            {isPaused && onResumeQueue && (
              <Button
                type="button"
                size="sm"
                onClick={onResumeQueue}
                className="h-6 px-2.5 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors gap-1 shadow-xs cursor-pointer"
                title="첫 번째 작업부터 이어서 자동 순차 실행"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>계속 실행</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearQueue}
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors gap-1 cursor-pointer"
              title="대기 중인 모든 요청 삭제"
            >
              <Trash2 className="h-3 w-3" />
              <span>모두 비우기</span>
            </Button>
          </div>
        </div>

        {/* Queued Items List */}
        <div className="max-h-36 overflow-y-auto overscroll-contain space-y-1.5 pr-1">
          {items.map((item, idx) => {
            const isSlashCommand = item.type === 'slash_command';
            const isSkill = item.type === 'skill';

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isPaused && onRunItem) {
                    onRunItem(item.id);
                  }
                }}
                className={cn(
                  'flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all group',
                  isPaused
                    ? 'bg-card/70 hover:bg-muted/80 hover:border-primary/50 cursor-pointer'
                    : 'bg-muted/40 hover:bg-muted/70 border-border/50',
                )}
                title={
                  isPaused
                    ? '클릭하면 이 작업을 즉시 실행하고 이후 항목을 순차 처리합니다'
                    : undefined
                }
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-muted-foreground font-semibold shrink-0">
                    #{idx + 1}
                  </span>

                  {isSlashCommand ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono text-[10px] shrink-0 font-medium">
                      <Terminal className="h-3 w-3" />
                      <span>명령어: /{item.commandName || 'cmd'}</span>
                    </span>
                  ) : isSkill ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 text-warning font-mono text-[10px] shrink-0 font-medium">
                      <Puzzle className="h-3 w-3" />
                      <span>스킬</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] shrink-0">
                      <MessageSquare className="h-3 w-3" />
                      <span>요청</span>
                    </span>
                  )}

                  <span className="text-foreground text-[11px] truncate flex-1 font-sans">
                    {item.text}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Direct run button if paused */}
                  {isPaused && onRunItem && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunItem(item.id);
                      }}
                      className="h-5 w-5 rounded flex items-center justify-center text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                      title="이 작업 실행"
                    >
                      <Play className="h-3 w-3 fill-current" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors cursor-pointer"
                    title="이 항목 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
