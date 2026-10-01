import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useImperativeHandle, useState, type Ref } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'

import { DatePicker } from '@/components/ui/date-picker'

import { newWheelSchema, type NewWheelFormValues } from '@/schemas/new-wheel'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { computeDteFromInput } from '../lib/format'
import { isPremiumOverridden, type PromotedCandidate } from '../lib/promote'
import type { SharedFieldsHandle } from './new-position-shared'
import { NewWheelDerivedRow } from './NewWheelDerivedRow'
import { PromotedFormChrome } from './PromotedFormChrome'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { SheetBody, SheetFooter } from './ui/Sheet'
import { NumberInput } from './ui/NumberInput'
const API_TO_FORM_FIELD: Record<string, keyof NewWheelFormValues> = {
  ticker: 'ticker',
  strike: 'strike',
  expiration: 'expiration',
  contracts: 'contracts',
  premiumPerContract: 'premiumPerContract',
  fillDate: 'fillDate'
}

const EMPTY_DEFAULTS: NewWheelFormValues = {
  ticker: '',
  strike: '',
  expiration: '',
  contracts: '',
  premiumPerContract: '',
  fillDate: undefined,
  thesis: undefined,
  notes: undefined
}

/** [US-68] Promoted values are editable defaults, never locks. Contracts starts at 1
 *  and the thesis carries the watchlist note; fill date stays the trader's. */
function promotedDefaults(promoted: PromotedCandidate): NewWheelFormValues {
  return {
    ...EMPTY_DEFAULTS,
    ticker: promoted.ticker,
    strike: promoted.strike,
    expiration: promoted.expiration,
    contracts: '1',
    premiumPerContract: promoted.premium,
    thesis: promoted.thesis
  }
}

/** `37 DTE` under the expiration field, or nothing while the date is unusable. */
function dteHint(expiration: string | undefined): string | undefined {
  const dte = computeDteFromInput(expiration)
  return dte === null ? undefined : `${dte} DTE`
}

type NewWheelFormProps = {
  navigate?: (path: string) => void
  defaultTicker?: string
  /** [US-68] Present only when the trader arrived from a screener promote. */
  promoted?: PromotedCandidate
  /** [US-101] Lets the New position sheet carry ticker/contracts across the strategy toggle. */
  sharedRef?: Ref<SharedFieldsHandle>
  onPendingChange?: (isPending: boolean) => void
  /** [US-101] Inside the New position sheet: fields in the scrolling body, Cancel + submit in
   *  the fixed footer. Absent, the form renders as a plain column. */
  onCancel?: () => void
}

export function NewWheelForm({
  navigate = () => {},
  defaultTicker,
  promoted,
  sharedRef,
  onPendingChange,
  onCancel
}: NewWheelFormProps): React.JSX.Element {
  // The seeded thesis lives in the Advanced section, so promoted mode opens it —
  // a pre-filled field the trader cannot see is worse than no pre-fill at all.
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(promoted))
  const mutation = useCreatePosition()
  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return
    const timer = setTimeout(() => navigate(`/positions/${mutation.data!.position.id}`), 2000)
    return () => clearTimeout(timer)
  }, [mutation.isSuccess, mutation.data, navigate])

  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

  const {
    register,
    handleSubmit,
    setError,
    control,
    getValues,
    setValue,
    formState: { errors }
  } = useForm<NewWheelFormValues>({
    resolver: zodResolver(newWheelSchema),
    mode: 'onBlur',
    defaultValues: promoted
      ? promotedDefaults(promoted)
      : { ...EMPTY_DEFAULTS, ticker: defaultTicker ?? '' }
  })

  useImperativeHandle(
    sharedRef,
    () => ({
      getShared: () => ({ ticker: getValues('ticker'), contracts: getValues('contracts') }),
      setShared: ({ ticker, contracts }) => {
        setValue('ticker', ticker)
        setValue('contracts', contracts)
      }
    }),
    [getValues, setValue]
  )

  // [US-68] The derived row and the banner track the live inputs, so an override
  // shows its consequence before the trader submits. The fresh quote is never
  // written back into form state — the pre-filled premium stays the trader's.
  const [premiumValue, strikeValue, contractsValue, expirationValue] = useWatch({
    control,
    name: ['premiumPerContract', 'strike', 'contracts', 'expiration']
  })

  // A property of the form, not of the banner: the derived row must say so whenever
  // the yield genuinely came from the trader's price, including while a
  // higher-precedence banner (offline / stale / moved) holds the one banner slot.
  const premiumOverridden = promoted ? isPremiumOverridden(premiumValue, promoted.premium) : false

  function mapFieldErrors(error: ApiError): void {
    if (error.status !== 400) return
    const body = error.body as { detail?: ApiFieldError[] }
    body.detail?.forEach((fe) => {
      const key = API_TO_FORM_FIELD[fe.field]
      if (key) setError(key, { message: fe.message })
    })
  }

  function onSubmit(values: NewWheelFormValues): void {
    mutation.mutate(
      {
        ticker: values.ticker,
        strike: parseFloat(values.strike),
        expiration: values.expiration,
        contracts: parseInt(values.contracts, 10),
        premiumPerContract: parseFloat(values.premiumPerContract),
        fillDate: values.fillDate || undefined,
        thesis: values.thesis || undefined,
        notes: values.notes || undefined
      },
      {
        onError: (error) => {
          mapFieldErrors(error as ApiError)
        }
      }
    )
  }

  const isServerError = mutation.isError && (mutation.error as ApiError)?.status !== 400

  if (mutation.isSuccess && mutation.data) {
    const pos = mutation.data.position
    const cb = mutation.data.costBasisSnapshot
    const card = (
      <div
        className="px-6 py-5 rounded-lg bg-wb-green-dim border border-[rgba(63,185,80,0.25)]"
        role="status"
        aria-live="polite"
      >
        <div className="text-xs font-semibold text-wb-green mb-3 font-wb-mono tracking-[0.05em]">
          ✓ WHEEL OPENED — {pos.ticker}
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            ['Premium collected', cb.totalPremiumCollected],
            ['Cost basis / share', cb.basisPerShare]
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-xs text-wb-text-muted font-wb-mono">{k}</span>
              <span className="text-xs text-wb-text-primary font-wb-mono">{v}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate(`/positions/${mutation.data!.position.id}`)}
          className="mt-4 w-full py-[7px] rounded-md border border-[rgba(63,185,80,0.4)] bg-transparent text-wb-green text-xs font-wb-mono cursor-pointer tracking-[0.05em]"
        >
          View position →
        </button>
      </div>
    )
    return onCancel ? <SheetBody>{card}</SheetBody> : card
  }

  const fields = (
    <>
      {isServerError && <ErrorAlert message="Something went wrong. Please try again." />}

      {promoted && <PromotedFormChrome promoted={promoted} currentPremium={premiumValue} />}

      {/* Primary fields — 2 column grid */}
      <div className="grid grid-cols-2 gap-5">
        <Field
          label="Ticker"
          error={errors.ticker?.message}
          hint={promoted ? 'from screener — editable' : undefined}
        >
          <NumberInput
            {...register('ticker')}
            id="ticker"
            aria-label="Ticker"
            placeholder="TSLA"
            hasError={Boolean(errors.ticker)}
          />
        </Field>

        <Field label="Contracts" error={errors.contracts?.message}>
          <NumberInput
            {...register('contracts')}
            id="contracts"
            aria-label="Contracts"
            inputMode="numeric"
            placeholder="1"
            hasError={Boolean(errors.contracts)}
          />
        </Field>

        <Field label="Strike Price" error={errors.strike?.message}>
          <NumberInput
            {...register('strike')}
            id="strike"
            aria-label="Strike"
            inputMode="decimal"
            placeholder="245.00"
            hasError={Boolean(errors.strike)}
          />
        </Field>

        <Field
          label="Premium / Contract"
          error={errors.premiumPerContract?.message}
          hint={promoted ? "editable — override with the price you'll work" : undefined}
        >
          <NumberInput
            {...register('premiumPerContract')}
            id="premiumPerContract"
            aria-label="Premium per contract"
            inputMode="decimal"
            placeholder="3.20"
            hasError={Boolean(errors.premiumPerContract)}
          />
        </Field>
      </div>

      <Field
        label="Expiration"
        error={errors.expiration?.message}
        hint={promoted ? dteHint(expirationValue) : undefined}
      >
        <Controller
          control={control}
          name="expiration"
          render={({ field }) => (
            <DatePicker
              id="expiration"
              aria-label="Expiration"
              value={field.value}
              onChange={field.onChange}
              onBlur={() => {
                if (field.value) field.onBlur()
              }}
              hasError={!!errors.expiration}
            />
          )}
        />
      </Field>

      {promoted && (
        <NewWheelDerivedRow
          strike={strikeValue}
          contracts={contractsValue}
          premium={premiumValue}
          expiration={expirationValue}
          edited={premiumOverridden}
        />
      )}

      {/* Advanced section */}
      <div>
        <button
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
          className="bg-transparent border-none py-1 px-0 cursor-pointer flex items-center gap-[8px] text-wb-text-muted text-xs font-wb-mono tracking-[0.06em] uppercase focus:outline-none"
        >
          <span
            style={{
              display: 'inline-block',
              transform: advancedOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s'
            }}
          >
            ▶
          </span>
          Advanced
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-5 mt-4">
            <Field label="Fill Date" error={errors.fillDate?.message}>
              <Controller
                control={control}
                name="fillDate"
                render={({ field }) => (
                  <DatePicker
                    id="fillDate"
                    aria-label="Fill date"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={() => {
                      if (field.value) field.onBlur()
                    }}
                    hasError={!!errors.fillDate}
                  />
                )}
              />
            </Field>

            <Field label="Thesis" error={errors.thesis?.message}>
              <NumberInput
                {...register('thesis')}
                id="thesis"
                aria-label="Thesis"
                placeholder="Why this trade?"
              />
            </Field>

            <Field label="Notes" error={errors.notes?.message}>
              <NumberInput
                {...register('notes')}
                id="notes"
                aria-label="Notes"
                placeholder="Additional notes…"
              />
            </Field>
          </div>
        )}
      </div>
    </>
  )

  const submit = (
    <FormButton
      label="Open Wheel"
      pendingLabel="Opening…"
      isPending={mutation.isPending}
      aria-label="Open wheel"
    />
  )

  if (onCancel) {
    return (
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex h-full min-h-0 flex-1 flex-col"
      >
        <SheetBody>
          <div className="flex flex-col gap-6">{fields}</div>
        </SheetBody>
        <SheetFooter>
          <FormButton
            label="Cancel"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={onCancel}
          />
          {submit}
        </SheetFooter>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {fields}

      {/* Divider */}
      <div className="border-t border-wb-border" />

      {submit}
    </form>
  )
}
