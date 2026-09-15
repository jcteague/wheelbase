import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'
import type { z } from 'zod'

import { watchlistEntrySchema, type WatchlistEntryFormValues } from '@/schemas/watchlist'
import type { ApiError, WatchlistEntry, WatchlistEntryPayload } from '../api/watchlist'
import type { IpcFieldError } from '../api/error'
import { useAddToWatchlist } from '../hooks/useAddToWatchlist'
import { useUpdateWatchlistEntry } from '../hooks/useUpdateWatchlistEntry'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { ErrorAlert } from './ui/ErrorAlert'

const IVR_PRESETS = [30, 50, 70] as const
const THESIS_MAX_LENGTH = 500
const GENERIC_ADD_ERROR = 'Could not add the ticker — please try again.'
const GENERIC_EDIT_ERROR = 'Could not save the changes — please try again.'

// The schema's `.default(false)` booleans make its input type (form values) differ
// from its output type (submitted values), so type the form with both.
type WatchlistFormInput = z.input<typeof watchlistEntrySchema>

type ChipButtonProps = {
  label: string
  active: boolean
  onClick: () => void
}

function ChipButton({ label, active, onClick }: ChipButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        'inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-full font-wb-mono text-xs border cursor-pointer',
        active
          ? 'border-wb-gold-border bg-wb-gold-dim text-wb-gold font-bold'
          : 'border-wb-border text-wb-text-secondary'
      )}
    >
      <span className="opacity-70">{active ? '✓' : '+'}</span>
      {label}
    </button>
  )
}

type ConditionRowProps = {
  label: string
  error?: string
  onRemove: () => void
  children: React.ReactNode
}

function ConditionRow({ label, error, onRemove, children }: ConditionRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[10px] flex-wrap p-[8px] rounded-md border border-wb-gold-border bg-wb-gold-dim">
      <span className="font-wb-mono text-xs font-bold text-wb-gold">{label}</span>
      {children}
      <button
        type="button"
        title="Remove condition"
        onClick={onRemove}
        className="ml-auto w-[22px] h-[22px] rounded-md border border-wb-gold-border bg-transparent text-wb-gold font-wb-mono text-sm cursor-pointer leading-none"
      >
        ✕
      </button>
      {error && <span className="w-full font-wb-mono text-xs text-wb-red">{error}</span>}
    </div>
  )
}

// [US-69] One form, two modes. Adding and editing ask the trader for exactly the same
// things, so they are one component rather than two that drift apart — the only
// differences are the ticker (an input when adding, fixed text when editing, because a
// rename is remove + re-add), the mutation behind Save, and the footer's buttons.

type WatchlistEntryFormProps = {
  /** Absent in add mode. Present in edit mode, seeding the form and fixing the ticker. */
  entry?: WatchlistEntry
  onSaved?: () => void
  onCancel?: () => void
}

/** Stored 4dp money reads back as the 2dp a trader normally types — but never rounded.
 *  Nothing upstream caps the price at 2dp, and a save replaces the field outright, so
 *  rounding here would let someone who opened the form to fix a typo in the thesis
 *  silently rewrite a trigger they never touched. */
function seedPrice(ownBelowPrice: string | null | undefined): string | undefined {
  if (ownBelowPrice == null) return undefined
  const value = Number(ownBelowPrice)
  return Number(value.toFixed(2)) === value ? value.toFixed(2) : String(value)
}

export function WatchlistEntryForm({
  entry,
  onSaved,
  onCancel
}: WatchlistEntryFormProps): React.JSX.Element {
  const isEdit = entry !== undefined
  const addMutation = useAddToWatchlist()
  const updateMutation = useUpdateWatchlistEntry()
  const [showOwnBelow, setShowOwnBelow] = useState(entry?.ownBelowPrice != null)
  const [showHighIv, setShowHighIv] = useState(entry?.ivrTrigger != null)

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    reset,
    control,
    formState: { errors }
  } = useForm<WatchlistFormInput, unknown, WatchlistEntryFormValues>({
    resolver: zodResolver(watchlistEntrySchema),
    defaultValues: {
      ticker: entry?.ticker ?? '',
      thesis: entry?.notes ?? undefined,
      ownBelowPrice: seedPrice(entry?.ownBelowPrice),
      ivrTrigger: entry?.ivrTrigger == null ? undefined : String(entry.ivrTrigger),
      postEarningsOnly: entry?.postEarningsOnly ?? false,
      coreHolding: entry?.coreHolding ?? false
    }
  })

  // Trimmed, because the schema trims before it measures and the service stores the
  // trimmed text. Counting the raw value would put a red `505 / 500` beside a note that
  // saves perfectly well once its trailing spaces come off.
  const thesis = (useWatch({ control, name: 'thesis' }) ?? '').trim()
  const postEarningsOnly = useWatch({ control, name: 'postEarningsOnly' })
  const coreHolding = useWatch({ control, name: 'coreHolding' })

  // Ticker-field errors bind to the ticker input; every other IPC failure
  // (validation on another field, or a non-field internal error) is surfaced
  // as a form-level alert so it can never fail silently. In edit mode there is no ticker
  // input to bind to, so a ticker error goes to the alert as well.
  function mapFieldErrors(error: ApiError): void {
    // Optional chained: a rejection that never reached the `{ ok, errors }` envelope — a
    // dead channel, a serialization failure — has no body at all, and throwing in here
    // would lose the failure entirely rather than show it.
    const details = (error.body as { detail?: IpcFieldError[] } | null | undefined)?.detail ?? []
    let surfaced = false
    details.forEach((fe) => {
      if (fe.field === 'ticker' && !isEdit) setError('ticker', { message: fe.message })
      else setError('root', { message: fe.message })
      surfaced = true
    })
    if (!surfaced) setError('root', { message: isEdit ? GENERIC_EDIT_ERROR : GENERIC_ADD_ERROR })
  }

  /** The form's values as the payload both channels take. A condition the trader cleared
   *  is an empty string here and an explicit `null` on the wire — the same thing an
   *  absent condition means, and what the service stores either way. */
  function toPayload(values: WatchlistEntryFormValues): WatchlistEntryPayload {
    return {
      ticker: values.ticker,
      notes: values.thesis || null,
      ownBelowPrice: values.ownBelowPrice ? parseFloat(values.ownBelowPrice) : null,
      ivrTrigger: values.ivrTrigger ? parseInt(values.ivrTrigger, 10) : null,
      postEarningsOnly: values.postEarningsOnly,
      coreHolding: values.coreHolding
    }
  }

  function onSubmit(values: WatchlistEntryFormValues): void {
    clearErrors('root')
    const onError = (error: unknown): void => mapFieldErrors(error as ApiError)

    if (isEdit) {
      updateMutation.mutate(toPayload(values), { onSuccess: () => onSaved?.(), onError })
      return
    }

    addMutation.mutate(toPayload(values), {
      // Adding clears the form for the next ticker; editing hands the panel back instead.
      onSuccess: () => {
        reset()
        setShowOwnBelow(false)
        setShowHighIv(false)
      },
      onError
    })
  }

  function removeOwnBelow(): void {
    setShowOwnBelow(false)
    setValue('ownBelowPrice', '')
  }

  function removeHighIv(): void {
    setShowHighIv(false)
    setValue('ivrTrigger', '')
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-[14px] rounded-md border border-wb-gold-border bg-wb-bg-surface p-4"
    >
      <div className="font-wb-mono text-[0.65rem] uppercase tracking-[0.12em] text-wb-text-muted">
        {isEdit ? `Edit ${entry.ticker}` : 'Add to watchlist'}
      </div>

      {errors.root?.message && <ErrorAlert message={errors.root.message} />}

      {isEdit ? (
        <div className="flex items-baseline gap-2">
          <span
            data-testid="watchlist-entry-ticker"
            className="font-wb-mono font-bold tracking-[0.03em] text-wb-gold"
          >
            {entry.ticker}
          </span>
          <span className="font-wb-mono text-[0.66rem] text-wb-text-muted">· ticker fixed</span>
        </div>
      ) : (
        <Field label="Ticker" htmlFor="ticker" error={errors.ticker?.message}>
          <NumberInput
            {...register('ticker')}
            id="ticker"
            placeholder="Ticker (e.g. NVDA)"
            className="uppercase max-w-[240px]"
            hasError={Boolean(errors.ticker)}
          />
        </Field>
      )}

      <div className="flex flex-col gap-[10px]">
        <div className="font-wb-mono text-[0.62rem] uppercase tracking-[0.12em] text-wb-text-muted">
          Entry conditions
        </div>

        {showOwnBelow && (
          <ConditionRow
            label="Would own below"
            error={errors.ownBelowPrice?.message}
            onRemove={removeOwnBelow}
          >
            <div className="w-[140px]">
              <NumberInput
                {...register('ownBelowPrice')}
                id="ownBelowPrice"
                inputMode="decimal"
                prefix="$"
                placeholder="38.00"
                hasError={Boolean(errors.ownBelowPrice)}
              />
            </div>
          </ConditionRow>
        )}

        {showHighIv && (
          <ConditionRow
            label="Wait for high IV"
            error={errors.ivrTrigger?.message}
            onRemove={removeHighIv}
          >
            <div className="w-[120px]">
              <NumberInput
                {...register('ivrTrigger')}
                id="ivrTrigger"
                inputMode="numeric"
                prefix="IVR ≥"
                placeholder="50"
                hasError={Boolean(errors.ivrTrigger)}
              />
            </div>
            <span className="inline-flex gap-1">
              {IVR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setValue('ivrTrigger', String(preset), { shouldValidate: true })}
                  className="px-[9px] py-[3px] rounded-full border border-wb-border bg-transparent text-wb-text-secondary font-wb-mono text-[0.66rem] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </span>
          </ConditionRow>
        )}

        <div className="flex gap-2 flex-wrap">
          {!showOwnBelow && (
            <ChipButton
              label="Would own below"
              active={false}
              onClick={() => setShowOwnBelow(true)}
            />
          )}
          {!showHighIv && (
            <ChipButton
              label="Wait for high IV"
              active={false}
              onClick={() => setShowHighIv(true)}
            />
          )}
          <ChipButton
            label="Post-earnings only"
            active={Boolean(postEarningsOnly)}
            onClick={() => setValue('postEarningsOnly', !postEarningsOnly)}
          />
          <ChipButton
            label="Core holding"
            active={Boolean(coreHolding)}
            onClick={() => setValue('coreHolding', !coreHolding)}
          />
        </div>
      </div>

      <Field label="Thesis (optional)" htmlFor="thesis" error={errors.thesis?.message}>
        {/* No `maxLength`: silently truncating at 500 would let the trader believe a long
            thesis saved whole. The counter turns red and the resolver rejects instead. */}
        <textarea
          {...register('thesis')}
          id="thesis"
          placeholder="Why you'd own this name…"
          className="w-full min-h-[56px] resize-none p-[10px] rounded-md border border-wb-border bg-wb-bg-elevated text-wb-text-primary text-[0.8125rem] leading-normal outline-none"
        />
      </Field>

      <div className="flex items-center justify-between">
        <span
          className={twMerge(
            'font-wb-mono text-[0.66rem]',
            thesis.length > THESIS_MAX_LENGTH ? 'text-wb-red' : 'text-wb-text-muted'
          )}
        >
          {thesis.length} / {THESIS_MAX_LENGTH}
        </span>
        {isEdit ? (
          <div className="flex items-center gap-2">
            <FormButton
              variant="secondary"
              label="Cancel"
              onClick={onCancel}
              data-testid="watchlist-edit-cancel"
              aria-label="Cancel"
            />
            <FormButton
              label="Save changes"
              pendingLabel="Saving…"
              isPending={updateMutation.isPending}
              data-testid="watchlist-edit-submit"
              aria-label="Save changes"
            />
          </div>
        ) : (
          <FormButton
            label="Add ticker"
            pendingLabel="Adding…"
            isPending={addMutation.isPending}
            data-testid="watchlist-add-submit"
            aria-label="Add ticker"
          />
        )}
      </div>
    </form>
  )
}
