// [US-110] The field primitives both screening-criteria forms compose — the wheel's
// US-67 sheet and the PMCC lens's — so the two sheets stay class-for-class identical.

import type {
  FieldPath,
  FieldValues,
  UseFormRegisterReturn,
  UseFormSetError
} from 'react-hook-form'
import type { EarningsHandling } from '../../../main/core/screener'
import type { ApiError, IpcFieldError } from '../api/error'
import { FormButton } from './ui/FormButton'
import { SheetFooter, SheetHeader } from './ui/Sheet'

const GENERIC_SAVE_ERROR = 'Could not save the screening criteria — please try again.'

export function Divider(): React.JSX.Element {
  return <div className="h-px bg-wb-border-subtle" />
}

export function SheetGroup({
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

export function SheetField({
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

export type SegmentOption<T> = { value: T; label: string; testId: string }

export function Segment<T extends string | boolean>({
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

export function NumericInput({
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
export function RangeField({
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
export function OptionalNumericField({
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

/** A single labelled numeric input. `ariaLabel` defaults to the visible label. */
export function NumericField({
  label,
  ariaLabel = label,
  caption,
  error,
  registration,
  suffix
}: {
  label: string
  ariaLabel?: string
  caption: string
  error?: string
  registration: UseFormRegisterReturn
  suffix?: string
}): React.JSX.Element {
  return (
    <SheetField label={label} caption={caption} error={error}>
      <NumericInput
        ariaLabel={ariaLabel}
        registration={registration}
        widthClass="w-[104px]"
        hasError={Boolean(error)}
        suffix={suffix}
      />
    </SheetField>
  )
}

/** The policy segment both strategies share; only the caption differs per lens. */
export function EarningsHandlingField({
  caption,
  value,
  onChange
}: {
  caption: string
  value: EarningsHandling
  onChange: (value: EarningsHandling) => void
}): React.JSX.Element {
  return (
    <SheetField label="Earnings handling" caption={caption}>
      <Segment
        value={value}
        onChange={onChange}
        options={[
          { value: 'exclude', label: 'Exclude', testId: 'earnings-exclude' },
          { value: 'flag', label: 'Flag only', testId: 'earnings-flag' }
        ]}
      />
    </SheetField>
  )
}

/** The sheet header, naming the strategy lens and — when known — the watchlist size. */
export function CriteriaSheetHeader({
  lens,
  watchlistCount,
  onClose
}: {
  lens: string
  watchlistCount?: number
  onClose: () => void
}): React.JSX.Element {
  return (
    <SheetHeader
      eyebrow="Screener"
      title="Screening Criteria"
      subtitle={
        watchlistCount === undefined
          ? lens
          : `Applies to all ${watchlistCount} watchlist tickers · ${lens}`
      }
      onClose={onClose}
      eyebrowColor="var(--wb-gold)"
    />
  )
}

/** Save, Cancel, and — only while the form is valid — the reset link. */
export function CriteriaSheetFooter({
  isValid,
  isPending,
  onCancel,
  onReset
}: {
  isValid: boolean
  isPending: boolean
  onCancel: () => void
  onReset: () => void
}): React.JSX.Element {
  return (
    <SheetFooter>
      <FormButton
        label="Save & re-screen"
        pendingLabel="Saving..."
        isPending={isPending}
        disabled={!isValid}
      />
      <FormButton label="Cancel" variant="secondary" onClick={onCancel} />
      {isValid ? (
        <button
          type="button"
          onClick={onReset}
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
  )
}

/**
 * Binds a failed save's field errors to the form. Errors naming a field the sheet
 * renders (`isField`) bind inline to that input. Anything else — a `__root__`
 * internal error, a payload field with no input of its own, a malformed envelope —
 * becomes a form-level alert, so a failed save is never silent and the trader isn't
 * left re-clicking Save with no feedback.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the save path both forms share, kept beside the footer it feeds
export function bindCriteriaFieldErrors<
  TValues extends FieldValues,
  TField extends FieldPath<TValues>
>(
  error: ApiError,
  setError: UseFormSetError<TValues>,
  isField: (field: string) => field is TField
): void {
  const detail = (error.body as { detail?: IpcFieldError[] } | null | undefined)?.detail ?? []
  const bindable = detail.flatMap(({ field, message }) =>
    isField(field) ? [{ field, message }] : []
  )

  bindable.forEach(({ field, message }) => setError(field, { type: 'server', message }))

  const unbindable = detail.find(({ field }) => !isField(field))
  if (unbindable) setError('root', { type: 'server', message: unbindable.message })
  else if (bindable.length === 0) setError('root', { type: 'server', message: GENERIC_SAVE_ERROR })
}
