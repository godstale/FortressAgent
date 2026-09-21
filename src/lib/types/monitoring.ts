export interface SystemGpuInfo {
  gpuName: string;
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  gpuUtilizationPct: number;
  gpuTemperatureC: number;
  isNvidia: boolean;
  systemMemoryTotalMb: number;
  systemMemoryFreeMb: number;
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at?: string;
}

export interface OllamaModelArchitectureInfo {
  architecture: string;
  parameterSize: string;
  parameterCount: number;
  contextLimit: number;
  blockCount: number;
  embeddingLength: number;
  headCount: number;
  headCountKv: number;
  feedForwardLength: number;
  quantizationLevel: string;
  format: string;
  rawModelInfo?: Record<string, unknown>;
}

export type AgentOperationalStatus =
  | 'idle'
  | 'generating'
  | 'executing_tool'
  | 'waiting_approval'
  | 'disconnected'
  | 'unknown';

export interface LlmPerformanceMetrics {
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalCount: number;
  promptEvalDurationMs: number;
  evalCount: number;
  evalDurationMs: number;
  prefillSpeed: number; // tokens/sec
  decodingSpeed: number; // tokens/sec
}

export interface AgentMonitoringSnapshot {
  id: string;
  agentId: string;
  timestamp: string; // ISO string
  gpuName: string;
  gpuVramTotalMb: number;
  gpuVramUsedMb: number;
  gpuVramFreeMb: number;
  gpuUtilizationPct: number;
  gpuTemperatureC: number;
  systemMemoryTotalMb: number;
  systemMemoryFreeMb: number;
  llmModel: string;
  llmArchitecture: string;
  llmParameterSize: string;
  contextSize: number;
  contextLimit: number;
  modelWeightBytes: number;
  vramAllocatedBytes: number;
  kvCacheBytes: number;
  gpuOffloadPct: number;
  agentStatus: AgentOperationalStatus;
  currentTask: string;
  prefillTokens?: number;
  prefillDurationMs?: number;
  prefillSpeed?: number;
  decodingTokens?: number;
  decodingDurationMs?: number;
  decodingSpeed?: number;
  totalDurationMs?: number;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface MonitoringSummary {
  totalSnapshots: number;
  firstSnapshotTime: string | null;
  lastSnapshotTime: string | null;
  avgGpuUtilization: number;
  peakVramUsedMb: number;
  avgVramUsedMb: number;
  latestGpuName: string;
  latestModel: string;
  latestPrefillSpeed?: number;
  latestDecodingSpeed?: number;
}
