// [US-67] Body of the screening-criteria sheet: the whole editable criteria
// document in one form. Filters and the liquidity gate disqualify a strike; the
// ranking inputs only order what survives — the grouping on screen says so.
// `ScreeningCriteriaSheet` owns the portal and panel; this owns the form.

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { DEFAULT_SCREENING_CRITERIA } from '../../../main/core/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { useSaveScreeningCriteria } from '../hooks/useScreeningCriteria'
import {
  isScreeningCriteriaField,
  screeningCriteriaSchema,
  toFormValues,
  toPayload,
  type ScreeningCriteriaFormInput,
  type ScreeningCriteriaFormValues
} from '../schemas/screening-criteria'
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

type ScreeningCriteriaFormProps = {
  criteria: ScreeningCriteria
  watchlistCount?: number
  onClose: () => void
  /** Fired only on a successful save, so the page can confirm what `onClose` cannot distinguish. */
  onSaved?: () => void
}

export function ScreeningCriteriaForm({
  criteria,
  watchlistCount,
  onClose,
  onSaved
}: ScreeningCriteriaFormProps): React.JSX.Element {
  const { mutate, isPending } = useSaveScreeningCriteria()

  const { clearErrors, control, formState, handleSubmit, register, reset, setError } = useForm<
    ScreeningCriteriaFormInput,
    unknown,
    ScreeningCriteriaFormValues
  >({
    resolver: zodResolver(screeningCriteriaSchema),
    mode: 'onChange',
    defaultValues: toFormValues(criteria)
  })

  const { errors, isValid } = formState

  function onSubmit(values: ScreeningCriteriaFormValues): void {
    clearErrors('root')
    mutate(toPayload(values), {
      // The saved document is authoritative — re-seed the form from it so a
      // re-open shows what was persisted, not what was typed.
      onSuccess: (saved) => {
        reset(toFormValues(saved))
        onSaved?.()
        onClose()
      },
      onError: (error) => bindCriteriaFieldErrors(error, setError, isScreeningCriteriaField)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <CriteriaSheetHeader
        lens="Classic Wheel · CSP"
        watchlistCount={watchlistCount}
        onClose={onClose}
      />

      <SheetBody>
        <p className="text-[0.75rem] leading-relaxed text-wb-text-secondary">
          Filters disqualify a strike; ranking inputs order what survives. Saving re-screens
          immediately.
        </p>

        {errors.root?.message && <ErrorAlert message={errors.root.message} />}

        <SheetGroup label="Filters (hard)">
          <RangeField
            label="Delta band"
            caption="Assignment-probability band for the short put."
            unit="Δ"
            error={errors.deltaMin?.message ?? errors.deltaMax?.message}
            minLabel="Minimum delta"
            maxLabel="Maximum delta"
            minRegistration={register('deltaMin')}
            maxRegistration={register('deltaMax')}
          />

          <RangeField
            label="DTE window"
            caption="Days to expiration to include."
            unit="days"
            error={errors.dteMin?.message ?? errors.dteMax?.message}
            minLabel="Minimum DTE"
            maxLabel="Maximum DTE"
            minRegistration={register('dteMin')}
            maxRegistration={register('dteMax')}
          />

          <Controller
            control={control}
            name="priceCeilingEnabled"
            render={({ field }) => (
              <OptionalNumericField
                label="Price ceiling"
                caption="Off by default — an optional per-account buying-power limit. On by default would silently hide large-cap names."
                error={errors.maxUnderlyingPrice?.message}
                enabled={field.value}
                onToggle={field.onChange}
                offTestId="price-ceiling-off"
                onTestId="price-ceiling-on"
                registration={register('maxUnderlyingPrice')}
                prefix="$"
              />
            )}
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Liquidity (hard gate)">
          <NumericField
            label="Minimum open interest"
            caption="Contracts you can reliably enter and exit."
            error={errors.minOpenInterest?.message}
            registration={register('minOpenInterest')}
          />

          <NumericField
            label="Max bid-ask spread"
            caption="of mark; a tight absolute spread (≤ $0.10) also passes."
            error={errors.maxSpreadPercent?.message}
            registration={register('maxSpreadPercent')}
            suffix="%"
          />
        </SheetGroup>

        <Divider />

        <SheetGroup label="Ranking inputs (soft)">
          <Controller
            control={control}
            name="ivRankFloorEnabled"
            render={({ field }) => (
              <OptionalNumericField
                label="IV-rank floor"
                caption="Off by default so a low-vol market doesn't empty results."
                error={errors.minIvRank?.message}
                enabled={field.value}
                onToggle={field.onChange}
                offTestId="iv-rank-floor-off"
                onTestId="iv-rank-floor-on"
                registration={register('minIvRank')}
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
                caption="Exclude drops candidates with earnings on/before expiry; Flag keeps them with a warning."
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
        onReset={() => reset(toFormValues(DEFAULT_SCREENING_CRITERIA))}
      />
    </form>
  )
}
