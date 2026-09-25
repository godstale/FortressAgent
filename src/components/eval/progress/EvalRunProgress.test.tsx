import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-utils';
import '@testing-library/jest-dom/vitest';
import { useEval } from '@/lib/context/EvalContext';
import {
  getRun,
  listCandidates,
  listScores,
  listTrials,
} from '@/lib/db/repositories/evalRepo';
import type { RunnerEvent } from '@/lib/eval/runner/events';
import type {
  EvalCandidateRow,
  EvalRunRow,
  EvalScoreRow,
  EvalTrialRow,
} from '@/lib/eval/types';
import { EvalRunProgress } from './EvalRunProgress';

vi.mock('@/lib/context/EvalContext', () => ({
  useEval: vi.fn(),
}));

vi.mock('@/lib/db/repositories/evalRepo', () => ({
  getRun: vi.fn(),
  listCandidates: vi.fn(),
  listTrials: vi.fn(),
  listScores: vi.fn(),
}));

vi.mock('@/lib/eval/packs/packLoader', () => ({
  loadPack: vi.fn().mockRejectedValue(new Error('no tauri in tests')),
}));

vi.mock('@/lib/eval/packs/packFs', () => ({
  tauriPackFs: {},
}));

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart-container">{children}</div>
    ),
  };
});

const mockedUseEval = vi.mocked(useEval);
const mockedGetRun = vi.mocked(getRun);
const mockedListCandidates = vi.mocked(listCandidates);
const mockedListTrials = vi.mocked(listTrials);
const mockedListScores = vi.mocked(listScores);

function makeRun(over: Record<string, unknown> = {}): EvalRunRow {
  return {
    id: 'run-1',
    name: 'run one',
    config: {
      packs: [{ packId: 'pack-x', sampleIds: ['s1', 's2'], epochs: 1 }],
    },
    status: 'running',
    error: null,
    progressDone: 1,
    progressTotal: 4,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  } as unknown as EvalRunRow;
}

function makeCandidate(): EvalCandidateRow {
  return { id: 'c1', runId: 'run-1', label: 'model-a', status: 'running' } as unknown as EvalCandidateRow;
}

function makeTrial(): EvalTrialRow {
  return {
    id: 't1',
    runId: 'run-1',
    candidateId: 'c1',
    packId: 'pack-x',
    sampleId: 's1',
    epoch: 0,
    outcome: 'ok',
    turns: 3,
    toolCalls: 2,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  } as unknown as EvalTrialRow;
}

function makeScore(): EvalScoreRow {
  return { id: 'sc1', trialId: 't1', value: 1 } as unknown as EvalScoreRow;
}

const baseControls = {
  runs: [],
  packs: [],
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  cancelRun: vi.fn(),
  skipCandidate: vi.fn(),
};

function setup(opts: {
  status?: string;
  active?: boolean;
  events?: RunnerEvent[];
  runOver?: Record<string, unknown>;
}) {
  const status = opts.status ?? 'running';
  mockedGetRun.mockResolvedValue(makeRun({ status, ...(opts.runOver ?? {}) }));
  mockedListCandidates.mockResolvedValue([makeCandidate()]);
  mockedListTrials.mockResolvedValue([makeTrial()]);
  mockedListScores.mockResolvedValue([makeScore()]);
  mockedUseEval.mockReturnValue({
    ...baseControls,
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    cancelRun: vi.fn(),
    skipCandidate: vi.fn(),
    activeRunner: opts.active === false ? null : { runId: 'run-1', status, done: 1, total: 4 },
    events: opts.events ?? [],
  } as unknown as ReturnType<typeof useEval>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EvalRunProgress', () => {
  it('renders header, progress, matrix, and pause note for a running run', async () => {
    const events: RunnerEvent[] = [
      { type: 'trial_start', candidateId: 'c1', packId: 'pack-x', sampleId: 's1', epoch: 0 },
      { type: 'trial_delta', candidateId: 'c1', packId: 'pack-x', sampleId: 's1', text: 'hello' },
      { type: 'eta', remainingSec: 90 },
      { type: 'resource', vramUsedMb: 8000, gpuUtilPct: 55, gpuTempC: 60, decodeTps: 42 },
      { type: 'log', level: 'warn', message: 'unknown scorer: foo' },
    ];
    setup({ events });
    render(<EvalRunProgress runId="run-1" />);

    expect(await screen.findByText('run one')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 4 trials/)).toBeInTheDocument();
    expect(screen.getByText(/일시정지는 현재 trial이 끝난 뒤/)).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('unknown scorer: foo')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByText(/남은 시간/)).toBeInTheDocument();
  });

  it('wires pause, skip, and two-step cancel controls', async () => {
    setup({});
    render(<EvalRunProgress runId="run-1" />);
    await screen.findByText('run one');

    fireEvent.click(screen.getByText('일시정지'));
    fireEvent.click(screen.getByText('후보 건너뛰기'));
    const ctx = mockedUseEval.mock.results[0].value as ReturnType<typeof useEval>;
    expect(ctx.pauseRun).toHaveBeenCalledTimes(1);
    expect(ctx.skipCandidate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('중단'));
    fireEvent.click(screen.getByText('중단하기'));
    expect(ctx.cancelRun).toHaveBeenCalledTimes(1);
  });

  it('shows resume control when paused', async () => {
    setup({ status: 'paused' });
    render(<EvalRunProgress runId="run-1" />);
    expect(await screen.findByText('재개')).toBeInTheDocument();
    expect(screen.queryByText('일시정지')).not.toBeInTheDocument();
  });

  it('shows completion notice with disabled report placeholder when completed', async () => {
    setup({ status: 'completed', active: false });
    render(<EvalRunProgress runId="run-1" />);
    await screen.findByText(/실행이 완료되었습니다/);
    const reportBtn = screen.getByText('리포트 보기');
    expect(reportBtn).toBeDisabled();
    expect(reportBtn).toHaveAttribute('data-future-view', 'report');
    expect(screen.queryByText('일시정지')).not.toBeInTheDocument();
  });

  it('falls back to time-based ETA estimate without eta events', async () => {
    setup({});
    render(<EvalRunProgress runId="run-1" />);
    await screen.findByText('run one');
    expect(screen.getByText(/남은 시간/)).toBeInTheDocument();
    expect(screen.queryByText('계산 중…')).not.toBeInTheDocument();
  });
});
