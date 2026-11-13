// [US-110] Body of the screening-criteria sheet on the PMCC lens: the PMCC criteria
// document in one form. Leg filters disqualify a call, the pair filter a LEAPS +
// short combination, the IV band the underlying — the grouping on screen says so.
// `ScreeningCriteriaSheet` owns the portal and panel; this owns the form.

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type UseFormRegisterReturn, useForm } from 'react-hook-form'
import { DEFAULT_PMCC_SCREENING_CRITERIA } from '../../../main/core/pmcc-screener'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import { useSavePmccScreeningCriteria } from '../hooks/usePmccScreeningCriteria'
import {
  isPmccScreeningCriteriaField,
  PMCC_SCREENING_CRITERIA_DEPS,
  pmccScreeningCriteriaSchema,
  type PmccScreeningCriteriaField,
  toFormValues,
  toPayload,
  type PmccScreeningCriteriaFormInput,
  type PmccScreeningCriteriaFormValues
} from '../schemas/pmcc-screening-criteria'
import {
  bindCriteriaFieldErrors,
  CriteriaSheetFooter,
  CriteriaSheetHeader,
  Divider,
  EarningsHandlingField,
  NumericField,
  OptionalNumericField,
  RangeField,
  SheetGroup
} from './criteria-fields'
import { ErrorAlert } from './ui/ErrorAlert'
import { SheetBody } from './ui/Sheet'

type PmccScreeningCriteriaFormProps = {
  criteria: PmccScreeningCriteria
  watchlistCount?: number
  onClose: () => void
  /** Fired only on a successful save, so the page can confirm what `onClose` cannot distinguish. */
  onSaved?: () => void
}

export function PmccScreeningCriteriaForm({
  criteria,
  watchlistCount,
  onClose,
  onSaved
}: PmccScreeningCriteriaFormProps): React.JSX.Element {
  const { mutate, isPending } = useSavePmccScreeningCriteria()

  const { clearErrors, control, formState, handleSubmit, register, reset, setError } = useForm<
    PmccScreeningCriteriaFormInput,
    unknown,
    PmccScreeningCriteriaFormValues
  >({
    resolver: zodResolver(pmccScreeningCriteriaSchema),
    mode: 'onChange',
    defaultValues: toFormValues(criteria)
  })

  const { errors, isValid } = formState

  // Every input carries the fields its cross-field rules are bound to, so editing either
  // end of a rule re-checks the field that shows the rule's message.
  const registerField = (name: PmccScreeningCriteriaField): UseFormRegisterReturn =>
    register(name, { deps: PMCC_SCREENING_CRITERIA_DEPS[name] })

  function onSubmit(values: PmccScreeningCriteriaFormValues): void {
    clearErrors('root')
    mutate(toPayload(values), {
      // The saved document is authoritative — re-seed the form from it so a
      // re-open shows what was persisted, not what was typed.
      onSuccess: (saved) => {
        reset(toFormValues(saved))
        onSaved?.()
        onClose()
      },
      onError: (error) => bindCriteriaFieldErrors(error, setError, isPmccScreeningCriteriaField)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <CriteriaSheetHeader
        lens="PMCC · LEAPS + short call"
        watchlistCount={watchlistCount}
        onClose={onClose}
      />

      <SheetBody>
        <p className="text-[0.75rem] leading-relaxed text-wb-text-secondary">
          Leg filters disqualify a call; the pair filter disqualifies a LEAPS + short combination;
          the IV band disqualifies the underlying. Saving re-screens immediately.
        </p>

        {errors.root?.message && <ErrorAlert message={errors.root.message} />}

        <SheetGroup label="LEAPS (long call)">
          <RangeField
            label="Delta band"
            caption="Deep in the money: the LEAPS stands in for shares."
            unit="Δ"
            error={errors.longDeltaMin?.message ?? errors.longDeltaMax?.message}
            minLabel="LEAPS minimum delta"
            maxLabel="LEAPS maximum delta"
            minRegistration={registerField('longDeltaMin')}
            maxRegistration={registerField('longDeltaMax')}
          />
          <RangeField
            label="DTE window"
            caption="Long enough that the LEAPS outlives several short cycles."
            unit="days"
            error={errors.longDteMin?.message ?? errors.longDteMax?.message}
            minLabel="LEAPS minimum DTE"
            maxLabel="LEAPS maximum DTE"
            minRegistration={registerField('longDteMin')}
            maxRegistration={registerField('longDteMax')}
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Short call">
          <RangeField
            label="Delta band"
            caption="Assignment-probability band for the call you sell."
            unit="Δ"
            error={errors.shortDeltaMin?.message ?? errors.shortDeltaMax?.message}
            minLabel="Short-call minimum delta"
            maxLabel="Short-call maximum delta"
            minRegistration={registerField('shortDeltaMin')}
            maxRegistration={registerField('shortDeltaMax')}
          />
          <RangeField
            label="DTE window"
            caption="Days to expiration for the income leg."
            unit="days"
            error={errors.shortDteMin?.message ?? errors.shortDteMax?.message}
            minLabel="Short-call minimum DTE"
            maxLabel="Short-call maximum DTE"
            minRegistration={registerField('shortDteMin')}
            maxRegistration={registerField('shortDteMax')}
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Spread efficiency (pair)">
          <NumericField
            label="Max debit / strike width"
            ariaLabel="Max debit / width"
            caption="Net debit (LEAPS mark − short mark) as a share of strike width. Under 100% the width covers the debit if the short is assigned; 75% is the common comfort guideline."
            error={errors.maxDebitToWidthPercent?.message}
            registration={registerField('maxDebitToWidthPercent')}
            suffix="%"
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Liquidity (per leg)">
          <NumericField
            label="Minimum open interest"
            caption="Applied to the LEAPS and the short call separately. LEAPS books are thin — 200 is a floor, not a target."
            error={errors.minOpenInterest?.message}
            registration={registerField('minOpenInterest')}
          />
          <NumericField
            label="Max bid-ask spread"
            caption="of each leg's mark; a tight absolute spread (≤ $0.10) also passes."
            error={errors.maxSpreadPercent?.message}
            registration={registerField('maxSpreadPercent')}
            suffix="%"
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="IV environment (optional)">
          <Controller
            control={control}
            name="ivRankFloorEnabled"
            rules={{ deps: PMCC_SCREENING_CRITERIA_DEPS.ivRankFloorEnabled }}
            render={({ field }) => (
              <OptionalNumericField
                label="IV-rank floor"
                caption="Off by default. A floor keeps the short credit worth selling."
                error={errors.minIvRank?.message}
                enabled={field.value}
                onToggle={field.onChange}
                offTestId="iv-rank-floor-off"
                onTestId="iv-rank-floor-on"
                registration={registerField('minIvRank')}
                suffix="IVR"
              />
            )}
          />
          <Controller
            control={control}
            name="ivRankCeilingEnabled"
            rules={{ deps: PMCC_SCREENING_CRITERIA_DEPS.ivRankCeilingEnabled }}
            render={({ field }) => (
              <OptionalNumericField
                label="IV-rank ceiling"
                caption="Off by default. A ceiling keeps you from buying the LEAPS while its extrinsic is inflated."
                error={errors.maxIvRank?.message}
                enabled={field.value}
                onToggle={field.onChange}
                offTestId="iv-rank-ceiling-off"
                onTestId="iv-rank-ceiling-on"
                registration={registerField('maxIvRank')}
                suffix="IVR"
              />
            )}
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Policy">
          <Controller
            control={control}
            name="earningsHandling"
            render={({ field }) => (
              <EarningsHandlingField
                caption="Judged against the short call's expiration. Exclude drops the pair; Flag keeps it with a warning and no rank."
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SheetGroup>
      </SheetBody>

      <CriteriaSheetFooter
        isValid={isValid}
        isPending={isPending}
        onCancel={onClose}
        onReset={() => reset(toFormValues(DEFAULT_PMCC_SCREENING_CRITERIA))}
      />
    </form>
  )
}
