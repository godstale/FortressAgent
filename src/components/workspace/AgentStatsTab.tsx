import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Activity,
  MessageSquare,
  History,
  Cpu,
  Wrench,
  FileDown,
  RefreshCw,
  Clock,
  Terminal,
  Search,
  Copy,
  Check,
  Zap,
  Trash2,
  Sparkles,
  Bot,
  Code,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { computeAgentStats, type DetailedAgentStats } from '@/lib/metrics/agentMetrics';
import { appLogger, type LogEntry } from '@/lib/logger/logger';

const LOG_PAGE_SIZE = 100;
const LLM_PAGE_SIZE = 100;

export function AgentStatsTab({ tab }: { tab: WorkspaceTab }) {
  const agentId = tab.meta?.agentId as string | undefined;
  const initialView = (tab.meta?.view as 'stats' | 'logs') || 'stats';
  const { getAgent } = useAgents();
  const agent = agentId ? getAgent(agentId) : null;

  const [activeTab] = useState<'stats' | 'logs'>(initialView);
  const [stats, setStats] = useState<DetailedAgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [logPage, setLogPage] = useState(1);
  const [llmPage, setLlmPage] = useState(1);

  // Agent Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const data = await computeAgentStats(agentId);
      setStats(data);
      const loadedLogs = await appLogger.loadAgentLogs(agentId);
      setLogs(loadedLogs);
    } catch (err) {
      console.error('Failed to compute agent stats:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Load and subscribe to agent logs
  useEffect(() => {
    if (!agentId) return;
    let active = true;

    const refreshLogs = async () => {
      try {
        const loadedLogs = await appLogger.loadAgentLogs(agentId);
        if (active) {
          setLogs(loadedLogs);
        }
      } catch (err) {
        console.warn('Failed to load agent logs from SQLite:', err);
        if (active) {
          setLogs(appLogger.getAgentLogs(agentId));
        }
      }
    };

    void refreshLogs();
    const unsubscribe = appLogger.subscribe((entry) => {
      if (entry.agentId === agentId) {
        setLogs((prev) => {
          if (prev.some((e) => e.id === entry.id)) return prev;
          return [...prev, entry];
        });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [agentId]);

  useEffect(() => {
    let active = true;
    if (!agentId) return;

    void (async () => {
      try {
        const data = await computeAgentStats(agentId);
        if (active) setStats(data);
      } catch (err) {
        console.error('Failed to compute agent stats:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [agentId]);

  const handleExportJson = () => {
    if (!stats) return;
    const exportPayload = {
      agent,
      stats,
      logs,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-analysis-${agent?.name || agentId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportLogsText = () => {
    const text = filteredLogs
      .map((l) => {
        const detailsStr =
          l.details !== undefined && l.details !== null
            ? `\n  Details: ${
                typeof l.details === 'object'
                  ? JSON.stringify(l.details, null, 2)
                  : String(l.details)
              }`
            : '';
        return `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category.toUpperCase()}] ${l.message}${detailsStr}`;
      })
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-logs-${agent?.name || agentId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAgentLogs = async () => {
    if (!agentId) return;
    await appLogger.clearAgentLogs(agentId);
    setLogs([]);
    setClearConfirmOpen(false);
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogId(id);
      setTimeout(() => setCopiedLogId(null), 1500);
    } catch {
      // ignore
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (logLevelFilter !== 'all' && l.level !== logLevelFilter) {
      return false;
    }
    if (categoryFilter !== 'all' && l.category !== categoryFilter) {
      return false;
    }
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      let detailsStr = '';
      if (l.details !== undefined && l.details !== null) {
        try {
          detailsStr =
            typeof l.details === 'object'
              ? JSON.stringify(l.details).toLowerCase()
              : String(l.details).toLowerCase();
        } catch {
          detailsStr = String(l.details).toLowerCase();
        }
      }
      return (
        l.message.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        detailsStr.includes(q)
      );
    }
    return true;
  });

  // Paging calculations for logs (100 per page, latest first)
  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const currentLogPage = Math.min(logPage, totalLogPages);
  const pagedLogs = filteredLogs.slice(
    (currentLogPage - 1) * LOG_PAGE_SIZE,
    currentLogPage * LOG_PAGE_SIZE,
  );

  // Paging calculations for LLM calls (100 per page)
  const allLlmCalls = stats?.llmCalls || [];
  const totalLlmPages = Math.max(1, Math.ceil(allLlmCalls.length / LLM_PAGE_SIZE));
  const currentLlmPage = Math.min(llmPage, totalLlmPages);
  const pagedLlmCalls = allLlmCalls.slice(
    (currentLlmPage - 1) * LLM_PAGE_SIZE,
    currentLlmPage * LLM_PAGE_SIZE,
  );

  if (!agentId || !agent) {
    return (
      <div className="flex-1 p-8 text-center text-muted-foreground text-xs">
        에이전트 정보를 찾을 수 없습니다.
      </div>
    );
  }

  const toolChartData = stats
    ? Object.entries(stats.toolUsage).map(([name, data]) => ({
        name,
        성공: data.successes,
        실패: data.errors,
      }))
    : [];

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-background text-foreground space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-3 select-none">
        <div>
          <div className="flex items-center gap-2">
            {activeTab === 'logs' ? (
              <Terminal className="h-5 w-5 text-sky-400" />
            ) : (
              <Activity className="h-5 w-5 text-primary" />
            )}
            <h2 className="text-base font-bold text-foreground">
              {activeTab === 'logs' ? `${agent.name} 실행 로그` : `${agent.name} 성능 지표 및 통계`}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {activeTab === 'logs' ? (
              <>
                에이전트 루프, Ollama 추론, 도구 호출의 전체 상세 실행 기록을 확인합니다. | 총{' '}
                <span className="font-mono text-foreground font-medium">{logs.length}</span>건
              </>
            ) : (
              <>
                모델: <span className="font-mono text-foreground font-medium">{agent.model}</span> |
                컨텍스트 크기:{' '}
                <span className="font-mono text-foreground font-medium">
                  {agent.contextSize > 0 ? `${agent.contextSize.toLocaleString()} 토큰` : '기본 (8192)'}
                </span>{' '}
                | 승인 정책:{' '}
                <span className="font-mono text-foreground font-medium">
                  {agent.approvalMode}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </Button>

          {activeTab === 'stats' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              disabled={!stats}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>분석 다운로드</span>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportLogsText}
                disabled={filteredLogs.length === 0}
                className="text-xs gap-1.5 cursor-pointer"
                title="텍스트 파일로 저장"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>로그 다운로드</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearConfirmOpen(true)}
                disabled={logs.length === 0}
                className="text-xs gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                title="에이전트 로그 비우기"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>비우기</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
          에이전트 세션 및 통계 데이터를 집계하고 있습니다...
        </div>
      ) : activeTab === 'stats' ? (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-primary" />
                <span>총 대화 세션</span>
              </div>
              <div className="text-xl font-bold text-foreground">{stats?.sessionCount || 0}회</div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                <span>총 메시지 수</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {stats?.totalMessages || 0}건
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  (질문 {stats?.userMessages || 0} / 응답 {stats?.assistantMessages || 0})
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                <span>총 토큰 사용량</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {(stats?.totalTokens || 0).toLocaleString()}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  (in {(stats?.promptTokens || 0).toLocaleString()} / out {(stats?.completionTokens || 0).toLocaleString()})
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>평균 추론 응답 시간</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {stats?.avgDurationMs ? `${(stats.avgDurationMs / 1000).toFixed(2)}초` : '—'}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  ({stats?.llmCalls.length || 0}회 호출)
                </span>
              </div>
            </div>
          </div>

          {/* Charts Row 1: Session Activity & Tool Executions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Session Activity */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    최근 세션별 메시지 및 토큰 추이
                  </span>
                </div>
              </div>
              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(stats?.sessionHistory || []).slice(-8).map((s) => ({
                      name: s.title.length > 10 ? s.title.slice(0, 10) + '...' : s.title,
                      메시지: s.messageCount,
                      토큰: s.tokenCount,
                    }))}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="메시지" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="토큰" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tool Executions */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-foreground">
                  도구별 호출 빈도 및 성공/실패율
                </span>
              </div>
              {toolChartData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
                  아직 실행된 도구 기록이 없습니다.
                </div>
              ) : (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={toolChartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="성공" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="실패" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Charts Row 2: Context Size vs Response Latency Correlation */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-foreground">
                  컨텍스트 크기 vs 모델 실행 시간(Latency) 상관관계
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                컨텍스트가 증가할 때 모델 연산 지연시간 추이
              </span>
            </div>

            {(!stats?.contextVsDuration || stats.contextVsDuration.length === 0) ? (
              <div className="h-48 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1">
                <p>수집된 LLM 추론 시간 데이터가 아직 없습니다.</p>
                <p className="text-[11px] opacity-70">채팅에서 대화를 진행하면 실시간으로 레이턴시 그래프가 누적됩니다.</p>
              </div>
            ) : (
              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.contextVsDuration.map((item, idx) => ({
                      index: `#${idx + 1}`,
                      컨텍스트: item.contextTokens,
                      실행시간_초: Number((item.durationMs / 1000).toFixed(2)),
                      생성토큰: item.outputTokens,
                    }))}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="index" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tick={{ fontSize: 10 }} unit="s" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="컨텍스트"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.15}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="실행시간_초"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Detailed LLM Call History Table */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  최근 LLM 호출 상세 기록 ({stats?.llmCalls.length || 0}건)
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                한 번의 요청 처리에 발생한 호출 당 컨텍스트 크기, 소요 시간, 생성 토큰 정보
              </span>
            </div>

            {(!stats?.llmCalls || stats.llmCalls.length === 0) ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                아직 기록된 LLM 호출 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border/60 rounded-lg">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/80 text-[11px] text-muted-foreground">
                      <th className="p-2.5">호출 시각</th>
                      <th className="p-2.5">입력 컨텍스트</th>
                      <th className="p-2.5">출력 토큰</th>
                      <th className="p-2.5">소요 시간</th>
                      <th className="p-2.5">도구 호출 수</th>
                      <th className="p-2.5">초당 생성 속도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLlmCalls.map((call) => {
                      const tps =
                        call.durationMs > 0
                          ? ((call.outputTokens / (call.durationMs / 1000))).toFixed(1)
                          : '—';
                      return (
                        <tr key={call.id} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="p-2.5 text-muted-foreground text-[11px]">
                            {new Date(call.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-2.5 font-semibold text-foreground">
                            {call.contextTokens.toLocaleString()} tokens
                          </td>
                          <td className="p-2.5 text-emerald-400 font-medium">
                            {call.outputTokens.toLocaleString()} tokens
                          </td>
                          <td className="p-2.5 text-amber-400 font-medium">
                            {(call.durationMs / 1000).toFixed(2)}s
                          </td>
                          <td className="p-2.5">
                            {call.toolCallsCount > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px]">
                                {call.toolCallsCount}건 실행
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {tps !== '—' ? `${tps} tok/s` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* LLM Calls Pagination */}
            {totalLlmPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs border-t border-border/40 select-none">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {(currentLlmPage - 1) * LLM_PAGE_SIZE + 1} ~{' '}
                  {Math.min(currentLlmPage * LLM_PAGE_SIZE, allLlmCalls.length)} / 총{' '}
                  {allLlmCalls.length}건
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLlmPage(1)}
                    disabled={currentLlmPage === 1}
                    className="h-7 w-7 p-0 cursor-pointer"
                    title="첫 페이지"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLlmPage((p) => Math.max(1, p - 1))}
                    disabled={currentLlmPage === 1}
                    className="h-7 px-2 text-xs gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>이전</span>
                  </Button>
                  <span className="px-2 text-xs font-mono font-medium">
                    {currentLlmPage} / {totalLlmPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLlmPage((p) => Math.min(totalLlmPages, p + 1))}
                    disabled={currentLlmPage === totalLlmPages}
                    className="h-7 px-2 text-xs gap-1 cursor-pointer"
                  >
                    <span>다음</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLlmPage(totalLlmPages)}
                    disabled={currentLlmPage === totalLlmPages}
                    className="h-7 w-7 p-0 cursor-pointer"
                    title="마지막 페이지"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Agent Full Execution Logs Tab */
        <div className="space-y-4">
          {/* Filter & Action Bar */}
          <div className="p-3 rounded-xl border border-border bg-card flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-64 min-w-[200px]">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => {
                    setLogSearchQuery(e.target.value);
                    setLogPage(1);
                  }}
                  placeholder="로그 내용, 프롬프트, 도구 결과 검색..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setLogPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">전체 카테고리 (ALL)</option>
                <option value="chat">CHAT (질문/대화)</option>
                <option value="ollama">OLLAMA (추론/응답/Thinking)</option>
                <option value="tools">TOOLS (도구 실행)</option>
                <option value="agent">AGENT (루프 제어)</option>
                <option value="approval">APPROVAL (승인/권한)</option>
                <option value="context">CONTEXT (컨텍스트 관리)</option>
              </select>

              <select
                value={logLevelFilter}
                onChange={(e) => {
                  setLogLevelFilter(e.target.value);
                  setLogPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">전체 레벨 (ALL)</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
                <option value="debug">DEBUG</option>
              </select>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <span className="text-xs text-muted-foreground font-mono mr-2">
                표시: {filteredLogs.length > 0 ? (currentLogPage - 1) * LOG_PAGE_SIZE + 1 : 0} ~{' '}
                {Math.min(currentLogPage * LOG_PAGE_SIZE, filteredLogs.length)} / 총 {filteredLogs.length}건
                {totalLogPages > 1 && ` (페이지 ${currentLogPage}/${totalLogPages})`}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportLogsText}
                disabled={filteredLogs.length === 0}
                className="h-7 text-xs gap-1 cursor-pointer"
                title="텍스트 파일로 저장"
              >
                <FileDown className="h-3 w-3" />
                <span>저장</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearConfirmOpen(true)}
                disabled={logs.length === 0}
                className="h-7 text-xs gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                title="에이전트 로그 비우기"
              >
                <Trash2 className="h-3 w-3" />
                <span>비우기</span>
              </Button>
            </div>
          </div>

          {/* Logs List */}
          {filteredLogs.length === 0 ? (
            <div className="p-16 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card space-y-1.5">
              <Terminal className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground">기록된 에이전트 로그가 없습니다.</p>
              <p className="text-[11px] opacity-70">
                채팅창에서 질문이나 도구 실행을 요청하면 실시간으로 모든 추론 및 실행 로그가 이곳에 기록됩니다.
              </p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl bg-card overflow-hidden divide-y divide-border/40 font-mono text-xs max-h-[700px] overflow-y-auto select-text">
              {pagedLogs.map((log) => {
                const isError = log.level === 'error';
                const isWarn = log.level === 'warn';
                const isInfo = log.level === 'info';
                const categoryClass =
                  log.category === 'chat'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                    : log.category === 'ollama'
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    : log.category === 'tools'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : log.category === 'agent'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : log.category === 'approval'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : log.category === 'context'
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    : 'bg-muted text-muted-foreground border-border';

                const detailsObj =
                  log.details && typeof log.details === 'object'
                    ? (log.details as Record<string, unknown>)
                    : null;

                const hasPrompt = Boolean(detailsObj && (detailsObj.prompt || detailsObj.fullPrompt));
                const hasThinking = Boolean(detailsObj && typeof detailsObj.thinking === 'string' && detailsObj.thinking.trim());
                const hasContent = Boolean(detailsObj && typeof detailsObj.content === 'string' && detailsObj.content.trim());
                const hasArguments = Boolean(detailsObj && detailsObj.arguments && typeof detailsObj.arguments === 'object');
                const hasToolResult = Boolean(detailsObj && detailsObj.result !== undefined);
                const hasMessages = Boolean(detailsObj && Array.isArray(detailsObj.messages) && detailsObj.messages.length > 0);

                return (
                  <div
                    key={log.id}
                    className={`p-3 space-y-2 hover:bg-muted/30 transition-colors ${
                      isError ? 'bg-destructive/5' : isWarn ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-1.5 py-0.2 rounded font-semibold text-[10px] uppercase border ${
                            isError
                              ? 'bg-destructive/20 text-destructive border-destructive/30'
                              : isWarn
                              ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                              : isInfo
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {log.level}
                        </span>

                        <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] uppercase border ${categoryClass}`}>
                          {log.category.toUpperCase()}
                        </span>

                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.sessionId && (
                          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                            세션: {log.sessionId.length > 12 ? log.sessionId.slice(0, 12) + '...' : log.sessionId}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}\n${
                              log.details ? JSON.stringify(log.details, null, 2) : ''
                            }`,
                            log.id,
                          )
                        }
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                        title="로그 복사"
                      >
                        {copiedLogId === log.id ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    {/* Log Message Headline */}
                    <div className="text-foreground leading-relaxed font-sans font-medium text-xs">
                      {log.message}
                    </div>

                    {/* Rich Details Renderers */}
                    {hasPrompt && (
                      <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/20 text-xs">
                        <div className="text-[11px] font-semibold text-sky-400 mb-1 flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>사용자 프롬프트 전문</span>
                        </div>
                        <div className="whitespace-pre-wrap text-foreground/90 font-sans leading-relaxed">
                          {String(detailsObj!.fullPrompt || detailsObj!.prompt)}
                        </div>
                      </div>
                    )}

                    {hasThinking && (
                      <details className="group rounded-lg bg-purple-950/20 border border-purple-500/20 text-xs overflow-hidden" open>
                        <summary className="px-2.5 py-1.5 font-semibold text-purple-400 cursor-pointer select-none flex items-center justify-between hover:bg-purple-500/10 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            <span>LLM 사고 과정 (Thinking / CoT) — {String(detailsObj!.thinking).length}자</span>
                          </div>
                        </summary>
                        <div className="p-2.5 border-t border-purple-500/20 whitespace-pre-wrap text-foreground/90 font-sans leading-relaxed max-h-72 overflow-y-auto">
                          {String(detailsObj!.thinking)}
                        </div>
                      </details>
                    )}

                    {hasContent && (
                      <details className="group rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs overflow-hidden" open>
                        <summary className="px-2.5 py-1.5 font-semibold text-emerald-400 cursor-pointer select-none flex items-center justify-between hover:bg-emerald-500/10 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5 text-emerald-400" />
                            <span>LLM 응답 전문 — {String(detailsObj!.content).length}자</span>
                          </div>
                        </summary>
                        <div className="p-2.5 border-t border-emerald-500/20 whitespace-pre-wrap text-foreground/90 font-sans leading-relaxed max-h-72 overflow-y-auto">
                          {String(detailsObj!.content)}
                        </div>
                      </details>
                    )}

                    {hasArguments && (
                      <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-xs">
                        <div className="text-[11px] font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5" />
                          <span>도구 호출 인자 (Arguments)</span>
                        </div>
                        <pre className="text-foreground/90 font-mono text-[11px] whitespace-pre-wrap break-all">
                          {JSON.stringify(detailsObj!.arguments, null, 2)}
                        </pre>
                      </div>
                    )}

                    {hasToolResult && (
                      <details className="group rounded-lg bg-muted/40 border border-border/80 text-xs overflow-hidden" open>
                        <summary className="px-2.5 py-1.5 font-semibold text-foreground/80 cursor-pointer select-none flex items-center justify-between hover:bg-muted/60 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <Terminal className="h-3.5 w-3.5 text-primary" />
                            <span>도구 실행 결과 전문 (Tool Result)</span>
                          </div>
                        </summary>
                        <div className="p-2.5 border-t border-border/60 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground max-h-72 overflow-y-auto">
                          {typeof detailsObj!.result === 'object'
                            ? JSON.stringify(detailsObj!.result, null, 2)
                            : String(detailsObj!.result)}
                        </div>
                      </details>
                    )}

                    {hasMessages && (
                      <details className="group rounded-lg bg-zinc-950/40 border border-zinc-700/40 text-xs overflow-hidden">
                        <summary className="px-2.5 py-1.5 font-semibold text-zinc-400 cursor-pointer select-none flex items-center justify-between hover:bg-zinc-800/40 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <Code className="h-3.5 w-3.5" />
                            <span>LLM 입력 프롬프트 및 컨텍스트 메시지 ({(detailsObj!.messages as unknown[]).length}개)</span>
                          </div>
                        </summary>
                        <div className="p-2.5 border-t border-zinc-700/40 space-y-2 max-h-80 overflow-y-auto">
                          {(detailsObj!.messages as Array<{ role: string; content?: string }>).map((m, idx) => (
                            <div key={idx} className="p-2 rounded bg-background border border-border/50 font-mono text-[11px]">
                              <div className="font-bold text-primary uppercase text-[10px] mb-1">[{m.role}]</div>
                              <div className="whitespace-pre-wrap font-sans text-foreground/90">{m.content}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Raw JSON Details Viewer (if other details exist or fallback) */}
                    {log.details !== undefined && log.details !== null && !hasPrompt && !hasThinking && !hasContent && !hasArguments && !hasToolResult && !hasMessages && (
                      <pre className="p-2 rounded bg-background/80 border border-border/50 text-[11px] text-muted-foreground overflow-x-auto font-mono">
                        {typeof log.details === 'object'
                          ? JSON.stringify(log.details, null, 2)
                          : String(log.details)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Logs Pagination Controls */}
          {totalLogPages > 1 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card text-xs select-none">
              <span className="text-[11px] text-muted-foreground font-mono">
                {(currentLogPage - 1) * LOG_PAGE_SIZE + 1} ~{' '}
                {Math.min(currentLogPage * LOG_PAGE_SIZE, filteredLogs.length)} / 총{' '}
                {filteredLogs.length}건
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogPage(1)}
                  disabled={currentLogPage === 1}
                  className="h-7 w-7 p-0 cursor-pointer"
                  title="첫 페이지"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={currentLogPage === 1}
                  className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>이전</span>
                </Button>
                <span className="px-3 text-xs font-mono font-semibold text-foreground">
                  {currentLogPage} / {totalLogPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                  disabled={currentLogPage === totalLogPages}
                  className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                >
                  <span>다음</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogPage(totalLogPages)}
                  disabled={currentLogPage === totalLogPages}
                  className="h-7 w-7 p-0 cursor-pointer"
                  title="마지막 페이지"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Clear Logs Confirmation Dialog */}
          <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">에이전트 실행 로그 비우기</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
                  <strong className="text-foreground font-medium">"{agent.name}"</strong> 에이전트의 모든 실행 로그 기록을 완전히 삭제하시겠습니까?
                  <span className="block mt-2 text-rose-400 font-medium">
                    * 이 작업은 되돌릴 수 없으며, SQLite에 저장된 과거 기록도 모두 삭제됩니다.
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
                  onClick={handleClearAgentLogs}
                  className="text-xs"
                >
                  로그 비우기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export default AgentStatsTab;
