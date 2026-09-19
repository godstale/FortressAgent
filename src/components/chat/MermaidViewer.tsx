import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { useTheme } from '../../lib/context/ThemeContext';

interface MermaidViewerProps {
  code: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code }) => {
  const { theme } = useTheme();
  const rawId = useId();
  const elementId = 'mermaid-' + rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    const renderDiagram = async () => {
      try {
        setError(null);
        setSvg(null);

        const isDark =
          theme === 'dark' ||
          (theme === 'system' &&
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);

        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        const trimmedCode = code.trim();
        if (!trimmedCode) {
          if (active) setSvg('');
          return;
        }

        const renderResult = await mermaid.render(elementId, trimmedCode);
        if (active) {
          setSvg(renderResult.svg);
        }
      } catch (err) {
        // Clean up any stray error elements injected by mermaid into document.body
        const stray = document.querySelectorAll(`[id^="d${elementId}"], #${elementId}, .error-icon`);
        stray.forEach((el) => {
          if (el.parentElement === document.body) {
            el.remove();
          }
        });

        if (active) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        }
      }
    };

    void renderDiagram();

    return () => {
      active = false;
      const stray = document.querySelectorAll(`[id^="d${elementId}"], #${elementId}`);
      stray.forEach((el) => {
        if (el.parentElement === document.body) {
          el.remove();
        }
      });
    };
  }, [code, theme, elementId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  if (error) {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-destructive mb-2">
          <AlertCircle className="w-4 h-4" />
          <span>Mermaid Diagram Syntax Error</span>
        </div>
        <div className="text-muted-foreground mb-2 text-[11px] font-mono break-words">{error}</div>
        <div className="relative">
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <pre className="overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-foreground">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="relative my-3 rounded-lg border border-border bg-card p-4 overflow-x-auto shadow-sm">
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Copy diagram code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {svg ? (
        <div
          className="flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="text-center py-4 text-xs text-muted-foreground animate-pulse">
          Rendering diagram...
        </div>
      )}
    </div>
  );
};
