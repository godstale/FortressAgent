import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_PROFILES } from '@/lib/eval/constants';
import { evalLock } from '@/lib/eval/evalLock';
import { collectHardware } from '@/lib/eval/runner/hardware';
import { EvalRunner } from '@/lib/eval/runner/runner';
import { tauriPackFs } from '@/lib/eval/packs/packFs';
import { listPacks, type LoadedPackRef } from '@/lib/eval/packs/packLoader';
import type {
  EvalProfile,
  EvalRunConfig,
  EvalRunRow,
  IntegrationSettings,
} from '@/lib/eval/types';
import {
  createRun as repoCreateRun,
  deleteRun as repoDeleteRun,
  getRun,
  insertCandidates,
  listProfiles,
  listRuns,
  renameRun as repoRenameRun,
} from '@/lib/db/repositories/evalRepo';
import { getIntegrationSettings } from '@/lib/db/repositories/integrationsRepo';
import { markInterruptedRuns } from '@/lib/db/repositories/evalRepo';
import { cleanupAllSandboxes } from '@/lib/eval/runner/sandbox';
import { runJudgePass } from '@/lib/eval/judge/judgePass';
import type { RunnerEvent } from '@/lib/eval/runner/events';
import { useSafeWorkspace } from '@/lib/context/WorkspaceContext';

export interface ActiveRunnerState {
  runId: string;
  status: string;
  done: number;
  total: number;
}

export interface EvalContextValue {
  runs: EvalRunRow[];
  packs: LoadedPackRef[];
  profiles: EvalProfile[];
  integrationSettings: IntegrationSettings | null;
  activeRunner: ActiveRunnerState | null;
  /** Live runner events for the active run (capped, cleared on start). Progress UI reads these + polls the DB. */
  events: RunnerEvent[];
  refreshRuns: () => Promise<void>;
  refreshPacks: () => Promise<void>;
  createRun: (config: EvalRunConfig) => Promise<string>;
  startRun: (runId: string) => Promise<void>;
  pauseRun: () => void;
  resumeRun: () => void;
  cancelRun: () => void;
  skipCandidate: () => void;
  deleteRun: (runId: string) => Promise<void>;
  renameRun: (runId: string, name: string) => Promise<void>;
  cloneRun: (runId: string) => Promise<string>;
}

const EvalContext = createContext<EvalContextValue | null>(null);

async function fetchPackRefs(workspaceRoot: string | undefined): Promise<LoadedPackRef[]> {
  try {
    const { refs } = await listPacks(tauriPackFs, workspaceRoot);
    return refs;
  } catch {
    return [];
  }
}

export function EvalProvider({ children }: { children: React.ReactNode }) {
  const workspace = useSafeWorkspace();
  const workspaceRoot = workspace?.workspaceRoot ?? undefined;
  const [runs, setRuns] = useState<EvalRunRow[]>([]);
  const [packs, setPacks] = useState<LoadedPackRef[]>([]);
  const [customProfiles, setCustomProfiles] = useState<EvalProfile[]>([]);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings | null>(null);
  const [activeRunner, setActiveRunner] = useState<ActiveRunnerState | null>(null);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const runnerRef = useRef<EvalRunner | null>(null);

  const refreshRuns = useCallback(async () => {
    setRuns(await listRuns({ limit: 100 }));
  }, []);

  const refreshPacks = useCallback(async () => {
    setPacks(await fetchPackRefs(workspaceRoot));
  }, [workspaceRoot]);

  useEffect(() => {
    let alive = true;
    async function initialLoad(): Promise<void> {
      await markInterruptedRuns().catch(() => undefined);
      await cleanupAllSandboxes().catch(() => undefined);
      const [nextRuns, nextPacks, nextProfiles, nextSettings] = await Promise.all([
        listRuns({ limit: 100 }).catch(() => [] as EvalRunRow[]),
        fetchPackRefs(workspaceRoot),
        listProfiles().catch(() => [] as EvalProfile[]),
        getIntegrationSettings().catch(() => null),
      ]);
      if (!alive) return;
      setRuns(nextRuns);
      setPacks(nextPacks);
      setCustomProfiles(nextProfiles);
      setIntegrationSettings(nextSettings);
    }
    void initialLoad();
    return () => {
      alive = false;
    };
  }, [workspaceRoot]);

  const createRun = useCallback(
    async (config: EvalRunConfig): Promise<string> => {
      const hardware = await collectHardware();
      const runId = await repoCreateRun(config, hardware);
      await insertCandidates(runId, config.candidates);
      await refreshRuns();
      return runId;
    },
    [refreshRuns],
  );

  const startRun = useCallback(
    async (runId: string): Promise<void> => {
      if (evalLock.get()) return;
      const runner = new EvalRunner({
        workspaceRoot,
        judgePass: (id) => runJudgePass(id).then(() => undefined),
      });
      runnerRef.current = runner;
      setEvents([]);
      runner.on((e) => {
        setEvents((prev) => (prev.length > 300 ? [...prev.slice(-300), e] : [...prev, e]));
        if (e.type === 'run_status') {
          setActiveRunner((prev) =>
            prev && prev.runId === runId ? { ...prev, status: e.status } : prev,
          );
          if (e.status === 'completed' || e.status === 'cancelled' || e.status === 'failed') {
            void refreshRuns();
          }
        } else if (e.type === 'candidate_start') {
          setActiveRunner((prev) => (prev ? prev : { runId, status: 'running', done: 0, total: 0 }));
        }
      });
      const run = await getRun(runId);
      setActiveRunner({ runId, status: 'running', done: run?.progressDone ?? 0, total: run?.progressTotal ?? 0 });
      try {
        await runner.start(runId);
      } finally {
        runnerRef.current = null;
        setActiveRunner(null);
        await refreshRuns();
      }
    },
    [refreshRuns, workspaceRoot],
  );

  const deleteRun = useCallback(
    async (runId: string): Promise<void> => {
      await repoDeleteRun(runId);
      await refreshRuns();
    },
    [refreshRuns],
  );

  const renameRun = useCallback(
    async (runId: string, name: string): Promise<void> => {
      await repoRenameRun(runId, name);
      await refreshRuns();
    },
    [refreshRuns],
  );

  const cloneRun = useCallback(
    async (runId: string): Promise<string> => {
      const run = await getRun(runId);
      if (!run) throw new Error(`run not found: ${runId}`);
      const hardware = await collectHardware();
      const cloned: EvalRunConfig = { ...run.config, name: `${run.config.name} (copy)` };
      const newId = await repoCreateRun(cloned, hardware);
      await insertCandidates(newId, cloned.candidates);
      await refreshRuns();
      return newId;
    },
    [refreshRuns],
  );

  const value = useMemo<EvalContextValue>(
    () => ({
      runs,
      packs,
      profiles: [...BUILTIN_PROFILES, ...customProfiles],
      integrationSettings,
      activeRunner,
      events,
      refreshRuns,
      refreshPacks,
      createRun,
      startRun,
      pauseRun: () => runnerRef.current?.pause(),
      resumeRun: () => runnerRef.current?.resume(),
      cancelRun: () => runnerRef.current?.cancel(),
      skipCandidate: () => runnerRef.current?.skipCurrentCandidate(),
      deleteRun,
      renameRun,
      cloneRun,
    }),
    [
      runs,
      packs,
      customProfiles,
      integrationSettings,
      activeRunner,
      events,
      refreshRuns,
      refreshPacks,
      createRun,
      startRun,
      deleteRun,
      renameRun,
      cloneRun,
    ],
  );

  return <EvalContext.Provider value={value}>{children}</EvalContext.Provider>;
}

export function useEval(): EvalContextValue {
  const ctx = useContext(EvalContext);
  if (!ctx) throw new Error('useEval must be used within EvalProvider');
  return ctx;
}
