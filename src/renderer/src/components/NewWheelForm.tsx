import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'

import { DatePicker } from '@/components/ui/date-picker'

import { newWheelSchema, type NewWheelFormValues } from '@/schemas/new-wheel'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { MONO } from '../lib/tokens'
import { ErrorAlert } from './ui/ErrorAlert'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 6,
  border: '1px solid var(--wb-border)',
  background: 'var(--wb-bg-elevated)',
  color: 'var(--wb-text-primary)',
  fontSize: '0.9375rem',
  fontFamily: MONO,
  transition: 'border-color 0.15s'
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--wb-red)'
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
        style={{
          padding: '20px 24px',
          borderRadius: 8,
          background: 'var(--wb-green-dim)',
          border: '1px solid rgba(63,185,80,0.25)'
        }}
        role="status"
        aria-live="polite"
      >
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--wb-green)',
            marginBottom: 12,
            fontFamily: MONO,
            letterSpacing: '0.05em'
          }}
        >
          ✓ WHEEL OPENED — {pos.ticker}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Premium collected', cb.total_premium_collected],
            ['Cost basis / share', cb.basis_per_share]
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span
                style={{ fontSize: '0.75rem', color: 'var(--wb-text-muted)', fontFamily: MONO }}
              >
                {k}
              </span>
              <span
                style={{ fontSize: '0.75rem', color: 'var(--wb-text-primary)', fontFamily: MONO }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate(`/positions/${mutation.data!.position.id}`)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '7px',
            borderRadius: 6,
            border: '1px solid rgba(63,185,80,0.4)',
            background: 'transparent',
            color: 'var(--wb-green)',
            fontSize: '0.75rem',
            fontFamily: MONO,
            cursor: 'pointer',
            letterSpacing: '0.05em'
          }}
        >
          View position →
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      {isServerError && <ErrorAlert message="Something went wrong. Please try again." />}

      {/* Primary fields — 2 column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Field label="Ticker" error={errors.ticker?.message}>
          <input
            {...register('ticker')}
            id="ticker"
            aria-label="Ticker"
            placeholder="TSLA"
            className="wb-input"
            style={errors.ticker ? inputErrorStyle : inputStyle}
          />
        </Field>

        <Field label="Contracts" error={errors.contracts?.message}>
          <input
            {...register('contracts')}
            id="contracts"
            aria-label="Contracts"
            inputMode="numeric"
            placeholder="1"
            className="wb-input"
            style={errors.contracts ? inputErrorStyle : inputStyle}
          />
        </Field>

        <Field label="Strike Price" error={errors.strike?.message}>
          <input
            {...register('strike')}
            id="strike"
            aria-label="Strike"
            inputMode="decimal"
            placeholder="245.00"
            className="wb-input"
            style={errors.strike ? inputErrorStyle : inputStyle}
          />
        </Field>

        <Field label="Premium / Contract" error={errors.premiumPerContract?.message}>
          <input
            {...register('premiumPerContract')}
            id="premiumPerContract"
            aria-label="Premium per contract"
            inputMode="decimal"
            placeholder="3.20"
            className="wb-input"
            style={errors.premiumPerContract ? inputErrorStyle : inputStyle}
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
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--wb-text-muted)',
            fontSize: '0.75rem',
            fontFamily: MONO,
            letterSpacing: '0.06em',
            textTransform: 'uppercase'
          }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
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
              <input
                {...register('thesis')}
                id="thesis"
                aria-label="Thesis"
                placeholder="Why this trade?"
                className="wb-input"
                style={inputStyle}
              />
            </Field>

            <Field label="Notes" error={errors.notes?.message}>
              <input
                {...register('notes')}
                id="notes"
                aria-label="Notes"
                placeholder="Additional notes…"
                className="wb-input"
                style={inputStyle}
              />
            </Field>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--wb-border)' }} />

      <FormButton
        label="Open Wheel"
        pendingLabel="Opening…"
        isPending={mutation.isPending}
        aria-label="Open wheel"
      />
    </form>
  )
}
