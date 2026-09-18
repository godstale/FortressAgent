// Bootstrap registered hooks and tools
// Phase 2: Built-in tools and truncation hook
import '@/lib/tools/registry';

// Phase 4: Compaction hooks
import '@/lib/compaction/register';

// TODO(Phase5): import '@/lib/approval/register';

export function bootstrapRuntime(): void {
  // Executed once on application startup
}
