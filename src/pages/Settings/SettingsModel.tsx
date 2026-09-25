// TODO(Phase4): persist to SQLite app_settings

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function SettingsModel() {
  const { t } = useLanguage();
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
