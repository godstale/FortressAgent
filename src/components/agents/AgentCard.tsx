import React, { useState } from 'react';
import {
  Bot,
  MessageSquare,
  Edit2,
  Trash2,
  Star,
  Cpu,
  Thermometer,
  Wrench,
  BookOpen,
  Layers,
  Activity,
  Terminal,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { Agent, AgentConnectionStatus } from '@/lib/types/agent';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface AgentCardProps {
  agent: Agent;
  isOnlyAgent?: boolean;
  status?: AgentConnectionStatus;
  isChecking?: boolean;
  onCheckConnection?: (agent: Agent) => void;
  onOpenMonitor?: (agent: Agent) => void;
  onStartChat: (agent: Agent) => void;
  onShowStats?: (agent: Agent) => void;
  onShowLogs?: (agent: Agent) => void;
  onEdit: (agent: Agent) => void;
  onSetDefault: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isOnlyAgent,
  status = 'unknown',
  isChecking = false,
  onCheckConnection,
  onOpenMonitor,
  onStartChat,
  onShowStats,
  onShowLogs,
  onEdit,
  onSetDefault,
  onDelete,
}) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);


  const handleDelete = () => {
    setDeleteConfirmOpen(false);
    onDelete(agent);
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          containerClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500',
          iconClass: 'text-emerald-500',
          dotClass: 'bg-emerald-500',
          label: '연결됨 (서비스 정상)',
        };
      case 'disconnected':
        return {
          containerClass: 'bg-rose-500/10 border-rose-500/30 text-rose-500',
          iconClass: 'text-rose-500',
          dotClass: 'bg-rose-500',
          label: '미연결 (서비스 미연결 또는 모델 미설치)',
        };
      case 'unknown':
      default:
        return {
          containerClass: 'bg-zinc-700/30 border-zinc-500/40 text-white',
          iconClass: 'text-white',
          dotClass: 'bg-white',
          label: '상태체크 전',
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <>
      <div className="group rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/50 hover:shadow-xs space-y-2.5">
        {/* Header: Name + Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => (onOpenMonitor ? onOpenMonitor(agent) : onCheckConnection?.(agent))}
              disabled={isChecking}
              className={`relative h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer hover:opacity-85 hover:scale-105 active:scale-95 focus:outline-none focus:ring-1 focus:ring-ring ${statusConfig.containerClass}`}
              title={`연결 상태: ${statusConfig.label}${isChecking ? ' (확인 중...)' : ''} - 클릭하여 실시간 모니터링 열기`}
              aria-label={`에이전트 연결 상태: ${statusConfig.label}`}
            >
              {isChecking ? (
                <Loader2 className={`h-4 w-4 animate-spin ${statusConfig.iconClass}`} />
              ) : (
                <Bot className={`h-4 w-4 ${statusConfig.iconClass}`} />
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card shadow-xs ${statusConfig.dotClass}`}
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold text-foreground truncate">{agent.name}</h4>
                {agent.isDefault && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-medium border border-amber-500/25 shrink-0">
                    <Star className="h-2.5 w-2.5 fill-amber-500" />
                    <span>기본</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                {agent.description || '설명 없음'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={() => onCheckConnection?.(agent)}
              disabled={isChecking}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title="연결 상태 확인"
              aria-label="연결 상태 확인"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            </button>
            {!agent.isDefault && (
              <button
                type="button"
                onClick={() => onSetDefault(agent)}
                className="p-1 rounded text-muted-foreground hover:text-amber-500 hover:bg-muted transition-colors"
                title="기본 에이전트로 설정"
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(agent)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="에이전트 수정"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            {!isOnlyAgent && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                title="에이전트 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Metadata Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
            <Cpu className="h-3 w-3 text-primary" />
            <span className="truncate max-w-[100px]">{agent.model}</span>
          </span>
          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
            <Layers className="h-3 w-3 text-cyan-400" />
            <span>
              {agent.contextSize > 0
                ? `${agent.contextSize >= 1024 ? Math.round(agent.contextSize / 1024) + 'k' : agent.contextSize} ctx`
                : '8k ctx'}
            </span>
          </span>
          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
            <Thermometer className="h-3 w-3" />
            <span>{agent.temperature}</span>
          </span>
          <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
            <Wrench className="h-3 w-3" />
            <span>{agent.enabledBuiltinTools.length}개 도구</span>
          </span>
          {agent.enabledSkills.length > 0 && (
            <span className="flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
              <BookOpen className="h-3 w-3 text-sky-400" />
              <span>{agent.enabledSkills.length}개 스킬</span>
            </span>
          )}
        </div>

        {/* Action Buttons: Start Conversation, Statistics & Logs */}
        <div className="pt-1 space-y-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onStartChat(agent)}
            className="w-full h-7 text-xs flex items-center justify-center gap-1.5 border-border/80 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>대화 시작</span>
          </Button>

          <div className="grid grid-cols-3 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpenMonitor?.(agent)}
              className="w-full h-7 text-[10px] px-1 flex items-center justify-center gap-1 text-primary hover:text-primary hover:bg-primary/10 transition-colors border border-primary/30 cursor-pointer"
              title="실시간 GPU 및 LLM 리소스 모니터링 열기"
            >
              <Activity className="h-3 w-3 text-primary" />
              <span>모니터링</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onShowStats?.(agent)}
              className="w-full h-7 text-[10px] px-1 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors border border-border/40 cursor-pointer"
              title="세션 및 호출 지표 통계"
            >
              <Cpu className="h-3 w-3 text-amber-400" />
              <span>통계</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onShowLogs?.(agent)}
              className="w-full h-7 text-[10px] px-1 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors border border-border/40 cursor-pointer"
              title="에이전트 실행 로그"
            >
              <Terminal className="h-3 w-3 text-sky-400" />
              <span>로그</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">에이전트 삭제 확인</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
              정말로 <strong className="text-foreground font-medium">"{agent.name}"</strong>{' '}
              에이전트를 삭제하시겠습니까?
              {agent.isDefault && (
                <span className="block mt-2 text-amber-500 font-medium">
                  * 이 에이전트는 현재 기본 에이전트입니다. 삭제 시 목록의 다음 에이전트가
                  자동으로 기본으로 승격됩니다.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
              className="text-xs"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="text-xs"
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
