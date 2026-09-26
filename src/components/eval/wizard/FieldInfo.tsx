import { Info } from 'lucide-react';

interface FieldInfoProps {
  label: string;
  help: string;
}

// 라벨 옆 [i] 아이콘. title 툴팁으로 상세 설명을 제공한다.
// (AgentEditorForm의 ParamInfo와 같은 패턴 — 새 의존성 없음)
export function FieldInfo({ label, help }: FieldInfoProps) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={label} title={help}>
      <Info className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
    </span>
  );
}
