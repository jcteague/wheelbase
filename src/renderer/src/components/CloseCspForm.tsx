import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useClosePosition } from '../hooks/useClosePosition'

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

const closeCspSchema = z.object({
  close_price_per_contract: z
    .string()
    .refine(
      (v) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) > 0,
      'Close price must be positive'
    )
})

type CloseCspFormValues = z.infer<typeof closeCspSchema>

type PnlPreview = { netPnl: number; totalPnl: number; pct: number }

function computePreview(
  openPremium: number,
  closePrice: number,
  contracts: number
): PnlPreview | null {
  if (!(closePrice > 0 && openPremium > 0)) return null
  const netPnl = openPremium - closePrice
  return { netPnl, totalPnl: netPnl * contracts * 100, pct: (netPnl / openPremium) * 100 }
}

type CloseCspFormProps = {
  positionId: string
  openPremiumPerContract: string
  contracts: number
}

function fmt(n: number): string {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`
}

function fmtPct(n: number): string {
  return n < 0 ? `-${Math.abs(n).toFixed(0)}%` : `${n.toFixed(0)}%`
}

function extractFieldErrors(error: ApiError): ApiFieldError[] {
  const { body } = error
  if (body && typeof body === 'object' && 'detail' in body) {
    return (body as { detail: ApiFieldError[] }).detail
  }
  return []
}

export function CloseCspForm({
  positionId,
  openPremiumPerContract,
  contracts
}: CloseCspFormProps): React.JSX.Element {
  const [, navigate] = useLocation()
  const mutation = useClosePosition()

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors }
  } = useForm<CloseCspFormValues>({
    resolver: zodResolver(closeCspSchema)
  })

  const closePriceStr = watch('close_price_per_contract') ?? ''

  useEffect(() => {
    if (!mutation.isError || !mutation.error) return
    const fieldErrors = extractFieldErrors(mutation.error as ApiError)
    fieldErrors.forEach((e) => {
      setError(e.field as keyof CloseCspFormValues, { message: e.message })
    })
  }, [mutation.isError, mutation.error, setError])

  function onSubmit(values: CloseCspFormValues): void {
    mutation.mutate(
      {
        position_id: positionId,
        close_price_per_contract: parseFloat(values.close_price_per_contract)
      },
      { onSuccess: () => navigate('/') }
    )
  }

  const closePrice = parseFloat(closePriceStr)
  const openPremium = parseFloat(openPremiumPerContract)
  const preview = computePreview(openPremium, closePrice, contracts)
  const isProfit = preview !== null && preview.netPnl >= 0

  return (
    <section
      style={{
        background: 'var(--wb-bg-surface)',
        border: '1px solid var(--wb-border)',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--wb-border)',
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--wb-text-muted)',
          fontFamily: MONO
        }}
      >
        Buy to Close
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            htmlFor="close_price_per_contract"
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--wb-text-muted)',
              fontFamily: MONO
            }}
          >
            Close price per contract
          </label>
          <input
            id="close_price_per_contract"
            type="number"
            step="0.01"
            placeholder="0.00"
            data-testid="close-price-input"
            className="wb-input"
            style={{
              background: 'var(--wb-bg-elevated)',
              border: '1px solid var(--wb-border)',
              borderRadius: 6,
              padding: '8px 12px',
              fontFamily: MONO,
              fontSize: '0.875rem',
              color: 'var(--wb-text-primary)',
              width: 200,
              transition: 'border-color 0.15s',
              appearance: 'none'
            }}
            {...register('close_price_per_contract')}
          />
          {errors.close_price_per_contract && (
            <span
              role="alert"
              style={{
                fontSize: '0.75rem',
                color: 'var(--wb-red)',
                fontFamily: MONO
              }}
            >
              {errors.close_price_per_contract.message}
            </span>
          )}
        </div>

        {preview && (
          <div
            style={{
              background: isProfit ? 'var(--wb-green-dim)' : 'var(--wb-red-dim)',
              border: `1px solid ${isProfit ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)'}`,
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontFamily: MONO,
              fontSize: '0.8125rem',
              color: isProfit ? 'var(--wb-green)' : 'var(--wb-red)'
            }}
          >
            <div>Net P&L: {fmt(preview.netPnl)}</div>
            <div>Total P&L: {fmt(preview.totalPnl)}</div>
            <div style={{ fontWeight: 600 }}>{fmtPct(preview.pct)}</div>
          </div>
        )}

        <div>
          <button
            type="submit"
            data-testid="close-csp-submit"
            disabled={mutation.isPending}
            style={{
              padding: '7px 20px',
              borderRadius: 6,
              border: 'none',
              fontFamily: MONO,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.03em',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              background: mutation.isPending ? 'var(--wb-bg-elevated)' : 'var(--wb-gold)',
              color: mutation.isPending ? 'var(--wb-text-muted)' : 'var(--wb-bg-base)',
              transition: 'opacity 0.15s, background 0.15s'
            }}
            onMouseEnter={(e) => {
              if (!mutation.isPending) (e.currentTarget as HTMLElement).style.opacity = '0.85'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.opacity = '1'
            }}
          >
            {mutation.isPending ? 'Closing...' : 'Close Position'}
          </button>
        </div>
      </form>
    </section>
  )
}
