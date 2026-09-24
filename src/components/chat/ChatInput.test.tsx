import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-utils';
import '@testing-library/jest-dom/vitest';
import { ChatInput } from './ChatInput';
import type { SkillManifest } from '@/lib/types/skill';

// Mock tauri core invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: { path: string }) => {
    if (cmd === 'read_text_file') {
      if (args.path.includes('pdf-tools')) {
        return `---\nname: pdf-tools\ndescription: PDF tool\n---\n# PDF Manual\nExecute scripts/pdf.py`;
      }
    }
    throw new Error(`File not found: ${args.path}`);
  }),
}));

describe('ChatInput component', () => {
  const mockSkills: SkillManifest[] = [
    {
      name: 'pdf-tools',
      description: 'Extract and analyze PDF documents',
      filePath: 'C:/skills/pdf-tools/SKILL.md',
      baseDir: 'C:/skills/pdf-tools',
      source: 'workspace',
      disableModelInvocation: false,
    },
    {
      name: 'code-analyzer',
      description: 'Analyze codebase for errors',
      filePath: 'C:/skills/code-analyzer/SKILL.md',
      baseDir: 'C:/skills/code-analyzer',
      source: 'global',
      disableModelInvocation: false,
    },
  ];

  it('renders textarea and submit button', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
      />,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTitle('전송')).toBeInTheDocument();
  });

  it('sends normal text via onSend on Enter', () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('shows autocomplete popup when typing /skill:', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        skills={mockSkills}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/skill:' } });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('/skill:pdf-tools')).toBeInTheDocument();
    expect(screen.getByText('/skill:code-analyzer')).toBeInTheDocument();
  });

  it('filters autocomplete list by query', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        skills={mockSkills}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/skill:pdf' } });

    expect(screen.getByText('/skill:pdf-tools')).toBeInTheDocument();
    expect(screen.queryByText('/skill:code-analyzer')).not.toBeInTheDocument();
  });

  it('selects skill on click and inserts /skill:name into input', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        skills={mockSkills}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/skill:pdf' } });

    const option = screen.getByText('/skill:pdf-tools');
    fireEvent.click(option);

    expect(textarea).toHaveValue('/skill:pdf-tools ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('resolves skill content on submit and sends the expanded prompt', async () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        skills={mockSkills}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '/skill:pdf-tools invoice.pdf' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        '# PDF Manual\nExecute scripts/pdf.py\n\nUser: invoice.pdf',
      );
    });
  });

  it('shows error banner when skill is not found', async () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        skills={mockSkills}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '/skill:non-existent' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/찾을 수 없습니다/)).toBeInTheDocument();
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('handles /compact command and invokes onCompact with arguments', async () => {
    const onCompact = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        onCompact={onCompact}
        isStreaming={false}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '/compact focus on auth flow' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onCompact).toHaveBeenCalledWith('focus on auth flow');
    });
  });

  it('applies customHeight style when customHeight prop is provided', () => {
    const { container } = render(
      <ChatInput
        onSend={vi.fn()}
        onSteer={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        customHeight={240}
      />,
    );

    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv).toHaveStyle({ height: '240px' });
  });
});

