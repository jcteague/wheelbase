import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'

import { DatePicker } from '@/components/ui/date-picker'

import { newWheelSchema, type NewWheelFormValues } from '@/schemas/new-wheel'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
const API_TO_FORM_FIELD: Record<string, keyof NewWheelFormValues> = {
  ticker: 'ticker',
  strike: 'strike',
  expiration: 'expiration',
  contracts: 'contracts',
  premium_per_contract: 'premiumPerContract',
  fill_date: 'fillDate'
}

type NewWheelFormProps = {
  navigate?: (path: string) => void
  defaultTicker?: string
}

export function NewWheelForm({
  navigate = () => {},
  defaultTicker
}: NewWheelFormProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const mutation = useCreatePosition()
  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return
    const timer = setTimeout(() => navigate(`/positions/${mutation.data!.position.id}`), 2000)
    return () => clearTimeout(timer)
  }, [mutation.isSuccess, mutation.data, navigate])

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors }
  } = useForm<NewWheelFormValues>({
    resolver: zodResolver(newWheelSchema),
    mode: 'onBlur',
    defaultValues: {
      ticker: defaultTicker ?? '',
      strike: '',
      expiration: '',
      contracts: '',
      premiumPerContract: '',
      fillDate: undefined,
      thesis: undefined,
      notes: undefined
    }
  })

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
        premium_per_contract: parseFloat(values.premiumPerContract),
        fill_date: values.fillDate || undefined,
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
    const cb = mutation.data.cost_basis_snapshot
    return (
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
            ['Premium collected', cb.total_premium_collected],
            ['Cost basis / share', cb.basis_per_share]
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
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {isServerError && <ErrorAlert message="Something went wrong. Please try again." />}

      {/* Primary fields — 2 column grid */}
      <div className="grid grid-cols-2 gap-5">
        <Field label="Ticker" error={errors.ticker?.message}>
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

        <Field label="Premium / Contract" error={errors.premiumPerContract?.message}>
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

      <Field label="Expiration" error={errors.expiration?.message}>
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

      {/* Divider */}
      <div className="border-t border-wb-border" />

      <FormButton
        label="Open Wheel"
        pendingLabel="Opening…"
        isPending={mutation.isPending}
        aria-label="Open wheel"
      />
    </form>
  )
}
