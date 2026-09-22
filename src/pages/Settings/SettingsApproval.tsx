import { ShieldCheck, AlertTriangle, ShieldAlert, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalMode } from '@/lib/types/agent';
import { useSettings } from '@/lib/context/SettingsContext';

export function SettingsApproval() {
  const { settings, setDefaultApprovalMode, loading } = useSettings();
  const currentMode = settings.defaultApprovalMode;

  const handleSelectMode = async (mode: ApprovalMode) => {
    try {
      await setDefaultApprovalMode(mode);
    } catch (err) {
      console.error('Failed to update default approval mode:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">도구 승인 정책 (HITL)</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          에이전트가 파일 쓰기, 편집, 셸 실행 등 부수 효과가 있는 도구를 호출할 때 사용자 승인을 받을 지 여부를 결정합니다.
        </p>
      </div>

      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">기본 승인 모드</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              새 에이전트 생성 및 기본 세션에 적용될 보안 수준입니다.
            </p>
          </div>
          {loading && <span className="text-xs text-muted-foreground animate-pulse">불러오는 중...</span>}
        </div>

        <div className="space-y-3 pt-2">
          {/* dangerous-only */}
          <div
            onClick={() => void handleSelectMode('dangerous-only')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors relative',
              currentMode === 'dangerous-only'
                ? 'border-primary bg-accent/30 ring-1 ring-primary/40'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-semibold text-foreground">
                위험 도구만 승인 요청 (권장)
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary font-mono ml-auto">
                기본값
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-relaxed">
              파일 쓰기(<code className="font-mono text-foreground">write</code>,{' '}
              <code className="font-mono text-foreground">edit</code>) 및 셸 명령(
              <code className="font-mono text-foreground">shell</code>) 실행 시 승인 팝업을 표시합니다.
              읽기 전용 작업(<code className="font-mono">read</code>, <code className="font-mono">ls</code>,{' '}
              <code className="font-mono">grep</code>, <code className="font-mono">find</code>)은 자동 승인됩니다.
            </p>
          </div>

          {/* always */}
          <div
            onClick={() => void handleSelectMode('always')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors',
              currentMode === 'always'
                ? 'border-primary bg-accent/30 ring-1 ring-primary/40'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="text-xs font-semibold text-foreground">모든 도구 승인 요청 (엄격)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-relaxed">
              파일 읽기나 검색을 포함한 모든 도구 호출에 대해 사용자의 명시적 승인을 요구합니다.
            </p>
          </div>

          {/* never */}
          <div
            onClick={() => void handleSelectMode('never')}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-colors',
              currentMode === 'never'
                ? 'border-primary bg-accent/30 ring-1 ring-primary/40'
                : 'border-border hover:bg-accent/10',
            )}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">자동 승인 (위험)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-relaxed">
              파일 쓰기 및 편집 작업을 확인 없이 즉시 실행합니다.
            </p>
            <div className="mt-2.5 ml-6 p-2 rounded bg-destructive/10 border border-destructive/20 text-[11px] text-destructive flex items-start gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                보안 주의: 셸 실행(<code className="font-mono underline">shell</code>) 도구는 이 설정과 무관하게 항상 사용자 승인을 요구합니다 (§7, §8.1).
              </span>
            </div>
          </div>
        </div>

        {/* Shell Tool Security Notice */}
        <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border/70 flex items-start gap-2.5 text-xs text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-foreground text-xs">셸 실행 도구 안전 경계</span>
            <p className="text-[11px] leading-relaxed">
              <code className="font-mono text-foreground">shell</code> 도구는 파일시스템 스코프 제한을 우회할 수 있으므로, 어떤 승인 모드에서도 항상 실행 전 명령 전문과 함께 승인 대화상자가 표시됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsApproval;
