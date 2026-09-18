import type { WorkspaceTab } from '@/lib/types/workspaceTab';

export interface TabPlaceholderProps {
  tab: WorkspaceTab;
}

export function TabPlaceholder({ tab }: TabPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center text-muted-foreground select-none">
      <div className="rounded-full bg-accent p-4 mb-3">
        <span className="text-xl font-mono">⚡</span>
      </div>
      <h3 className="text-sm font-semibold text-foreground">{tab.title}</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
        탭 타입: <code className="bg-muted px-1 py-0.5 rounded">{tab.type}</code>
      </p>
      <p className="text-[11px] opacity-70 mt-2">
        해당 탭 컴포넌트는 다음 Phase에서 구현되어 제공됩니다.
      </p>
    </div>
  );
}

export default TabPlaceholder;
