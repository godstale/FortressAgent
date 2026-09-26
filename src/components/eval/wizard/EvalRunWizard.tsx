import { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { useEval } from '@/lib/context/EvalContext';
import { BUILTIN_PROFILES, DEFAULT_RUN_OPTIONS } from '@/lib/eval/constants';
import type { CandidateSnapshot, EvalProfile, JudgeConfig } from '@/lib/eval/types';
import { StepProfile } from './StepProfile';
import { StepPacks } from './StepPacks';
import { StepCandidates, type QuantCompare } from './StepCandidates';
import { StepReview } from './StepReview';
import { needsJudge, type WizardDraft, type WizardPackSelection, type WizardRunOptions } from './buildRunConfig';

const STEPS = [0, 1, 2, 3] as const;

function cloneProfile(p: EvalProfile): EvalProfile {
  return JSON.parse(JSON.stringify(p)) as EvalProfile;
}

export function EvalRunWizard() {
  const { t } = useLanguage();
  const { packs, profiles } = useEval();
  const [step, setStep] = useState(0);
  const [extraProfiles, setExtraProfiles] = useState<EvalProfile[]>([]);
  const [profileId, setProfileId] = useState(BUILTIN_PROFILES[0].id);
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    runName: `eval-${new Date().toISOString().slice(0, 10)}`,
    profile: cloneProfile(BUILTIN_PROFILES[0]),
    packSelections: [],
    candidates: [],
    judge: null,
    options: {
      deterministicMode: DEFAULT_RUN_OPTIONS.deterministicMode,
      reliabilityEpochs: DEFAULT_RUN_OPTIONS.reliabilityEpochs,
      timeoutMultiplier: DEFAULT_RUN_OPTIONS.timeoutMultiplier,
      perfRepeats: DEFAULT_RUN_OPTIONS.perfRepeats,
      unloadBetweenCandidates: DEFAULT_RUN_OPTIONS.unloadBetweenCandidates,
    },
    sampleOrderSeed: 42,
    weightsConfirmedAt: '',
    externalTransfers: [],
    externalConfirmedAt: null,
    codeExecution: null,
    proceedWithoutExternal: false,
  }));
  const [quant, setQuant] = useState<QuantCompare>({ enabled: false, baseIndex: 0 });

  const allProfiles = useMemo(() => [...profiles, ...extraProfiles.filter((e) => !profiles.some((p) => p.id === e.id))], [profiles, extraProfiles]);

  function patch(p: Partial<WizardDraft>): void {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  function selectProfile(id: string): void {
    const found = allProfiles.find((p) => p.id === id);
    if (!found) return;
    setProfileId(id);
    patch({ profile: cloneProfile(found), weightsConfirmedAt: '' });
  }

  function saveCustomProfile(p: EvalProfile): void {
    setExtraProfiles((prev) => [...prev.filter((x) => x.id !== p.id), p]);
    setProfileId(p.id);
    patch({ profile: cloneProfile(p), weightsConfirmedAt: '' });
  }

  const selectedRefs = useMemo(() => {
    const byKey = new Map(packs.map((r) => [`${r.scope}:${r.manifest.id}`, r]));
    return draft.packSelections
      .map((s) => byKey.get(`${s.scope}:${s.packId}`))
      .filter((r): r is (typeof packs)[number] => r !== undefined);
  }, [packs, draft.packSelections]);

  const judgeRequired = useMemo(
    () => needsJudge(selectedRefs.map((r) => r.manifest)),
    [selectedRefs],
  );

  const canNext =
    (step === 0 || (step === 1 && draft.packSelections.length > 0) ||
      (step === 2 && draft.candidates.length > 0 && (!judgeRequired || draft.judge !== null))) &&
    step < 3;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h2 className="text-base font-semibold">{t('eval.wizard.title')}</h2>
      <ol className="flex gap-1 text-xs">
        {STEPS.map((s) => (
          <li key={s} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => setStep(s)}
              className={`flex-1 rounded px-2 py-1.5 text-center ${s === step ? 'bg-primary text-primary-foreground' : s < step ? 'bg-primary/15' : 'bg-muted text-muted-foreground'}`}
            >
              {t(`eval.wizard.step.${['profile', 'packs', 'candidates', 'review'][s]}`)}
            </button>
          </li>
        ))}
      </ol>
      <div className="text-[11px] text-muted-foreground">{t('eval.wizard.stepOf', { a: step + 1, b: 4 })}</div>

      {step === 0 && (
        <StepProfile
          profiles={allProfiles}
          selectedId={profileId}
          profile={draft.profile}
          onSelect={selectProfile}
          onSaveCustom={saveCustomProfile}
        />
      )}
      {step === 1 && (
        <StepPacks
          packs={packs}
          errors={[]}
          selections={draft.packSelections}
          profile={draft.profile}
          onChange={(packSelections: WizardPackSelection[]) => patch({ packSelections })}
        />
      )}
      {step === 2 && (
        <StepCandidates
          candidates={draft.candidates}
          onChange={(candidates: CandidateSnapshot[]) => patch({ candidates })}
          judge={draft.judge}
          onJudgeChange={(judge: JudgeConfig | null) => patch({ judge })}
          judgeRequired={judgeRequired}
          packManifests={selectedRefs.map((r) => r.manifest)}
          options={draft.options}
          onOptionsChange={(options: WizardRunOptions) => patch({ options })}
          sampleOrderSeed={draft.sampleOrderSeed}
          onSeedChange={(sampleOrderSeed: number) => patch({ sampleOrderSeed })}
          quant={quant}
          onQuantChange={setQuant}
        />
      )}
      {step === 3 && (
        <StepReview draft={draft} onUpdate={patch} refs={selectedRefs} onProfileSaved={saveCustomProfile} />
      )}

      {step < 3 && (
        <div className="flex justify-between">
          <Button type="button" size="sm" variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            {t('eval.wizard.prev')}
          </Button>
          <Button type="button" size="sm" disabled={!canNext} onClick={() => setStep((s) => Math.min(3, s + 1))}>
            {t('eval.wizard.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default EvalRunWizard;
