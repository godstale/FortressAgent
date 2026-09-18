import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
import { Send, Square, CornerDownLeft, Puzzle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SkillManifest } from '@/lib/types/skill';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { resolveSkillInvocation, parseSkillCommand } from '@/lib/skills/invokeSkill';

export interface ChatInputProps {
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onStop: () => void;
  onCompact?: (instructions?: string) => Promise<void> | void;
  isStreaming: boolean;
  placeholder?: string;
  skills?: SkillManifest[];
}

export function ChatInput({
  onSend,
  onSteer,
  onStop,
  onCompact,
  isStreaming,
  placeholder,
  skills: skillsProp,
}: ChatInputProps) {
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

  // Detect `/skill:<filter>` pattern before any whitespace
  const autocompleteQuery = useMemo(() => {
    if (autocompleteDismissed) return null;
    const match = text.match(/^\/skill:([^\s]*)$/i);
    if (!match) return null;
    return match[1].toLowerCase();
  }, [text, autocompleteDismissed]);

  const filteredSkills = useMemo(() => {
    if (autocompleteQuery === null) return [];
    if (!autocompleteQuery) return availableSkills;
    return availableSkills.filter((s) =>
      s.name.toLowerCase().includes(autocompleteQuery),
    );
  }, [autocompleteQuery, availableSkills]);

  const isAutocompleteOpen =
    autocompleteQuery !== null && filteredSkills.length > 0;

  // Derive clamped selected index without setting state in effect
  const activeIndex =
    selectedIndex < filteredSkills.length ? selectedIndex : 0;

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [text]);

  const selectSkill = (skill: SkillManifest) => {
    setText(`/skill:${skill.name} `);
    setAutocompleteDismissed(true);
    setSelectedIndex(0);
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setErrorMessage(null);

    let messageToSend = trimmed;
    const compactMatch = trimmed.match(/^\/compact(?:\s+([\s\S]*))?$/);
    if (compactMatch) {
      if (onCompact) {
        try {
          await onCompact(compactMatch[1]?.trim());
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
          prev < filteredSkills.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredSkills.length - 1,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = filteredSkills[activeIndex];
        if (chosen) {
          selectSkill(chosen);
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
    : '메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈, /skill: 스킬 호출)...';

  return (
    <div className="relative border border-border rounded-xl bg-background shadow-xs focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
      {/* Autocomplete popup */}
      {isAutocompleteOpen && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="스킬 자동완성 목록"
          className="absolute bottom-full left-0 right-0 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            사용 가능한 스킬 ({filteredSkills.length})
          </div>
          {filteredSkills.map((skill, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={skill.filePath}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectSkill(skill)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <Puzzle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-foreground">
                      /skill:{skill.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-muted text-muted-foreground">
                      {skill.source === 'workspace' ? '워크스페이스' : '전역'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {skill.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Inline error if resolution failed */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 rounded-t-xl">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || defaultPlaceholder}
        className="w-full resize-none bg-transparent px-3.5 py-3 pr-20 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden max-h-44 leading-relaxed font-sans"
      />

      <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
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
  );
}
