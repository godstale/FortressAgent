import { useState, useRef, useEffect, useMemo, useContext, type KeyboardEvent } from 'react';
import {
  Send,
  Square,
  CornerDownLeft,
  Puzzle,
  AlertCircle,
  Bot,
  Terminal,
  Zap,
  RotateCcw,
  BarChart2,
  Settings,
  Folder,
  Layers,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SkillManifest } from '@/lib/types/skill';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { AgentsContext } from '@/lib/context/AgentsContext';
import { resolveSkillInvocation, parseSkillCommand } from '@/lib/skills/invokeSkill';

import { ContextGauge } from './ContextGauge';
import { cn } from '@/lib/utils';

export interface SlashCommandOption {
  type: 'command' | 'skill';
  name: string;
  syntax: string;
  description: string;
  source?: 'workspace' | 'global';
  icon?: typeof Terminal;
}

const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  { type: 'command', name: 'clear', syntax: '/clear', description: '대화창을 초기화 (컨텍스트 초기화)', icon: RotateCcw },
  { type: 'command', name: 'usage', syntax: '/usage', description: 'context 사용량을 표시, 기본적인 agent 사용 통계를 표시', icon: BarChart2 },
  { type: 'command', name: 'agent', syntax: '/agent', description: '현재 설정된 agent 설정을 표시', icon: Bot },
  { type: 'command', name: 'yolo', syntax: '/yolo', description: '최대 허용 모드로 실행 (채팅창 상단에 현재 모드 표시)', icon: Zap },
  { type: 'command', name: 'settings', syntax: '/settings', description: 'agent 설정 화면으로 전환', icon: Settings },
  { type: 'command', name: 'skills', syntax: '/skills', description: '설치된 skill 들을 보여줌', icon: Puzzle },
  { type: 'command', name: 'pwd', syntax: '/pwd', description: '현재 작업 디렉토리 경로를 출력', icon: Folder },
  { type: 'command', name: 'compact', syntax: '/compact', description: 'context 압축 작업을 실행', icon: Layers },
  { type: 'command', name: 'status', syntax: '/status', description: 'Fortress 앱 정보를 표시', icon: Info },
];

export interface ChatInputProps {
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onStop: () => void;
  onCompact?: (instructions?: string) => Promise<void> | void;
  onOpenCompactDialog?: () => void;
  onSlashCommand?: (command: string, args?: string) => boolean | Promise<boolean>;
  isStreaming: boolean;
  placeholder?: string;
  skills?: SkillManifest[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
  isAgentLocked?: boolean;
  contextUsage?: { tokens: number; limit: number };
  yoloMode?: boolean;
  customHeight?: number | null;
  maxHeight?: number;
}

export function ChatInput({
  onSend,
  onSteer,
  onStop,
  onCompact,
  onOpenCompactDialog,
  onSlashCommand,
  isStreaming,
  placeholder,
  skills: skillsProp,
  selectedAgentId,
  onSelectAgent,
  isAgentLocked,
  contextUsage,
  yoloMode,
  customHeight,
  maxHeight = 180,
}: ChatInputProps) {
  const safeSkillsCtx = useSafeSkills();
  const availableSkills = useMemo(() => {
    return skillsProp ?? safeSkillsCtx?.skills ?? [];
  }, [skillsProp, safeSkillsCtx?.skills]);

  const agentsCtx = useContext(AgentsContext);
  const currentAgent = useMemo(() => {
    if (!agentsCtx) return null;
    const targetId = selectedAgentId || agentsCtx.defaultAgent.id;
    return agentsCtx.getAgent(targetId) || agentsCtx.defaultAgent;
  }, [agentsCtx, selectedAgentId]);

  const [text, setText] = useState('');
  const [autocompleteDismissed, setAutocompleteDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Detect `/` slash command or `/skill:<filter>` pattern before any whitespace
  const autocompleteQuery = useMemo(() => {
    if (autocompleteDismissed) return null;
    const match = text.match(/^\/([^\s]*)$/);
    if (!match) return null;
    return match[1].toLowerCase();
  }, [text, autocompleteDismissed]);

  const filteredOptions = useMemo<SlashCommandOption[]>(() => {
    if (autocompleteQuery === null) return [];
    let query = autocompleteQuery;
    let isSkillQuery = false;
    if (query.startsWith('skill:')) {
      query = query.slice(6);
      isSkillQuery = true;
    }

    const commandMatches = isSkillQuery
      ? []
      : BUILTIN_SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().includes(query));

    const skillMatches: SlashCommandOption[] = availableSkills
      .filter((s) => s.name.toLowerCase().includes(query))
      .map((s) => ({
        type: 'skill' as const,
        name: s.name,
        syntax: `/skill:${s.name} `,
        description: s.description,
        source: s.source,
      }));

    return [...commandMatches, ...skillMatches];
  }, [autocompleteQuery, availableSkills]);

  const isAutocompleteOpen =
    autocompleteQuery !== null && filteredOptions.length > 0;

  // Derive clamped selected index without setting state in effect
  const activeIndex =
    selectedIndex < filteredOptions.length ? selectedIndex : 0;

  // Auto-resize textarea height when not in fixed/custom height mode
  useEffect(() => {
    if (!textareaRef.current) return;
    if (customHeight) {
      textareaRef.current.style.height = '100%';
      return;
    }
    textareaRef.current.style.height = 'auto';
    const scrollHeight = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, [text, customHeight, maxHeight]);

  const selectOption = (opt: SlashCommandOption) => {
    if (opt.type === 'command') {
      if (opt.name === 'compact' && onOpenCompactDialog) {
        onOpenCompactDialog();
        setText('');
        setAutocompleteDismissed(true);
        return;
      }
      setText(`${opt.syntax} `);
      setAutocompleteDismissed(true);
      setSelectedIndex(0);
      textareaRef.current?.focus();
    } else {
      setText(opt.syntax);
      setAutocompleteDismissed(true);
      setSelectedIndex(0);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setErrorMessage(null);

    // Check built-in slash commands
    const slashMatch = trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
    if (slashMatch) {
      const commandName = slashMatch[1].toLowerCase();
      const args = slashMatch[2]?.trim();

      if (commandName === 'compact') {
        if (onCompact) {
          try {
            await onCompact(args);
            setText('');
            setAutocompleteDismissed(false);
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
            return;
          } catch (err) {
            setErrorMessage(
              err instanceof Error ? err.message : '수동 압축에 실패했습니다.',
            );
            return;
          }
        }
      }

      if (onSlashCommand) {
        const handled = await onSlashCommand(commandName, args);
        if (handled) {
          setText('');
          setAutocompleteDismissed(false);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
          return;
        }
      }
    }

    let messageToSend = trimmed;

    if (parseSkillCommand(trimmed)) {
      try {
        const resolved = await resolveSkillInvocation(trimmed, availableSkills);
        if (resolved) {
          messageToSend = resolved;
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : '스킬 호출에 실패했습니다.',
        );
        return;
      }
    }

    if (isStreaming) {
      onSteer(messageToSend);
    } else {
      onSend(messageToSend);
    }

    setText('');
    setAutocompleteDismissed(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent sending during IME composition (e.g. Korean / Japanese / Chinese typing)
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (isAutocompleteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = filteredOptions[activeIndex];
        if (chosen) {
          selectOption(chosen);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleTextChange = (val: string) => {
    setText(val);
    setAutocompleteDismissed(false);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const defaultPlaceholder = isStreaming
    ? '스트리밍 중입니다 (입력 후 Enter시 지시 주입 — Steering)...'
    : '메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈, /: 슬래시 명령어, /skill: 스킬)...';

  return (
    <div
      style={customHeight ? { height: `${customHeight}px` } : undefined}
      className={cn(
        'relative border border-border rounded-xl bg-background shadow-xs focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all',
        customHeight ? 'flex flex-col overflow-hidden' : '',
      )}
    >
      {/* Autocomplete popup */}
      {isAutocompleteOpen && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="명령어 및 스킬 자동완성 목록"
          className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>사용 가능한 슬래시 명령 / 스킬 ({filteredOptions.length})</span>
            <span className="text-[10px] text-muted-foreground/70 lowercase font-normal">
              ↑↓ 탐색, Enter 선택
            </span>
          </div>
          {filteredOptions.map((opt, idx) => {
            const isSelected = idx === activeIndex;
            const Icon = opt.icon || (opt.type === 'skill' ? Puzzle : Terminal);
            return (
              <button
                key={`${opt.type}-${opt.name}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <div
                  className={`p-1 rounded-md shrink-0 mt-0.5 ${
                    opt.type === 'command'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-foreground">
                      {opt.syntax.trim()}
                    </span>
                    {opt.type === 'skill' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-muted text-muted-foreground">
                        {opt.source === 'workspace' ? '워크스페이스' : '전역'}
                      </span>
                    )}
                    {opt.type === 'command' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-primary/10 text-primary font-mono">
                        내장 명령
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Inline error if resolution failed */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 rounded-t-xl shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Agent Selector / Lock Bar */}
      {agentsCtx && agentsCtx.agents.length > 0 && (
        <div className="flex items-center justify-between px-3.5 pt-2 pb-1 text-[11px] text-muted-foreground border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground/70 shrink-0">
                에이전트:
              </span>
              {isAgentLocked ? (
                <span className="font-semibold text-foreground truncate">
                  {currentAgent?.name} ({currentAgent?.model})
                </span>
              ) : (
                <select
                  value={currentAgent?.id}
                  onChange={(e) => onSelectAgent?.(e.target.value)}
                  className="bg-transparent text-foreground font-semibold cursor-pointer border-none outline-none pr-2 focus:ring-0 text-xs"
                  title="대화할 에이전트 선택"
                >
                  {agentsCtx.agents.map((a) => (
                    <option key={a.id} value={a.id} className="bg-card text-foreground">
                      {a.name} ({a.model}) {a.isDefault ? '★' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* YOLO Mode Badge */}
            {yoloMode && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-semibold animate-pulse"
                title="YOLO 모드 활성화됨: 셸을 제외한 모든 도구 호출이 자동 승인됩니다."
              >
                <Zap className="h-3 w-3 fill-current" />
                <span>YOLO MODE ON</span>
              </div>
            )}
          </div>

          {contextUsage && (
            <div className="shrink-0 pl-2">
              <ContextGauge
                tokens={contextUsage.tokens}
                limit={contextUsage.limit}
                onClick={onOpenCompactDialog}
              />
            </div>
          )}
        </div>
      )}

      <div className={cn('relative', customHeight ? 'flex-1 min-h-0 flex flex-col' : '')}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          style={customHeight ? undefined : { maxHeight: `${maxHeight}px` }}
          className={cn(
            'w-full resize-none bg-transparent px-3.5 py-2.5 pr-20 text-sm text-foreground placeholder:text-muted-foreground/60 border-0 outline-none focus:outline-none focus:ring-0 shadow-none leading-normal font-sans',
            customHeight
              ? 'flex-1 min-h-0 h-full overflow-y-auto'
              : 'min-h-[38px] overflow-y-auto',
          )}
        />

        <div className="absolute right-2.5 bottom-2 flex items-center gap-1.5">
          {isStreaming && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onStop}
              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="중지"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            onClick={() => void handleSubmit()}
            disabled={!text.trim()}
            className="h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={isStreaming ? '지시 주입 (Steer)' : '전송'}
          >
            {isStreaming ? (
              <CornerDownLeft className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
