import { useState } from 'react';
import { Send, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

export interface ChatTabProps {
  tab: WorkspaceTab;
}

// TODO(Phase2): wire to useChat & FortressAgent runtime

export function ChatTab({ tab }: ChatTabProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    alert('에이전트 런타임은 Phase 2에서 연결됩니다.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/40 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <Bot className="h-4 w-4 text-primary" />
          <span>{tab.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] bg-muted/60 px-2 py-0.5 rounded-full">
          <Sparkles className="h-3 w-3 text-amber-400" />
          <span>Phase 1 골격 (Phase 2 LLM 연결 대기)</span>
        </div>
      </div>

      {/* Message List Area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center select-none">
        <div className="max-w-md flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">Fortress AI Agent</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ollama 로컬 LLM을 사용하여 코딩, 문서 작성, 파일 편집, 시각화를 도와드립니다.
            에이전트 루프 및 스트리밍은 Phase 2에서 활성화됩니다.
          </p>
        </div>
      </div>

      {/* Input Box Area */}
      <div className="p-4 border-t border-border bg-card/20">
        <div className="relative flex items-center border border-border rounded-lg bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="메시지를 입력하세요 (Shift+Enter 줄바꿈)..."
            rows={2}
            className="w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="p-2 shrink-0">
            <Button
              size="sm"
              className="h-8 px-3 text-xs flex items-center gap-1"
              onClick={handleSend}
            >
              <Send className="h-3.5 w-3.5" />
              <span>전송</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatTab;
