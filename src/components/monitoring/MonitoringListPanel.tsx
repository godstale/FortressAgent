import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  BotOff,
  Cpu,
  Server,
  Gauge,
  Trash2,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useAgents } from '@/lib/context/AgentsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getProviderPreset } from '@/lib/llm/providers';
import type { LlmProviderKind } from '@/lib/types/agent';
import type { AgentMonitoringSnapshot } from '@/lib/types/monitoring';
import {
  listRecentMonitoringSnapshots,
  deleteMonitoringSnapshot,
  clearAllMonitoringSnapshots,
  clearAllConversationSummaries,
} from '@/lib/db/repositories/monitoringRepo';
import {
  groupMonitoringSnapshots,
  UNKNOWN_MONITOR_SEGMENT,
  type MonitoringFilterMode,
} from '@/lib/monitoring/monitoringGroups';

type TFn = (key: string, params?: Record<string, string | number>) => string;

function formatTime(iso: string, t: TFn): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60 * 1000) return t('sessions.justNow');
    if (diff < 60 * 60 * 1000)
      return t('sessions.minutesAgo', { n: Math.floor(diff / (60 * 1000)) });
    if (diff < 24 * 60 * 60 * 1000)
      return t('sessions.hoursAgo', { n: Math.floor(diff / (60 * 60 * 1000)) });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

const FILTER_STORAGE_KEY = 'fortress:monitoring-filter';

function readStoredFilterMode(): MonitoringFilterMode {
  try {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (
      saved === 'agent' ||
      saved === 'provider' ||
      saved === 'model' ||
      saved === 'status'
    ) {
      return saved;
    }
  } catch {
    // localStorage 미지원 환경에서는 전체 보기로 폴백한다.
  }
  return 'all';
}

export function MonitoringListPanel() {
  const { t } = useLanguage();
  const { openTab } = useWorkspaceTabs();
  const {
    getAgent,
    getKnownAgentName,
    loading: agentsLoading,
  } = useAgents();
  const { workspaceRoot } = useWorkspace();

  const [snapshots, setSnapshots] = useState<AgentMonitoringSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [filterMode, setFilterMode] =
    useState<MonitoringFilterMode>(readStoredFilterMode);
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(
    () => new Set(),
  );

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listRecentMonitoringSnapshots(200, workspaceRoot);
      setSnapshots(rows);
    } catch (err) {
      console.error('Failed to load monitoring snapshots:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await listRecentMonitoringSnapshots(200, workspaceRoot);
        if (!active) return;
        setSnapshots(rows);
      } catch (err) {
        console.error('Failed to load monitoring snapshots:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceRoot]);

  const handleFilterChange = (mode: MonitoringFilterMode) => {
    setFilterMode(mode);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, mode);
    } catch {
      // 저장 실패는 무시하고 이번 세션 동안만 유지한다.
    }
  };

  const toggleGroup = (key: string) => {
    setManuallyCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleOpenMonitor = (snapshot: AgentMonitoringSnapshot) => {
    const agent = getAgent(snapshot.agentId);
    const name =
      agent?.name ?? getKnownAgentName(snapshot.agentId) ?? snapshot.agentId;
    openTab({
      id: `agent-monitor:${snapshot.agentId}`,
      type: 'agent-monitor',
      title: t('agentList.monitor', { name }),
      meta: { agentId: snapshot.agentId },
    });
  };

  const handleDeleteSnapshot = async (
    e: React.MouseEvent,
    snapshotId: string,
  ) => {
    e.stopPropagation();
    setDeletingId(snapshotId);
    try {
      await deleteMonitoringSnapshot(snapshotId, workspaceRoot);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
    } catch (err) {
      console.error('Failed to delete monitoring snapshot:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await clearAllMonitoringSnapshots(workspaceRoot);
      await clearAllConversationSummaries(workspaceRoot);
      setSnapshots([]);
      setClearConfirmOpen(false);
    } catch (err) {
      console.error('Failed to clear monitoring history:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const groups = useMemo(
    () =>
      filterMode === 'all'
        ? null
        : groupMonitoringSnapshots(snapshots, filterMode, getAgent),
    [snapshots, filterMode, getAgent],
  );

  const collapsedGroups = useMemo(() => manuallyCollapsed, [manuallyCollapsed]);

  const resolveGroupHeader = (key: string) => {
    if (filterMode === 'agent') {
      const agentId = key.slice('agent:'.length);
      const agent = agentsLoading ? undefined : getAgent(agentId);
      if (agent) return { label: agent.name, Icon: Bot, deleted: false };
      const known = agentsLoading ? null : getKnownAgentName(agentId);
      return {
        label: agentsLoading ? '…' : (known ?? t('sessions.agentDeleted')),
        Icon: BotOff,
        deleted: !agentsLoading,
      };
    }
    if (filterMode === 'provider') {
      const segment = key.slice('provider:'.length);
      if (segment === UNKNOWN_MONITOR_SEGMENT) {
        return {
          label: agentsLoading ? '…' : t('sessions.agentDeleted'),
          Icon: BotOff,
          deleted: true,
        };
      }
      return {
        label: getProviderPreset(segment as LlmProviderKind).label,
        Icon: Server,
        deleted: false,
      };
    }
    if (filterMode === 'status') {
      return { label: key.slice('status:'.length), Icon: Gauge, deleted: false };
    }
    const segment = key.slice('model:'.length);
    if (segment === UNKNOWN_MONITOR_SEGMENT) {
      return {
        label: agentsLoading ? '…' : t('sessions.agentDeleted'),
        Icon: BotOff,
        deleted: true,
      };
    }
    return { label: segment, Icon: Cpu, deleted: false };
  };

  const renderSnapshotRow = (snapshot: AgentMonitoringSnapshot) => {
    const isDeleting = deletingId === snapshot.id;
    const agent = agentsLoading ? undefined : getAgent(snapshot.agentId);
    const knownName = agentsLoading
      ? undefined
      : (agent?.name ?? getKnownAgentName(snapshot.agentId));
    const isAgentDeleted = !agentsLoading && !agent;
    const displayName = knownName ?? t('sessions.agentDeleted');
    const model = snapshot.llmModel || agent?.model || '—';

    return (
      <div
        key={snapshot.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenMonitor(snapshot)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleOpenMonitor(snapshot);
          }
        }}
        className="group relative flex items-start justify-between rounded-lg p-2.5 text-xs transition-colors cursor-pointer border text-foreground hover:bg-muted/60 border-transparent"
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-medium truncate min-w-0">
              <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
              <span
                className={`truncate ${isAgentDeleted ? 'line-through text-muted-foreground' : ''}`}
                title={isAgentDeleted ? t('sessions.agentDeleted') : undefined}
              >
                {displayName}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatTime(snapshot.timestamp, t)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground truncate">
            <span className="truncate font-mono">
              {model} • {snapshot.agentStatus}
              {snapshot.gpuUtilizationPct > 0 &&
                ` • GPU ${Math.round(snapshot.gpuUtilizationPct)}%`}
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          disabled={isDeleting}
          onClick={(e) => void handleDeleteSnapshot(e, snapshot.id)}
          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity shrink-0"
          title={t('monitoringList.deleteRecord')}
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          {t('monitoringList.titleCount', { n: snapshots.length })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => void loadSnapshots()}
            disabled={isLoading}
            title={t('monitoringList.refresh')}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
            onClick={() => setClearConfirmOpen(true)}
            disabled={snapshots.length === 0 || isClearing}
            title={t('monitoringList.clearAll')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <select
          value={filterMode}
          onChange={(e) =>
            handleFilterChange(e.target.value as MonitoringFilterMode)
          }
          aria-label={t('monitoringList.filterLabel')}
          className="w-full bg-transparent text-xs text-foreground outline-none cursor-pointer"
        >
          <option value="all">{t('sessions.filterAll')}</option>
          <option value="agent">{t('sessions.filterByAgent')}</option>
          <option value="provider">{t('sessions.filterByProvider')}</option>
          <option value="model">{t('sessions.filterByModel')}</option>
          <option value="status">{t('monitoringList.filterByStatus')}</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && snapshots.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{t('monitoringList.loading')}</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">{t('monitoringList.empty')}</p>
            <p className="text-[11px] opacity-70 mt-1">
              {t('monitoringList.emptyDesc')}
            </p>
          </div>
        ) : groups ? (
          groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key);
            const { label, Icon, deleted } = resolveGroupHeader(group.key);
            const ToggleIcon = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <div key={group.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!isCollapsed}
                  title={
                    isCollapsed
                      ? t('sessions.expandGroup')
                      : t('sessions.collapseGroup')
                  }
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                >
                  <ToggleIcon className="h-3.5 w-3.5 shrink-0" />
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span
                    className={`truncate font-medium text-left flex-1 min-w-0 ${deleted ? 'line-through' : ''}`}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] tabular-nums shrink-0">
                    {group.snapshots.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1">
                    {group.snapshots.map(renderSnapshotRow)}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          snapshots.map(renderSnapshotRow)
        )}
      </div>

      {/* 전체 삭제 확인 팝업 (필수) */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('monitoringList.clearConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('monitoringList.clearConfirmDesc', { n: snapshots.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearConfirmOpen(false)}
              disabled={isClearing}
            >
              {t('monitor.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleClearAll()}
              disabled={isClearing}
            >
              {isClearing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              {t('monitor.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MonitoringListPanel;
