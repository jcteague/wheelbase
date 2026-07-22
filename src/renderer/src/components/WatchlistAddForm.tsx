import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'
import type { z } from 'zod'

import { watchlistEntrySchema, type WatchlistEntryFormValues } from '@/schemas/watchlist'
import type { ApiError } from '../api/watchlist'
import type { IpcFieldError } from '../api/error'
import { useAddToWatchlist } from '../hooks/useAddToWatchlist'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { ErrorAlert } from './ui/ErrorAlert'

const IVR_PRESETS = [30, 50, 70] as const
const THESIS_MAX_LENGTH = 500
const GENERIC_ADD_ERROR = 'Could not add the ticker — please try again.'

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

export function WatchlistAddForm(): React.JSX.Element {
  const mutation = useAddToWatchlist()
  const [showOwnBelow, setShowOwnBelow] = useState(false)
  const [showHighIv, setShowHighIv] = useState(false)

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
      ticker: '',
      thesis: undefined,
      ownBelowPrice: undefined,
      ivrTrigger: undefined,
      postEarningsOnly: false,
      coreHolding: false
    }
  })

  const thesis = useWatch({ control, name: 'thesis' }) ?? ''
  const postEarningsOnly = useWatch({ control, name: 'postEarningsOnly' })
  const coreHolding = useWatch({ control, name: 'coreHolding' })

  // Ticker-field errors bind to the ticker input; every other IPC failure
  // (validation on another field, or a non-field internal error) is surfaced
  // as a form-level alert so it can never fail silently.
  function mapFieldErrors(error: ApiError): void {
    const details = (error.body as { detail?: IpcFieldError[] }).detail ?? []
    let surfaced = false
    details.forEach((fe) => {
      if (fe.field === 'ticker') setError('ticker', { message: fe.message })
      else setError('root', { message: fe.message })
      surfaced = true
    })
    if (!surfaced) setError('root', { message: GENERIC_ADD_ERROR })
  }

  function onSubmit(values: WatchlistEntryFormValues): void {
    clearErrors('root')
    mutation.mutate(
      {
        ticker: values.ticker,
        notes: values.thesis || undefined,
        ownBelowPrice: values.ownBelowPrice ? parseFloat(values.ownBelowPrice) : undefined,
        ivrTrigger: values.ivrTrigger ? parseInt(values.ivrTrigger, 10) : undefined,
        postEarningsOnly: values.postEarningsOnly,
        coreHolding: values.coreHolding
      },
      {
        onSuccess: () => {
          reset()
          setShowOwnBelow(false)
          setShowHighIv(false)
        },
        onError: (error) => mapFieldErrors(error as ApiError)
      }
    )
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
        Add to watchlist
      </div>

      {errors.root?.message && <ErrorAlert message={errors.root.message} />}

      <Field label="Ticker" htmlFor="ticker" error={errors.ticker?.message}>
        <NumberInput
          {...register('ticker')}
          id="ticker"
          placeholder="Ticker (e.g. NVDA)"
          className="uppercase max-w-[240px]"
          hasError={Boolean(errors.ticker)}
        />
      </Field>

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
        <textarea
          {...register('thesis')}
          id="thesis"
          maxLength={THESIS_MAX_LENGTH}
          placeholder="Why you'd own this name…"
          className="w-full min-h-[56px] resize-none p-[10px] rounded-md border border-wb-border bg-wb-bg-elevated text-wb-text-primary text-[0.8125rem] leading-normal outline-none"
        />
      </Field>

      <div className="flex items-center justify-between">
        <span className="font-wb-mono text-[0.66rem] text-wb-text-muted">
          {thesis.length} / {THESIS_MAX_LENGTH}
        </span>
        <FormButton
          label="Add ticker"
          pendingLabel="Adding…"
          isPending={mutation.isPending}
          data-testid="watchlist-add-submit"
          aria-label="Add ticker"
        />
      </div>
    </form>
  )
}
