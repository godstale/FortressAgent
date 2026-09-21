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
} from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { useSettings } from '@/lib/context/SettingsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { Button } from '@/components/ui/button';
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
        // Keep most recent 60 snapshots for graph
        const next = [newSnapshot, ...prev.filter((s) => s.id !== newSnapshot.id)];
        return next.slice(0, 60);
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

      {/* 8 Key Operational & Performance KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {/* 1. GPU Model & Utilization */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
              <span>GPU 사용률</span>
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
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-purple-400" />
            <span>LLM 아키텍처</span>
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
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>컨텍스트 & KV</span>
          </div>
          <div className="text-base font-bold text-foreground">
            {currentSnapshot?.contextSize.toLocaleString() || '8,192'}
            <span className="text-[10px] font-normal text-muted-foreground ml-1">
              / {currentSnapshot?.contextLimit.toLocaleString() || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground text-[10px]">KV 캐시 크기</span>
            <span className="font-mono text-[10px] text-sky-400 font-semibold">
              {currentSnapshot && currentSnapshot.kvCacheBytes > 0
                ? `${(currentSnapshot.kvCacheBytes / (1024 * 1024)).toFixed(1)} MB`
                : '계산 중...'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            어텐션: {rawDetails.headCount ? `${rawDetails.headCount}H / ${rawDetails.headCountKv}KV` : '—'}
          </div>
        </div>

        {/* 7. CPU / GPU Workload Offloading */}
        <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>GPU 오프로딩</span>
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
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
            <span>현재 작업 상태</span>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">
              수집된 스냅샷 타임라인 (최근 {snapshots.length}개 스냅샷)
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            * 일정 간격으로 자동 기록되며, 추후 AI 에이전트가 성능/리소스 병목을 정밀 분석할 수 있도록 보존됩니다.
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            아직 수집된 스냅샷 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border/60 rounded-lg">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
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
                {snapshots.slice(0, 20).map((snap) => {
                  return (
                    <tr key={snap.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-2.5 text-muted-foreground text-[11px]">
                        {new Date(snap.timestamp).toLocaleTimeString()}
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
                          ? `${(snap.kvCacheBytes / (1024 * 1024)).toFixed(1)} MB`
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
