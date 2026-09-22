import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Cpu, Sparkles, MessageSquare, Terminal, Zap, Layers } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { useChatSessions } from '@/lib/context/ChatSessionsContext';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { useChat } from '@/hooks/useChat';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatExecutionLog } from '@/components/chat/ChatExecutionLog';
import { ErrorBanner } from '@/components/chat/ErrorBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as sessionsRepo from '@/lib/db/repositories/sessionsRepo';
import { setActiveApprovalMode } from '@/lib/approval/register';
import { cn } from '@/lib/utils';

export interface ChatTabProps {
  tab: WorkspaceTab;
}

export function ChatTab({ tab }: ChatTabProps) {
  const { getAgent, defaultAgent } = useAgents();
  const { updateTab, openTab } = useWorkspaceTabs();
  const { workspaceRoot } = useWorkspace();
  const { refreshSessions, updateSessionTitle } = useChatSessions();
  const skillsCtx = useSafeSkills();

  const tabAgentId = tab.meta?.agentId as string | undefined;
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    tabAgentId || defaultAgent.id,
  );
  const [viewMode, setViewMode] = useState<'chat' | 'log'>('chat');
  const [yoloMode, setYoloMode] = useState<boolean>(false);
  const [compactDialogOpen, setCompactDialogOpen] = useState<boolean>(false);
  const [compactCustomInstruction, setCompactCustomInstruction] = useState<string>('');
  const [isCompacting, setIsCompacting] = useState<boolean>(false);

  const [sessionWorkspaceRoot, setSessionWorkspaceRoot] = useState<string | null>(null);
  const [customInputHeight, setCustomInputHeight] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = inputContainerRef.current?.getBoundingClientRect().height ?? 110;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - moveEvent.clientY;
      const minH = 80;
      const maxH = Math.min(window.innerHeight * 0.75, 600);
      const nextHeight = Math.max(minH, Math.min(maxH, startHeightRef.current + deltaY));
      setCustomInputHeight(Math.round(nextHeight));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetInputHeight = () => {
    setCustomInputHeight(null);
  };

  const activeAgent = getAgent(selectedAgentId) || defaultAgent;
  const sessionId = (tab.meta?.sessionId as string) || (tab.id.startsWith('chat:') ? tab.id.slice(5) : tab.id);

  // Ensure session record exists in SQLite for stats and persistence tracking
  useEffect(() => {
    void (async () => {
      try {
        const existing = await sessionsRepo.getSession(sessionId);
        if (!existing) {
          await sessionsRepo.createSession({
            id: sessionId,
            agentId: activeAgent.id,
            workspaceRoot: workspaceRoot ?? null,
            title: tab.title || '새 대화',
          });
          await refreshSessions();
        } else if (existing.workspaceRoot) {
          setSessionWorkspaceRoot(existing.workspaceRoot);
        }
      } catch (err) {
        console.error('Failed to ensure session exists in DB:', err);
      }
    })();
  }, [sessionId, activeAgent.id, workspaceRoot, tab.title, refreshSessions]);

  const effectiveCwd = workspaceRoot ?? sessionWorkspaceRoot ?? undefined;

  const {
    messages,
    isStreaming,
    contextUsage,
    sendMessage,
    steer,
    stop,
    error,
    retry,
    compact,
    clearChat,
    injectInfoMessage,
  } = useChat(sessionId, activeAgent, { cwd: effectiveCwd });

  const handleSelectAgent = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    updateTab(tab.id, {
      meta: { ...tab.meta, agentId: newAgentId },
    });
    void sessionsRepo.updateSession(sessionId, { agentId: newAgentId }).catch((err) => {
      console.error('Failed to update session agent:', err);
    });
  };

  const handleSendMessage = useCallback(
    async (text: string) => {
      const isFirstUserMessage = messages.filter((m) => m.role === 'user').length === 0;

      // Ensure session in DB and context
      try {
        const existing = await sessionsRepo.getSession(sessionId);
        if (!existing) {
          await sessionsRepo.createSession({
            id: sessionId,
            agentId: activeAgent.id,
            workspaceRoot: workspaceRoot ?? null,
            title: tab.title || '새 대화',
          });
          await refreshSessions();
        }
      } catch (err) {
        console.error('Failed to ensure session before sending message:', err);
      }

      await sendMessage(text);

      // If this is the first message, extract title and sync to tab & sessions list
      if (isFirstUserMessage) {
        const clean = text.replace(/^[/#]\w+:\w+\s*/, '').replace(/\s+/g, ' ').trim();
        const snippet = clean.length > 22 ? clean.slice(0, 22) + '...' : clean;
        if (snippet) {
          try {
            await updateSessionTitle(sessionId, snippet);
            updateTab(tab.id, { title: snippet });
            await refreshSessions();
          } catch (err) {
            console.error('Failed to update session title:', err);
          }
        }
      }
    },
    [messages, sessionId, activeAgent.id, workspaceRoot, tab.title, tab.id, sendMessage, updateSessionTitle, updateTab, refreshSessions],
  );

  const handleSlashCommand = useCallback(
    async (command: string, args?: string): Promise<boolean> => {
      switch (command) {
        case 'clear':
          await clearChat();
          injectInfoMessage('🧹 대화 및 컨텍스트가 초기화되었습니다.');
          return true;

        case 'usage': {
          const limit = contextUsage?.limit || activeAgent.contextSize || 8192;
          const tokens = contextUsage?.tokens || 0;
          const pct = Math.round((tokens / limit) * 100);
          const userCount = messages.filter((m) => m.role === 'user').length;
          const assistantCount = messages.filter((m) => m.role === 'assistant').length;

          injectInfoMessage(
            `### 📊 세션 사용량 및 통계\n` +
            `- **컨텍스트 토큰 사용량**: \`${tokens.toLocaleString()} / ${limit.toLocaleString()}\` (${pct}%)\n` +
            `- **사용자 턴 수**: \`${userCount}\`회\n` +
            `- **어시스턴트 응답 수**: \`${assistantCount}\`회\n` +
            `- **활성 모델**: \`${activeAgent.model}\``,
          );
          return true;
        }

        case 'agent':
          injectInfoMessage(
            `### 🤖 현재 에이전트 설정 (\`${activeAgent.name}\`)\n` +
            `- **모델 ID**: \`${activeAgent.model}\`\n` +
            `- **도구 승인 모드**: \`${yoloMode ? 'never (YOLO)' : activeAgent.approvalMode}\`\n` +
            `- **컨텍스트 크기**: \`${(activeAgent.contextSize || 8192).toLocaleString()} tokens\`\n` +
            `- **추론 온도 (Temperature)**: \`${activeAgent.temperature ?? 0.7}\`\n` +
            `- **활성화된 도구**: \`${(activeAgent.enabledBuiltinTools || []).join(', ')}\``,
          );
          return true;

        case 'yolo': {
          const next = !yoloMode;
          setYoloMode(next);
          setActiveApprovalMode(next ? 'never' : activeAgent.approvalMode);
          injectInfoMessage(
            next
              ? `⚡ **YOLO 모드가 활성화되었습니다!**\n셸 도구를 제외한 파일 쓰기/편집 도구가 사용자 확인 없이 자동 실행됩니다.`
              : `🛡️ **YOLO 모드가 해제되었습니다.**\n에이전트의 원래 승인 정책(\`${activeAgent.approvalMode}\`)으로 복원되었습니다.`,
          );
          return true;
        }

        case 'settings':
          openTab({
            id: `agent-editor:${activeAgent.id}`,
            type: 'agent-editor',
            title: `${activeAgent.name} 편집`,
            meta: { agentId: activeAgent.id },
          });
          return true;

        case 'skills': {
          const skillsList = skillsCtx?.skills || [];
          if (skillsList.length === 0) {
            injectInfoMessage('🧩 현재 설치되거나 로드된 스킬이 없습니다.');
          } else {
            const skillLines = skillsList
              .map((s) => `- **/skill:${s.name}**: ${s.description} (${s.source === 'workspace' ? '워크스페이스' : '전역'})`)
              .join('\n');
            injectInfoMessage(`### 🧩 설치된 스킬 목록 (${skillsList.length})\n${skillLines}`);
          }
          return true;
        }

        case 'pwd':
          injectInfoMessage(
            `📁 **현재 작업 디렉토리**:\n\`${workspaceRoot || '(프로젝트 폴더가 선택되지 않았습니다)'}\``,
          );
          return true;

        case 'compact':
          if (args) {
            setCompactCustomInstruction(args);
          }
          setCompactDialogOpen(true);
          return true;

        case 'status':
          injectInfoMessage(
            `### 🏰 Fortress 애플리케이션 정보\n` +
            `- **버전**: \`0.1.0\` (Tauri 2 + React 19)\n` +
            `- **Ollama 엔드포인트**: \`http://localhost:11434\`\n` +
            `- **작업 공간**: \`${workspaceRoot || '지정되지 않음'}\`\n` +
            `- **승인 정책**: \`${yoloMode ? 'never (YOLO)' : activeAgent.approvalMode}\``,
          );
          return true;

        default:
          return false;
      }
    },
    [
      clearChat,
      injectInfoMessage,
      contextUsage,
      activeAgent,
      messages,
      yoloMode,
      openTab,
      skillsCtx?.skills,
      workspaceRoot,
    ],
  );

  const handleExecuteCompaction = async () => {
    setIsCompacting(true);
    try {
      await compact(compactCustomInstruction.trim() || undefined);
      setCompactDialogOpen(false);
      setCompactCustomInstruction('');
      injectInfoMessage('🗜️ 컨텍스트 압축이 성공적으로 완료되었습니다.');
    } catch (err) {
      console.error('Compaction dialog error:', err);
    } finally {
      setIsCompacting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 font-medium min-w-0">
          <Bot className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">{tab.title}</span>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono shrink-0">
            <Sparkles className="h-3 w-3 text-warning" />
            <span className="font-semibold text-foreground">{activeAgent.name}</span>
            <span className="text-muted-foreground/60">•</span>
            <Cpu className="h-3 w-3" />
            <span>{activeAgent.model}</span>
          </div>

          {yoloMode && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/20 text-destructive border border-destructive/30 text-[10px] font-semibold animate-pulse">
              <Zap className="h-3 w-3 fill-current" />
              <span>YOLO</span>
            </div>
          )}
        </div>

        {/* View Switcher Button (대화 보기 / 상세 로그 보기) */}
        <div className="flex items-center rounded-lg bg-muted/60 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('chat')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              viewMode === 'chat'
                ? 'bg-background text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>대화</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('log')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              viewMode === 'log'
                ? 'bg-background text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>상세 로그</span>
          </button>
        </div>
      </div>

      {/* Error banner if present */}
      <ErrorBanner error={error} onRetry={retry} />

      {/* Content Area: Chat Messages OR Detailed Execution Log */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {viewMode === 'chat' ? (
          <MessageList messages={messages} isStreaming={isStreaming} />
        ) : (
          <ChatExecutionLog sessionId={tab.id} messages={messages} />
        )}
      </div>

      {/* Resizable handle for Chat Input Area */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="채팅 입력창 크기 조절"
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResetInputHeight}
        className="group relative h-2 -my-1 z-10 cursor-row-resize flex items-center justify-center hover:bg-primary/20 transition-colors select-none"
        title="드래그하여 크기 조절 (더블 클릭 시 자동 크기로 초기화)"
      >
        <div className="w-10 h-1 rounded-full bg-border/80 group-hover:bg-primary transition-colors" />
      </div>

      {/* Input area */}
      <div
        ref={inputContainerRef}
        style={customInputHeight ? { height: `${customInputHeight}px` } : undefined}
        className={cn(
          'p-3 border-t border-border bg-card/20 shrink-0',
          customInputHeight ? 'flex flex-col overflow-hidden' : '',
        )}
      >
        <ChatInput
          onSend={handleSendMessage}
          onSteer={steer}
          onStop={stop}
          onCompact={compact}
          onOpenCompactDialog={() => setCompactDialogOpen(true)}
          onSlashCommand={handleSlashCommand}
          isStreaming={isStreaming}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          isAgentLocked={messages.length > 0}
          contextUsage={contextUsage}
          yoloMode={yoloMode}
          customHeight={customInputHeight ? Math.max(60, customInputHeight - 24) : null}
        />
      </div>

      {/* Manual Compaction Dialog */}
      <Dialog open={compactDialogOpen} onOpenChange={setCompactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-semibold">컨텍스트 수동 압축 (Compact)</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              이전 대화 내역을 구조화된 요약본으로 압축하여 컨텍스트 윈도우 여유 공간을 확보합니다.
              최신 대화는 그대로 보존됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/70 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">현재 컨텍스트:</span>
                <span className="font-semibold text-foreground">
                  {contextUsage?.tokens.toLocaleString() || 0} / {contextUsage?.limit.toLocaleString() || 8192} tokens
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">대화 메시지 수:</span>
                <span className="font-semibold text-foreground">{messages.length}건</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                압축 시 특별 지시 사항 (선택 사항):
              </label>
              <input
                type="text"
                value={compactCustomInstruction}
                onChange={(e) => setCompactCustomInstruction(e.target.value)}
                placeholder="예: 파일 변경 내역과 작성한 SQL 쿼리는 반드시 포함해줘"
                className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCompactDialogOpen(false)}
              disabled={isCompacting}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExecuteCompaction}
              disabled={isCompacting}
              className="gap-1.5 bg-primary text-primary-foreground"
            >
              {isCompacting ? (
                <span>압축 수행 중...</span>
              ) : (
                <>
                  <Layers className="h-3.5 w-3.5" />
                  <span>압축 실행</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChatTab;

