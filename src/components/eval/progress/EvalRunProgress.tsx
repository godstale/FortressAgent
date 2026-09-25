import { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Pause, Play, SkipForward, XCircle } from 'lucide-react';
import { useEval } from '@/lib/context/EvalContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getRun,
  listCandidates,
  listScores,
  listTrials,
} from '@/lib/db/repositories/evalRepo';
import type {
  EvalCandidateRow,
  EvalRunRow,
  EvalScoreRow,
  EvalTrialRow,
} from '@/lib/eval/types';
import type { RunnerEvent } from '@/lib/eval/runner/events';
import { CandidatePackMatrix } from './CandidatePackMatrix';
import { LiveSamplePreview } from './LiveSamplePreview';
import { ResourceMiniChart, type ResourcePoint } from './ResourceMiniChart';
import { RunLog } from './RunLog';

const POLL_MS = 2000;
const RESOURCE_CAP = 600;

type LogEvent = Extract<RunnerEvent, { type: 'log' }>;
type TrialStartEvent = Extract<RunnerEvent, { type: 'trial_start' }>;

function formatSeconds(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function statusBadgeClass(status: string): string {
  if (status === 'completed') return 'bg-success/15 text-success';
  if (status === 'failed') return 'bg-destructive/15 text-destructive';
  if (status === 'cancelled' || status === 'interrupted')
    return 'bg-warning/15 text-warning';
  if (status === 'running' || status === 'judging' || status === 'paused')
    return 'bg-primary/15 text-primary';
  return 'bg-muted text-muted-foreground';
}

function makeCellKey(candidateId: string, packId: string): string {
  return `${candidateId}|${packId}`;
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);

export function EvalRunProgress({ runId }: { runId: string }) {
  return <EvalRunProgressInner key={runId} runId={runId} />;
}

function EvalRunProgressInner({ runId }: { runId: string }) {
  const { t } = useLanguage();
  const { runs, packs, activeRunner, events, pauseRun, resumeRun, cancelRun, skipCandidate } =
    useEval();

  const [run, setRun] = useState<EvalRunRow | null>(null);
  const [candidates, setCandidates] = useState<EvalCandidateRow[]>([]);
  const [trials, setTrials] = useState<EvalTrialRow[]>([]);
  const [scores, setScores] = useState<EvalScoreRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [resourceHistory, setResourceHistory] = useState<ResourcePoint[]>([]);
  const [cachedInput, setCachedInput] = useState<{
    key: string;
    input: string | null;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const processedEventsRef = useRef(0);

  const isActiveRun = activeRunner?.runId === runId;
  const liveEvents = useMemo(
    () => (isActiveRun ? events : []),
    [isActiveRun, events],
  );

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const [nextRun, nextCandidates, nextTrials, nextScores] = await Promise.all([
          getRun(runId),
          listCandidates(runId),
          listTrials(runId),
          listScores(runId),
        ]);
        if (cancelled) return;
        setRun(nextRun);
        setCandidates(nextCandidates);
        setTrials(nextTrials);
        setScores(nextScores);
        setLoaded(true);
        setLoadError(nextRun == null);
      } catch {
        if (cancelled) return;
        setLoaded(true);
        setLoadError(true);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);

  useEffect(() => {
    const fresh = liveEvents.slice(processedEventsRef.current);
    processedEventsRef.current = liveEvents.length;
    if (fresh.length === 0) return;
    const points: ResourcePoint[] = [];
    for (const e of fresh) {
      if (e.type === 'resource') {
        points.push({
          t: Date.now(),
          decodeTps: e.decodeTps,
          vramUsedMb: e.vramUsedMb,
          gpuUtilPct: e.gpuUtilPct,
        });
      }
    }
    if (points.length === 0) return;
    const timer = setTimeout(() => {
      setResourceHistory((prev) => [...prev, ...points].slice(-RESOURCE_CAP));
    }, 0);
    return () => clearTimeout(timer);
  }, [liveEvents]);

  const status = isActiveRun && activeRunner ? activeRunner.status : (run?.status ?? 'pending');
  const isTerminal = TERMINAL_STATUSES.has(status);
  const showControls = isActiveRun && !isTerminal;

  useEffect(() => {
    if (!showControls) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showControls]);

  const runName = run?.name ?? runs.find((r) => r.id === runId)?.name ?? runId;
  const done = run?.progressDone ?? 0;
  const total = run?.progressTotal ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const startedAt = run?.startedAt ?? null;
  const finishedAt = run?.finishedAt ?? null;
  const elapsedSec = useMemo(() => {
    if (startedAt == null) return null;
    const start = new Date(startedAt).getTime();
    if (!Number.isFinite(start)) return null;
    const end = finishedAt != null ? new Date(finishedAt).getTime() : nowMs;
    if (!Number.isFinite(end) || end < start) return null;
    return (end - start) / 1000;
  }, [startedAt, finishedAt, nowMs]);

  const lastEtaSec = useMemo(() => {
    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const e = liveEvents[i];
      if (e.type === 'eta') return e.remainingSec;
    }
    return null;
  }, [liveEvents]);

  const fallbackEtaSec = useMemo(() => {
    if (elapsedSec == null || done <= 0 || total <= done) return null;
    return (elapsedSec * (total - done)) / done;
  }, [elapsedSec, done, total]);

  const etaSec = lastEtaSec ?? fallbackEtaSec;

  const packIds = useMemo(
    () => (run?.config.packs ?? []).map((p) => p.packId),
    [run],
  );

  const expectedPerCell = useMemo(() => {
    const out: Record<string, number> = {};
    const packDefs = run?.config.packs ?? [];
    for (const c of candidates) {
      for (const p of packDefs) {
        out[makeCellKey(c.id, p.packId)] = p.sampleIds.length * p.epochs;
      }
    }
    return out;
  }, [candidates, run]);

  const currentStart = useMemo<TrialStartEvent | null>(() => {
    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const e = liveEvents[i];
      if (e.type === 'trial_start') return e;
    }
    return null;
  }, [liveEvents]);

  const streamText = useMemo(() => {
    if (!currentStart) return '';
    const chunks: string[] = [];
    let afterStart = false;
    for (const e of liveEvents) {
      if (e === currentStart) {
        afterStart = true;
        continue;
      }
      if (!afterStart) continue;
      if (
        e.type === 'trial_delta' &&
        e.candidateId === currentStart.candidateId &&
        e.packId === currentStart.packId &&
        e.sampleId === currentStart.sampleId
      ) {
        chunks.push(e.text);
      }
    }
    return chunks.join('');
  }, [liveEvents, currentStart]);

  const currentTrialRow = useMemo<EvalTrialRow | null>(() => {
    if (!currentStart) return null;
    const matches = trials.filter(
      (tr) =>
        tr.candidateId === currentStart.candidateId &&
        tr.packId === currentStart.packId &&
        tr.sampleId === currentStart.sampleId,
    );
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => (a.startedAt >= b.startedAt ? a : b));
  }, [trials, currentStart]);

  const currentOutcome = useMemo<string | null>(() => {
    if (currentTrialRow) return currentTrialRow.outcome;
    if (!currentStart) return null;
    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const e = liveEvents[i];
      if (
        e.type === 'trial_end' &&
        e.candidateId === currentStart.candidateId &&
        e.packId === currentStart.packId &&
        e.sampleId === currentStart.sampleId
      ) {
        return e.outcome;
      }
    }
    return null;
  }, [currentTrialRow, liveEvents, currentStart]);

  const trialKey = currentStart
    ? `${currentStart.packId}|${currentStart.sampleId}|${currentStart.epoch}`
    : null;
  const currentPackId = currentStart?.packId ?? null;
  const currentSampleId = currentStart?.sampleId ?? null;

  useEffect(() => {
    if (trialKey == null || currentPackId == null || currentSampleId == null) return;
    if (cachedInput?.key === trialKey) return;
    const ref = packs.find((p) => p.manifest.id === currentPackId);
    if (!ref) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ loadPack }, { tauriPackFs }] = await Promise.all([
          import('@/lib/eval/packs/packLoader'),
          import('@/lib/eval/packs/packFs'),
        ]);
        const pack = await loadPack(tauriPackFs, ref);
        const sample = pack.samples.find((s) => s.id === currentSampleId);
        const input =
          sample == null
            ? null
            : typeof sample.input === 'string'
              ? sample.input
              : sample.input.map((m) => m.content).join('\n');
        if (!cancelled) setCachedInput({ key: trialKey, input });
      } catch {
        if (!cancelled) setCachedInput({ key: trialKey, input: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trialKey, currentPackId, currentSampleId, packs, cachedInput]);

  const sampleInput = trialKey != null && cachedInput?.key === trialKey ? cachedInput.input : null;

  const logEvents = useMemo<LogEvent[]>(
    () => liveEvents.filter((e): e is LogEvent => e.type === 'log'),
    [liveEvents],
  );

  const liveCell = useMemo(() => {
    if (!currentStart || isTerminal) return null;
    return { candidateId: currentStart.candidateId, packId: currentStart.packId };
  }, [currentStart, isTerminal]);

  const candidateLabel = useMemo(() => {
    if (!currentStart) return null;
    return candidates.find((c) => c.id === currentStart.candidateId)?.label ?? null;
  }, [candidates, currentStart]);

  if (!loaded) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        {t('eval.progress.loading')}
      </p>
    );
  }

  if (loadError || !run) {
    return (
      <p className="p-4 text-xs text-destructive">
        {t('eval.progress.loadFailed')}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="rounded-xl border border-border bg-card/40 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
            {runName}
          </h2>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              statusBadgeClass(status),
            )}
          >
            {t('eval.progress.status')}: {status}
          </span>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('eval.progress.overall')}</span>
            <span className="font-mono">
              {t('eval.progress.trials', { done, total })} · {pct}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t('eval.progress.elapsed')}:{' '}
            <span className="font-mono text-foreground">
              {elapsedSec != null ? formatSeconds(elapsedSec) : t('eval.progress.etaUnknown')}
            </span>
          </span>
          <span>
            {t('eval.progress.eta')}:{' '}
            <span className="font-mono text-foreground">
              {etaSec != null ? formatSeconds(etaSec) : t('eval.progress.etaUnknown')}
            </span>
          </span>
        </div>
        {showControls && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {status === 'running' && (
                <Button type="button" size="sm" variant="outline" onClick={pauseRun}>
                  <Pause className="h-3.5 w-3.5" />
                  {t('eval.progress.pause')}
                </Button>
              )}
              {status === 'paused' && (
                <Button type="button" size="sm" onClick={resumeRun}>
                  <Play className="h-3.5 w-3.5" />
                  {t('eval.progress.resume')}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={skipCandidate}>
                <SkipForward className="h-3.5 w-3.5" />
                {t('eval.progress.skipCandidate')}
              </Button>
              {confirmCancel ? (
                <>
                  <span className="w-full text-[11px] text-muted-foreground">
                    {t('eval.progress.cancelAsk')}
                  </span>
                  <Button type="button" size="sm" variant="destructive" onClick={cancelRun}>
                    <XCircle className="h-3.5 w-3.5" />
                    {t('eval.progress.cancelYes')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmCancel(false)}
                  >
                    {t('eval.progress.cancelNo')}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t('eval.progress.cancel')}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {t('eval.progress.pauseNote')}
            </p>
          </div>
        )}
      </header>

      {status === 'completed' && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-xs">
          <p className="font-medium text-foreground">{t('eval.progress.completed')}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled
            data-future-view="report"
            title={t('eval.progress.viewReport')}
          >
            {t('eval.progress.viewReport')}
          </Button>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card/40 p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          {t('eval.progress.matrix.title')}
        </h3>
        <CandidatePackMatrix
          candidates={candidates}
          packIds={packIds}
          trials={trials}
          scores={scores}
          expectedPerCell={expectedPerCell}
          liveCell={liveCell}
        />
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          {t('eval.progress.preview.title')}
        </h3>
        <LiveSamplePreview
          packId={currentStart?.packId ?? null}
          sampleId={currentStart?.sampleId ?? null}
          candidateLabel={candidateLabel}
          sampleInput={sampleInput}
          streamText={streamText}
          turns={currentTrialRow?.turns ?? null}
          toolCallCount={currentTrialRow?.toolCalls ?? null}
          outcome={currentOutcome}
        />
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          {t('eval.progress.resources.title')}
        </h3>
        <ResourceMiniChart points={resourceHistory} now={nowMs} />
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          {t('eval.progress.log.title')}
        </h3>
        <RunLog events={logEvents} />
      </section>
    </div>
  );
}
