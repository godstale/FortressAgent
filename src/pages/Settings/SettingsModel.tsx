// TODO(Phase2): wire to Ollama client & SettingsContext
// TODO(Phase4): persist to SQLite app_settings

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Cpu, RefreshCw, CheckCircle2 } from 'lucide-react';

export function SettingsModel() {
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://127.0.0.1:11434');
  const [defaultModel, setDefaultModel] = useState('qwen3.5:9b');
  const [contextSize, setContextSize] = useState('8192');
  const [reserveTokens, setReserveTokens] = useState('2048');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">모델 및 LLM 설정</h2>
        <p className="text-xs text-muted-foreground mt-1">
          로컬 Ollama 서비스 연결 및 기본 추론 파라미터를 설정합니다.
        </p>
      </div>

      {/* Ollama Endpoint */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-primary" />
              Ollama API 주소
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              로컬 또는 원격 Ollama 인스턴스 HTTP 엔드포인트입니다.
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs text-success font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            연결됨
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            value={ollamaEndpoint}
            onChange={(e) => setOllamaEndpoint(e.target.value)}
            className="text-xs font-mono"
          />
          <Button variant="outline" size="sm" className="text-xs shrink-0 flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            연결 테스트
          </Button>
        </div>
      </div>

      {/* Default Model */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">기본 에이전트 모델</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            새 대화 시작 시 기본 적용될 Ollama 모델 태그입니다.
          </p>
        </div>
        <Input
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          className="text-xs font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          권장 모델: <code>qwen3.5:9b</code>, <code>granite4.1:8b</code>, <code>gemma4:12b</code>
        </p>
      </div>

      {/* Context Size & Compaction Thresholds */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">컨텍스트 및 압축 임계값</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            에이전트가 기억할 컨텍스트 윈도우 크기와 자동 압축 트리거 토큰입니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">컨텍스트 크기 (Context Size, 토큰)</label>
            <Input
              type="number"
              value={contextSize}
              onChange={(e) => setContextSize(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">압축 예비 토큰 (Reserve Tokens)</label>
            <Input
              type="number"
              value={reserveTokens}
              onChange={(e) => setReserveTokens(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModel;
