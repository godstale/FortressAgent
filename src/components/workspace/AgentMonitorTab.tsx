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

const CHART_COLORS = {
  gpu: '#10b981', // 선명한 에메랄드 녹색 (GPU 점유율)
  vram: '#8b5cf6', // 뚜렷이 대비되는 바이올렛 보라색 (VRAM 메모리)
  prefill: '#f59e0b', // 앰버 황색 (Prefill 속도 및 시간)
  decoding: '#06b6d4', // 시안 청록색 (디코딩 속도 및 시간)
} as const;

const INTERVAL_OPTIONS = [
  { label: '1초 간격', value: 1000 },
  { label: '3초 간격', value: 3000 },
  { label: '5초 간격', value: 5000 },
  { label: '10초 간격', value: 10000 },
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

interface KpiCardHelpProps {
  title: string;
  description: string;
  guide?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function KpiCardHelp({ title, description, guide, side = 'top' }: KpiCardHelpProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <UiTooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary inline-flex items-center justify-center cursor-help"
            aria-label={`${title} 상세 도움말`}
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
            <span>{title}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-normal">
            {description}
          </p>
          {guide && (
            <div className="text-[10px] bg-accent/40 rounded p-2 font-sans text-accent-foreground border border-border/40 space-y-1">
              <span className="font-semibold text-foreground block">💡 보는 법 & 지표 해석:</span>
              <span className="leading-normal block whitespace-normal text-muted-foreground">{guide}</span>
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
  const [isCollecting, setIsCollecting] = useState(true);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [selectedSnapshot, setSelectedSnapshot] = useState<AgentMonitoringSnapshot | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [timelineOffset, setTimelineOffset] = useState(0);

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
    };
  }, [agent, settings.ollamaBaseUrl, isCollecting, intervalMs, workspaceRoot]);

  const handleToggleCollecting = () => {
    if (!agent) return;
    if (isCollecting) {
      monitoringCollector.stop(agent.id);
      setIsCollecting(false);
    } else {
      monitoringCollector.start(agent, settings.ollamaBaseUrl, intervalMs, workspaceRoot);
      setIsCollecting(true);
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
      const snap = await monitoringCollector.collectNow(agent, settings.ollamaBaseUrl, workspaceRoot);
      if (snap) {
        setCurrentSnapshot(snap);
        setSnapshots((prev) => [snap, ...prev.filter((s) => s.id !== snap.id)].slice(0, 60));
      }
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

  // Memory breakdown bar data
  const memoryBreakdownData = useMemo(() => {
    if (!currentSnapshot) return [];
    const modelWeightMb = Math.round(currentSnapshot.modelWeightBytes / (1024 * 1024));
    const kvCacheMb = Math.round(currentSnapshot.kvCacheBytes / (1024 * 1024));
    const freeVramMb = Math.max(0, currentSnapshot.gpuVramFreeMb);
    const otherVramMb = Math.max(0, currentSnapshot.gpuVramUsedMb - modelWeightMb);

    return [
      {
        name: 'VRAM 메모리 분배',
        '모델 가중치(Weights)': modelWeightMb,
        'KV 캐시(추정)': kvCacheMb,
        '기타 사용량': otherVramMb,
        '여유 공간(Free)': freeVramMb,
      },
    ];
  }, [currentSnapshot]);

  if (!agentId || !agent) {
    return (
      <div className="flex-1 p-8 text-center text-muted-foreground text-xs">
        에이전트 정보를 찾을 수 없습니다.
      </div>
    );
  }

  const vramPercent =
    currentSnapshot && currentSnapshot.gpuVramTotalMb > 0
      ? Math.round((currentSnapshot.gpuVramUsedMb / currentSnapshot.gpuVramTotalMb) * 100)
      : 0;

  const rawDetails = (currentSnapshot?.details || {}) as Record<string, unknown>;

  const getStatusBadge = (status: AgentMonitoringSnapshot['agentStatus']) => {
    switch (status) {
      case 'generating':
        return {
          label: 'LLM 추론/답변 생성 중',
          className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse',
        };
      case 'executing_tool':
        return {
          label: '도구(Tool) 실행 중',
          className: 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse',
        };
      case 'waiting_approval':
        return {
          label: '사용자 승인 대기',
          className: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        };
      case 'idle':
      default:
        return {
          label: '대기 중 (유휴 상태)',
          className: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40',
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
                  {agent.name} 실시간 리소스 모니터링
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${statusBadge.className}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {statusBadge.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                모델: <span className="font-mono text-foreground font-medium">{agent.model}</span> |
                컨텍스트:{' '}
                <span className="font-mono text-foreground font-medium">
                  {agent.contextSize > 0 ? `${agent.contextSize.toLocaleString()}` : '8192'} ctx
                </span>{' '}
                | 현재 작업:{' '}
                <span className="text-foreground/90 font-medium truncate max-w-sm inline-block align-bottom">
                  {currentSnapshot?.currentTask || '대기 중'}
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
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start/Pause Toggle */}
          <Button
            variant={isCollecting ? 'secondary' : 'default'}
            size="sm"
            onClick={handleToggleCollecting}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            {isCollecting ? (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>수집 일시정지</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <span>수집 재개</span>
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
            title="즉시 최신 데이터 수집"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${manualRefreshing ? 'animate-spin' : ''}`} />
            <span>즉시 측정</span>
          </Button>

          {/* Export JSON for AI Agents */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={snapshots.length === 0}
            className="h-8 text-xs gap-1.5 cursor-pointer"
            title="추후 AI Agent 분석용 JSON 전체 데이터 다운로드"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>분석용 JSON</span>
          </Button>

          {/* Clear history */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearConfirmOpen(true)}
            disabled={snapshots.length === 0}
            className="h-8 text-xs gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
            title="수집된 모니터링 기록 비우기"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>비우기</span>
          </Button>
        </div>
      </div>

      {/* 8 Key Operational & Performance KPI Cards (max 4 per row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. GPU Model & Utilization */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
              <span>GPU 사용률</span>
              <KpiCardHelp
                title="GPU 사용률 & 칩셋 온도"
                description="그래픽 카드의 연산 코어(SM) 점유율과 칩셋 온도입니다. AI 모델이 프롬프트를 평가(Prefill)하거나 답변을 생성(Decoding)할 때 GPU 연산 부하를 나타냅니다."
                guide="추론 중 80~100%로 상승하고 대기 중 0~5%가 정상입니다. 85°C 이상 지속 시 쿨링 점검이 권장됩니다."
              />
            </span>
            {currentSnapshot && currentSnapshot.gpuTemperatureC > 0 && (
              <span className="flex items-center text-[10px] text-amber-400">
                <Thermometer className="h-3 w-3 mr-0.5" />
                {currentSnapshot.gpuTemperatureC}°C
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-foreground truncate" title={currentSnapshot?.gpuName}>
            {currentSnapshot?.gpuName || '감지 중...'}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">GPU 점유율</span>
            <span className="font-mono font-semibold text-emerald-400">
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
              <Cpu className="h-3.5 w-3.5 text-violet-400" />
              <span>VRAM 메모리</span>
              <KpiCardHelp
                title="VRAM (비디오 메모리) 사용량"
                description="GPU 전용 비디오 메모리(VRAM)의 총 용량 대비 현재 할당된 메모리 및 잔여 여유 공간입니다. LLM 모델 가중치와 KV 캐시가 이 메모리에 적재됩니다."
                guide="가중치 + KV 캐시가 전용 VRAM 안에 100% 들어갈 때 최고 속도가 나옵니다. 여유 메모리가 고갈되면 시스템 RAM으로 스왑되어 속도가 급감합니다."
              />
            </span>
            <span className="text-[10px] font-mono text-violet-400 font-semibold">{vramPercent}%</span>
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
            <span className="text-muted-foreground text-[10px]">여유 메모리</span>
            <span className="font-mono text-[10px] text-emerald-400 font-semibold">
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
              <Gauge className="h-3.5 w-3.5 text-amber-400" />
              <span>Prefill 속도 / 시간</span>
              <KpiCardHelp
                title="Prefill (입력 평가) 속도 & 소요 시간"
                description="사용자의 질문, 시스템 프롬프트, 도구 실행 결과 등 입력 토큰들을 모델이 처음에 한꺼번에 읽고 병렬 연산하는 속도(token/s)와 소요 시간입니다."
                guide="GPU 병렬 연산으로 처리되어 디코딩보다 5~10배 빠릅니다(150~400+ token/s). 입력 문서나 대화 기록이 길어질수록 소요 시간이 비례하여 증가합니다."
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1">
            <span className="font-mono text-amber-400">
              {currentSnapshot?.prefillSpeed ? `${currentSnapshot.prefillSpeed.toFixed(1)}` : '0.0'}
            </span>
            <span className="text-[10px] text-muted-foreground">token/s</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">소요 시간</span>
            <span className="font-mono text-[10px] text-foreground font-semibold">
              {currentSnapshot?.prefillDurationMs
                ? `${(currentSnapshot.prefillDurationMs / 1000).toFixed(2)}s (${currentSnapshot.prefillDurationMs}ms)`
                : '—'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            입력 토큰: {currentSnapshot?.prefillTokens ? `${currentSnapshot.prefillTokens.toLocaleString()} tokens` : '—'}
          </div>
        </div>

        {/* 4. Decoding Speed & Duration */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-cyan-400" />
              <span>디코딩 속도 / 시간</span>
              <KpiCardHelp
                title="디코딩 (답변 생성) 속도 & 소요 시간"
                description="모델이 답변 텍스트를 한 토큰씩 순차적으로 출력하는 속도(token/s)와 소요 시간입니다. 사용자가 체감하는 실시간 AI 타자 속도입니다."
                guide="VRAM 메모리 대역폭의 영향을 직접 받습니다. RTX 4070 SUPER 기준 8B 모델은 35~50+ token/s가 정상 최적 성능입니다."
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1">
            <span className="font-mono text-cyan-400">
              {currentSnapshot?.decodingSpeed ? `${currentSnapshot.decodingSpeed.toFixed(1)}` : '0.0'}
            </span>
            <span className="text-[10px] text-muted-foreground">token/s</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">소요 시간</span>
            <span className="font-mono text-[10px] text-foreground font-semibold">
              {currentSnapshot?.decodingDurationMs
                ? `${(currentSnapshot.decodingDurationMs / 1000).toFixed(2)}s (${currentSnapshot.decodingDurationMs}ms)`
                : '—'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            생성 토큰: {currentSnapshot?.decodingTokens ? `${currentSnapshot.decodingTokens.toLocaleString()} tokens` : '—'}
          </div>
        </div>

        {/* 5. LLM Architecture & Parameters */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-purple-400" />
              <span>LLM 아키텍처</span>
              <KpiCardHelp
                title="LLM 신경망 구조 & 파라미터"
                description="실행 중인 모델의 신경망 패밀리(Qwen, Llama 등), 총 파라미터 수(8B, 14B), 양자화 포맷(Q4_K_M 등) 및 트랜스포머 블록(레이어) 수입니다."
                guide="Q4_K 양자화는 FP16 대비 품질 저하는 거의 없으면서 VRAM을 약 50% 절약하여 12GB 환경에서 64k 컨텍스트 운용을 가능하게 합니다."
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground capitalize truncate">
            {currentSnapshot?.llmArchitecture || '감지 중...'}
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">파라미터</span>
            <span className="font-mono text-[10px] font-semibold text-purple-300 truncate">
              {currentSnapshot?.llmParameterSize || '—'} (
              {rawDetails.quantizationLevel ? String(rawDetails.quantizationLevel) : 'Q4_K'})
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            레이어: {rawDetails.blockCount ? `${rawDetails.blockCount} Layers` : '—'}
          </div>
        </div>

        {/* 6. Context Size & KV Cache */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>컨텍스트 & KV</span>
              <KpiCardHelp
                title="컨텍스트 크기 & KV 캐시 메모리"
                description="현재 대화 세션의 토큰 사용량과 최대 한도(예: 8k / 64k), 그리고 모델이 과거 대화 문맥을 기억하기 위해 VRAM에 동적으로 할당하는 어텐션 KV 캐시 크기입니다."
                guide="표시되는 'KV 캐시 (최대)'는 설정된 최대 컨텍스트(64k) 도달 시 필요한 VRAM 용량(약 7.6GB)입니다. 16H/16KV는 Query와 Key-Value 헤드 수가 동일한 MHA 구조를 의미합니다. 12GB 그래픽카드에서는 32k(약 3.8GB) 설정 시 VRAM 초과 없이 가장 안전하게 동작합니다."
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-baseline gap-1.5">
            <span className="font-mono text-sky-400">
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
            <span className="text-muted-foreground text-[10px]" title="설정된 최대 컨텍스트(64k) 전체 소모 시 필요한 예상 KV 캐시 크기">
              KV 캐시 (최대)
            </span>
            <span className="font-mono text-[10px] text-sky-400 font-semibold" title="최대 컨텍스트 도달 시 필요한 VRAM 메모리">
              {currentSnapshot && currentSnapshot.kvCacheBytes > 0
                ? formatMemoryBytes(currentSnapshot.kvCacheBytes)
                : '계산 중...'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate" title="어텐션 헤드: 16 Query Heads / 16 Key-Value Heads (MHA 구조)">
            어텐션: {rawDetails.headCount ? `${rawDetails.headCount}H / ${rawDetails.headCountKv}KV` : '—'}
          </div>
        </div>

        {/* 7. CPU / GPU Workload Offloading */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>GPU 오프로딩</span>
              <KpiCardHelp
                title="GPU 가중치 오프로딩 비율"
                description="모델 가중치 레이어 중 몇 퍼센트가 GPU VRAM에 로드되어 하드웨어 가속되는지 나타냅니다."
                guide="100% (Full GPU)일 때 최고의 속도를 냅니다. VRAM 부족으로 레이어 일부가 시스템 RAM(CPU)으로 밀려나면(GPU+CPU) 병목 현상으로 디코딩 속도가 5~10 token/s 이하로 크게 떨어집니다."
              />
            </span>
          </div>
          <div className="text-base font-bold text-foreground flex items-center gap-1.5">
            <span>{currentSnapshot ? `${currentSnapshot.gpuOffloadPct}%` : '0%'}</span>
            <span className="text-[10px] font-medium text-amber-400 truncate">
              {currentSnapshot && currentSnapshot.gpuOffloadPct >= 100
                ? 'Full GPU'
                : currentSnapshot && currentSnapshot.gpuOffloadPct > 0
                ? 'GPU+CPU'
                : 'CPU/대기'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">VRAM 로드</span>
            <span className="font-mono text-[10px] font-semibold text-emerald-400">
              {currentSnapshot && currentSnapshot.vramAllocatedBytes > 0
                ? `${(currentSnapshot.vramAllocatedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                : '0 GB'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${currentSnapshot?.gpuOffloadPct || 0}%` }}
            />
          </div>
        </div>

        {/* 8. Current Operational State */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
              <span>현재 작업 상태</span>
              <KpiCardHelp
                title="에이전트 실시간 동작 상태"
                description="Fortress AI 에이전트의 현재 동작 주기(유휴 IDLE, 토큰 생성 GENERATING, 도구 실행 EXECUTING_TOOL, 승인 대기 WAITING_APPROVAL)와 진행 중인 작업 내용입니다."
                guide="에이전트 루프가 '생각(Thinking) -> 도구 호출(Tool) -> 답변 생성' 과정을 정상적으로 밟고 있는지 실시간으로 모니터링할 수 있습니다."
              />
            </span>
          </div>
          <div className="text-sm font-bold text-foreground truncate">
            {currentSnapshot?.agentStatus === 'idle'
              ? '유휴 (IDLE)'
              : currentSnapshot?.agentStatus === 'generating'
              ? '생성 중 (RUNNING)'
              : currentSnapshot?.agentStatus === 'executing_tool'
              ? '도구 실행 중'
              : '작업 중'}
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
            {currentSnapshot?.currentTask || '대기 중인 요청이 없습니다.'}
          </p>
        </div>
      </div>

      {/* Real-time Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real-time GPU & VRAM Timeline Chart (2 cols) */}
        <div className="lg:col-span-2 p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-foreground">
                실시간 GPU 사용률 & VRAM 추이 ({timeSeriesData.length}개 표본)
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.gpu }}
                />
                <span className="text-emerald-400 font-medium">GPU 점유율 (%)</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.vram }}
                />
                <span className="text-violet-400 font-medium">VRAM 사용량 (MB)</span>
              </span>
            </div>
          </div>

          <div className="w-full h-64">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                수집된 실시간 데이터가 없습니다. 상단의 수집 시작 버튼을 확인해주세요.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    domain={[0, 100]}
                    stroke={CHART_COLORS.gpu}
                    tick={{ fontSize: 10 }}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={CHART_COLORS.vram}
                    tick={{ fontSize: 10 }}
                    unit="MB"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="gpuUtilization"
                    name="GPU 점유율"
                    stroke={CHART_COLORS.gpu}
                    fill={CHART_COLORS.gpu}
                    fillOpacity={0.2}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="vramUsedMb"
                    name="VRAM 사용량"
                    stroke={CHART_COLORS.vram}
                    fill={CHART_COLORS.vram}
                    fillOpacity={0.18}
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
              <Cpu className="h-4 w-4 text-violet-400" />
              <h3 className="text-xs font-semibold text-foreground">VRAM 메모리 분배 상세</h3>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">단위: MB</span>
          </div>

          <div className="w-full h-64">
            {memoryBreakdownData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                데이터 집계 중...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memoryBreakdownData} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="MB" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="모델 가중치(Weights)" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="KV 캐시(추정)" stackId="a" fill="#38bdf8" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="기타 사용량" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="여유 공간(Free)" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Inference Performance Charts (Prefill & Decoding) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Generation Speed Chart (Prefill & Decoding Speed) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-foreground">
                실시간 토큰 생성 속도 추이 (Prefill vs 디코딩 Speed)
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.prefill }}
                />
                <span className="text-amber-400 font-medium">Prefill 속도 (t/s)</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.decoding }}
                />
                <span className="text-cyan-400 font-medium">디코딩 속도 (t/s)</span>
              </span>
            </div>
          </div>

          <div className="w-full h-60">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                수집된 추론 속도 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit=" t/s" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="prefillSpeed"
                    name="Prefill 속도"
                    stroke={CHART_COLORS.prefill}
                    fill={CHART_COLORS.prefill}
                    fillOpacity={0.2}
                    unit=" token/s"
                  />
                  <Area
                    type="monotone"
                    dataKey="decodingSpeed"
                    name="디코딩 속도"
                    stroke={CHART_COLORS.decoding}
                    fill={CHART_COLORS.decoding}
                    fillOpacity={0.2}
                    unit=" token/s"
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
              <Timer className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-semibold text-foreground">
                실시간 추론 소요 시간 추이 (Prefill & 디코딩 Latency)
              </h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.prefill }}
                />
                <span className="text-amber-400 font-medium">Prefill 시간 (ms)</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: CHART_COLORS.decoding }}
                />
                <span className="text-cyan-400 font-medium">디코딩 시간 (ms)</span>
              </span>
            </div>
          </div>

          <div className="w-full h-60">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                수집된 추론 소요 시간 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit=" ms" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="prefillDurationMs"
                    name="Prefill 소요 시간"
                    stroke={CHART_COLORS.prefill}
                    fill={CHART_COLORS.prefill}
                    fillOpacity={0.2}
                    unit=" ms"
                  />
                  <Area
                    type="monotone"
                    dataKey="decodingDurationMs"
                    name="디코딩 소요 시간"
                    stroke={CHART_COLORS.decoding}
                    fill={CHART_COLORS.decoding}
                    fillOpacity={0.2}
                    unit=" ms"
                  />
                </AreaChart>
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
              <Server className="h-4 w-4 text-purple-400" />
              <h3 className="text-xs font-semibold text-foreground">
                LLM 모델 아키텍처 상세 사양
              </h3>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {currentSnapshot?.llmModel}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">아키텍처 종류</div>
              <div className="font-bold text-foreground uppercase mt-0.5">
                {currentSnapshot?.llmArchitecture || '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">블록/레이어 수</div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.blockCount ? `${rawDetails.blockCount}개` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">임베딩 차원 (Dim)</div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.embeddingLength ? `${rawDetails.embeddingLength}` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">어텐션 헤드 수</div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.headCount ? `${rawDetails.headCount} Heads` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">KV 어텐션 헤드 수</div>
              <div className="font-bold text-foreground mt-0.5">
                {rawDetails.headCountKv ? `${rawDetails.headCountKv} KV Heads` : '—'}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground font-sans">FFN 확장 차원</div>
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
              <Zap className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-foreground">
                시스템 자원 및 CPU/GPU 오프로딩 상태
              </h3>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {currentSnapshot?.gpuName}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* GPU Offload Ratio Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">GPU 레이어 오프로딩 비율</span>
                <span className="font-mono font-bold text-amber-400">
                  {currentSnapshot ? `${currentSnapshot.gpuOffloadPct}%` : '0%'}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${currentSnapshot?.gpuOffloadPct || 0}%` }}
                  title="GPU 오프로드"
                />
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.max(0, 100 - (currentSnapshot?.gpuOffloadPct || 0))}%` }}
                  title="CPU 연산"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>GPU 가속: {currentSnapshot?.gpuOffloadPct || 0}%</span>
                <span>CPU 분배: {Math.max(0, 100 - (currentSnapshot?.gpuOffloadPct || 0))}%</span>
              </div>
            </div>

            {/* System RAM */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between font-mono">
              <span className="text-[11px] text-muted-foreground font-sans">호스트 시스템 RAM</span>
              <span className="font-semibold text-foreground">
                {currentSnapshot && currentSnapshot.systemMemoryTotalMb > 0
                  ? `${(currentSnapshot.systemMemoryTotalMb / 1024).toFixed(1)} GB (여유: ${(
                      currentSnapshot.systemMemoryFreeMb / 1024
                    ).toFixed(1)} GB)`
                  : 'N/A'}
              </span>
            </div>

            {/* Model Weight Status in Memory */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between font-mono">
              <span className="text-[11px] text-muted-foreground font-sans">Ollama 메모리 로드 상태</span>
              <span className="flex items-center gap-1.5 font-sans text-xs">
                {rawDetails.isModelLoadedInMemory ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">메모리에 활성화됨</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-amber-400 font-medium">대기 상태 (요청 시 즉시 로드)</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Collected Snapshots History Table (For AI Agent Analysis) */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">
              수집된 스냅샷 타임라인 (최근 {snapshots.length}개 스냅샷)
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            * 일정 간격으로 자동 기록되며, 슬라이더 위젯으로 최근 100개 스냅샷의 특정 시점을 정밀 탐색할 수 있습니다.
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            아직 수집된 스냅샷 데이터가 없습니다.
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
                          <span className="font-semibold text-foreground">타임라인 탐색 슬라이더</span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            표시: {currentOffset + 1} ~{' '}
                            {Math.min(currentOffset + TIMELINE_WINDOW_SIZE, snapshots.length)}번째
                            (총 {snapshots.length}개 중)
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
                            title="가장 최신 스냅샷 시점으로 이동"
                          >
                            <ChevronsLeft className="h-3 w-3" />
                            <span>최신</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTimelineOffset((prev) => Math.max(0, prev - 10))}
                            disabled={currentOffset === 0}
                            className="h-6 px-2 text-[10px] gap-0.5 cursor-pointer"
                            title="최신 쪽으로 10개 이동"
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
                            title="과거 쪽으로 10개 이동"
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
                            title="가장 과거 스냅샷 시점으로 이동"
                          >
                            <span>과거 끝</span>
                            <ChevronsRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Slider Input */}
                      <div className="flex items-center gap-2.5 pt-0.5">
                        <span className="text-[10px] font-mono text-emerald-400 font-semibold shrink-0">
                          [최신 #1]
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
                          [과거 #{snapshots.length}]
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto border border-border/60 rounded-lg max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="bg-muted/40 border-b border-border/80 text-[11px] text-muted-foreground font-sans">
                          <th className="p-2.5">수집 시각</th>
                          <th className="p-2.5">GPU 점유율</th>
                          <th className="p-2.5">VRAM 사용량</th>
                          <th className="p-2.5">Prefill 속도 / 시간</th>
                          <th className="p-2.5">디코딩 속도 / 시간</th>
                          <th className="p-2.5">KV 캐시(추정)</th>
                          <th className="p-2.5">오프로딩</th>
                          <th className="p-2.5">에이전트 상태</th>
                          <th className="p-2.5">현재 작업</th>
                          <th className="p-2.5 text-right">상세 데이터</th>
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
                      <td className="p-2.5 font-semibold text-emerald-400">
                        {snap.gpuUtilizationPct}%
                      </td>
                      <td className="p-2.5 font-medium text-violet-400">
                        {snap.gpuVramUsedMb.toLocaleString()} MB
                      </td>
                      <td className="p-2.5 text-amber-400">
                        {snap.prefillSpeed !== undefined && snap.prefillSpeed > 0
                          ? `${snap.prefillSpeed.toFixed(1)} t/s (${snap.prefillDurationMs ?? 0}ms)`
                          : '—'}
                      </td>
                      <td className="p-2.5 text-cyan-400">
                        {snap.decodingSpeed !== undefined && snap.decodingSpeed > 0
                          ? `${snap.decodingSpeed.toFixed(1)} t/s (${snap.decodingDurationMs ?? 0}ms)`
                          : '—'}
                      </td>
                      <td className="p-2.5 text-sky-400 font-medium">
                        {snap.kvCacheBytes > 0
                          ? formatMemoryBytes(snap.kvCacheBytes)
                          : '—'}
                      </td>
                      <td className="p-2.5 text-amber-400 font-medium">
                        {snap.gpuOffloadPct}%
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-medium ${
                            snap.agentStatus === 'generating'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : snap.agentStatus === 'executing_tool'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {snap.agentStatus}
                        </span>
                      </td>
                      <td className="p-2.5 font-sans text-muted-foreground truncate max-w-xs" title={snap.currentTask}>
                        {snap.currentTask || '대기 중'}
                      </td>
                      <td className="p-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSnapshot(snap)}
                          className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>JSON 보기</span>
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
              <span>스냅샷 상세 JSON (AI 분석용 스키마)</span>
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
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span>복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>JSON 복사</span>
                    </>
                  )}
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              수집 시각: {selectedSnapshot?.timestamp} | 에이전트: {agent.name} ({agent.model})
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 rounded-lg bg-zinc-950 border border-border/80 font-mono text-xs text-emerald-400 max-h-96 select-text whitespace-pre-wrap">
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
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">모니터링 데이터 비우기</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
              정말로 <strong className="text-foreground font-medium">"{agent.name}"</strong>의 수집된
              모니터링 스냅샷 기록을 모두 삭제하시겠습니까?
              <span className="block mt-1 text-rose-400">
                * 삭제된 데이터는 AI 에이전트 성능 분석 시 참조할 수 없게 됩니다.
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
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClearHistory}
              className="text-xs"
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
