import { ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/lib/context/WorkspaceContext';

export function TrustWorkspaceDialog() {
  const {
    workspaceRoot,
    trustModalOpen,
    setTrustModalOpen,
    trustCurrentWorkspace,
    rejectCurrentWorkspace,
  } = useWorkspace();

  if (!workspaceRoot) return null;

  return (
    <Dialog open={trustModalOpen} onOpenChange={setTrustModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle className="text-base font-semibold text-foreground">
              워크스페이스 신뢰 확인
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            이 폴더의 <code className="text-foreground font-mono">AGENTS.md</code>와{' '}
            <code className="text-foreground font-mono">.agents/skills/</code>를 로드할까요?
            워크스페이스의 스킬과 지침은 모델에게 파일 수정이나 도구 실행 등의 행동을
            지시할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="p-2.5 rounded-lg bg-muted/50 border border-border/60 text-xs font-mono break-all text-muted-foreground">
          {workspaceRoot}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 sm:justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={rejectCurrentWorkspace}
            className="text-xs"
          >
            신뢰하지 않음
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={trustCurrentWorkspace}
            className="text-xs flex items-center gap-1.5 bg-primary text-primary-foreground"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>신뢰하고 로드</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
