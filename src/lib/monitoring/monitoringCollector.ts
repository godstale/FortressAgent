import type { Agent } from '@/lib/types/agent';
import type {
  AgentMonitoringSnapshot,
  AgentOperationalStatus,
  LlmPerformanceMetrics,
  OllamaModelArchitectureInfo,
  OllamaRunningModel,
  SystemGpuInfo,
} from '@/lib/types/monitoring';
import {
  getRunningModels,
  getModelArchitectureInfo,
  getSystemGpuInfo,
  calculateEstimatedKvCacheBytes,
} from '@/lib/llm/ollamaClient';
import { saveMonitoringSnapshot } from '@/lib/db/repositories/monitoringRepo';
import { appLogger } from '@/lib/logger/logger';

export type MonitoringListener = (snapshot: AgentMonitoringSnapshot) => void;

class MonitoringCollectorService {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private listeners = new Map<string, Set<MonitoringListener>>();
  private archCache = new Map<string, { info: OllamaModelArchitectureInfo; timestamp: number }>();
  private intervals = new Map<string, number>();
  private isCollectingMap = new Map<string, boolean>();
  private latestInferenceMetrics = new Map<string, LlmPerformanceMetrics>();

  public recordInferenceMetrics(agentId: string, metrics: LlmPerformanceMetrics): void {
    this.latestInferenceMetrics.set(agentId, metrics);
  }

  public getLatestInferenceMetrics(agentId: string): LlmPerformanceMetrics | undefined {
    return this.latestInferenceMetrics.get(agentId);
  }

  public subscribe(agentId: string, listener: MonitoringListener): () => void {
    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Set());
    }
    this.listeners.get(agentId)!.add(listener);

    return () => {
      const set = this.listeners.get(agentId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(agentId);
        }
      }
    };
  }

  public setInterval(agentId: string, intervalMs: number, agent: Agent, baseUrl: string, workspaceRoot?: string | null): void {
    this.intervals.set(agentId, intervalMs);
    if (this.activeTimers.has(agentId)) {
      this.stop(agentId);
      this.start(agent, baseUrl, intervalMs, workspaceRoot);
    }
  }

  public getInterval(agentId: string): number {
    return this.intervals.get(agentId) || 3000;
  }

  public isRunning(agentId: string): boolean {
    return this.activeTimers.has(agentId);
  }

  public start(
    agent: Agent,
    baseUrl: string,
    intervalMs = 3000,
    workspaceRoot?: string | null,
  ): void {
    if (this.activeTimers.has(agent.id)) {
      return;
    }

    this.intervals.set(agent.id, intervalMs);

    // Initial immediate collection
    void this.collect(agent, baseUrl, workspaceRoot);

    const timer = setInterval(() => {
      void this.collect(agent, baseUrl, workspaceRoot);
    }, intervalMs);

    this.activeTimers.set(agent.id, timer);
  }

  public stop(agentId: string): void {
    const timer = this.activeTimers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(agentId);
    }
  }

  public stopAll(): void {
    for (const timer of this.activeTimers.values()) {
      clearInterval(timer);
    }
    this.activeTimers.clear();
  }

  public async collectNow(
    agent: Agent,
    baseUrl: string,
    workspaceRoot?: string | null,
  ): Promise<AgentMonitoringSnapshot | null> {
    return this.collect(agent, baseUrl, workspaceRoot);
  }

  private async getArchitectureCached(
    baseUrl: string,
    model: string,
  ): Promise<OllamaModelArchitectureInfo | null> {
    const cached = this.archCache.get(model);
    const now = Date.now();
    // Cache for 5 minutes
    if (cached && now - cached.timestamp < 300_000) {
      return cached.info;
    }

    try {
      const info = await getModelArchitectureInfo(baseUrl, model);
      this.archCache.set(model, { info, timestamp: now });
      return info;
    } catch (err) {
      console.warn(`Failed to fetch model architecture for ${model}:`, err);
      return null;
    }
  }

  private detectAgentOperationalStatus(agentId: string): {
    status: AgentOperationalStatus;
    task: string;
  } {
    const logs = appLogger.getAgentLogs(agentId);
    if (!logs || logs.length === 0) {
      return { status: 'idle', task: '대기 중 (유휴 상태)' };
    }

    const now = Date.now();
    const recentLogs = logs.filter((l) => now - new Date(l.timestamp).getTime() < 15_000);
    if (recentLogs.length === 0) {
      return { status: 'idle', task: '대기 중 (유휴 상태)' };
    }

    const latest = recentLogs[recentLogs.length - 1];

    if (latest.category === 'approval') {
      return { status: 'waiting_approval', task: `사용자 승인 대기 중: ${latest.message}` };
    }

    if (latest.category === 'tools') {
      return { status: 'executing_tool', task: `도구 실행 중: ${latest.message}` };
    }

    if (latest.category === 'ollama' || latest.category === 'chat') {
      return { status: 'generating', task: `LLM 응답 생성/추론 중: ${latest.message}` };
    }

    return { status: 'idle', task: `최근 활동: ${latest.message}` };
  }

  private async collect(
    agent: Agent,
    baseUrl: string,
    workspaceRoot?: string | null,
  ): Promise<AgentMonitoringSnapshot | null> {
    if (this.isCollectingMap.get(agent.id)) {
      return null;
    }
    this.isCollectingMap.set(agent.id, true);

    try {
      const timestamp = new Date().toISOString();

      // 1. Query Hardware GPU & System Memory
      let gpuInfo: SystemGpuInfo;
      try {
        gpuInfo = await getSystemGpuInfo();
      } catch {
        gpuInfo = {
          gpuName: 'Default Video Controller',
          vramTotalMb: 0,
          vramUsedMb: 0,
          vramFreeMb: 0,
          gpuUtilizationPct: 0,
          gpuTemperatureC: 0,
          isNvidia: false,
          systemMemoryTotalMb: 0,
          systemMemoryFreeMb: 0,
        };
      }

      // 2. Query Running Models in Ollama memory
      let runningModels: OllamaRunningModel[] = [];
      try {
        runningModels = await getRunningModels(baseUrl);
      } catch (err) {
        console.warn('Failed to query running models from Ollama:', err);
      }

      // Match current agent model
      const agentModelName = agent.model.trim();
      const matchedRunning = runningModels.find(
        (m) =>
          m.name === agentModelName ||
          m.model === agentModelName ||
          m.name.startsWith(agentModelName.split(':')[0]) ||
          agentModelName.startsWith(m.name.split(':')[0]),
      );

      // 3. Query or use cached architecture
      const arch = await this.getArchitectureCached(baseUrl, agent.model);

      // 4. Memory breakdown & CPU/GPU Offloading
      const modelWeightBytes = matchedRunning ? matchedRunning.size : 0;
      const vramAllocatedBytes = matchedRunning ? matchedRunning.size_vram : 0;
      const gpuOffloadPct =
        modelWeightBytes > 0
          ? Math.min(100, Number(((vramAllocatedBytes / modelWeightBytes) * 100).toFixed(1)))
          : 0;

      // 5. Calculate KV cache size
      const targetContextSize = agent.contextSize > 0 ? agent.contextSize : 8192;
      const kvCacheBytes = arch
        ? calculateEstimatedKvCacheBytes(
            arch.blockCount,
            arch.headCountKv,
            arch.embeddingLength,
            arch.headCount,
            targetContextSize,
          )
        : 0;

      // 6. Detect Current Operational Task
      const opState = this.detectAgentOperationalStatus(agent.id);

      // 7. Get latest inference performance metrics
      const perf = this.latestInferenceMetrics.get(agent.id);

      const snapshot: AgentMonitoringSnapshot = {
        id: `mon-${agent.id}-${Date.now()}`,
        agentId: agent.id,
        timestamp,
        gpuName: gpuInfo.gpuName || 'GPU / Accelerated Device',
        gpuVramTotalMb: gpuInfo.vramTotalMb,
        gpuVramUsedMb: gpuInfo.vramUsedMb,
        gpuVramFreeMb: gpuInfo.vramFreeMb,
        gpuUtilizationPct: gpuInfo.gpuUtilizationPct,
        gpuTemperatureC: gpuInfo.gpuTemperatureC,
        systemMemoryTotalMb: gpuInfo.systemMemoryTotalMb,
        systemMemoryFreeMb: gpuInfo.systemMemoryFreeMb,
        llmModel: agent.model,
        llmArchitecture: arch?.architecture || 'unknown',
        llmParameterSize: arch?.parameterSize || '',
        contextSize: targetContextSize,
        contextLimit: arch?.contextLimit || 8192,
        modelWeightBytes,
        vramAllocatedBytes,
        kvCacheBytes,
        gpuOffloadPct,
        agentStatus: opState.status,
        currentTask: opState.task,
        prefillTokens: perf?.promptEvalCount,
        prefillDurationMs: perf?.promptEvalDurationMs,
        prefillSpeed: perf?.prefillSpeed,
        decodingTokens: perf?.evalCount,
        decodingDurationMs: perf?.evalDurationMs,
        decodingSpeed: perf?.decodingSpeed,
        totalDurationMs: perf?.totalDurationMs,
        details: {
          blockCount: arch?.blockCount ?? 0,
          headCount: arch?.headCount ?? 0,
          headCountKv: arch?.headCountKv ?? 0,
          embeddingLength: arch?.embeddingLength ?? 0,
          feedForwardLength: arch?.feedForwardLength ?? 0,
          quantizationLevel: arch?.quantizationLevel ?? '',
          format: arch?.format ?? 'gguf',
          parameterCount: arch?.parameterCount ?? 0,
          isModelLoadedInMemory: Boolean(matchedRunning),
          runningExpiresAt: matchedRunning?.expires_at,
          allRunningModels: runningModels.map((r) => ({
            name: r.name,
            size_vram_mb: Math.round(r.size_vram / 1024 / 1024),
          })),
        },
        createdAt: timestamp,
      };

      // Persist snapshot to SQLite
      try {
        await saveMonitoringSnapshot(snapshot, workspaceRoot);
      } catch (err) {
        console.warn('Failed to save monitoring snapshot to SQLite:', err);
      }

      // Notify active listeners
      const listenersSet = this.listeners.get(agent.id);
      if (listenersSet) {
        for (const listener of listenersSet) {
          try {
            listener(snapshot);
          } catch (e) {
            console.error('Error in monitoring listener:', e);
          }
        }
      }

      return snapshot;
    } finally {
      this.isCollectingMap.set(agent.id, false);
    }
  }
}

export const monitoringCollector = new MonitoringCollectorService();
