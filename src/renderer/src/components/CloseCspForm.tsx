import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useLocation } from 'wouter'
import { z } from 'zod'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useClosePosition } from '../hooks/useClosePosition'
import { fmtMoney, fmtPct } from '../lib/format'
import { MONO } from '../lib/tokens'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function makeCloseCspSchema(
  openFillDate: string,
  expiration: string
): z.ZodObject<{
  close_price_per_contract: z.ZodString
  fill_date: z.ZodOptional<z.ZodString>
}> {
  return z.object({
    close_price_per_contract: z
      .string()
      .refine(
        (v) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Close price must be positive'
      ),
    fill_date: z
      .string()
      .refine((v) => v === '' || ISO_DATE_RE.test(v), 'Fill date must be a valid date (YYYY-MM-DD)')
      .refine((v) => v === '' || v >= openFillDate, 'Close date cannot be before the open date')
      .refine((v) => v === '' || v <= expiration, 'Close date cannot be after expiration date')
      .optional()
  })
}

type CloseCspFormValues = { close_price_per_contract: string; fill_date?: string }

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
  openFillDate: string
  expiration: string
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
  contracts,
  openFillDate,
  expiration
}: CloseCspFormProps): React.JSX.Element {
  const [, navigate] = useLocation()
  const mutation = useClosePosition()

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors }
  } = useForm<CloseCspFormValues>({
    resolver: zodResolver(makeCloseCspSchema(openFillDate, expiration))
  })

  const closePriceStr = useWatch({ control, name: 'close_price_per_contract' }) ?? ''

  function onSubmit(values: CloseCspFormValues): void {
    mutation.mutate(
      {
        position_id: positionId,
        close_price_per_contract: parseFloat(values.close_price_per_contract),
        ...(values.fill_date && values.fill_date !== '' ? { fill_date: values.fill_date } : {})
      },
      {
        onSuccess: () => navigate('/'),
        onError: (error) => {
          const fieldErrors = extractFieldErrors(error as ApiError)
          fieldErrors.forEach((e) => {
            setError(e.field as keyof CloseCspFormValues, { message: e.message })
          })
        }
      }
    )
  }

  const closePrice = parseFloat(closePriceStr)
  const openPremium = parseFloat(openPremiumPerContract)
  const preview = computePreview(openPremium, closePrice, contracts)
  const isProfit = preview !== null && preview.netPnl >= 0

  return (
    <SectionCard header="Buy to Close">
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Field
          label="Close price per contract"
          htmlFor="close_price_per_contract"
          error={errors.close_price_per_contract?.message}
        >
          <NumberInput
            id="close_price_per_contract"
            type="number"
            step="0.01"
            placeholder="0.00"
            data-testid="close-price-input"
            hasError={Boolean(errors.close_price_per_contract)}
            style={{
              padding: '8px 12px',
              fontSize: '0.875rem',
              width: 200,
              appearance: 'none' as const
            }}
            {...register('close_price_per_contract')}
          />
        </Field>

        <Field label="Fill date (optional)" htmlFor="fill_date" error={errors.fill_date?.message}>
          <NumberInput
            id="fill_date"
            type="date"
            data-testid="fill-date-input"
            hasError={Boolean(errors.fill_date)}
            style={{ padding: '8px 12px', fontSize: '0.875rem', width: 200 }}
            {...register('fill_date')}
          />
        </Field>

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
            <div>Net P&L: {fmtMoney(preview.netPnl.toString())}</div>
            <div>Total P&L: {fmtMoney(preview.totalPnl.toString())}</div>
            <div style={{ fontWeight: 600 }}>{fmtPct(preview.pct)}</div>
          </div>
        )}

        <div>
          <FormButton
            label="Close Position"
            pendingLabel="Closing..."
            isPending={mutation.isPending}
            data-testid="close-csp-submit"
            style={{ padding: '7px 20px', fontSize: '0.75rem', letterSpacing: '0.03em' }}
          />
        </div>
      </form>
    </SectionCard>
  )
}
