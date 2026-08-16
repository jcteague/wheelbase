// [US-67] Body of the screening-criteria sheet: the whole editable criteria
// document in one form. Filters and the liquidity gate disqualify a strike; the
// ranking inputs only order what survives — the grouping on screen says so.
// `ScreeningCriteriaSheet` owns the portal and panel; this owns the form.

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { DEFAULT_SCREENING_CRITERIA } from '../../../main/core/screener'
import type { ApiError, IpcFieldError } from '../api/error'
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
import { ErrorAlert } from './ui/ErrorAlert'
import { FormButton } from './ui/FormButton'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'

const GENERIC_SAVE_ERROR = 'Could not save the screening criteria — please try again.'

type ScreeningCriteriaFormProps = {
  criteria: ScreeningCriteria
  watchlistCount?: number
  onClose: () => void
  /** Fired only on a successful save, so the page can confirm what `onClose` cannot distinguish. */
  onSaved?: () => void
}

function Divider(): React.JSX.Element {
  return <div className="h-px bg-wb-border-subtle" />
}

function SheetGroup({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="font-wb-mono text-[0.62rem] uppercase tracking-[0.12em] text-wb-text-muted">
        {label}
      </div>
      {children}
    </div>
  )
}

function SheetField({
  label,
  caption,
  error,
  children
}: {
  label: string
  caption: string
  error?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="text-[0.8125rem] font-semibold text-wb-text-primary">{label}</div>
      <div className="mt-1 text-[0.7rem] leading-relaxed text-wb-text-muted">{caption}</div>
      <div className="mt-2.5">{children}</div>
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-wb-red">
          <span className="font-wb-mono font-bold">!</span>
          {error}
        </div>
      )}
    </div>
  )
}

type SegmentOption<T> = { value: T; label: string; testId: string }

function Segment<T extends string | boolean>({
  options,
  value,
  onChange
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-wb-border bg-wb-bg-elevated p-[3px]">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.testId}
            type="button"
            data-testid={option.testId}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              'cursor-pointer rounded-full border-none px-3 py-1 font-wb-mono text-[0.72rem]',
              active
                ? 'bg-wb-gold-dim font-bold text-wb-gold'
                : 'bg-transparent text-wb-text-secondary'
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function NumericInput({
  ariaLabel,
  registration,
  widthClass,
  hasError = false,
  disabled = false,
  prefix,
  suffix
}: {
  ariaLabel: string
  registration: UseFormRegisterReturn
  widthClass: string
  hasError?: boolean
  disabled?: boolean
  prefix?: string
  suffix?: string
}): React.JSX.Element {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5',
        widthClass,
        hasError ? 'border-wb-red' : 'border-wb-border',
        disabled ? 'bg-wb-bg-surface opacity-50' : 'bg-wb-bg-base'
      ].join(' ')}
    >
      {prefix && <span className="font-wb-mono text-[0.8rem] text-wb-text-muted">{prefix}</span>}
      <input
        type="text"
        aria-label={ariaLabel}
        className="w-full min-w-0 flex-1 border-none bg-transparent font-wb-mono text-[0.85rem] text-wb-text-primary outline-none"
        {...registration}
        disabled={disabled}
      />
      {suffix && <span className="font-wb-mono text-[0.78rem] text-wb-text-muted">{suffix}</span>}
    </span>
  )
}

/** A min–max band: two inputs, an en-dash, and the band's unit. */
function RangeField({
  label,
  caption,
  unit,
  error,
  minLabel,
  maxLabel,
  minRegistration,
  maxRegistration
}: {
  label: string
  caption: string
  unit: string
  error?: string
  minLabel: string
  maxLabel: string
  minRegistration: UseFormRegisterReturn
  maxRegistration: UseFormRegisterReturn
}): React.JSX.Element {
  return (
    <SheetField label={label} caption={caption} error={error}>
      <div className="flex items-center gap-2">
        <NumericInput
          ariaLabel={minLabel}
          registration={minRegistration}
          widthClass="w-[86px]"
          hasError={Boolean(error)}
        />
        <span className="text-wb-text-muted">–</span>
        <NumericInput
          ariaLabel={maxLabel}
          registration={maxRegistration}
          widthClass="w-[86px]"
          hasError={Boolean(error)}
        />
        <span className="text-[0.72rem] text-wb-text-muted">{unit}</span>
      </div>
    </SheetField>
  )
}

/** An Off/On segment gating a single numeric input — the shape both optionals take. */
function OptionalNumericField({
  label,
  caption,
  error,
  enabled,
  onToggle,
  offTestId,
  onTestId,
  registration,
  prefix,
  suffix
}: {
  label: string
  caption: string
  error?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  offTestId: string
  onTestId: string
  registration: UseFormRegisterReturn
  prefix?: string
  suffix?: string
}): React.JSX.Element {
  return (
    <SheetField label={label} caption={caption} error={error}>
      <div className="flex items-center gap-3">
        <Segment
          value={enabled}
          onChange={onToggle}
          options={[
            { value: false, label: 'Off', testId: offTestId },
            { value: true, label: 'On', testId: onTestId }
          ]}
        />
        <NumericInput
          ariaLabel={label}
          registration={registration}
          widthClass="w-[104px]"
          hasError={Boolean(error)}
          disabled={!enabled}
          prefix={prefix}
          suffix={suffix}
        />
      </div>
    </SheetField>
  )
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

  // Errors naming a field the sheet renders bind inline to that input. Anything
  // else — a `__root__` internal error, a payload field with no input of its
  // own, a malformed envelope — becomes a form-level alert, so a failed save is
  // never silent and the trader isn't left re-clicking Save with no feedback.
  function bindFieldErrors(error: ApiError): void {
    const detail = (error.body as { detail?: IpcFieldError[] } | null | undefined)?.detail ?? []
    const bindable = detail.flatMap(({ field, message }) =>
      isScreeningCriteriaField(field) ? [{ field, message }] : []
    )

    bindable.forEach(({ field, message }) => setError(field, { type: 'server', message }))

    const unbindable = detail.find(({ field }) => !isScreeningCriteriaField(field))
    if (unbindable) setError('root', { type: 'server', message: unbindable.message })
    else if (bindable.length === 0)
      setError('root', { type: 'server', message: GENERIC_SAVE_ERROR })
  }

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
      onError: bindFieldErrors
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader
        eyebrow="Screener"
        title="Screening Criteria"
        subtitle={
          watchlistCount === undefined
            ? 'Classic Wheel · CSP'
            : `Applies to all ${watchlistCount} watchlist tickers · Classic Wheel · CSP`
        }
        onClose={onClose}
        eyebrowColor="var(--wb-gold)"
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
          <SheetField
            label="Minimum open interest"
            caption="Contracts you can reliably enter and exit."
            error={errors.minOpenInterest?.message}
          >
            <NumericInput
              ariaLabel="Minimum open interest"
              registration={register('minOpenInterest')}
              widthClass="w-[104px]"
              hasError={Boolean(errors.minOpenInterest)}
            />
          </SheetField>

          <SheetField
            label="Max bid-ask spread"
            caption="of mark; a tight absolute spread (≤ $0.10) also passes."
            error={errors.maxSpreadPercent?.message}
          >
            <NumericInput
              ariaLabel="Max bid-ask spread"
              registration={register('maxSpreadPercent')}
              widthClass="w-[104px]"
              hasError={Boolean(errors.maxSpreadPercent)}
              suffix="%"
            />
          </SheetField>
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
          <SheetField
            label="Earnings handling"
            caption="Exclude drops candidates with earnings on/before expiry; Flag keeps them with a warning."
          >
            <Controller
              control={control}
              name="earningsHandling"
              render={({ field }) => (
                <Segment
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'exclude', label: 'Exclude', testId: 'earnings-exclude' },
                    { value: 'flag', label: 'Flag only', testId: 'earnings-flag' }
                  ]}
                />
              )}
            />
          </SheetField>
        </SheetGroup>
      </SheetBody>

      <SheetFooter>
        <FormButton
          label="Save & re-screen"
          pendingLabel="Saving..."
          isPending={isPending}
          disabled={!isValid}
        />
        <FormButton label="Cancel" variant="secondary" onClick={onClose} />
        {isValid ? (
          <button
            type="button"
            onClick={() => reset(toFormValues(DEFAULT_SCREENING_CRITERIA))}
            className="ml-auto cursor-pointer border-none bg-transparent font-wb-mono text-[0.7rem] text-wb-text-muted underline"
          >
            Reset to defaults
          </button>
        ) : (
          <span className="ml-auto text-[0.7rem] text-wb-text-muted">
            Fix the highlighted fields.
          </span>
        )}
      </SheetFooter>
    </form>
  )
}
