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
} from 'lucide-react';
import type { Agent } from '@/lib/types/agent';
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
  onStartChat: (agent: Agent) => void;
  onEdit: (agent: Agent) => void;
  onSetDefault: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isOnlyAgent,
  onStartChat,
  onEdit,
  onSetDefault,
  onDelete,
}) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDelete = () => {
    setDeleteConfirmOpen(false);
    onDelete(agent);
  };

  return (
    <>
      <div className="group rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/50 hover:shadow-xs space-y-2.5">
        {/* Header: Name + Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Bot className="h-4 w-4" />
            </div>
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

        {/* Action Button: Start Conversation */}
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onStartChat(agent)}
            className="w-full h-7 text-xs flex items-center justify-center gap-1.5 border-border/80 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>대화 시작</span>
          </Button>
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
