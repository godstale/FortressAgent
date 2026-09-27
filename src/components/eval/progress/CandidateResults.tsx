import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import type {
  EvalCandidateRow,
  EvalRunConfig,
  EvalScoreRow,
  EvalTrialRow,
  HardwareFingerprint,
} from '@/lib/eval/types';
import { formatScore } from '../report/reportData';
import { FieldInfo } from '../wizard/FieldInfo';

function mean(xs: Array<number | null | undefined>): number | null {
  const vals = xs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sum(xs: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of xs) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

function max(xs: Array<number | null | undefined>): number | null {
  const vals = xs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function fmtInt(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString() : '—';
}

function fmtMs(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`;
}

function fmtTps(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)} t/s`;
}

function fmtGb(mb: number | null): string {
  return mb == null ? '—' : `${(mb / 1024).toFixed(1)} GB`;
}

function MiniCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5 rounded-md border border-border/60 bg-card/20 p-2', className)}>
      <div className="text-[11px] font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

export function CandidateResults({
  candidates,
  trials,
  scores,
  config,
  composites,
  hardware,
  pendingTrialIds,
}: {
  candidates: EvalCandidateRow[];
  trials: EvalTrialRow[];
  scores: EvalScoreRow[];
  config: EvalRunConfig;
  composites: Record<string, number>;
  hardware: HardwareFingerprint;
  pendingTrialIds: ReadonlySet<string>;
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

  // Per-candidate monitoring block. Inner rows mirror AgentMonitorTab:
  // row 1 = 3 columns (offload / memory / trend), row 2 = 2 columns
  // (tokens / architecture), so no half-empty gutter remains.
  return (
    <div className="space-y-3">
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
        const pendingCount = cellTrials.filter((tr) => pendingTrialIds.has(tr.id)).length;

        const offload = mean(cellTrials.map((tr) => tr.offloadRatio));
        const offloadPct = offload != null ? Math.round(offload * 100) : null;
        const vramPeak = max(cellTrials.map((tr) => tr.vramPeakMb));
        const vramTotal = hardware.vramTotalMb > 0 ? hardware.vramTotalMb : null;
        const vramPct =
          vramPeak != null && vramTotal != null ? Math.min(100, (vramPeak / vramTotal) * 100) : null;

        const trend = [...cellTrials]
          .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
          .map((tr, i) => ({
            i: i + 1,
            vram: tr.vramPeakMb ?? null,
            gpu: tr.gpuUtilAvg != null ? Math.round(tr.gpuUtilAvg) : null,
          }));
        const hasTrend = trend.some((p) => p.vram != null || p.gpu != null);

        const inSum = sum(cellTrials.map((tr) => tr.inputTokens));
        const outSum = sum(cellTrials.map((tr) => tr.outputTokens));
        const thinkSum = sum(cellTrials.map((tr) => tr.thinkingTokens));
        const ttft = mean(cellTrials.map((tr) => tr.ttftMs));
        const decode = mean(cellTrials.map((tr) => tr.decodeTps));
        const sources = new Map<string, number>();
        for (const tr of cellTrials) {
          if (tr.timingSource) sources.set(tr.timingSource, (sources.get(tr.timingSource) ?? 0) + 1);
        }
        const turnSum = sum(cellTrials.map((tr) => tr.turns));
        const toolSum = sum(cellTrials.map((tr) => tr.toolCalls));

        const snap = c.snapshot;
        return (
          <div
            key={c.id}
            className="space-y-2 rounded-md border border-border/60 bg-card/30 p-2.5 text-xs"
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
              {pendingCount > 0 && (
                <div className="font-medium text-warning">
                  {t('eval.progress.results.pendingNote', { n: pendingCount })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
              <MiniCard title={t('eval.progress.results.offload')}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {offloadPct != null ? `${offloadPct}%` : t('eval.progress.results.noData')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('eval.progress.results.load')}: {c.loadMs != null ? fmtMs(c.loadMs) : t('eval.progress.results.noData')}
                  </span>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-warning" style={{ width: `${offloadPct ?? 0}%` }} />
                  <div className="h-full bg-primary" style={{ width: `${100 - (offloadPct ?? 0)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{t('eval.progress.results.offloadGpu')}</span>
                  <span>{t('eval.progress.results.offloadCpu')}</span>
                </div>
              </MiniCard>

              <MiniCard title={t('eval.progress.results.memDist')}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-muted-foreground">{t('eval.progress.results.memVram')}</span>
                  <span className="font-mono font-semibold text-foreground">
                    {fmtGb(vramPeak)}
                    <span className="font-normal text-muted-foreground"> / {fmtGb(vramTotal)}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full"
                    style={{ width: `${vramPct ?? 0}%`, backgroundColor: 'hsl(var(--chart-2))' }}
                  />
                </div>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-muted-foreground">{t('eval.progress.results.memRam')}</span>
                  <span className="font-mono font-semibold text-foreground">{fmtGb(hardware.ramTotalMb > 0 ? hardware.ramTotalMb : null)}</span>
                </div>
              </MiniCard>

              <MiniCard title={t('eval.progress.results.trend')}>
                {hasTrend ? (
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            color: 'hsl(var(--popover-foreground))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="vram"
                          name="VRAM MB"
                          stroke="hsl(var(--chart-2))"
                          fill="hsl(var(--chart-2))"
                          fillOpacity={0.2}
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="gpu"
                          name="GPU %"
                          stroke="hsl(var(--chart-3))"
                          fill="hsl(var(--chart-3))"
                          fillOpacity={0.2}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-4 text-center text-[11px] text-muted-foreground">
                    {t('eval.progress.results.trendEmpty')}
                  </p>
                )}
              </MiniCard>
            </div>

            <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
              <MiniCard title={t('eval.progress.results.tokens')}>
                <div className="font-mono text-[11px] text-foreground">
                  {t('eval.progress.results.tokensValue', {
                    i: fmtInt(inSum),
                    o: fmtInt(outSum),
                    t: fmtInt(thinkSum),
                  })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t('eval.progress.results.timingValue', {
                    t: fmtMs(ttft),
                    d: fmtTps(decode),
                  })}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {sources.size > 0
                    ? t('eval.progress.results.timingSource', {
                      s: [...sources.entries()].map(([s, n]) => `${s} ${n}`).join(' · '),
                    })
                    : t('eval.progress.results.noData')}
                  {` · ${turnSum} turns/${toolSum} tools`}
                </div>
              </MiniCard>

              <MiniCard title={t('eval.progress.results.arch')}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate font-mono font-semibold text-foreground" title={snap?.model}>
                      {snap?.model ?? t('eval.progress.results.noData')}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {snap?.provider ?? ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>
                      {t('eval.progress.results.archCtx')}{' '}
                      <span className="font-mono text-foreground">
                        {(snap?.contextSize ?? 0) > 0 ? (snap?.contextSize ?? 0).toLocaleString() : t('eval.progress.results.noData')}
                      </span>
                    </span>
                    <span>
                      T <span className="font-mono text-foreground">{snap?.temperature ?? '—'}</span>
                    </span>
                    <span>
                      {t('eval.progress.results.archReasoning')}{' '}
                      <span className="font-mono text-foreground">
                        {snap?.reasoning === 'on' ? `on:${snap?.reasoningEffort ?? 'medium'}` : (snap?.reasoning ?? 'default')}
                      </span>
                    </span>
                  </div>
              </MiniCard>
            </div>
          </div>
        );
      })}
    </div>
  );
}
