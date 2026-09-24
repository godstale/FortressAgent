// TODO(Phase2): wire to Ollama client & SettingsContext
// TODO(Phase4): persist to SQLite app_settings

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Cpu, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function SettingsModel() {
  const { t } = useLanguage();
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://127.0.0.1:11434');
  const [defaultModel, setDefaultModel] = useState('qwen3.5:9b');
  const [contextSize, setContextSize] = useState('8192');
  const [reserveTokens, setReserveTokens] = useState('2048');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">{t('settingsModel.title')}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {t('settingsModel.desc')}
        </p>
      </div>

      {/* Ollama Endpoint */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-primary" />
              {t('settingsModel.apiUrl')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settingsModel.apiUrlDesc')}
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs text-success font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('settingsModel.connected')}
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
            {t('settingsModel.test')}
          </Button>
        </div>
      </div>

      {/* Default Model */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{t('settingsModel.defaultModel')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('settingsModel.defaultModelDesc')}
          </p>
        </div>
        <Input
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          className="text-xs font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          {t('settingsModel.recommended')} <code>qwen3.5:9b</code>, <code>granite4.1:8b</code>, <code>gemma4:12b</code>
        </p>
      </div>

      {/* Context Size & Compaction Thresholds */}
      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">{t('settingsModel.context')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('settingsModel.contextDesc')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t('settingsModel.contextSize')}</label>
            <Input
              type="number"
              value={contextSize}
              onChange={(e) => setContextSize(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t('settingsModel.reserve')}</label>
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
