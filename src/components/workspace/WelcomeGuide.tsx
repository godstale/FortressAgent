import {
  FolderOpen,
  Clock,
  Bot,
  Sparkles,
  ShieldCheck,
  Files,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { invoke } from '@tauri-apps/api/core';

export function WelcomeGuide() {
  const { setWorkspaceRoot, recentWorkspaces } = useWorkspace();

  const handlePickFolder = async () => {
    try {
      const picked = await invoke<string | null>('pick_project_folder');
      if (picked) {
        setWorkspaceRoot(picked);
      }
    } catch (err) {
      console.error('Failed to pick project folder:', err);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto flex flex-col items-center justify-center p-8 select-none bg-background text-foreground">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-200">
        {/* Fortress Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center text-primary shadow-sm">
            <Bot className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Fortress AI Workstation</h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            로컬 Ollama LLM 기반 지능형 코딩 및 연구 어시스턴트입니다.
            <br />
            작업을 시작하려면 프로젝트(작업 폴더)를 열어주세요.
          </p>
        </div>

        {/* Primary Action Card */}
        <div className="border border-border/80 rounded-2xl bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <FolderOpen className="h-4 w-4 text-warning" />
                프로젝트 폴더 열기
              </h2>
              <p className="text-xs text-muted-foreground">
                선택한 폴더의 소스 코드, AGENTS.md 지침, 스킬을 기반으로 에이전트가 동작합니다.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={handlePickFolder}
            className="w-full h-11 gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <FolderOpen className="h-4 w-4" />
            <span>폴더 선택하기</span>
            <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
          </Button>

          {/* Recent folders if any */}
          {recentWorkspaces.length > 0 && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>최근 사용한 폴더</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {recentWorkspaces.slice(0, 5).map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setWorkspaceRoot(path)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-muted/60 transition-colors text-left group border border-transparent hover:border-border/60"
                  >
                    <span className="font-mono truncate text-foreground text-[11px]">
                      {path}
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      열기
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <Files className="h-4 w-4 text-primary mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">로컬 파일 작업</div>
            <p className="text-[10px] text-muted-foreground">안전한 샌드박스 파일 읽기/쓰기</p>
          </div>
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <ShieldCheck className="h-4 w-4 text-success mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">위험 동작 승인제</div>
            <p className="text-[10px] text-muted-foreground">쓰기/명령어 실행 전 사용자 확인</p>
          </div>
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <Sparkles className="h-4 w-4 text-warning mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">AGENTS.md & 스킬</div>
            <p className="text-[10px] text-muted-foreground">워크스페이스 규칙 자동 인지</p>
          </div>
        </div>
      </div>
    </div>
  );
}
