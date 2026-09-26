import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
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
  Lock,
  Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SkillManifest } from '@/lib/types/skill';
import type { ReasoningEffort, ReasoningMode } from '@/lib/types/agent';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { resolveSkillInvocation, parseSkillCommand } from '@/lib/skills/invokeSkill';

import { ContextGauge } from './ContextGauge';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useEvalLock } from '@/lib/eval/evalLock';
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
  { type: 'command', name: 'clear', syntax: '/clear', description: 'chatInput.clearDesc', icon: RotateCcw },
  { type: 'command', name: 'usage', syntax: '/usage', description: 'chatInput.usageDesc', icon: BarChart2 },
  { type: 'command', name: 'agent', syntax: '/agent', description: 'chatInput.agentDesc', icon: Bot },
  { type: 'command', name: 'yolo', syntax: '/yolo', description: 'chatInput.yoloDesc', icon: Zap },
  { type: 'command', name: 'settings', syntax: '/settings', description: 'chatInput.settingsDesc', icon: Settings },
  { type: 'command', name: 'skills', syntax: '/skills', description: 'chatInput.skillsDesc', icon: Puzzle },
  { type: 'command', name: 'pwd', syntax: '/pwd', description: 'chatInput.pwdDesc', icon: Folder },
  { type: 'command', name: 'compact', syntax: '/compact', description: 'chatInput.compactDesc', icon: Layers },
  { type: 'command', name: 'status', syntax: '/status', description: 'chatInput.statusDesc', icon: Info },
];

export interface ChatInputProps {
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onStop: () => void;
  onCompact?: (instructions?: string) => Promise<void> | void;
  onOpenCompactDialog?: () => void;
  onSlashCommand?: (command: string, args?: string) => boolean | Promise<boolean>;
  onQueue?: (item: {
    text: string;
    type: 'message' | 'slash_command' | 'skill';
    commandName?: string;
    commandArgs?: string;
  }) => void;
  isStreaming: boolean;
  isLockedByOtherSession?: boolean;
  isThisSessionBusy?: boolean;
  busySessionTitle?: string;
  placeholder?: string;
  skills?: SkillManifest[];
  /** 귀속된 에이전트의 reasoning 설정 (effort 셀렉터 비활성화 판단용) */
  agentReasoning?: ReasoningMode;
  contextUsage?: { tokens: number; limit: number };
  yoloMode?: boolean;
  /**
   * 세션 단위 reasoning/effort 오버라이드. 'agent'(기본값)면 Agent 설정을 따른다.
   * Ollama think 최상위 필드로만 전달되므로 변경해도 프롬프트/prefill 오버헤드가 없다.
   */
  reasoningOverride?: ReasoningMode | 'agent';
  effortOverride?: ReasoningEffort | 'agent';
  onReasoningOverrideChange?: (v: ReasoningMode | 'agent') => void;
  onEffortOverrideChange?: (v: ReasoningEffort | 'agent') => void;
  customHeight?: number | null;
  maxHeight?: number;
  /** 삭제된 에이전트 설정을 쓰는 채팅이면 true. 입력 전체를 비활성화한다. */
  isAgentDeleted?: boolean;
}

export function ChatInput({
  onSend,
  onSteer,
  onStop,
  onCompact,
  onOpenCompactDialog,
  onSlashCommand,
  onQueue,
  isStreaming,
  isLockedByOtherSession = false,
  isThisSessionBusy = false,
  busySessionTitle,
  placeholder,
  skills: skillsProp,
  agentReasoning = 'default',
  contextUsage,
  yoloMode,
  reasoningOverride = 'agent',
  effortOverride = 'agent',
  onReasoningOverrideChange,
  onEffortOverrideChange,
  customHeight,
  maxHeight = 180,
  isAgentDeleted = false,
}: ChatInputProps) {
  const { t } = useLanguage();
  const evalLocked = useEvalLock() !== null;
  const safeSkillsCtx = useSafeSkills();
  const availableSkills = useMemo(() => {
    return skillsProp ?? safeSkillsCtx?.skills ?? [];
  }, [skillsProp, safeSkillsCtx?.skills]);

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
    autocompleteQuery !== null && filteredOptions.length > 0 && !evalLocked;

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
    if (isLockedByOtherSession || isAgentDeleted || evalLocked) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setErrorMessage(null);

    // If this session is busy (running LLM or has pending queue items) and onQueue is available,
    // enqueue the request instead of executing immediately or overwriting
    if ((isThisSessionBusy || isStreaming) && onQueue) {
      // 1. Check if slash command
      const slashMatch = trimmed.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
      if (slashMatch) {
        const commandName = slashMatch[1].toLowerCase();
        const args = slashMatch[2]?.trim();
        onQueue({
          text: trimmed,
          type: 'slash_command',
          commandName,
          commandArgs: args,
        });
        setText('');
        setAutocompleteDismissed(false);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        return;
      }

      // 2. Check if skill command
      if (parseSkillCommand(trimmed)) {
        onQueue({
          text: trimmed,
          type: 'skill',
        });
        setText('');
        setAutocompleteDismissed(false);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        return;
      }

      // 3. Normal user message
      onQueue({
        text: trimmed,
        type: 'message',
      });
      setText('');
      setAutocompleteDismissed(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

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
              err instanceof Error ? err.message : t('chatInput.compactFailed'),
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
          err instanceof Error ? err.message : t('chatInput.skillFailed'),
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

  const defaultPlaceholder = evalLocked
    ? t('eval.lock.inputPlaceholder')
    : isAgentDeleted
    ? t('chatInput.agentDeletedPlaceholder')
    : isLockedByOtherSession
    ? t('chatInput.lockedOther')
    : isThisSessionBusy || isStreaming
    ? t('chatInput.busySelf')
    : t('chatInput.placeholder');

  // LLM 동작 중에는 다음 턴에 적용되는 실행 설정도 변경할 수 없다.
  // (입력 텍스트의 대기 큐 추가는 허용하되 reasoning/effort 셀렉터만 잠근다.)
  // 평가 잠금 중에는 입력·전송·큐·슬래시·셀렉터가 모두 막힌다(D5).
  const settingsLocked =
    isAgentDeleted || isStreaming || isThisSessionBusy || isLockedByOtherSession || evalLocked;
  const settingsLockTitle = settingsLocked && !isAgentDeleted ? t('chatInput.settingsLocked') : undefined;

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
          aria-label={t('chatInput.autocompleteLabel')}
          className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>{t('chatInput.autocompleteHeader', { n: filteredOptions.length })}</span>
            <span className="text-[10px] text-muted-foreground/70 lowercase font-normal">
              {t('chatInput.autocompleteHint')}
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
                      : 'bg-warning/10 text-warning'
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
                        {opt.source === 'workspace' ? t('chatInput.sourceWorkspace') : t('chatInput.sourceGlobal')}
                      </span>
                    )}
                    {opt.type === 'command' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-primary/10 text-primary font-mono">
                        {t('chatInput.builtin')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {opt.type === 'command' ? t(opt.description) : opt.description}
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

      {/* Lock banner when another session is busy */}
      {isLockedByOtherSession && !isAgentDeleted && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 text-xs text-amber-500 bg-amber-500/10 border-b border-amber-500/20 font-medium select-none">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {busySessionTitle
              ? t('chatInput.lockedBannerWith', { title: busySessionTitle })
              : t('chatInput.lockedBanner')}
          </span>
        </div>
      )}

      {/* Deleted-agent banner: 이 채팅은 삭제된 설정을 사용하므로 입력을 막는다 */}
      {isAgentDeleted && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 font-medium select-none">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('chatInput.agentDeletedBanner')}</span>
        </div>
      )}

      {/* Session options bar (채팅은 하나의 에이전트 설정에 귀속되므로 에이전트 전환 UI 없음) */}
      <div className="flex items-center justify-between px-3.5 pt-2 pb-1 text-[11px] text-muted-foreground border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* YOLO Mode Badge */}
          {yoloMode && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/20 text-destructive border border-destructive/30 text-[10px] font-semibold animate-pulse"
              title={t('chatInput.yoloBadge')}
            >
              <Zap className="h-3 w-3 fill-current" />
              <span>{t('chatInput.yoloShort')}</span>
            </div>
          )}

          {/* Session reasoning/effort override (Ollama think field — no prefill overhead) */}
          <div
            className="flex items-center gap-1 shrink-0"
            title={settingsLockTitle ?? t('chatInput.thinkTitle')}
          >
            <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
              <select
                value={reasoningOverride}
                onChange={(e) => onReasoningOverrideChange?.(e.target.value as ReasoningMode | 'agent')}
                disabled={settingsLocked}
                title={settingsLockTitle}
                className="bg-transparent text-foreground font-semibold cursor-pointer border-none outline-none focus:ring-0 text-[11px] max-w-[86px] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="agent" className="bg-card text-foreground">
                  {t('chatInput.thinkFollowAgent')}
                </option>
                <option value="default" className="bg-card text-foreground">
                  {t('chatInput.thinkDefault')}
                </option>
                <option value="on" className="bg-card text-foreground">
                  {t('chatInput.thinkOn')}
                </option>
                <option value="off" className="bg-card text-foreground">
                  {t('chatInput.thinkOff')}
                </option>
              </select>
              <select
                value={effortOverride}
                disabled={
                  settingsLocked ||
                  (reasoningOverride === 'agent' ? agentReasoning : reasoningOverride) === 'off'
                }
                title={settingsLockTitle}
                onChange={(e) => onEffortOverrideChange?.(e.target.value as ReasoningEffort | 'agent')}
                className="bg-transparent text-foreground font-semibold cursor-pointer border-none outline-none focus:ring-0 text-[11px] font-mono max-w-[72px] disabled:opacity-40"
              >
                <option value="agent" className="bg-card text-foreground">
                  {t('chatInput.thinkFollowAgent')}
                </option>
                <option value="low" className="bg-card text-foreground">
                  {t('agentForm.effortLow')}
                </option>
                <option value="medium" className="bg-card text-foreground">
                  {t('agentForm.effortMedium')}
                </option>
                <option value="high" className="bg-card text-foreground">
                  {t('agentForm.effortHigh')}
                </option>
              </select>
            </div>
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

      <div className={cn('relative', customHeight ? 'flex-1 min-h-0 flex flex-col' : '')}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLockedByOtherSession || isAgentDeleted || evalLocked}
          placeholder={placeholder || defaultPlaceholder}
          style={customHeight ? undefined : { maxHeight: `${maxHeight}px` }}
          className={cn(
            'w-full resize-none bg-transparent px-3.5 py-2.5 pr-20 text-sm text-foreground placeholder:text-muted-foreground/60 border-0 outline-none focus:outline-none focus:ring-0 shadow-none leading-normal font-sans',
            (isLockedByOtherSession || isAgentDeleted || evalLocked) && 'opacity-60 cursor-not-allowed',
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
              title={t('chatInput.stop')}
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            onClick={() => void handleSubmit()}
            disabled={isLockedByOtherSession || isAgentDeleted || evalLocked || !text.trim()}
            className="h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={
              evalLocked
                ? t('eval.lock.chatBlocked')
                : isAgentDeleted
                ? t('chatInput.agentDeletedBanner')
                : isLockedByOtherSession
                ? t('chatInput.sendLocked')
                : isThisSessionBusy || isStreaming
                ? t('chatInput.sendQueue')
                : t('chatInput.send')
            }
          >
            {isThisSessionBusy || isStreaming ? (
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
