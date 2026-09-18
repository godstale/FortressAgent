import { Puzzle } from 'lucide-react';

// TODO(Phase3): wire to SkillsContext

export function SkillListPanel() {
  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Puzzle className="h-3.5 w-3.5" />
          스킬 관리
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center text-muted-foreground">
        <Puzzle className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-xs font-medium">스킬 목록</p>
        <p className="text-[11px] opacity-70 mt-1">
          (Phase 3에서 .agents/skills 로더로 연결됩니다)
        </p>
      </div>
    </div>
  );
}

export default SkillListPanel;
