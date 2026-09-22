import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { basicSetup } from 'codemirror';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Loader2,
  Columns2,
  Eye,
  Code2,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/fileIcons';
import { CodeViewer } from '@/components/chat/CodeViewer';
import { useTheme } from '@/lib/context/ThemeContext';

export interface EditorTabProps {
  tab: WorkspaceTab;
}

/**
 * Rich syntax highlighting style tailored for dark theme and Markdown documents
 */
const darkHighlightStyle = HighlightStyle.define([
  // Markdown Headings
  { tag: t.heading1, color: '#8AB6FF', fontWeight: 'bold', fontSize: '1.25em' },
  { tag: t.heading2, color: '#5B9BFF', fontWeight: 'bold', fontSize: '1.15em' },
  { tag: t.heading3, color: '#A3B0EC', fontWeight: 'bold', fontSize: '1.05em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: '#E09BE6', fontWeight: 'bold' },

  // Markdown Formatting
  { tag: t.strong, fontWeight: 'bold', color: '#F5F6FB' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#E8EBFA' },
  { tag: t.link, color: '#8AB6FF', textDecoration: 'underline' },
  { tag: t.url, color: '#A3B0EC' },
  { tag: t.quote, color: '#A6ADCF', fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', opacity: '0.6' },

  // Code & Tokens
  { tag: t.monospace, color: '#E09BE6', backgroundColor: 'rgba(224, 155, 230, 0.10)' },
  { tag: t.keyword, color: '#E09BE6', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#4FD39A' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#8189B0', fontStyle: 'italic' },
  { tag: [t.number, t.integer, t.float], color: '#FFC062' },
  { tag: [t.bool, t.null], color: '#FF8A80', fontWeight: '600' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8AB6FF' },
  { tag: [t.typeName, t.className], color: '#FFC062', fontWeight: '500' },
  { tag: [t.propertyName, t.attributeName], color: '#B3CCFF' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#E8EBFA' },
  { tag: t.operator, color: '#B3B9D2' },
  { tag: [t.meta, t.documentMeta], color: '#DE92E3' },
  { tag: t.tagName, color: '#FF8A80', fontWeight: '500' },
]);

/**
 * Clean syntax highlighting style tailored for light theme
 */
const lightHighlightStyle = HighlightStyle.define([
  // Markdown Headings
  { tag: t.heading1, color: '#0062DB', fontWeight: 'bold', fontSize: '1.25em' },
  { tag: t.heading2, color: '#004FB3', fontWeight: 'bold', fontSize: '1.15em' },
  { tag: t.heading3, color: '#4357BE', fontWeight: 'bold', fontSize: '1.05em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: '#8E4394', fontWeight: 'bold' },

  // Markdown Formatting
  { tag: t.strong, fontWeight: 'bold', color: '#0E1330' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#1A1F3A' },
  { tag: t.link, color: '#0062DB', textDecoration: 'underline' },
  { tag: t.url, color: '#004FB3' },
  { tag: t.quote, color: '#4A5173', fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', opacity: '0.6' },

  // Code & Tokens
  { tag: t.monospace, color: '#8E4394', backgroundColor: 'rgba(142, 67, 148, 0.06)' },
  { tag: t.keyword, color: '#8E4394', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#0B7A4B' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#5F6689', fontStyle: 'italic' },
  { tag: [t.number, t.integer, t.float], color: '#004FB3' },
  { tag: [t.bool, t.null], color: '#8F5600', fontWeight: '600' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#4357BE' },
  { tag: [t.typeName, t.className], color: '#8F5600', fontWeight: '500' },
  { tag: [t.propertyName, t.attributeName], color: '#34449A' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#0E1330' },
  { tag: t.operator, color: '#004FB3' },
  { tag: [t.meta, t.documentMeta], color: '#8E4394' },
  { tag: t.tagName, color: '#C4302B', fontWeight: '500' },
]);

const EDITOR_FONT = "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Modern Dark Editor Theme
 */
const darkEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: '#E8EBFA',
    backgroundColor: '#0B1026',
    fontSize: 'var(--editor-font-size, 13px)',
  },
  '.cm-content': {
    caretColor: '#8AB6FF',
    fontFamily: EDITOR_FONT,
    lineHeight: '1.65',
    padding: '12px 4px',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#8AB6FF',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(91, 155, 255, 0.28) !important',
  },
  '.cm-panels': {
    backgroundColor: '#111733',
    color: '#E8EBFA',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #2A3360',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid #2A3360',
  },
  '.cm-gutters': {
    backgroundColor: '#0B1026',
    color: '#8189B0',
    borderRight: '1px solid #2A3360',
    minWidth: '38px',
    paddingRight: '8px',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(91, 155, 255, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(91, 155, 255, 0.10)',
    color: '#E8EBFA',
    fontWeight: '600',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#212A55',
    border: 'none',
    color: '#A6ADCF',
    borderRadius: '3px',
    padding: '0 4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(91, 155, 255, 0.2)',
    outline: '1px solid rgba(91, 155, 255, 0.45)',
  },
});

/**
 * Modern Light Editor Theme
 */
const lightEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: '#0E1330',
    backgroundColor: '#FFFFFF',
    fontSize: 'var(--editor-font-size, 13px)',
  },
  '.cm-content': {
    caretColor: '#0062DB',
    fontFamily: EDITOR_FONT,
    lineHeight: '1.65',
    padding: '12px 4px',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#0062DB',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(0, 98, 219, 0.18) !important',
  },
  '.cm-panels': {
    backgroundColor: '#F4F6FB',
    color: '#0E1330',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #D3D8E8',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid #D3D8E8',
  },
  '.cm-gutters': {
    backgroundColor: '#F4F6FB',
    color: '#5F6689',
    borderRight: '1px solid #E3E7F2',
    minWidth: '38px',
    paddingRight: '8px',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 98, 219, 0.04)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#E3E7F2',
    color: '#0E1330',
    fontWeight: '600',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#E3E7F2',
    border: 'none',
    color: '#4A5173',
    borderRadius: '3px',
    padding: '0 4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(0, 98, 219, 0.12)',
    outline: '1px solid rgba(0, 98, 219, 0.35)',
  },
});

async function resolveLanguageExtension(filePath: string): Promise<Extension> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'md' || ext === 'markdown') {
    return markdown({ codeLanguages: languages });
  }
  if (ext === 'json' || ext === 'jsonc') {
    return json();
  }
  if (ext === 'py') {
    return python();
  }
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return javascript({ jsx: true });
  }
  if (ext === 'ts' || ext === 'tsx') {
    return javascript({ typescript: true, jsx: true });
  }

  // Dynamic language loading via @codemirror/language-data
  const desc = LanguageDescription.matchFilename(languages, filePath);
  if (desc) {
    try {
      return await desc.load();
    } catch {
      return [];
    }
  }

  return [];
}

export function EditorTab({ tab }: EditorTabProps) {
  const { isDark } = useTheme();
  const filePath = (tab.meta?.filePath as string) || tab.id.replace(/^editor:/, '');
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [content, setContent] = useState<string>('');
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [mdMode, setMdMode] = useState<'edit' | 'split' | 'preview'>('edit');
  const [fontSize, setFontSize] = useState<number>(13);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  const loading = loadedFilePath !== filePath;

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>('');

  const fileIconSpec = getFileIcon(fileName, false);

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

  // Load file content from disk
  useEffect(() => {
    let cancelled = false;

    invoke<string>('read_text_file', { path: filePath })
      .then((data) => {
        if (cancelled) return;
        setContent(data);
        contentRef.current = data;
        setReadError(null);
        setLoadedFilePath(filePath);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to read file:', err);
        setReadError(String(err));
        setLoadedFilePath(filePath);
      });

    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [filePath]);

  // Mount CodeMirror editor
  useEffect(() => {
    if (loading || !containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    let active = true;

    void resolveLanguageExtension(filePath).then((langExtension) => {
      if (!active || !containerRef.current) return;

      const extensions = [
        basicSetup,
        keymap.of([...defaultKeymap, indentWithTab]),
        langExtension,
        syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle),
        isDark ? darkEditorTheme : lightEditorTheme,
        EditorView.theme({
          '&': {
            '--editor-font-size': `${fontSize}px`,
          } as Record<string, string>,
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onDocChange(update.state.doc.toString());
          }
          if (update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            setCursorPos({
              line: line.number,
              col: head - line.from + 1,
            });
          }
        }),
      ];

      const state = EditorState.create({
        doc: contentRef.current,
        extensions,
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;
    });

    return () => {
      active = false;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [loading, filePath, onDocChange, fontSize, isDark]);

  const lineCount = content.split('\n').length;
  const charCount = content.length;

  return (
    <div className="flex flex-col h-full w-full bg-background min-h-0 select-none">
      {/* Visual Editor Toolbar */}
      <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/60 text-xs">
        {/* Left: File Icon & Name */}
        <div className="flex items-center gap-2 min-w-0">
          <fileIconSpec.Icon
            className="h-4 w-4 shrink-0"
            style={{ color: fileIconSpec.color }}
          />
          <span
            className="font-mono font-medium text-foreground text-xs truncate max-w-xs"
            title={filePath}
          >
            {fileName}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline opacity-70">
            {lineCount}줄 • {charCount.toLocaleString()}자
          </span>
        </div>

        {/* Right: Controls (Font size, Markdown toggles, Save status) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Font Size Adjusters */}
          <div className="flex items-center rounded-md border border-border/70 bg-background/50 px-1 py-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.max(10, f - 1))}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
              title="글꼴 축소"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="px-1.5 font-mono text-[10px] text-muted-foreground min-w-[28px] text-center">
              {fontSize}px
            </span>
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.min(22, f + 1))}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
              title="글꼴 확대"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          {/* Markdown View Toggle (Source | Split | Preview) */}
          {isMarkdown && (
            <div className="flex items-center rounded-md border border-border/80 bg-background/80 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setMdMode('edit')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1 transition-colors',
                  mdMode === 'edit'
                    ? 'bg-accent text-foreground font-medium shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
                title="편집기 전용"
              >
                <Code2 className="h-3 w-3" />
                <span>편집</span>
              </button>
              <button
                type="button"
                onClick={() => setMdMode('split')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1 transition-colors border-l border-border/50',
                  mdMode === 'split'
                    ? 'bg-accent text-foreground font-medium shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
                title="나란히 보기 (분할)"
              >
                <Columns2 className="h-3 w-3" />
                <span>분할</span>
              </button>
              <button
                type="button"
                onClick={() => setMdMode('preview')}
                className={cn(
                  'px-2 py-0.5 rounded flex items-center gap-1 transition-colors border-l border-border/50',
                  mdMode === 'preview'
                    ? 'bg-accent text-foreground font-medium shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
                title="미리보기 전용"
              >
                <Eye className="h-3 w-3" />
                <span>미리보기</span>
              </button>
            </div>
          )}

          {/* Save Status Badge */}
          <div className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-muted/40 border border-border/60">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-warning" />
                <span className="text-warning">저장 중...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-3 w-3 text-success" />
                <span className="text-success">저장됨</span>
              </>
            )}
            {saveStatus === 'error' && (
              <span className="text-destructive font-semibold">저장 실패</span>
            )}
          </div>
        </div>
      </div>

      {/* Editor Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden select-text">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
            <span>파일을 불러오는 중...</span>
          </div>
        ) : readError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-destructive p-4 gap-2">
            <AlertTriangle className="h-6 w-6" />
            <span>파일을 읽을 수 없습니다: {readError}</span>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Split Mode with Resizable Panels */}
            {isMarkdown && mdMode === 'split' ? (
              <PanelGroup direction="horizontal" className="flex-1 min-h-0">
                <Panel defaultSize={50} minSize={20} className="flex flex-col min-w-0">
                  <div ref={containerRef} className="h-full w-full overflow-hidden" />
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary data-[resize-handle-active]:bg-primary transition-colors cursor-col-resize" />
                <Panel defaultSize={50} minSize={20} className="flex flex-col min-w-0 overflow-y-auto bg-card/20 p-6">
                  <div className={cn('prose prose-sm max-w-none break-words', isDark && 'prose-invert')}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const lang = match ? match[1].toLowerCase() : '';
                          const codeString = String(children).replace(/\n$/, '');
                          const isInline = !match && !codeString.includes('\n');

                          if (isInline) {
                            return (
                              <code
                                className="px-1.5 py-0.5 mx-0.5 rounded bg-muted/80 font-mono text-[12px] text-primary border border-border/50"
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          }
                          return <CodeViewer code={codeString} language={lang || 'text'} />;
                        },
                      }}
                    >
                      {content}
                    </ReactMarkdown>
                  </div>
                </Panel>
              </PanelGroup>
            ) : isMarkdown && mdMode === 'preview' ? (
              /* Preview Mode */
              <div className="flex-1 overflow-y-auto bg-card/20 p-6">
                <div className={cn('prose prose-sm max-w-3xl mx-auto break-words', isDark && 'prose-invert')}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const lang = match ? match[1].toLowerCase() : '';
                        const codeString = String(children).replace(/\n$/, '');
                        const isInline = !match && !codeString.includes('\n');

                        if (isInline) {
                          return (
                            <code
                              className="px-1.5 py-0.5 mx-0.5 rounded bg-muted/80 font-mono text-[12px] text-primary border border-border/50"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        return <CodeViewer code={codeString} language={lang || 'text'} />;
                      },
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              /* Standard Code Editor */
              <div ref={containerRef} className="flex-1 h-full overflow-hidden" />
            )}
          </div>
        )}

        {/* Footer Status Bar */}
        <div className="h-6 shrink-0 flex items-center justify-between px-3 border-t border-border/60 bg-card/70 text-[11px] font-mono text-muted-foreground select-none">
          <div className="flex items-center gap-3">
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span>UTF-8</span>
          </div>
          <div className="flex items-center gap-3">
            <span>{isMarkdown ? 'Markdown' : fileName.split('.').pop()?.toUpperCase() || 'Text'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditorTab;
