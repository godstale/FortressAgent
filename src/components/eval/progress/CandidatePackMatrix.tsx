import { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import type {
  EvalCandidateRow,
  EvalScoreRow,
  EvalTrialRow,
} from '@/lib/eval/types';

export interface LiveCell {
  candidateId: string;
  packId: string;
}

interface CandidatePackMatrixProps {
  candidates: EvalCandidateRow[];
  packIds: string[];
  trials: EvalTrialRow[];
  scores: EvalScoreRow[];
  expectedPerCell: Record<string, number>;
  liveCell: LiveCell | null;
}

interface CellData {
  done: number;
  total: number;
  pct: number;
  accuracy: number | null;
}

function cellKey(candidateId: string, packId: string): string {
  return `${candidateId}|${packId}`;
}

interface CellData {
  done: number;
  total: number;
  pct: number;
  accuracy: number | null;
}

export function CandidatePackMatrix({
  candidates,
  packIds,
  trials,
  scores,
  expectedPerCell,
  liveCell,
}: CandidatePackMatrixProps) {
  const { t } = useLanguage();

  const cells = useMemo(() => {
    const valuesByTrial = new Map<string, number[]>();
    for (const s of scores) {
      const list = valuesByTrial.get(s.trialId) ?? [];
      list.push(s.value);
      valuesByTrial.set(s.trialId, list);
    }
    const out = new Map<string, CellData>();
    for (const c of candidates) {
      for (const packId of packIds) {
        const key = cellKey(c.id, packId);
        const cellTrials = trials.filter(
          (tr) => tr.candidateId === c.id && tr.packId === packId,
        );
        const done = cellTrials.length;
        const total = expectedPerCell[key] ?? done;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        const values: number[] = [];
        for (const tr of cellTrials) {
          const v = valuesByTrial.get(tr.id);
          if (v) values.push(...v);
        }
        const accuracy =
          values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : null;
        out.set(key, { done, total, pct, accuracy });
      }
    }
    return out;
  }, [candidates, packIds, trials, scores, expectedPerCell]);

  if (candidates.length === 0 || packIds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('eval.progress.matrix.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1.5 text-left font-medium text-muted-foreground" />
            {packIds.map((packId) => (
              <th
                key={packId}
                className="max-w-32 truncate p-1.5 text-left font-medium text-muted-foreground"
                title={packId}
              >
                {packId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id} className="border-t border-border/60">
              <th
                className="max-w-40 truncate p-1.5 text-left font-medium text-foreground"
                title={c.label}
              >
                {c.label}
              </th>
              {packIds.map((packId) => {
                const key = cellKey(c.id, packId);
                const cell = cells.get(key) ?? { done: 0, total: 0, pct: 0, accuracy: null };
                const live =
                  liveCell?.candidateId === c.id && liveCell?.packId === packId;
                return (
                  <td key={key} className="p-1.5 align-top">
                    <div
                      className={cn(
                        'rounded-md border border-border/60 bg-card/40 p-1.5',
                        live && 'border-primary/60 bg-primary/5 ring-1 ring-primary/40',
                      )}
                      aria-label={live ? t('eval.progress.matrix.live') : undefined}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="text-muted-foreground">
                          {t('eval.progress.matrix.progress')} {cell.done}/{cell.total}
                        </span>
                        {live && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-px font-medium text-primary">
                            {t('eval.progress.matrix.live')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            live ? 'bg-primary' : 'bg-muted-foreground/50',
                          )}
                          style={{ width: `${cell.pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {t('eval.progress.matrix.accuracy')}{' '}
                        <span className="font-mono font-medium text-foreground">
                          {cell.accuracy != null
                            ? `${(cell.accuracy * 100).toFixed(1)}%`
                            : t('eval.progress.matrix.noScore')}
                        </span>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
