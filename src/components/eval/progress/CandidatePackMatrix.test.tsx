import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-utils';
import '@testing-library/jest-dom/vitest';
import { CandidatePackMatrix } from './CandidatePackMatrix';
import type {
  EvalCandidateRow,
  EvalScoreRow,
  EvalTrialRow,
} from '@/lib/eval/types';

function candidate(id: string, label: string): EvalCandidateRow {
  return { id, label } as unknown as EvalCandidateRow;
}

function trial(id: string, candidateId: string, packId: string): EvalTrialRow {
  return {
    id,
    candidateId,
    packId,
    sampleId: 's1',
    outcome: 'ok',
  } as unknown as EvalTrialRow;
}

function score(trialId: string, value: number): EvalScoreRow {
  return { trialId, value } as unknown as EvalScoreRow;
}

describe('CandidatePackMatrix', () => {
  it('renders progress and running accuracy per cell', () => {
    render(
      <CandidatePackMatrix
        candidates={[candidate('c1', 'model-a')]}
        packIds={['pack-x']}
        trials={[trial('t1', 'c1', 'pack-x')]}
        scores={[score('t1', 1), score('t1', 0.5)]}
        expectedPerCell={{ 'c1|pack-x': 2 }}
        liveCell={null}
      />,
    );
    expect(screen.getByText('model-a')).toBeInTheDocument();
    expect(screen.getByText('pack-x')).toBeInTheDocument();
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('highlights the live cell', () => {
    render(
      <CandidatePackMatrix
        candidates={[candidate('c1', 'model-a')]}
        packIds={['pack-x']}
        trials={[]}
        scores={[]}
        expectedPerCell={{}}
        liveCell={{ candidateId: 'c1', packId: 'pack-x' }}
      />,
    );
    expect(screen.getByLabelText('진행 중')).toBeInTheDocument();
  });

  it('shows empty state without candidates or packs', () => {
    render(
      <CandidatePackMatrix
        candidates={[]}
        packIds={['pack-x']}
        trials={[]}
        scores={[]}
        expectedPerCell={{}}
        liveCell={null}
      />,
    );
    expect(
      screen.getByText('표시할 후보 또는 팩이 없습니다.'),
    ).toBeInTheDocument();
  });
});
