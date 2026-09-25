import { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CATEGORY_META } from '@/lib/eval/constants';
import type { LoadedPackRef } from '@/lib/eval/packs/packLoader';
import type { EvalCategoryId, EvalProfile, PackScope, TierName } from '@/lib/eval/types';
import { isZeroWeightCategory, type WizardPackSelection } from './buildRunConfig';

interface StepPacksProps {
  packs: LoadedPackRef[];
  errors: Array<{ scope: PackScope; packId: string; error: string }>;
  selections: WizardPackSelection[];
  profile: EvalProfile;
  onChange: (selections: WizardPackSelection[]) => void;
}

const TIERS: TierName[] = ['smoke', 'standard', 'full'];

function selKey(scope: PackScope, packId: string): string {
  return `${scope}:${packId}`;
}

export function StepPacks({ packs, errors, selections, profile, onChange }: StepPacksProps) {
  const { t, locale } = useLanguage();
  const byKey = useMemo(() => new Map(selections.map((s) => [selKey(s.scope, s.packId), s])), [selections]);

  function toggle(ref: LoadedPackRef): void {
    const key = selKey(ref.scope, ref.manifest.id);
    if (byKey.has(key)) {
      onChange(selections.filter((s) => selKey(s.scope, s.packId) !== key));
    } else {
      onChange([...selections, { scope: ref.scope, packId: ref.manifest.id, tier: 'smoke', epochs: ref.manifest.defaults.epochs, circular: ref.manifest.defaults.circular }]);
    }
  }

  function patch(ref: LoadedPackRef, p: Partial<WizardPackSelection>): void {
    const key = selKey(ref.scope, ref.manifest.id);
    onChange(selections.map((s) => (selKey(s.scope, s.packId) === key ? { ...s, ...p } : s)));
  }

  function applyPreset(tier: TierName): void {
    onChange(packs.map((r) => {
      const prev = byKey.get(selKey(r.scope, r.manifest.id));
      return prev ? { ...prev, tier } : { scope: r.scope, packId: r.manifest.id, tier, epochs: r.manifest.defaults.epochs, circular: r.manifest.defaults.circular };
    }));
  }

  const groups = useMemo(() => {
    const map = new Map<EvalCategoryId, LoadedPackRef[]>();
    for (const r of packs) {
      const arr = map.get(r.manifest.category) ?? [];
      arr.push(r);
      map.set(r.manifest.category, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [packs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('eval.wizard.packs.select')}</h3>
          <p className="text-xs text-muted-foreground">{t('eval.wizard.packs.desc')}</p>
        </div>
        <div className="ml-auto flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('smoke')}>{t('eval.wizard.packs.presetSmoke')}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('standard')}>{t('eval.wizard.packs.presetStandard')}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('full')}>{t('eval.wizard.packs.presetFull')}</Button>
        </div>
      </div>
      {packs.length === 0 && <div className="text-xs text-muted-foreground">{t('eval.wizard.packs.none')}</div>}
      {errors.map((e, i) => (
        <div key={i} className="text-xs text-destructive">
          {t('eval.wizard.packs.loadError', { err: `${e.scope}/${e.packId}: ${e.error}` })}
        </div>
      ))}
      {groups.map(([cat, refs]) => (
        <div key={cat} className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground">
            {cat} · {t(CATEGORY_META[cat].labelKey)}
          </div>
          {refs.map((ref) => {
            const m = ref.manifest;
            const sel = byKey.get(selKey(ref.scope, m.id));
            const dimmed = isZeroWeightCategory(profile, m.category);
            const tierCount = m.tiers[sel?.tier ?? 'smoke'];
            return (
              <div
                key={`${ref.scope}:${m.id}`}
                className={`rounded-lg border p-2.5 text-xs ${sel ? 'border-primary bg-primary/5' : 'border-border'} ${dimmed ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!sel} onChange={() => toggle(ref)} aria-label={m.id} />
                  <span className="font-mono font-semibold">{m.id}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{ref.scope}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{m.kind}</span>
                  {dimmed && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t('eval.wizard.packs.zeroWeight')}</span>}
                  <span className="ml-auto text-muted-foreground">{locale === 'ko' ? m.title.ko : m.title.en}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  license: {m.license.id}
                  {ref.diagnostics.length > 0 && ` · ⚠ ${ref.diagnostics[0].message}`}
                </div>
                {sel && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1">
                      {t('eval.wizard.packs.tier')}
                      <select
                        value={sel.tier}
                        onChange={(e) => patch(ref, { tier: e.target.value as TierName })}
                        className="h-7 rounded border border-input bg-background px-1"
                      >
                        {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      {t('eval.wizard.packs.epochs')}
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={sel.epochs}
                        onChange={(e) => patch(ref, { epochs: Math.max(1, Number(e.target.value)) })}
                        className="h-7 w-16"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={sel.circular} onChange={(e) => patch(ref, { circular: e.target.checked })} />
                      {t('eval.wizard.packs.circular')}
                    </label>
                    <span className="text-muted-foreground">
                      {t('eval.wizard.packs.samples', { n: tierCount === 'all' ? '∞' : tierCount })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {selections.length === 0 && <div className="text-xs text-destructive">{t('eval.wizard.packs.requireSelect')}</div>}
    </div>
  );
}
