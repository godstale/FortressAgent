// TODO(Phase5): wire to HITL approvalBus & SettingsContext
// TODO(Phase4): persist to SQLite app_settings

import { useState } from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalMode } from '@/lib/types/agent';

export function SettingsApproval() {
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('dangerous-only');

  return (
    <div className="space-y-6 select-none">
      <div>
        <h2 className="text-lg font-bold">도구 승인 정책 (HITL)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          에이전트가 파일 쓰기, 편집, 셸 실행 등 부수 효과가 있는 도구를 호출할 때 사용자 승인을 받을 지 여부를 결정합니다.
        </p>
      </div>

      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">기본 승인 모드</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            에이전트 생성 시 기본 적용될 보안 수준입니다.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          {/* dangerous-only */}
          <div
            onClick={() => setApprovalMode('dangerous-only')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors',
              approvalMode === 'dangerous-only'
                ? 'border-primary bg-accent/30'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold">위험 도구만 승인 요청 (권장)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              파일 쓰기(`write`, `edit`), 삭제(`delete_path`) 및 셸 명령(`shell`) 실행 시에만 승인 팝업을 표시합니다.
              읽기 전용 작업(`read`, `ls`, `grep`, `find`)은 자동 승인됩니다.
            </p>
          </div>

          {/* always */}
          <div
            onClick={() => setApprovalMode('always')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors',
              approvalMode === 'always'
                ? 'border-primary bg-accent/30'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              <span className="text-xs font-semibold">모든 도구 승인 요청 (엄격)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              파일 읽기를 포함한 모든 도구 호출에 대해 사용자의 명시적 승인을 요구합니다.
            </p>
          </div>

          {/* never */}
          <div
            onClick={() => setApprovalMode('never')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors',
              approvalMode === 'never'
                ? 'border-primary bg-accent/30'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-semibold">자동 승인 (YOLO 모드)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              모든 도구 호출을 확인 없이 즉시 실행합니다. (단, 시스템 안전 규칙에 따라 셸 실행은 항상 확인이 요구될 수 있습니다)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsApproval;
