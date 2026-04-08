import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { DatePicker } from '@/components/ui/date-picker'
import { computeDte, fmtMoney } from '../lib/format'
import { computeNetCreditDebit, getRollTypeLabel, rollCreditDebitColors } from '../lib/rolls'
import { MONO } from '../lib/tokens'
import type { RollCspFormValues } from './RollCspSheet'
import { AlertBox } from './ui/AlertBox'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'

type RollCspFormProps = {
  ticker: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  basisPerShare: string
  register: UseFormRegister<RollCspFormValues>
  errors: FieldErrors<RollCspFormValues>
  control: Control<RollCspFormValues>
  costToClose: string
  newPremium: string
  newStrike: string
  isPending: boolean
  onSubmit: () => void
  onClose: () => void
}

function NetCreditDebitPreview({
  costToClose,
  newPremium,
  contracts
}: {
  costToClose: string
  newPremium: string
  contracts: number
}): React.JSX.Element | null {
  const close = parseFloat(costToClose)
  const prem = parseFloat(newPremium)
  if (isNaN(close) || isNaN(prem) || close <= 0 || prem <= 0) return null

  const { net, isCredit, total } = computeNetCreditDebit(close, prem, contracts)
  const { color, bg, border } = rollCreditDebitColors(isCredit)
  const sign = isCredit ? '+' : '-'
  const label = isCredit ? 'Net Credit' : 'Net Debit'

  return (
    <div
      style={{ borderRadius: 6, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px'
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--wb-text-secondary)', fontFamily: MONO }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color, fontFamily: MONO }}>
            {sign}${Math.abs(net).toFixed(2)}/contract
          </span>
          <span style={{ fontSize: 11, color, opacity: 0.7, fontFamily: MONO }}>
            (${total.toFixed(2)} total)
          </span>
        </div>
      </div>
      {!isCredit && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: `1px solid ${border}`,
            fontSize: 11,
            color,
            fontFamily: MONO
          }}
        >
          ⚠ This roll costs more to close than the new premium provides
        </div>
      )}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  highlight
}: {
  label: string
  value: string
  highlight?: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        background: highlight
          ? 'linear-gradient(90deg, var(--wb-gold-subtle), transparent)'
          : undefined,
        padding: highlight ? '4px 0' : undefined
      }}
    >
      <span style={{ color: 'var(--wb-text-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function RollCspForm({
  ticker,
  strike,
  expiration,
  contracts,
  premiumPerContract,
  basisPerShare,
  register,
  errors,
  control,
  costToClose,
  newPremium,
  newStrike,
  isPending,
  onSubmit,
  onClose
}: RollCspFormProps): React.JSX.Element {
  const dte = computeDte(expiration)
  const totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(2)
  const rollType = getRollTypeLabel(strike, newStrike)

  return (
    <>
      <SheetHeader
        eyebrow={rollType}
        title="Roll Cash-Secured Put"
        subtitle={`${ticker} PUT ${fmtMoney(strike)} · exp ${expiration}`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Current Leg */}
        <SectionCard header="Current Leg">
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SummaryRow label="Strike" value={fmtMoney(strike)} />
            <SummaryRow label="Expiration" value={`${expiration} (${dte} DTE)`} />
            <SummaryRow
              label="Premium collected"
              value={`+${fmtMoney(premiumPerContract)}/contract ($${totalPremium})`}
            />
            <SummaryRow label="Cost basis" value={`${fmtMoney(basisPerShare)}/share`} highlight />
          </div>
        </SectionCard>

        {/* New Leg */}
        <SectionCard header="New Leg">
          <div
            style={{
              padding: '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            <Field label="New Strike" htmlFor="roll-new-strike" error={errors.new_strike?.message}>
              <NumberInput
                id="roll-new-strike"
                aria-label="New Strike"
                type="number"
                min="0"
                step="0.01"
                prefix="$"
                hasError={Boolean(errors.new_strike)}
                {...register('new_strike')}
              />
            </Field>

            <Field
              label="New Expiration"
              htmlFor="roll-new-expiration"
              error={errors.new_expiration?.message}
            >
              <Controller
                name="new_expiration"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="roll-new-expiration"
                    aria-label="New Expiration"
                    value={field.value}
                    hasError={Boolean(errors.new_expiration)}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="Cost to Close"
                htmlFor="roll-cost-to-close"
                error={errors.cost_to_close?.message}
              >
                <NumberInput
                  id="roll-cost-to-close"
                  aria-label="Cost to Close"
                  type="number"
                  min="0"
                  step="0.01"
                  prefix="$"
                  hasError={Boolean(errors.cost_to_close)}
                  {...register('cost_to_close')}
                />
              </Field>
              <Field
                label="New Premium"
                htmlFor="roll-new-premium"
                error={errors.new_premium?.message}
              >
                <NumberInput
                  id="roll-new-premium"
                  aria-label="New Premium"
                  type="number"
                  min="0"
                  step="0.01"
                  prefix="$"
                  hasError={Boolean(errors.new_premium)}
                  {...register('new_premium')}
                />
              </Field>
            </div>

            <Field label="Fill Date" htmlFor="roll-fill-date">
              <Controller
                name="fill_date"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="roll-fill-date"
                    aria-label="Fill Date"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
          </div>
        </SectionCard>

        <NetCreditDebitPreview
          costToClose={costToClose}
          newPremium={newPremium}
          contracts={contracts}
        />

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> A ROLL_FROM leg (buy-to-close) and ROLL_TO leg
          (sell-to-open) will be recorded as a linked pair. The position remains in CSP_OPEN phase.
        </AlertBox>
      </SheetBody>

      <SheetFooter>
        <FormButton label="Cancel" variant="secondary" onClick={onClose} style={{ flex: 1 }} />
        <FormButton
          label="Confirm Roll"
          pendingLabel="Rolling…"
          isPending={isPending}
          onClick={onSubmit}
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </>
  )
}
