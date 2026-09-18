import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Thermometer,
  Shield,
  Wrench,
  BookOpen,
  AlertTriangle,
  Check,
  RotateCcw,
} from 'lucide-react';
import type { Agent, ApprovalMode, BuiltinToolId } from '@/lib/types/agent';
import { Button } from '@/components/ui/button';
import { useSafeSkills } from '@/lib/context/SkillsContext';
import { useSettings } from '@/lib/context/SettingsContext';
import { useAgents } from '@/lib/context/AgentsContext';
import { listModels, showModel, type OllamaModel } from '@/lib/llm/ollamaClient';
import { resolveCompactionSettings } from '@/lib/compaction/settings';

const ALL_BUILTIN_TOOLS: { id: BuiltinToolId; label: string; desc: string; risk: string }[] = [
  { id: 'read', label: 'read (파일 읽기)', desc: '텍스트 파일 내용 읽기', risk: 'low' },
  { id: 'write', label: 'write (파일 생성/덮어쓰기)', desc: '지정 경로에 파일 생성', risk: 'high' },
  { id: 'edit', label: 'edit (파일 부분 편집)', desc: '정확한 문자열 매칭 및 치환', risk: 'high' },
  { id: 'ls', label: 'ls (디렉터리 목록)', desc: '폴더 내용 및 파일 크기 확인', risk: 'low' },
  { id: 'grep', label: 'grep (내용 검색)', desc: '텍스트 패턴 파일 검색', risk: 'low' },
  { id: 'find', label: 'find (파일명 검색)', desc: '글롭 패턴 파일/폴더 검색', risk: 'low' },
  { id: 'shell', label: 'shell (셸 명령 실행)', desc: '터미널 명령 실행 (항상 승인 필요)', risk: 'critical' },
  { id: 'web_search', label: 'web_search (웹 검색)', desc: 'DuckDuckGo 기반 웹 검색', risk: 'low' },
];

export interface AgentEditorFormProps {
  mode: 'create' | 'edit';
  initialAgent?: Agent;
  onSave: (savedAgent: Agent) => void;
  onCancel?: () => void;
}

export const AgentEditorForm: React.FC<AgentEditorFormProps> = ({
  mode,
  initialAgent,
  onSave,
  onCancel,
}) => {
  const { createAgent, updateAgent } = useAgents();
  const { settings } = useSettings();
  const skillsCtx = useSafeSkills();
  const safeSkills = skillsCtx?.skills || [];

  const [name, setName] = useState(initialAgent?.name || '');
  const [description, setDescription] = useState(initialAgent?.description || '');
  const [systemPrompt, setSystemPrompt] = useState(
    initialAgent?.systemPrompt ||
      'You are Fortress, an AI assistant workstation for development, documents, and research.',
  );
  const [model, setModel] = useState(initialAgent?.model || 'qwen3.5:9b');
  const [temperature, setTemperature] = useState(initialAgent?.temperature ?? 0.7);
  const [contextSize, setContextSize] = useState(initialAgent?.contextSize ?? 0);
  const [reserveTokens, setReserveTokens] = useState(initialAgent?.reserveTokens ?? 0);
  const [keepRecentTokens, setKeepRecentTokens] = useState(initialAgent?.keepRecentTokens ?? 0);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    initialAgent?.approvalMode || settings.defaultApprovalMode || 'dangerous-only',
  );
  const [enabledBuiltinTools, setEnabledBuiltinTools] = useState<BuiltinToolId[]>(
    initialAgent?.enabledBuiltinTools || ['read', 'write', 'edit', 'ls', 'grep', 'find'],
  );
  const [enabledSkills, setEnabledSkills] = useState<string[]>(
    initialAgent?.enabledSkills || [],
  );

  // Model list & capabilities
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [modelSupportsTools, setModelSupportsTools] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch installed models
  useEffect(() => {
    let active = true;
    listModels(settings.ollamaBaseUrl)
      .then((models) => {
        if (active) setAvailableModels(models);
      })
      .catch(() => {
        // Ollama offline or empty
      });
    return () => {
      active = false;
    };
  }, [settings.ollamaBaseUrl]);

  // Check tool calling capability for selected model
  useEffect(() => {
    let active = true;
    showModel(settings.ollamaBaseUrl, model)
      .then((info) => {
        if (active) setModelSupportsTools(info.supportsTools);
      })
      .catch(() => {
        if (active) setModelSupportsTools(true);
      });
    return () => {
      active = false;
    };
  }, [settings.ollamaBaseUrl, model]);

  // Derived budget preview
  const derivedBudget = useMemo(() => {
    const effectiveContextSize = contextSize > 0 ? contextSize : settings.defaultContextSize || 8192;
    return resolveCompactionSettings({
      contextSize: effectiveContextSize,
      reserveTokens: reserveTokens > 0 ? reserveTokens : undefined,
      keepRecentTokens: keepRecentTokens > 0 ? keepRecentTokens : undefined,
    });
  }, [contextSize, reserveTokens, keepRecentTokens, settings.defaultContextSize]);

  // Cross-validation: enabled skills require 'read' tool
  const showReadToolWarning =
    enabledSkills.length > 0 && !enabledBuiltinTools.includes('read');

  const toggleTool = (toolId: BuiltinToolId) => {
    setEnabledBuiltinTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  };

  const toggleSkill = (skillName: string) => {
    setEnabledSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('에이전트 이름을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const agentPayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        model: model.trim(),
        temperature,
        contextSize: Number(contextSize) || 0,
        reserveTokens: Number(reserveTokens) || 0,
        keepRecentTokens: Number(keepRecentTokens) || 0,
        approvalMode,
        enabledBuiltinTools,
        enabledSkills,
        isDefault: initialAgent?.isDefault ?? false,
      };

      let saved: Agent;
      if (mode === 'edit' && initialAgent) {
        saved = await updateAgent(initialAgent.id, agentPayload);
      } else {
        saved = await createAgent(agentPayload);
      }

      onSave(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl pb-10 select-none">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Basic Info */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              에이전트 이름 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 문서 분석 전문가"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 기술 문서 요약 및 아키텍처 다이어그램 작성을 전문으로 합니다."
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              시스템 프롬프트 (페르소나 / 지침)
            </label>
            <textarea
              rows={5}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* 2. Model & Generation Parameters */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">LLM 모델 및 생성 옵션</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Ollama 모델</label>
              {!modelSupportsTools && (
                <span className="text-[10px] text-amber-500 font-medium flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" /> 도구 미지원
                </span>
              )}
            </div>
            {availableModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {availableModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({(m.size / 1e9).toFixed(1)} GB)
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="qwen3.5:9b"
                className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Thermometer className="h-3 w-3" />
                <span>온도 (Temperature): {temperature}</span>
              </label>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary mt-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/50">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              컨텍스트 크기
            </label>
            <input
              type="number"
              value={contextSize}
              onChange={(e) => setContextSize(parseInt(e.target.value, 10) || 0)}
              placeholder="0 = 자동 (기본 8192)"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              0 입력 시 모델 기본값 적용
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              압축 여유분 (reserveTokens)
            </label>
            <input
              type="number"
              value={reserveTokens}
              onChange={(e) => setReserveTokens(parseInt(e.target.value, 10) || 0)}
              placeholder={`0 = 자동 (${derivedBudget.reserveTokens.toLocaleString()})`}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              현재 파생값: {derivedBudget.reserveTokens.toLocaleString()} 토큰
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              최근 보존량 (keepRecentTokens)
            </label>
            <input
              type="number"
              value={keepRecentTokens}
              onChange={(e) => setKeepRecentTokens(parseInt(e.target.value, 10) || 0)}
              placeholder={`0 = 자동 (${derivedBudget.keepRecentTokens.toLocaleString()})`}
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              현재 파생값: {derivedBudget.keepRecentTokens.toLocaleString()} 토큰
            </span>
          </div>
        </div>
      </div>

      {/* 3. Approval Mode */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">도구 승인 정책</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              { id: 'dangerous-only', label: '위험 도구만 (기본)', desc: 'write/edit/shell 승인 요청' },
              { id: 'always', label: '모든 도구 승인 (엄격)', desc: '읽기를 포함한 전 도구 확인' },
              { id: 'never', label: '자동 승인 (위험)', desc: '쓰기/편집 즉시 실행 (셸은 제외)' },
            ] as const
          ).map((opt) => (
            <div
              key={opt.id}
              onClick={() => setApprovalMode(opt.id)}
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                approvalMode === opt.id
                  ? 'border-primary bg-accent/30 ring-1 ring-primary/40'
                  : 'border-border hover:bg-accent/10'
              }`}
            >
              <div className="text-xs font-semibold text-foreground">{opt.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{opt.desc}</div>
            </div>
          ))}
        </div>

        {approvalMode === 'never' && (
          <div className="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-[11px] text-destructive flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>보안 주의: 셸 실행(shell)은 이 설정과 무관하게 항상 승인을 요구합니다 (§7).</span>
          </div>
        )}
      </div>

      {/* 4. Built-in Tools */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">활성 내장 도구</h3>
        </div>

        {showReadToolWarning && (
          <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>스킬 본문을 읽으려면 <code>read</code> 도구가 필요합니다 (§4.2).</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ALL_BUILTIN_TOOLS.map((tool) => {
            const isChecked = enabledBuiltinTools.includes(tool.id);
            return (
              <label
                key={tool.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleTool(tool.id)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 mt-0.5 accent-primary"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-medium text-foreground">
                      {tool.label}
                    </span>
                    {tool.risk === 'critical' && (
                      <span className="text-[9px] px-1 rounded bg-destructive/20 text-destructive font-mono uppercase font-bold">
                        critical
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{tool.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* 5. Enabled Skills */}
      {safeSkills.length > 0 && (
        <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-foreground">활성 스킬 (Agent Skills)</h3>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {enabledSkills.length} / {safeSkills.length}개 선택됨
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {safeSkills.map((skill) => {
              const isChecked = enabledSkills.includes(skill.name);
              return (
                <label
                  key={skill.name}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-sky-500/50 bg-sky-500/5'
                      : 'border-border/60 hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSkill(skill.name)}
                    className="rounded border-border text-sky-500 focus:ring-sky-500 h-3.5 w-3.5 mt-0.5 accent-sky-500"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-medium text-foreground">
                      {skill.name}
                    </span>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={isSaving}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground"
        >
          {isSaving ? (
            <RotateCcw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          <span>{mode === 'edit' ? '변경사항 저장' : '에이전트 생성'}</span>
        </Button>
      </div>
    </form>
  );
};
