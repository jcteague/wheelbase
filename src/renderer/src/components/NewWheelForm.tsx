import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'

import { DatePicker } from '@/components/ui/date-picker'

import { newWheelSchema, type NewWheelFormValues } from '@/schemas/new-wheel'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useCreatePosition } from '../hooks/useCreatePosition'

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'
const REDIRECT_DELAY_MS = 2000

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
}

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <label
      style={{
        display: 'block',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--wb-text-muted)',
        fontFamily: MONO,
        marginBottom: 6
      }}
    >
      {children}
    </label>
  )
}

type FieldProps = {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, error, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && !error && (
        <span style={{ fontSize: '0.7rem', color: 'var(--wb-text-muted)', marginTop: 4 }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          style={{
            fontSize: '0.7rem',
            color: 'var(--wb-red)',
            marginTop: 4,
            fontFamily: MONO
          }}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
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

export function NewWheelForm({ navigate = () => {} }: NewWheelFormProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const mutation = useCreatePosition()

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
      ticker: '',
      strike: '',
      expiration: '',
      contracts: '',
      premiumPerContract: '',
      fillDate: undefined,
      thesis: undefined,
      notes: undefined
    }
  })

  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return
    const id = mutation.data.position.id
    const timer = setTimeout(() => navigate(`/positions/${id}`), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [mutation.isSuccess, mutation.data, navigate])

  useEffect(() => {
    if (!mutation.isError || !mutation.error) return
    const err = mutation.error as ApiError
    if (err.status !== 400) return
    const body = err.body as { detail?: ApiFieldError[] }
    body.detail?.forEach((fe) => {
      const key = API_TO_FORM_FIELD[fe.field]
      if (key) setError(key, { message: fe.message })
    })
  }, [mutation.isError, mutation.error, setError])

  function onSubmit(values: NewWheelFormValues): void {
    mutation.mutate({
      ticker: values.ticker,
      strike: parseFloat(values.strike),
      expiration: values.expiration,
      contracts: parseInt(values.contracts, 10),
      premium_per_contract: parseFloat(values.premiumPerContract),
      fill_date: values.fillDate || undefined,
      thesis: values.thesis || undefined,
      notes: values.notes || undefined
    })
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
      {isServerError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            background: 'var(--wb-red-dim)',
            border: '1px solid rgba(248,81,73,0.25)',
            color: 'var(--wb-red)',
            fontSize: '0.75rem',
            fontFamily: MONO
          }}
          role="alert"
        >
          Something went wrong. Please try again.
        </div>
      )}

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
              onBlur={() => { if (field.value) field.onBlur() }}
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
                    onBlur={() => { if (field.value) field.onBlur() }}
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

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-label="Open wheel"
        style={{
          padding: '11px 24px',
          borderRadius: 6,
          border: 'none',
          background: mutation.isPending ? 'rgba(230,168,23,0.4)' : 'var(--wb-gold)',
          color: 'var(--wb-bg-base)',
          fontSize: '0.9375rem',
          fontWeight: 600,
          fontFamily: MONO,
          cursor: mutation.isPending ? 'not-allowed' : 'pointer',
          letterSpacing: '0.04em',
          transition: 'opacity 0.15s'
        }}
      >
        {mutation.isPending ? 'Opening…' : 'Open Wheel'}
      </button>
    </form>
  )
}
