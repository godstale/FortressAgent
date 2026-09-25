import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-utils';
import '@testing-library/jest-dom/vitest';
import { AgentMonitorTab } from './AgentMonitorTab';
import { monitoringCollector } from '@/lib/monitoring/monitoringCollector';
import { listModels } from '@/lib/llm/ollamaClient';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

vi.mock('@/lib/llm/ollamaClient', () => ({
  listModels: vi.fn(),
}));

vi.mock('@/lib/monitoring/monitoringCollector', () => ({
  monitoringCollector: {
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    collectNow: vi.fn().mockResolvedValue(null),
    setInterval: vi.fn(),
  },
  DEFAULT_MONITORING_INTERVAL_MS: 1000,
}));

vi.mock('@/lib/db/repositories/monitoringRepo', () => ({
  getMonitoringSnapshots: vi.fn().mockResolvedValue([]),
  clearMonitoringSnapshots: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/context/AgentsContext', () => ({
  useAgents: () => ({
    getAgent: (id: string) => ({
      id,
      name: 'Test Agent',
      model: 'qwen2.5-coder:7b',
      contextSize: 8192,
    }),
  }),
}));

vi.mock('@/lib/context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      ollamaBaseUrl: 'http://127.0.0.1:11434',
    },
  }),
}));

vi.mock('@/lib/context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspaceRoot: '/test/workspace',
  }),
}));

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart-container" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    ),
  };
});

describe('AgentMonitorTab', () => {
  const mockTab: WorkspaceTab = {
    id: 'monitor:test-agent',
    type: 'agent-monitor',
    title: '모니터링 - Test Agent',
    meta: { agentId: 'test-agent' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT start monitoring on initial mount and shows "모니터링 시작" button', async () => {
    render(<AgentMonitorTab tab={mockTab} />);

    expect(screen.getByText('모니터링 시작')).toBeInTheDocument();
    expect(screen.getByText('모니터링 대기 중')).toBeInTheDocument();
    expect(monitoringCollector.start).not.toHaveBeenCalled();
  });

  it('calls listModels to check connection when clicking "모니터링 시작" and starts monitoring on success', async () => {
    vi.mocked(listModels).mockResolvedValueOnce([
      { name: 'qwen2.5-coder:7b', size: 4000000000, digest: '123', modified_at: '' },
    ]);

    render(<AgentMonitorTab tab={mockTab} />);

    const startButton = screen.getByRole('button', { name: /모니터링 시작/ });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(listModels).toHaveBeenCalledWith('http://127.0.0.1:11434');
      expect(monitoringCollector.start).toHaveBeenCalled();
      expect(screen.getByText('모니터링 일시정지')).toBeInTheDocument();
    });
  });

  it('shows error popup dialog when Ollama connection fails and does not start monitoring', async () => {
    vi.mocked(listModels).mockRejectedValueOnce(new Error('Connection refused'));

    render(<AgentMonitorTab tab={mockTab} />);

    const startButton = screen.getByRole('button', { name: /모니터링 시작/ });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(listModels).toHaveBeenCalledWith('http://127.0.0.1:11434');
      expect(monitoringCollector.start).not.toHaveBeenCalled();
      expect(screen.getByText('Ollama 연결 실패')).toBeInTheDocument();
      expect(screen.getByText(/Ollama 서버에 연결할 수 없어 모니터링을 시작할 수 없습니다/)).toBeInTheDocument();
    });
  });

  it('stops monitoring collector when tab is unmounted', () => {
    const { unmount } = render(<AgentMonitorTab tab={mockTab} />);

    unmount();

    expect(monitoringCollector.stop).toHaveBeenCalledWith('test-agent');
  });
});
