import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { basicSetup } from 'codemirror';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Loader2, SplitSquareVertical, Eye, Code } from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { cn } from '@/lib/utils';

export interface EditorTabProps {
  tab: WorkspaceTab;
}

function getLanguageExtension(filePath: string): Extension {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return javascript();
    case 'ts':
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'json':
      return json();
    case 'md':
    case 'markdown':
      return markdown();
    case 'py':
      return python();
    default:
      return [];
  }
}

export function EditorTab({ tab }: EditorTabProps) {
  const filePath = (tab.meta?.filePath as string) || tab.id.replace(/^editor:/, '');
  const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [mdMode, setMdMode] = useState<'edit' | 'split' | 'preview'>('edit');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>('');

  const saveFile = useCallback(async (newContent: string) => {
    setSaveStatus('saving');
    try {
      await invoke('write_text_file', {
        path: filePath,
        contents: newContent,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to save file:', err);
      setSaveStatus('error');
    }
  }, [filePath]);

  const onDocChange = useCallback((newDoc: string) => {
    setContent(newDoc);
    contentRef.current = newDoc;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(() => {
      void saveFile(newDoc);
    }, 500);
  }, [saveFile]);

  // Load initial content from disk
  useEffect(() => {
    let cancelled = false;

    invoke<string>('read_text_file', { path: filePath })
      .then((data) => {
        if (cancelled) return;
        setContent(data);
        contentRef.current = data;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to read file:', err);
        setContent(`// 파일 읽기 실패: ${err}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [filePath]);

  // Initialize CodeMirror editor when loaded
  useEffect(() => {
    if (loading || !containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const state = EditorState.create({
      doc: contentRef.current,
      extensions: [
        basicSetup,
        keymap.of([...defaultKeymap, indentWithTab]),
        oneDark,
        getLanguageExtension(filePath),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onDocChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [loading, filePath, onDocChange]);

  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  return (
    <div className="flex flex-col h-full w-full bg-background min-h-0">
      {/* Editor sub-header */}
      <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/30 text-xs select-none">
        <span className="font-mono text-muted-foreground truncate">{fileName}</span>

        <div className="flex items-center gap-3">
          {/* Markdown View Toggle */}
          {isMarkdown && (
            <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setMdMode('edit')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1',
                  mdMode === 'edit'
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="편집기 전용"
              >
                <Code className="h-3 w-3" />
                <span>편집</span>
              </button>
              <button
                type="button"
                onClick={() => setMdMode('split')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1',
                  mdMode === 'split'
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="나란히 보기"
              >
                <SplitSquareVertical className="h-3 w-3" />
                <span>분할</span>
              </button>
              <button
                type="button"
                onClick={() => setMdMode('preview')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1',
                  mdMode === 'preview'
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="미리보기 전용"
              >
                <Eye className="h-3 w-3" />
                <span>미리보기</span>
              </button>
            </div>
          )}

          {/* Save Status Indicator */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                <span>저장 중...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span>저장됨</span>
              </>
            )}
            {saveStatus === 'error' && (
              <span className="text-destructive font-semibold">저장 실패</span>
            )}
          </div>
        </div>
      </div>

      {/* Editor / Preview Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            파일을 불러오는 중...
          </div>
        ) : (
          <>
            {/* CodeMirror Editor Container */}
            <div
              ref={containerRef}
              className={cn(
                'h-full overflow-hidden',
                mdMode === 'preview' && isMarkdown ? 'hidden' : 'flex-1',
                mdMode === 'split' && isMarkdown && 'border-r border-border',
              )}
            />

            {/* Markdown Preview Container */}
            {isMarkdown && (mdMode === 'split' || mdMode === 'preview') && (
              <div
                className={cn(
                  'h-full overflow-y-auto p-6 bg-card/10 prose prose-invert prose-sm max-w-none',
                  mdMode === 'split' ? 'flex-1' : 'w-full',
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EditorTab;
