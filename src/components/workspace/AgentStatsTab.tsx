import { useEffect, useState, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useAgents } from '@/lib/context/AgentsContext';
import { Button } from '@/components/ui/button';
import { computeAgentStats, type DetailedAgentStats } from '@/lib/metrics/agentMetrics';
import { appLogger, type LogEntry } from '@/lib/logger/logger';

export function AgentStatsTab({ tab }: { tab: WorkspaceTab }) {
  const agentId = tab.meta?.agentId as string | undefined;
  const initialView = (tab.meta?.view as 'stats' | 'logs') || 'stats';
  const { getAgent } = useAgents();
  const agent = agentId ? getAgent(agentId) : null;

  const [activeTab, setActiveTab] = useState<'stats' | 'logs'>(initialView);
  const [stats, setStats] = useState<DetailedAgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Agent Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const data = await computeAgentStats(agentId);
      setStats(data);
    } catch (err) {
      console.error('Failed to compute agent stats:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Load and subscribe to agent logs
  useEffect(() => {
    if (!agentId) return;

    const refreshLogs = () => {
      const all = appLogger.getEntries();
      const agentLogs = all.filter((e) => e.agentId === agentId);
      setLogs(agentLogs);
    };

    refreshLogs();
    const unsubscribe = appLogger.subscribe(() => {
      refreshLogs();
    });

    return () => {
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
      logs: logs.slice(0, 300),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-analysis-${agent?.name || agentId}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (logLevelFilter !== 'all' && l.level !== logLevelFilter) {
        return false;
      }
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        return (
          l.message.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (typeof l.details === 'string' && l.details.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, logLevelFilter, logSearchQuery]);

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
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              {agent.name} 성능 지표 및 통합 로그
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            모델: <span className="font-mono text-foreground font-medium">{agent.model}</span> |
            컨텍스트 크기:{' '}
            <span className="font-mono text-foreground font-medium">
              {agent.contextSize > 0 ? `${agent.contextSize.toLocaleString()} 토큰` : '기본 (8192)'}
            </span>{' '}
            | 승인 정책:{' '}
            <span className="font-mono text-foreground font-medium">
              {agent.approvalMode}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Tab Switcher */}
          <div className="flex items-center rounded-lg bg-muted/60 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>통계 대시보드</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>전체 로그 ({logs.length})</span>
            </button>
          </div>

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
                    {stats.llmCalls.map((call) => {
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
          </div>
        </div>
      ) : (
        /* Agent Full Execution Logs Tab */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3 rounded-xl border border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="로그 내용, 카테고리 검색..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <select
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">전체 레벨 (ALL)</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
                <option value="debug">DEBUG</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground self-end sm:self-auto font-mono">
              <span>표시: {filteredLogs.length} / 총 {logs.length}건</span>
            </div>
          </div>

          {/* Logs List */}
          {filteredLogs.length === 0 ? (
            <div className="p-16 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
              조건에 일치하는 에이전트 로그 기록이 없습니다.
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl bg-card overflow-hidden divide-y divide-border/40 font-mono text-xs max-h-[640px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const isError = log.level === 'error';
                const isWarn = log.level === 'warn';
                const isInfo = log.level === 'info';
                return (
                  <div
                    key={log.id}
                    className={`p-3 space-y-1.5 hover:bg-muted/30 transition-colors ${
                      isError ? 'bg-destructive/5' : isWarn ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2">
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
                        <span className="font-semibold text-foreground/80">
                          [{log.category.toUpperCase()}]
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}`,
                            log.id,
                          )
                        }
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        title="로그 복사"
                      >
                        {copiedLogId === log.id ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    <div className="text-foreground leading-relaxed break-all select-text font-sans">
                      {log.message}
                    </div>

                    {log.details !== undefined && log.details !== null && (
                      <pre className="p-2 rounded bg-background/80 border border-border/50 text-[11px] text-muted-foreground overflow-x-auto select-text font-mono">
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
        </div>
      )}
    </div>
  );
}

export default AgentStatsTab;
