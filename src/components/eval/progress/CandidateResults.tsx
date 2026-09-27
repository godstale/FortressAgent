import { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import type {
  EvalCandidateRow,
  EvalRunConfig,
  EvalScoreRow,
  EvalTrialRow,
} from '@/lib/eval/types';
import { formatScore } from '../report/reportData';
import { FieldInfo } from '../wizard/FieldInfo';

function mean(xs: Array<number | null | undefined>): number | null {
  const vals = xs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function max(xs: Array<number | null | undefined>): number | null {
  const vals = xs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function fmtMb(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} MB`;
}

function fmtMs(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`;
}

function fmtTps(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)} t/s`;
}

export function CandidateResults({
  candidates,
  trials,
  scores,
  config,
  composites,
}: {
  candidates: EvalCandidateRow[];
  trials: EvalTrialRow[];
  scores: EvalScoreRow[];
  config: EvalRunConfig;
  composites: Record<string, number>;
}) {
  const { t } = useLanguage();

  const valuesByTrial = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of scores) {
      const list = m.get(s.trialId) ?? [];
      list.push(s.value);
      m.set(s.trialId, list);
    }
    return m;
  }, [scores]);

  const expectedPerCandidate = useMemo(() => {
    let per = 0;
    for (const p of config.packs) per += p.sampleIds.length * p.epochs;
    return per;
  }, [config]);

  if (candidates.length === 0) return null;

  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {candidates.map((c) => {
        const cellTrials = trials.filter((tr) => tr.candidateId === c.id);
        const values: number[] = [];
        for (const tr of cellTrials) {
          const v = valuesByTrial.get(tr.id);
          if (v) values.push(...v);
        }
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        const outcomes = new Map<string, number>();
        for (const tr of cellTrials) outcomes.set(tr.outcome, (outcomes.get(tr.outcome) ?? 0) + 1);
        const pct =
          expectedPerCandidate > 0
            ? Math.min(100, Math.round((cellTrials.length / expectedPerCandidate) * 100))
            : 0;
        const composite = composites[c.id] ?? null;
        return (
          <div
            key={c.id}
            className="space-y-1.5 rounded-md border border-border/60 bg-card/30 p-2.5 text-xs"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="min-w-0 truncate font-semibold text-foreground" title={c.label}>
                {c.label}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <FieldInfo
                  label={c.label}
                  help={t('eval.progress.results.help')}
                />
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px font-medium',
                    c.status === 'done' && 'bg-success/15 text-success',
                    c.status === 'failed' && 'bg-destructive/15 text-destructive',
                    c.status === 'skipped' && 'bg-warning/15 text-warning',
                    (c.status === 'running' || c.status === 'pending') && 'bg-primary/15 text-primary',
                  )}
                >
                  {c.status}
                </span>
              </span>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {cellTrials.length}/{expectedPerCandidate} · {pct}% · {fmtPct(avg)}
              {composite != null && (
                <span className="text-foreground"> · {t('eval.progress.results.composite')} {formatScore(composite)}</span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              <div>
                {t('eval.progress.results.outcomes')}:{' '}
                {outcomes.size > 0
                  ? [...outcomes.entries()].map(([o, n]) => `${o} ${n}`).join(' · ')
                  : t('eval.progress.results.noData')}
              </div>
              <div>
                {t('eval.progress.results.load')}: {c.loadMs != null ? fmtMs(c.loadMs) : t('eval.progress.results.noData')}
              </div>
              <div>
                {t('eval.progress.results.resources')}:{' '}
                {(() => {
                  const vramPeak = max(cellTrials.map((tr) => tr.vramPeakMb));
                  const gpuAvg = mean(cellTrials.map((tr) => tr.gpuUtilAvg));
                  const offload = mean(cellTrials.map((tr) => tr.offloadRatio));
                  return t('eval.progress.results.resourcesValue', {
                    v: fmtMb(vramPeak),
                    g: gpuAvg != null ? `${gpuAvg.toFixed(0)}%` : '—',
                    o: offload != null ? `${(offload * 100).toFixed(0)}%` : '—',
                  });
                })()}
              </div>
              <div>
                {t('eval.progress.results.timing')}:{' '}
                {t('eval.progress.results.timingValue', {
                  t: fmtMs(mean(cellTrials.map((tr) => tr.ttftMs))),
                  d: fmtTps(mean(cellTrials.map((tr) => tr.decodeTps))),
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
