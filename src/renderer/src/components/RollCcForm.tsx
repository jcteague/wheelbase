import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { DatePicker } from '@/components/ui/date-picker'
import { computeDte, fmtMoney } from '../lib/format'
import {
  computeNetCreditDebit,
  getCcRollTypeDetail,
  getCcRollTypeLabel,
  getRollPreview,
  rollCreditDebitColors
} from '../lib/rolls'
import { computeGuardrailComparison } from './openCcGuardrail'
import { AlertBox } from './ui/AlertBox'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'
import { SummaryRow } from './ui/SummaryRow'

export type RollCcFormValues = {
  new_strike: string
  new_expiration: string
  cost_to_close: string
  new_premium: string
  fill_date?: string
}

type RollCcFormProps = {
  ticker: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  basisPerShare: string
  register: UseFormRegister<RollCcFormValues>
  errors: FieldErrors<RollCcFormValues>
  control: Control<RollCcFormValues>
  costToClose: string
  newPremium: string
  newStrike: string
  newExpiration: string
  isPending: boolean
  onSubmit: () => void
  onClose: () => void
}

function NetCreditDebitPreview({
  costToClose,
  newPremium,
  contracts,
  rollType
}: {
  costToClose: string
  newPremium: string
  contracts: number
  rollType: string
}): React.JSX.Element | null {
  const close = parseFloat(costToClose)
  const prem = parseFloat(newPremium)
  if (isNaN(close) || isNaN(prem) || close <= 0 || prem <= 0) return null

  const { net, isCredit, total } = computeNetCreditDebit(close, prem, contracts)
  const { bg, border } = rollCreditDebitColors(isCredit)
  const sign = isCredit ? '+' : '-'
  const label = isCredit ? 'Net Credit' : 'Net Debit'

  return (
    <div
      style={{ borderRadius: 6, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}
    >
      <div className="flex items-center justify-between px-[14px] py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-wb-mono text-[11px] text-wb-text-secondary">{label}</span>
          {rollType !== 'No Change' && (
            <span
              className={`font-wb-mono text-[10px] font-bold tracking-[0.06em] uppercase ${isCredit ? 'text-wb-green' : 'text-wb-gold'}`}
            >
              {rollType}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={`font-wb-mono text-[17px] font-bold ${isCredit ? 'text-wb-green' : 'text-wb-gold'}`}
          >
            {sign}${Math.abs(net).toFixed(2)}/contract
          </span>
          <span
            className={`font-wb-mono text-[11px] opacity-70 ${isCredit ? 'text-wb-green' : 'text-wb-gold'}`}
          >
            (${total.toFixed(2)} total)
          </span>
        </div>
      </div>
      {!isCredit && (
        <div
          className="font-wb-mono px-[14px] py-2 text-[11px] text-wb-gold"
          style={{ borderTop: `1px solid ${border}` }}
        >
          ⚠ This roll costs more to close than the new premium provides
        </div>
      )}
    </div>
  )
}

export function RollCcForm({
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
  newExpiration,
  isPending,
  onSubmit,
  onClose
}: RollCcFormProps): React.JSX.Element {
  const dte = computeDte(expiration)
  const totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(2)
  const rollType = getCcRollTypeLabel({
    currentStrike: strike,
    newStrike,
    currentExpiration: expiration,
    newExpiration
  })

  const { projectedBasis, hasNetValues } = getRollPreview({
    currentBasis: basisPerShare,
    costToClose,
    newPremium
  })
  const guardrail = computeGuardrailComparison(newStrike, projectedBasis)
  const belowCostBasis = guardrail?.type === 'below'
  const basisDiff = belowCostBasis ? Math.abs(guardrail!.diffPerShare).toFixed(2) : null

  const rollDetail =
    rollType !== 'No Change' && newStrike !== '' && newExpiration !== ''
      ? getCcRollTypeDetail({
          currentStrike: strike,
          newStrike,
          currentExpiration: expiration,
          newExpiration
        })
      : ''
  const eyebrowLabel = rollDetail ? `${rollType}: ${rollDetail}` : rollType

  return (
    <>
      <SheetHeader
        eyebrow={eyebrowLabel}
        title="Roll Covered Call"
        subtitle={`${ticker} CALL ${fmtMoney(strike)} · exp ${expiration}`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Current Leg */}
        <SectionCard header="Current Leg">
          <div className="px-4 py-3 flex flex-col gap-2">
            <SummaryRow label="Strike" value={fmtMoney(strike)} />
            <SummaryRow label="Expiration" value={`${expiration} (${dte} DTE)`} />
            <SummaryRow
              label="Premium collected"
              value={`+${fmtMoney(premiumPerContract)}/contract ($${totalPremium})`}
            />
            <SummaryRow label="Cost basis" value={`${fmtMoney(basisPerShare)}/share`} highlight />
            {hasNetValues && (
              <SummaryRow
                label="Projected basis (post-roll)"
                value={`${fmtMoney(projectedBasis)}/share`}
              />
            )}
          </div>
        </SectionCard>

        {/* New Leg */}
        <SectionCard header="New Leg" className="border-wb-border">
          <div className="px-[14px] py-4 flex flex-col gap-[14px]">
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

            <div className="grid grid-cols-2 gap-3">
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

        {rollType === 'No Change' && (
          <AlertBox variant="error">Roll must change the expiration, strike, or both.</AlertBox>
        )}

        {belowCostBasis && (
          <AlertBox variant="warning">
            New strike ({fmtMoney(newStrike)}) is below your cost basis ({fmtMoney(projectedBasis)}
            ). If called away, this guarantees a loss of <strong>${basisDiff}/share</strong>.
          </AlertBox>
        )}

        <NetCreditDebitPreview
          costToClose={costToClose}
          newPremium={newPremium}
          contracts={contracts}
          rollType={rollType}
        />

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> A ROLL_FROM leg (buy-to-close) and ROLL_TO leg
          (sell-to-open) will be recorded as a linked pair. The position remains in CC_OPEN phase.
        </AlertBox>
      </SheetBody>

      <SheetFooter>
        <FormButton label="Cancel" variant="secondary" onClick={onClose} style={{ flex: 1 }} />
        <FormButton
          label="Confirm Roll"
          pendingLabel="Rolling…"
          isPending={isPending}
          disabled={rollType === 'No Change'}
          onClick={onSubmit}
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </>
  )
}
