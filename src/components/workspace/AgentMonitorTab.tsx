import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  Activity,
  Cpu,
  Layers,
  Thermometer,
  HardDrive,
  RefreshCw,
  Play,
  Pause,
  FileDown,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Server,
  Zap,
  Clock,
  Radio,
  FileText,
  Copy,
  Check,
  Gauge,
  Timer,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { useSettings } from '@/lib/context/SettingsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { Button } from '@/components/ui/button';
import {
  Tooltip as UiTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { AgentMonitoringSnapshot } from '@/lib/types/monitoring';
import {
  getMonitoringSnapshots,
  clearMonitoringSnapshots,
} from '@/lib/db/repositories/monitoringRepo';
import { monitoringCollector } from '@/lib/monitoring/monitoringCollector';
import { listModels } from '@/lib/llm/ollamaClient';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const CHART_COLORS = {
  gpu: 'hsl(var(--chart-3))', // 선명한 에메랄드 녹색 (GPU 점유율)
  vram: 'hsl(var(--chart-2))', // 뚜렷이 대비되는 바이올렛 보라색 (VRAM 메모리)
  prefill: 'hsl(var(--chart-4))', // 앰버 황색 (Prefill 속도 및 시간)
  decoding: 'hsl(var(--chart-5))', // 시안 청록색 (디코딩 속도 및 시간)
} as const;

const INTERVAL_OPTIONS = [
  { seconds: 1, value: 1000 },
  { seconds: 2, value: 2000 },
  { seconds: 3, value: 3000 },
  { seconds: 5, value: 5000 },
  { seconds: 10, value: 10000 },
];

function formatMemoryBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatContextTokenSize(tokens?: number): string {
  if (!tokens || tokens <= 0) return '0';
  if (tokens >= 1024 * 1024) {
    const val = tokens / (1024 * 1024);
    return Number.isInteger(val) ? `${val}M` : `${val.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    if (tokens % 1024 === 0) {
      return `${tokens / 1024}k`;
    }
    const val = tokens / 1000;
    return val >= 10 ? `${Math.round(val)}k` : `${val.toFixed(1)}k`;
  }
  return `${tokens}`;
}

function computeDynamicMax(maxValue: number, defaultMin: number): number {
  if (!maxValue || maxValue <= 0) return defaultMin;
  const target = maxValue * 1.25; // 상단 25% 여유 공간 확보
  if (target <= defaultMin) return defaultMin;
  if (target < 50) return Math.ceil(target / 10) * 10;
  if (target < 200) return Math.ceil(target / 25) * 25;
  if (target < 1000) return Math.ceil(target / 50) * 50;
  if (target < 5000) return Math.ceil(target / 250) * 250;
  return Math.ceil(target / 500) * 500;
}

function formatAxisNumber(val: number): string {
  if (val === 0) return '0';
  const absVal = Math.abs(val);
  if (absVal >= 1_000_000) {
    const formatted = (val / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M`;
  }
  if (absVal >= 1_000) {
    const formatted = (val / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }
  return Number.isInteger(val) ? `${val}` : `${val.toFixed(1)}`;
}

interface KpiCardHelpProps {
  title?: string;
  description?: string;
  guide?: string;
  /** i18n key prefix: resolves monitorHelp.{prefix}.title/.desc/.guide */
  i18n?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function KpiCardHelp({ title, description, guide, i18n, side = 'top' }: KpiCardHelpProps) {
  const { t } = useLanguage();
  const titleText = i18n ? t(`monitorHelp.${i18n}.title`) : (title ?? '');
  const descText = i18n ? t(`monitorHelp.${i18n}.desc`) : (description ?? '');
  const guideText = i18n ? t(`monitorHelp.${i18n}.guide`) : guide;
  return (
    <TooltipProvider delayDuration={150}>
      <UiTooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary inline-flex items-center justify-center cursor-help"
            aria-label={t('monitor.helpAria', { title: titleText })}
          >
            <HelpCircle className="h-3.5 w-3.5 opacity-60 hover:opacity-100 transition-opacity" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs p-3 bg-popover text-popover-foreground border border-border shadow-2xl rounded-lg space-y-2 z-50 text-left"
        >
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 border-b border-border/60 pb-1.5">
            <span className="text-primary font-bold">ℹ️</span>
            <span>{titleText}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-normal">
            {descText}
          </p>
          {guideText && (
            <div className="text-[10px] bg-accent/40 rounded p-2 font-sans text-accent-foreground border border-border/40 space-y-1">
              <span className="font-semibold text-foreground block">{t('monitor.guideHeader')}</span>
              <span className="leading-normal block whitespace-normal text-muted-foreground">{guideText}</span>
            </div>
          )}
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

export function AgentMonitorTab({ tab }: { tab: WorkspaceTab }) {
  const agentId = tab.meta?.agentId as string | undefined;
  const { getAgent } = useAgents();
  const { settings } = useSettings();
  const { workspaceRoot } = useWorkspace();
  const agent = agentId ? getAgent(agentId) : null;

  const [snapshots, setSnapshots] = useState<AgentMonitoringSnapshot[]>([]);
  const [currentSnapshot, setCurrentSnapshot] = useState<AgentMonitoringSnapshot | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [ollamaErrorDialogOpen, setOllamaErrorDialogOpen] = useState(false);
  const [ollamaErrorMessage, setOllamaErrorMessage] = useState('');
  const [intervalMs, setIntervalMs] = useState(3000);
  const [selectedSnapshot, setSelectedSnapshot] = useState<AgentMonitoringSnapshot | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [timelineOffset, setTimelineOffset] = useState(0);
  const { t } = useLanguage();

  // Stop collector immediately when tab unmounts or agent changes
  useEffect(() => {
    return () => {
      if (agentId) {
        monitoringCollector.stop(agentId);
      }
    };
  }, [agentId]);

  // Initial load of historical snapshots
  useEffect(() => {
    if (!agentId) return;
    let active = true;

    void (async () => {
      try {
        const history = await getMonitoringSnapshots(agentId, 100, workspaceRoot);
        if (active) {
          setSnapshots(history);
          if (history.length > 0) {
            setCurrentSnapshot(history[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load initial monitoring snapshots:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [agentId, workspaceRoot]);

  // Start periodic collector and subscribe to real-time events
  useEffect(() => {
    if (!agent) return;

    if (isCollecting) {
      monitoringCollector.start(agent, settings.ollamaBaseUrl, intervalMs, workspaceRoot);
    } else {
      monitoringCollector.stop(agent.id);
    }

    const unsubscribe = monitoringCollector.subscribe(agent.id, (newSnapshot) => {
      setCurrentSnapshot(newSnapshot);
      setSnapshots((prev) => {
        // Keep most recent 100 snapshots for history and graphs
        const next = [newSnapshot, ...prev.filter((s) => s.id !== newSnapshot.id)];
        return next.slice(0, 100);
      });
    });

    return () => {
      unsubscribe();
      // Ensure collector is stopped if tab unmounts while collecting
      if (agent.id) {
        monitoringCollector.stop(agent.id);
      }
    };
  }, [agent, settings.ollamaBaseUrl, isCollecting, intervalMs, workspaceRoot]);

  const handleToggleCollecting = async () => {
    if (!agent) return;
    if (isCollecting) {
      monitoringCollector.stop(agent.id);
      setIsCollecting(false);
    } else {
      setIsStarting(true);
      try {
        // Verify Ollama connectivity before starting periodic monitoring
        await listModels(settings.ollamaBaseUrl);
        monitoringCollector.start(agent, settings.ollamaBaseUrl, intervalMs, workspaceRoot);
        setIsCollecting(true);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : t('monitor.connFailed');
        setOllamaErrorMessage(errMsg);
        setOllamaErrorDialogOpen(true);
        setIsCollecting(false);
      } finally {
        setIsStarting(false);
      }
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setIntervalMs(newInterval);
    if (agent && isCollecting) {
      monitoringCollector.setInterval(agent.id, newInterval, agent, settings.ollamaBaseUrl, workspaceRoot);
    }
  };

  const handleManualRefresh = async () => {
    if (!agent) return;
    setManualRefreshing(true);
    try {
      await listModels(settings.ollamaBaseUrl);
      const snap = await monitoringCollector.collectNow(agent, settings.ollamaBaseUrl, workspaceRoot);
      if (snap) {
        setCurrentSnapshot(snap);
        setSnapshots((prev) => [snap, ...prev.filter((s) => s.id !== snap.id)].slice(0, 100));
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : t('monitor.connFailed');
      setOllamaErrorMessage(errMsg);
      setOllamaErrorDialogOpen(true);
    } finally {
      setManualRefreshing(false);
    }
  };

  const handleClearHistory = async () => {
    if (!agentId) return;
    await clearMonitoringSnapshots(agentId, workspaceRoot);
    setSnapshots(currentSnapshot ? [currentSnapshot] : []);
    setClearConfirmOpen(false);
  };

  const handleExportJson = () => {
    if (!agent) return;
    const payload = {
      agent,
      collectedAt: new Date().toISOString(),
      currentSnapshot,
      historyCount: snapshots.length,
      history: snapshots,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-monitoring-${agent.name}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  // Prepare chart data (reverse to chronological order left-to-right)
  const timeSeriesData = useMemo(() => {
    return [...snapshots].reverse().map((s) => ({
      time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      gpuUtilization: s.gpuUtilizationPct,
      vramUsedMb: s.gpuVramUsedMb,
      vramUsedGb: Number((s.gpuVramUsedMb / 1024).toFixed(2)),
      gpuTemp: s.gpuTemperatureC,
      gpuOffloadPct: s.gpuOffloadPct,
      prefillSpeed: s.prefillSpeed ?? 0,
      decodingSpeed: s.decodingSpeed ?? 0,
      prefillDurationMs: s.prefillDurationMs ?? 0,
      decodingDurationMs: s.decodingDurationMs ?? 0,
      prefillDurationSec: s.prefillDurationMs ? Number((s.prefillDurationMs / 1000).toFixed(2)) : 0,
      decodingDurationSec: s.decodingDurationMs ? Number((s.decodingDurationMs / 1000).toFixed(2)) : 0,
      prefillTokens: s.prefillTokens ?? 0,
      decodingTokens: s.decodingTokens ?? 0,
    }));
  }, [snapshots]);

  // Compute dynamic scale upper bounds for dual Y-axis charts with comfortable headroom
  const {
    prefillSpeedMax,
    decodingSpeedMax,
    prefillDurationMax,
    decodingDurationMax,
  } = useMemo(() => {
    let maxPrefillSpeed = 0;
    let maxDecodingSpeed = 0;
    let maxPrefillDuration = 0;
    let maxDecodingDuration = 0;

    for (const d of timeSeriesData) {
      if (d.prefillSpeed > maxPrefillSpeed) maxPrefillSpeed = d.prefillSpeed;
      if (d.decodingSpeed > maxDecodingSpeed) maxDecodingSpeed = d.decodingSpeed;
      if (d.prefillDurationMs > maxPrefillDuration) maxPrefillDuration = d.prefillDurationMs;
      if (d.decodingDurationMs > maxDecodingDuration) maxDecodingDuration = d.decodingDurationMs;
    }

    return {
      prefillSpeedMax: computeDynamicMax(maxPrefillSpeed, 100),
      decodingSpeedMax: computeDynamicMax(maxDecodingSpeed, 40),
      prefillDurationMax: computeDynamicMax(maxPrefillDuration, 200),
      decodingDurationMax: computeDynamicMax(maxDecodingDuration, 1000),
    };
  }, [timeSeriesData]);

  // Memory breakdown bar data (converted to GB)
  const memoryBreakdownData = useMemo(() => {
    if (!currentSnapshot) return [];
    const modelWeightGb = Number((currentSnapshot.modelWeightBytes / (1024 * 1024 * 1024)).toFixed(2));
    const kvCacheGb = Number((currentSnapshot.kvCacheBytes / (1024 * 1024 * 1024)).toFixed(2));
    const freeVramGb = Number((Math.max(0, currentSnapshot.gpuVramFreeMb) / 1024).toFixed(2));
    const otherVramMb = Math.max(
      0,
      currentSnapshot.gpuVramUsedMb - Math.round(currentSnapshot.modelWeightBytes / (1024 * 1024)),
    );
    const otherVramGb = Number((otherVramMb / 1024).toFixed(2));

    return [
      {
        name: t('monitor.vramDist'),
        [t('monitor.weights')]: modelWeightGb,
        [t('monitor.kvEst')]: kvCacheGb,
        [t('monitor.otherUsage')]: otherVramGb,
        [t('monitor.freeSpace')]: freeVramGb,
      },
    ];
  }, [currentSnapshot, t]);

  if (!agentId || !agent) {
    return (
      <div className="flex-1 p-8 text-center text-muted-foreground text-xs">
        {t('monitor.notFound')}
      </div>
    );
  }

  const vramPercent =    currentSnapshot && currentSnapshot.gpuVramTotalMb > 0
      ? Math.round((currentSnapshot.gpuVramUsedMb / currentSnapshot.gpuVramTotalMb) * 100)
      : 0;

  const rawDetails = (currentSnapshot?.details || {}) as Record<string, unknown>;
  const lastCompleted = rawDetails.lastCompletedInference as
    | {
        prefillSpeed?: number;
        decodingSpeed?: number;
        prefillDurationMs?: number;
        decodingDurationMs?: number;
        prefillTokens?: number;
        decodingTokens?: number;
        totalDurationMs?: number;
        completedAt?: number;
      }
    | null
    | undefined;

  const getStatusBadge = (status: AgentMonitoringSnapshot['agentStatus']) => {
    switch (status) {
      case 'generating':
        return {
          label: t('monitor.inferring'),
          className: 'bg-success/20 text-success border-success/30 animate-pulse',
        };
      case 'executing_tool':
        return {
          label: t('monitor.toolRunning'),
          className: 'bg-warning/20 text-warning border-warning/30 animate-pulse',
        };
      case 'waiting_approval':
        return {
          label: t('monitor.awaitingApproval'),
          className: 'bg-destructive/20 text-destructive border-destructive/30',
        };
      case 'idle':
      default:
        return {
          label: t('monitor.idle'),
          className: 'bg-muted text-foreground border-border',
        };
    }
  };

  const statusBadge = getStatusBadge(currentSnapshot?.agentStatus || 'idle');

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 bg-background text-foreground space-y-5 select-none">
      {/* Top Header & Real-time Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {t('monitor.title', { name: agent.name })}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${
                    isCollecting ? statusBadge.className : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isCollecting ? 'bg-current' : 'bg-subtle'}`} />
                  {isCollecting ? statusBadge.label : t('monitor.pending')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('monitor.model')} <span className="font-mono text-foreground font-medium">{agent.model}</span> |
                {t('monitor.contextLabel')}{' '}
                <span className="font-mono text-foreground font-medium">
                  {agent.contextSize > 0 ? `${agent.contextSize.toLocaleString()}` : '8192'} ctx
                </span>{' '}
                | {t('monitor.currentTask')}{' '}
                <span className="text-foreground/90 font-medium truncate max-w-sm inline-block align-bottom">
                  {currentSnapshot?.currentTask || t('monitor.waiting')}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Action / Sampling Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Interval Selector */}
          <div className="flex items-center gap-1.5 bg-card border border-border/80 px-2 py-1 rounded-lg text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={intervalMs}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-popover text-popover-foreground">
                  {t('monitor.interval', { n: opt.seconds })}
                </option>
              ))}
            </select>
          </div>

          {/* Start/Pause Toggle */}
          <Button
            variant={isCollecting ? 'secondary' : 'default'}
            size="sm"
            onClick={handleToggleCollecting}
            disabled={isStarting}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            {isStarting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span>{t('monitor.checking')}</span>
              </>
            ) : isCollecting ? (
              <>
                <Pause className="h-3.5 w-3.5 fill-current text-amber-500 dark:text-amber-400" />
                <span>{t('monitor.pause')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current text-primary-foreground" />
                <span>{t('monitor.start')}</span>
              </>
            )}
          </Button>

          {/* Manual Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={manualRefreshing}
            className="h-8 text-xs gap-1.5 cursor-pointer"
            title={t('monitor.measureNowTitle')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${manualRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('monitor.measureNow')}</span>
          </Button>

          {/* Export JSON for AI Agents */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={snapshots.length === 0}
            className="h-8 text-xs gap-1.5 cursor-pointer"
            title={t('monitor.downloadTitle')}
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{t('monitor.downloadJson')}</span>
          </Button>

          {/* Clear history */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearConfirmOpen(true)}
            disabled={snapshots.length === 0}
            className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
            title={t('monitor.clearTitle')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('monitor.clear')}</span>
          </Button>
        </div>
      </div>

      {/* 8 Key Operational & Performance KPI Cards (max 4 per row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. GPU Model & Utilization */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-success" />
              <span>{t('monitor.gpuUsage')}</span>
              <KpiCardHelp
                i18n="gpu"
                description={undefined}
                guide={undefined}
              />
            </span>
            {currentSnapshot && currentSnapshot.gpuTemperatureC > 0 && (
              <span className="flex items-center text-[10px] text-warning">
                <Thermometer className="h-3 w-3 mr-0.5" />
                {currentSnapshot.gpuTemperatureC}°C
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-foreground truncate" title={currentSnapshot?.gpuName}>
            {currentSnapshot?.gpuName || t('monitor.detecting')}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.gpuShare')}</span>
            <span className="font-mono font-semibold text-success">
              {currentSnapshot ? `${currentSnapshot.gpuUtilizationPct}%` : '0%'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, currentSnapshot?.gpuUtilizationPct || 0)}%`,
                backgroundColor: CHART_COLORS.gpu,
              }}
            />
          </div>
        </div>

        {/* 2. GPU VRAM Memory */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-tertiary" />
              <span>{t('monitor.vram')}</span>
              <KpiCardHelp
                i18n="vram"
                description={undefined}
                guide={undefined}
              />
            </span>
            <span className="text-[10px] font-mono text-tertiary font-semibold">{vramPercent}%</span>
          </div>
          <div className="text-base font-bold text-foreground">
            {currentSnapshot && currentSnapshot.gpuVramTotalMb > 0
              ? `${(currentSnapshot.gpuVramUsedMb / 1024).toFixed(1)} GB`
              : '0 GB'}
            <span className="text-[10px] font-normal text-muted-foreground ml-1">
              / {currentSnapshot ? (currentSnapshot.gpuVramTotalMb / 1024).toFixed(1) : 0} GB
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.freeMemory')}</span>
            <span className="font-mono text-[10px] text-success font-semibold">
              {currentSnapshot ? `${(currentSnapshot.gpuVramFreeMb / 1024).toFixed(1)} GB Free` : '—'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${vramPercent}%`,
                backgroundColor: CHART_COLORS.vram,
              }}
            />
          </div>
        </div>

        {/* 3. Prefill Speed & Duration */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-warning" />
              <span>{t('monitor.prefill')}</span>
              <KpiCardHelp
                i18n="prefill"
                description={undefined}
                guide={undefined}
              />
            </span>
            {Boolean(currentSnapshot?.prefillSpeed && currentSnapshot.prefillSpeed > 0) && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold animate-pulse">
                {t('monitor.prefilling')}
              </span>
            )}
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1">
            <span className="font-mono text-warning">
              {currentSnapshot?.prefillSpeed && currentSnapshot.prefillSpeed > 0
                ? `${currentSnapshot.prefillSpeed.toFixed(1)}`
                : '0.0'}
            </span>
            <span className="text-[10px] text-muted-foreground">token/s</span>
            {Boolean(!currentSnapshot?.prefillSpeed && lastCompleted?.prefillSpeed && lastCompleted.prefillSpeed > 0) && lastCompleted && (
              <span className="text-[10px] font-mono text-muted-foreground ml-auto" title={t('monitor.lastSpeedTitle')}>
                {t('monitor.lastSpeed', { v: lastCompleted.prefillSpeed?.toFixed(1) ?? '' })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.elapsed')}</span>
            <span className="font-mono text-[10px] text-foreground font-semibold">
              {currentSnapshot?.prefillDurationMs && currentSnapshot.prefillDurationMs > 0
                ? `${(currentSnapshot.prefillDurationMs / 1000).toFixed(2)}s (${currentSnapshot.prefillDurationMs}ms)`
                : lastCompleted?.prefillDurationMs
                ? t('monitor.lastTime', { v: (lastCompleted.prefillDurationMs / 1000).toFixed(2), ms: lastCompleted.prefillDurationMs })
                : '—'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {t('monitor.inputTokens')} {currentSnapshot?.prefillTokens && currentSnapshot.prefillTokens > 0
              ? `${currentSnapshot.prefillTokens.toLocaleString()} tokens`
              : lastCompleted?.prefillTokens
              ? t('monitor.recentTokens', { v: lastCompleted.prefillTokens.toLocaleString() })
              : '—'}
          </div>
        </div>

        {/* 4. Decoding Speed & Duration */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-primary" />
              <span>{t('monitor.decoding')}</span>
              <KpiCardHelp
                i18n="decode"
                description={undefined}
                guide={undefined}
              />
            </span>
            {Boolean(currentSnapshot?.decodingSpeed && currentSnapshot.decodingSpeed > 0) && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold animate-pulse">
                {t('monitor.generating')}
              </span>
            )}
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1">
            <span className="font-mono text-primary">
              {currentSnapshot?.decodingSpeed && currentSnapshot.decodingSpeed > 0
                ? `${currentSnapshot.decodingSpeed.toFixed(1)}`
                : '0.0'}
            </span>
            <span className="text-[10px] text-muted-foreground">token/s</span>
            {Boolean(!currentSnapshot?.decodingSpeed && lastCompleted?.decodingSpeed && lastCompleted.decodingSpeed > 0) && lastCompleted && (
              <span className="text-[10px] font-mono text-muted-foreground ml-auto" title={t('monitor.lastSpeedTitle')}>
                {t('monitor.lastSpeed', { v: lastCompleted.decodingSpeed?.toFixed(1) ?? '' })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.elapsed')}</span>
            <span className="font-mono text-[10px] text-foreground font-semibold">
              {currentSnapshot?.decodingDurationMs && currentSnapshot.decodingDurationMs > 0
                ? `${(currentSnapshot.decodingDurationMs / 1000).toFixed(2)}s (${currentSnapshot.decodingDurationMs}ms)`
                : lastCompleted?.decodingDurationMs
                ? t('monitor.lastTime', { v: (lastCompleted.decodingDurationMs / 1000).toFixed(2), ms: lastCompleted.decodingDurationMs })
                : '—'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {t('monitor.genTokens')} {currentSnapshot?.decodingTokens && currentSnapshot.decodingTokens > 0
              ? `${currentSnapshot.decodingTokens.toLocaleString()} tokens`
              : lastCompleted?.decodingTokens
              ? t('monitor.recentTokens', { v: lastCompleted.decodingTokens.toLocaleString() })
              : '—'}
          </div>
        </div>

        {/* 5. LLM Architecture & Parameters */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-info" />
              <span>{t('monitor.arch')}</span>
              <KpiCardHelp
                i18n="arch"
                description={undefined}
                guide={undefined}
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground capitalize truncate">
            {currentSnapshot?.llmArchitecture || t('monitor.detecting')}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.params')}</span>
            <span className="font-mono text-[10px] font-semibold text-info truncate">
              {currentSnapshot?.llmParameterSize || '—'} (
              {rawDetails.quantizationLevel ? String(rawDetails.quantizationLevel) : 'Q4_K'})
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {t('monitor.layers')} {rawDetails.blockCount ? `${rawDetails.blockCount} Layers` : '—'}
          </div>
        </div>

        {/* 6. Context Size & KV Cache */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-info" />
              <span>{t('monitor.ctxKv')}</span>
              <KpiCardHelp
                i18n="ctxkv"
                description={undefined}
                guide={undefined}
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1.5">
            <span className="font-mono text-info">
              {formatContextTokenSize(currentSnapshot?.contextSize)}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              / {formatContextTokenSize(currentSnapshot?.contextLimit)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              ({currentSnapshot?.contextSize.toLocaleString() || '0'} tokens)
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]" title={t('monitor.kvMaxTitle')}>
              {t('monitor.kvMax')}
            </span>
            <span className="font-mono text-[10px] text-info font-semibold" title={t('monitor.kvMaxTitle2')}>
              {currentSnapshot && currentSnapshot.kvCacheBytes > 0
                ? formatMemoryBytes(currentSnapshot.kvCacheBytes)
                : t('monitor.calculating')}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate" title={t('monitor.attnTitle')}>
            {t('monitor.attention')} {rawDetails.headCount ? `${rawDetails.headCount}H / ${rawDetails.headCountKv}KV` : '—'}
          </div>
        </div>

        {/* 7. CPU / GPU Workload Offloading */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-warning" />
              <span>{t('monitor.offload')}</span>
              <KpiCardHelp
                i18n="offload"
                description={undefined}
                guide={undefined}
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-center gap-1.5">
            <span>{currentSnapshot ? `${currentSnapshot.gpuOffloadPct}%` : '0%'}</span>
            <span className="text-[10px] font-medium text-warning truncate">
              {currentSnapshot && currentSnapshot.gpuOffloadPct >= 100
                ? t('monitor.fullGpu')
                : currentSnapshot && currentSnapshot.gpuOffloadPct > 0
                ? t('monitor.gpuCpu')
                : `${t('monitor.cpu')}/${t('monitor.standby')}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">{t('monitor.vramLoad')}</span>
            <span className="font-mono text-[10px] font-semibold text-success">
              {currentSnapshot && currentSnapshot.vramAllocatedBytes > 0
                ? `${(currentSnapshot.vramAllocatedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                : '0 GB'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-warning transition-all duration-300"
              style={{ width: `${currentSnapshot?.gpuOffloadPct || 0}%` }}
            />
          </div>
        </div>

        {/* 8. Current Operational State */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-success" />
              <span>{t('monitor.currentStatus')}</span>
              <KpiCardHelp
                i18n="agent"
                description={undefined}
                guide={undefined}
              />
            </span>
          </div>
          <div className="text-sm font-bold text-foreground truncate">
            {currentSnapshot?.agentStatus === 'idle'
              ? t('monitor.statusIdle')
              : currentSnapshot?.agentStatus === 'generating'
              ? t('monitor.statusRunning')
              : currentSnapshot?.agentStatus === 'executing_tool'
              ? t('monitor.statusTools')
              : t('monitor.statusWorking')}
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
            {currentSnapshot?.currentTask || t('monitor.noPending')}
          </p>
        </div>
      </div>

      {/* Real-time Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real-time GPU & VRAM Timeline Chart (2 cols) */}
        <div className="lg:col-span-2 p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" />
              <h3 className="text-xs font-semibold text-foreground">
                {t('monitor.realtimeGpu', { n: timeSeriesData.length })}
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.gpu }}
                />
                <span className="text-success font-medium">{t('monitor.gpuShareUnit')}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.vram }}
                />
                <span className="text-tertiary font-medium">{t('monitor.vramUsage')}</span>
              </span>
            </div>
          </div>

          <div className="w-full h-64">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                {t('monitor.noRealtime')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={[0, 100]}
                    stroke={CHART_COLORS.gpu}
                    tick={{ fontSize: 10 }}
                    unit="%"
                    width={38}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={CHART_COLORS.vram}
                    tick={{ fontSize: 10 }}
                    unit=" GB"
                    width={44}
                  />
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
                    yAxisId="left"
                    type="monotone"
                    dataKey="gpuUtilization"
                    name={t('monitor.gpuShare')}
                    stroke={CHART_COLORS.gpu}
                    fill={CHART_COLORS.gpu}
                    fillOpacity={0.2}
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="vramUsedGb"
                    name={t('monitor.vramUsageShort')}
                    stroke={CHART_COLORS.vram}
                    fill={CHART_COLORS.vram}
                    fillOpacity={0.18}
                    unit=" GB"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Memory Breakdown Composition Chart (1 col) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-tertiary" />
              <h3 className="text-xs font-semibold text-foreground">{t('monitor.vramDist')}</h3>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{t('monitor.unitGb')}</span>
          </div>

          <div className="w-full h-64">
            {memoryBreakdownData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                {t('monitor.aggregating')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memoryBreakdownData} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit=" GB" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey={t('monitor.weights')} stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} unit=" GB" isAnimationActive={false} />
                  <Bar dataKey={t('monitor.kvEst')} stackId="a" fill="hsl(var(--chart-5))" radius={[0, 0, 0, 0]} unit=" GB" isAnimationActive={false} />
                  <Bar dataKey={t('monitor.otherUsage')} stackId="a" fill="hsl(var(--chart-4))" radius={[0, 0, 0, 0]} unit=" GB" isAnimationActive={false} />
                  <Bar dataKey={t('monitor.freeSpace')} stackId="a" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} unit=" GB" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Architecture Spec Grid & Hardware Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Architecture Deep Specs */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-info" />
              <h3 className="text-xs font-semibold text-foreground">
                {t('monitor.archDetail')}
              </h3>
              <KpiCardHelp
                i18n="archDetail"
                description={undefined}
                guide={undefined}
              />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {currentSnapshot?.llmModel}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.archKindShort')}</span>
                <KpiCardHelp
                  i18n="archKind"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground uppercase mt-0.5 truncate">
                {currentSnapshot?.llmArchitecture || '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.blockCount')}</span>
                <KpiCardHelp
                  i18n="blocks"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.blockCount ? t('monitor.blockUnit', { n: String(rawDetails.blockCount) }) : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.embedDim')}</span>
                <KpiCardHelp
                  i18n="embed"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.embeddingLength ? `${rawDetails.embeddingLength}` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.heads')}</span>
                <KpiCardHelp
                  i18n="heads"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.headCount ? `${rawDetails.headCount} Heads` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.kvHeads')}</span>
                <KpiCardHelp
                  i18n="kvheads"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.headCountKv ? `${rawDetails.headCountKv} KV Heads` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                <span>{t('monitor.ffnDim')}</span>
                <KpiCardHelp
                  i18n="ffn"
                  description={undefined}
                  guide={undefined}
                />
              </div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.feedForwardLength ? `${rawDetails.feedForwardLength}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* System & Offloading Status */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" />
              <h3 className="text-xs font-semibold text-foreground">
                {t('monitor.sysResources')}
              </h3>
              <KpiCardHelp
                i18n="sysres"
                description={undefined}
                guide={undefined}
              />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {currentSnapshot?.gpuName}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* GPU Offload Ratio Bar */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground flex items-center gap-1">
                  <span>{t('monitor.offloadRatio')}</span>
                  <KpiCardHelp
                    i18n="offloadRatio"
                    description={undefined}
                    guide={undefined}
                  />
                </span>
                <span className="font-mono font-bold text-warning">
                  {currentSnapshot ? `${currentSnapshot.gpuOffloadPct}%` : '0%'}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-warning"
                  style={{ width: `${currentSnapshot?.gpuOffloadPct || 0}%` }}
                  title={t('monitor.gpuOffload')}
                />
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.max(0, 100 - (currentSnapshot?.gpuOffloadPct || 0))}%` }}
                  title={t('monitor.cpuCompute')}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>{t('monitor.gpuAccel', { v: currentSnapshot?.gpuOffloadPct || 0 })}</span>
                <span>{t('monitor.cpuShare', { v: Math.max(0, 100 - (currentSnapshot?.gpuOffloadPct || 0)) })}</span>
              </div>
            </div>

            {/* GPU VRAM Status (corresponding to GPU offload acceleration) */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between font-mono">
              <span className="text-[11px] text-muted-foreground font-sans flex items-center gap-1">
                <span>{t('monitor.vramState')}</span>
                <KpiCardHelp
                  i18n="vramState"
                  description={undefined}
                  guide={undefined}
                />
              </span>
              <div className="flex items-center gap-2">
                {rawDetails.isModelLoadedInMemory ? (
                  <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>
                      {currentSnapshot && currentSnapshot.vramAllocatedBytes > 0
                        ? t('monitor.gbLoaded', { v: (currentSnapshot.vramAllocatedBytes / (1024 * 1024 * 1024)).toFixed(1) })
                        : t('monitor.enabled')}
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{t('monitor.standbyState')}</span>
                  </span>
                )}
                <span className="font-semibold text-foreground">
                  {currentSnapshot && currentSnapshot.gpuVramTotalMb > 0
                    ? t('monitor.gbFree', {
                        total: (currentSnapshot.gpuVramTotalMb / 1024).toFixed(1),
                        free: (currentSnapshot.gpuVramFreeMb / 1024).toFixed(1),
                      })
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Host System RAM (corresponding to CPU offload distribution) */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between font-mono">
              <span className="text-[11px] text-muted-foreground font-sans flex items-center gap-1">
                <span>{t('monitor.hostRam')}</span>
                <KpiCardHelp
                  i18n="hostram"
                  description={undefined}
                  guide={undefined}
                />
              </span>
              <span className="font-semibold text-foreground">
                {currentSnapshot && currentSnapshot.systemMemoryTotalMb > 0
                  ? t('monitor.gbFree', {
                      total: (currentSnapshot.systemMemoryTotalMb / 1024).toFixed(1),
                      free: (currentSnapshot.systemMemoryFreeMb / 1024).toFixed(1),
                    })
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Inference Performance Charts (Prefill & Decoding) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Generation Speed Chart (Prefill & Decoding Speed) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-warning" />
              <h3 className="text-xs font-semibold text-foreground">
                {t('monitor.tokenSpeed')}
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.prefill }}
                />
                <span className="text-warning font-medium">{t('monitor.leftPrefill')}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.decoding }}
                />
                <span className="text-primary font-medium">{t('monitor.rightDecode')}</span>
              </span>
            </div>
          </div>

          <div className="w-full h-60">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                {t('monitor.noSpeed')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={[0, prefillSpeedMax]}
                    stroke={CHART_COLORS.prefill}
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatAxisNumber}
                    unit=" t/s"
                    width={44}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, decodingSpeedMax]}
                    stroke={CHART_COLORS.decoding}
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatAxisNumber}
                    unit=" t/s"
                    width={42}
                  />
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
                    yAxisId="left"
                    type="monotone"
                    dataKey="prefillSpeed"
                    name={t('monitor.prefillSpeed')}
                    stroke={CHART_COLORS.prefill}
                    strokeWidth={2}
                    fill={CHART_COLORS.prefill}
                    fillOpacity={0.15}
                    dot={{ r: 3, fill: CHART_COLORS.prefill, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    unit=" token/s"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="decodingSpeed"
                    name={t('monitor.decodeSpeed')}
                    stroke={CHART_COLORS.decoding}
                    strokeWidth={2.5}
                    fill={CHART_COLORS.decoding}
                    fillOpacity={0.25}
                    dot={{ r: 3.5, fill: CHART_COLORS.decoding, strokeWidth: 0 }}
                    activeDot={{ r: 5.5 }}
                    unit=" token/s"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Inference Latency / Duration Chart (Prefill & Decoding Duration) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">
                {t('monitor.latencyTrend')}
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.prefill }}
                />
                <span className="text-warning font-medium">{t('monitor.leftPrefillMs')}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.decoding }}
                />
                <span className="text-primary font-medium">{t('monitor.rightDecodeMs')}</span>
              </span>
            </div>
          </div>

          <div className="w-full h-60">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                {t('monitor.noLatency')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={[0, prefillDurationMax]}
                    stroke={CHART_COLORS.prefill}
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatAxisNumber}
                    unit=" ms"
                    width={44}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, decodingDurationMax]}
                    stroke={CHART_COLORS.decoding}
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatAxisNumber}
                    unit=" ms"
                    width={44}
                  />
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
                    yAxisId="left"
                    type="monotone"
                    dataKey="prefillDurationMs"
                    name={t('monitor.prefillTime')}
                    stroke={CHART_COLORS.prefill}
                    strokeWidth={2}
                    fill={CHART_COLORS.prefill}
                    fillOpacity={0.15}
                    dot={{ r: 3, fill: CHART_COLORS.prefill, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    unit=" ms"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="decodingDurationMs"
                    name={t('monitor.decodeTime')}
                    stroke={CHART_COLORS.decoding}
                    strokeWidth={2.5}
                    fill={CHART_COLORS.decoding}
                    fillOpacity={0.25}
                    dot={{ r: 3.5, fill: CHART_COLORS.decoding, strokeWidth: 0 }}
                    activeDot={{ r: 5.5 }}
                    unit=" ms"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent Collected Snapshots History Table (For AI Agent Analysis) */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">
              {t('monitor.snapshots', { n: snapshots.length })}
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {t('monitor.snapshotNote')}
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t('monitor.noSnapshots')}
          </div>
        ) : (
          <>
            {/* Timeline Slider Widget */}
            {(() => {
              const TIMELINE_WINDOW_SIZE = 25;
              const maxOffset = Math.max(0, snapshots.length - TIMELINE_WINDOW_SIZE);
              const currentOffset = Math.min(timelineOffset, maxOffset);
              const visibleSnapshots = snapshots.slice(
                currentOffset,
                currentOffset + TIMELINE_WINDOW_SIZE,
              );

              return (
                <>
                  {snapshots.length > TIMELINE_WINDOW_SIZE && (
                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-2 select-none">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{t('monitor.slider')}</span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {t('monitor.showing')} {currentOffset + 1} ~{' '}
                            {t('monitor.rangeN', { n: Math.min(currentOffset + TIMELINE_WINDOW_SIZE, snapshots.length) })}
                            {t('monitor.ofTotal', { n: snapshots.length })}
                          </span>
                          {visibleSnapshots.length > 0 && (
                            <span className="text-[10px] text-primary/90 bg-primary/10 px-2 py-0.5 rounded font-mono border border-primary/20">
                              {new Date(
                                visibleSnapshots[visibleSnapshots.length - 1].timestamp,
                              ).toLocaleTimeString()}{' '}
                              ~ {new Date(visibleSnapshots[0].timestamp).toLocaleTimeString()}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTimelineOffset(0)}
                            disabled={currentOffset === 0}
                            className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                            title={t('monitor.goLatest')}
                          >
                            <ChevronsLeft className="h-3 w-3" />
                            <span>{t('monitor.latest')}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTimelineOffset((prev) => Math.max(0, prev - 10))}
                            disabled={currentOffset === 0}
                            className="h-6 px-2 text-[10px] gap-0.5 cursor-pointer"
                            title={t('monitor.forward10')}
                          >
                            <ChevronLeft className="h-3 w-3" />
                            <span>-10</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setTimelineOffset((prev) => Math.min(maxOffset, prev + 10))
                            }
                            disabled={currentOffset >= maxOffset}
                            className="h-6 px-2 text-[10px] gap-0.5 cursor-pointer"
                            title={t('monitor.back10')}
                          >
                            <span>+10</span>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTimelineOffset(maxOffset)}
                            disabled={currentOffset >= maxOffset}
                            className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                            title={t('monitor.goOldest')}
                          >
                            <span>{t('monitor.oldestEnd')}</span>
                            <ChevronsRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Slider Input */}
                      <div className="flex items-center gap-2.5 pt-0.5">
                        <span className="text-[10px] font-mono text-success font-semibold shrink-0">
                          {t('monitor.rangeNewest')}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={maxOffset}
                          step={1}
                          value={currentOffset}
                          onChange={(e) => setTimelineOffset(Number(e.target.value))}
                          className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {t('monitor.rangeOldest', { n: snapshots.length })}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto border border-border/60 rounded-lg max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="bg-muted/40 border-b border-border/80 text-[11px] text-muted-foreground font-sans">
                          <th className="p-2.5">{t('monitor.time')}</th>
                          <th className="p-2.5">{t('monitor.gpuShare')}</th>
                          <th className="p-2.5">{t('monitor.vramUsageShort')}</th>
                          <th className="p-2.5">{t('monitor.prefill')}</th>
                          <th className="p-2.5">{t('monitor.decoding')}</th>
                          <th className="p-2.5">{t('monitor.kvEst')}</th>
                          <th className="p-2.5">{t('monitor.offload')}</th>
                          <th className="p-2.5">{t('monitor.currentStatus')}</th>
                          <th className="p-2.5">{t('monitor.currentTask')}</th>
                          <th className="p-2.5 text-right">{t('monitor.detail')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSnapshots.map((snap, idx) => {
                          const globalIdx = currentOffset + idx + 1;
                          return (
                            <tr
                              key={snap.id}
                              className="border-b border-border/40 hover:bg-muted/20"
                            >
                              <td className="p-2.5 text-muted-foreground text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1 py-0.2 rounded bg-muted/60 text-[9px] font-mono text-muted-foreground/80 border border-border/40">
                                    #{globalIdx}
                                  </span>
                                  <span>{new Date(snap.timestamp).toLocaleTimeString()}</span>
                                </div>
                              </td>
                      <td className="p-2.5 font-semibold text-success">
                        {snap.gpuUtilizationPct}%
                      </td>
                      <td className="p-2.5 font-medium text-tertiary">
                        {snap.gpuVramUsedMb.toLocaleString()} MB
                      </td>
                      <td className="p-2.5 text-warning">
                        {snap.prefillSpeed !== undefined && snap.prefillSpeed > 0
                          ? `${snap.prefillSpeed.toFixed(1)} t/s (${snap.prefillDurationMs ?? 0}ms)`
                          : '—'}
                      </td>
                      <td className="p-2.5 text-primary">
                        {snap.decodingSpeed !== undefined && snap.decodingSpeed > 0
                          ? `${snap.decodingSpeed.toFixed(1)} t/s (${snap.decodingDurationMs ?? 0}ms)`
                          : '—'}
                      </td>
                      <td className="p-2.5 text-info font-medium">
                        {snap.kvCacheBytes > 0
                          ? formatMemoryBytes(snap.kvCacheBytes)
                          : '—'}
                      </td>
                      <td className="p-2.5 text-warning font-medium">
                        {snap.gpuOffloadPct}%
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-medium ${
                            snap.agentStatus === 'generating'
                              ? 'bg-success/15 text-success'
                              : snap.agentStatus === 'executing_tool'
                              ? 'bg-warning/15 text-warning'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {snap.agentStatus}
                        </span>
                      </td>
                      <td className="p-2.5 font-sans text-muted-foreground truncate max-w-xs" title={snap.currentTask}>
                        {snap.currentTask || t('monitor.waiting')}
                      </td>
                      <td className="p-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSnapshot(snap)}
                          className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>{t('monitor.jsonView')}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      );
    })()}
  </>
)}
</div>

      {/* Snapshot JSON Detail Dialog for AI Analysis */}
      <Dialog open={!!selectedSnapshot} onOpenChange={(open) => !open && setSelectedSnapshot(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between pr-6">
              <span>{t('monitor.snapshotJson')}</span>
              {selectedSnapshot && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopyJson(JSON.stringify(selectedSnapshot, null, 2), selectedSnapshot.id)
                  }
                  className="h-7 text-xs gap-1 cursor-pointer"
                >
                  {copiedId === selectedSnapshot.id ? (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      <span>{t('monitor.copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>{t('monitor.copyJson')}</span>
                    </>
                  )}
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('monitor.snapshotMeta', { time: String(selectedSnapshot?.timestamp ?? ''), name: agent.name, n: agent.model })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 rounded-lg bg-code border border-border/80 font-mono text-xs text-code-foreground max-h-96 select-text whitespace-pre-wrap">
            {selectedSnapshot ? JSON.stringify(selectedSnapshot, null, 2) : ''}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedSnapshot(null)}
              className="text-xs"
            >
              {t('monitor.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t('monitor.clearData')}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
              {t('monitor.clearConfirm', { name: agent.name })}
              <span className="block mt-1 text-destructive">
                {t('monitor.clearWarn')}
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setClearConfirmOpen(false)}
              className="text-xs"
            >
              {t('monitor.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClearHistory}
              className="text-xs"
            >
              {t('monitor.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ollama Connection Error Dialog */}
      <Dialog open={ollamaErrorDialogOpen} onOpenChange={setOllamaErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <DialogTitle className="text-sm font-semibold text-foreground">
                {t('monitor.connFailTitle')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
              {t('monitor.connFailBody')}
              <br />
              {t('monitor.connFailHint')}
              <span className="block mt-2 font-mono text-[11px] p-2 bg-destructive/10 text-destructive rounded border border-destructive/20 break-all">
                URL: {settings.ollamaBaseUrl}
                {ollamaErrorMessage ? `\n${t('monitor.errorPrefix', { msg: ollamaErrorMessage })}` : ''}
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setOllamaErrorDialogOpen(false)}
              className="text-xs cursor-pointer"
            >
              {t('monitor.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
