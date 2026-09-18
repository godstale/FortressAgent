import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgentEditorForm } from './AgentEditorForm';
import { WorkspaceProvider } from '@/lib/context/WorkspaceContext';
import { AgentsProvider } from '@/lib/context/AgentsContext';
import { SettingsProvider } from '@/lib/context/SettingsContext';
import { SkillsProvider } from '@/lib/context/SkillsContext';

// Mock listModels & showModel
vi.mock('@/lib/llm/ollamaClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/ollamaClient')>();
  return {
    ...actual,
    listModels: vi.fn().mockResolvedValue([
      { name: 'qwen3.5:9b', size: 9e9, digest: '', modified_at: '' },
      { name: 'llama3.2:3b', size: 3e9, digest: '', modified_at: '' },
    ]),
    showModel: vi.fn().mockResolvedValue({ contextLength: 8192, supportsTools: true }),
  };
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <WorkspaceProvider>
    <SettingsProvider>
      <SkillsProvider>
        <AgentsProvider>{children}</AgentsProvider>
      </SkillsProvider>
    </SettingsProvider>
  </WorkspaceProvider>
);

describe('AgentEditorForm', () => {
  it('renders all configuration fields in create mode', async () => {
    render(
      <TestWrapper>
        <AgentEditorForm mode="create" onSave={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByText('기본 정보')).toBeInTheDocument();
    expect(screen.getByText('LLM 모델 및 생성 옵션')).toBeInTheDocument();
    expect(screen.getByText('도구 승인 정책')).toBeInTheDocument();
    expect(screen.getByText('활성 내장 도구')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /에이전트 생성/i })).toBeInTheDocument();
  });

  it('validates required name field', async () => {
    const handleSave = vi.fn();
    render(
      <TestWrapper>
        <AgentEditorForm mode="create" onSave={handleSave} />
      </TestWrapper>,
    );

    const nameInput = screen.getByPlaceholderText(/예: 문서 분석 전문가/);
    fireEvent.change(nameInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /에이전트 생성/i }));
    expect(handleSave).not.toHaveBeenCalled();
  });

  it('submits valid agent creation', async () => {
    const handleSave = vi.fn();
    render(
      <TestWrapper>
        <AgentEditorForm mode="create" onSave={handleSave} />
      </TestWrapper>,
    );

    const nameInput = screen.getByPlaceholderText(/예: 문서 분석 전문가/);
    fireEvent.change(nameInput, { target: { value: 'Doc Analyzer' } });

    fireEvent.click(screen.getByRole('button', { name: /에이전트 생성/i }));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalled();
      const saved = handleSave.mock.calls[0][0];
      expect(saved.name).toBe('Doc Analyzer');
    });
  });
});
