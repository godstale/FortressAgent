import { getDatabase } from '@/lib/db/client';
import type { AgentMonitoringSnapshot, MonitoringSummary } from '@/lib/types/monitoring';

export async function saveMonitoringSnapshot(
  snapshot: AgentMonitoringSnapshot,
  workspaceRoot?: string | null,
): Promise<void> {
  const db = await getDatabase(workspaceRoot);
  const detailsJson = snapshot.details ? JSON.stringify(snapshot.details) : null;

  await db.execute(
    `INSERT INTO agent_monitoring_snapshots (
      id, agent_id, timestamp, gpu_name, gpu_vram_total_mb, gpu_vram_used_mb,
      gpu_vram_free_mb, gpu_utilization_pct, gpu_temperature_c,
      system_memory_total_mb, system_memory_free_mb,
      llm_model, llm_architecture, llm_parameter_size, context_size,
      context_limit, model_weight_bytes, vram_allocated_bytes, kv_cache_bytes,
      gpu_offload_pct, agent_status, current_task,
      prefill_tokens, prefill_duration_ms, prefill_speed,
      decoding_tokens, decoding_duration_ms, decoding_speed, total_duration_ms,
      details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.id,
      snapshot.agentId,
      snapshot.timestamp,
      snapshot.gpuName,
      snapshot.gpuVramTotalMb,
      snapshot.gpuVramUsedMb,
      snapshot.gpuVramFreeMb,
      snapshot.gpuUtilizationPct,
      snapshot.gpuTemperatureC,
      snapshot.systemMemoryTotalMb,
      snapshot.systemMemoryFreeMb,
      snapshot.llmModel,
      snapshot.llmArchitecture,
      snapshot.llmParameterSize,
      snapshot.contextSize,
      snapshot.contextLimit,
      snapshot.modelWeightBytes,
      snapshot.vramAllocatedBytes,
      snapshot.kvCacheBytes,
      snapshot.gpuOffloadPct,
      snapshot.agentStatus,
      snapshot.currentTask,
      snapshot.prefillTokens ?? null,
      snapshot.prefillDurationMs ?? null,
      snapshot.prefillSpeed ?? null,
      snapshot.decodingTokens ?? null,
      snapshot.decodingDurationMs ?? null,
      snapshot.decodingSpeed ?? null,
      snapshot.totalDurationMs ?? null,
      detailsJson,
      snapshot.createdAt,
    ],
  );
}

interface DbSnapshotRow {
  id: string;
  agent_id: string;
  timestamp: string;
  gpu_name: string | null;
  gpu_vram_total_mb: number | null;
  gpu_vram_used_mb: number | null;
  gpu_vram_free_mb: number | null;
  gpu_utilization_pct: number | null;
  gpu_temperature_c: number | null;
  system_memory_total_mb: number | null;
  system_memory_free_mb: number | null;
  llm_model: string | null;
  llm_architecture: string | null;
  llm_parameter_size: string | null;
  context_size: number | null;
  context_limit: number | null;
  model_weight_bytes: number | null;
  vram_allocated_bytes: number | null;
  kv_cache_bytes: number | null;
  gpu_offload_pct: number | null;
  agent_status: string | null;
  current_task: string | null;
  prefill_tokens: number | null;
  prefill_duration_ms: number | null;
  prefill_speed: number | null;
  decoding_tokens: number | null;
  decoding_duration_ms: number | null;
  decoding_speed: number | null;
  total_duration_ms: number | null;
  details: string | null;
  created_at: string;
}

function mapRowToSnapshot(row: DbSnapshotRow): AgentMonitoringSnapshot {
  let parsedDetails: Record<string, unknown> | undefined = undefined;
  if (row.details) {
    try {
      parsedDetails = JSON.parse(row.details) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  return {
    id: row.id,
    agentId: row.agent_id,
    timestamp: row.timestamp,
    gpuName: row.gpu_name ?? 'N/A',
    gpuVramTotalMb: row.gpu_vram_total_mb ?? 0,
    gpuVramUsedMb: row.gpu_vram_used_mb ?? 0,
    gpuVramFreeMb: row.gpu_vram_free_mb ?? 0,
    gpuUtilizationPct: row.gpu_utilization_pct ?? 0,
    gpuTemperatureC: row.gpu_temperature_c ?? 0,
    systemMemoryTotalMb: row.system_memory_total_mb ?? 0,
    systemMemoryFreeMb: row.system_memory_free_mb ?? 0,
    llmModel: row.llm_model ?? '',
    llmArchitecture: row.llm_architecture ?? '',
    llmParameterSize: row.llm_parameter_size ?? '',
    contextSize: row.context_size ?? 0,
    contextLimit: row.context_limit ?? 0,
    modelWeightBytes: row.model_weight_bytes ?? 0,
    vramAllocatedBytes: row.vram_allocated_bytes ?? 0,
    kvCacheBytes: row.kv_cache_bytes ?? 0,
    gpuOffloadPct: row.gpu_offload_pct ?? 0,
    agentStatus: (row.agent_status as AgentMonitoringSnapshot['agentStatus']) ?? 'unknown',
    currentTask: row.current_task ?? '',
    prefillTokens: row.prefill_tokens ?? undefined,
    prefillDurationMs: row.prefill_duration_ms ?? undefined,
    prefillSpeed: row.prefill_speed ?? undefined,
    decodingTokens: row.decoding_tokens ?? undefined,
    decodingDurationMs: row.decoding_duration_ms ?? undefined,
    decodingSpeed: row.decoding_speed ?? undefined,
    totalDurationMs: row.total_duration_ms ?? undefined,
    details: parsedDetails,
    createdAt: row.created_at,
  };
}

export async function getMonitoringSnapshots(
  agentId: string,
  limit = 200,
  workspaceRoot?: string | null,
): Promise<AgentMonitoringSnapshot[]> {
  const db = await getDatabase(workspaceRoot);
  const rows = await db.select<DbSnapshotRow[]>(
    'SELECT * FROM agent_monitoring_snapshots WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?',
    [agentId, limit],
  );
  return rows.map(mapRowToSnapshot);
}

export async function getRecentMonitoringSnapshots(
  agentId: string,
  durationMinutes = 30,
  workspaceRoot?: string | null,
): Promise<AgentMonitoringSnapshot[]> {
  const db = await getDatabase(workspaceRoot);
  const since = new Date(Date.now() - durationMinutes * 60 * 1000).toISOString();
  const rows = await db.select<DbSnapshotRow[]>(
    'SELECT * FROM agent_monitoring_snapshots WHERE agent_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
    [agentId, since],
  );
  return rows.map(mapRowToSnapshot);
}

export async function clearMonitoringSnapshots(
  agentId: string,
  workspaceRoot?: string | null,
): Promise<void> {
  const db = await getDatabase(workspaceRoot);
  await db.execute(
    'DELETE FROM agent_monitoring_snapshots WHERE agent_id = ?',
    [agentId],
  );
}

export async function getMonitoringSummary(
  agentId: string,
  workspaceRoot?: string | null,
): Promise<MonitoringSummary> {
  const snapshots = await getMonitoringSnapshots(agentId, 500, workspaceRoot);
  if (snapshots.length === 0) {
    return {
      totalSnapshots: 0,
      firstSnapshotTime: null,
      lastSnapshotTime: null,
      avgGpuUtilization: 0,
      peakVramUsedMb: 0,
      avgVramUsedMb: 0,
      latestGpuName: 'N/A',
      latestModel: '',
    };
  }

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  const totalUtilization = snapshots.reduce((acc, s) => acc + s.gpuUtilizationPct, 0);
  const totalVramUsed = snapshots.reduce((acc, s) => acc + s.gpuVramUsedMb, 0);
  const peakVram = Math.max(...snapshots.map((s) => s.gpuVramUsedMb));

  const latestWithPrefill = snapshots.find((s) => s.prefillSpeed !== undefined && s.prefillSpeed > 0);
  const latestWithDecoding = snapshots.find((s) => s.decodingSpeed !== undefined && s.decodingSpeed > 0);

  return {
    totalSnapshots: snapshots.length,
    firstSnapshotTime: oldest.timestamp,
    lastSnapshotTime: latest.timestamp,
    avgGpuUtilization: Number((totalUtilization / snapshots.length).toFixed(1)),
    peakVramUsedMb: peakVram,
    avgVramUsedMb: Math.round(totalVramUsed / snapshots.length),
    latestGpuName: latest.gpuName,
    latestModel: latest.llmModel,
    latestPrefillSpeed: latestWithPrefill?.prefillSpeed,
    latestDecodingSpeed: latestWithDecoding?.decodingSpeed,
  };
}
