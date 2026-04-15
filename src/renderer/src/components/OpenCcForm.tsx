import { fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'
import { DatePicker } from '@/components/ui/date-picker'
import { SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'
import type { GuardrailResult } from './openCcGuardrail'

export function CcForm({
  ticker,
  contracts,
  sharesHeld,
  basisPerShare,
  totalPremiumCollected,
  strike,
  premium,
  ccContracts,
  expiration,
  fillDate,
  fieldErrors,
  guardrail,
  isPending,
  onStrikeChange,
  onPremiumChange,
  onContractsChange,
  onExpirationChange,
  onFillDateChange,
  onSubmit,
  onClose
}: {
  ticker: string
  contracts: number
  sharesHeld: number
  basisPerShare: string
  totalPremiumCollected: string
  strike: string
  premium: string
  ccContracts: string
  expiration: string
  fillDate: string
  fieldErrors: Record<string, string>
  guardrail: GuardrailResult
  isPending: boolean
  onStrikeChange: (v: string) => void
  onPremiumChange: (v: string) => void
  onContractsChange: (v: string) => void
  onExpirationChange: (v: string) => void
  onFillDateChange: (v: string) => void
  onSubmit: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <>
      <SheetHeader
        eyebrow="Open Covered Call"
        title="Sell Covered Call"
        subtitle={`Holding ${sharesHeld} shares · cost basis ${fmtMoney(basisPerShare)}/share`}
        onClose={onClose}
      />
      <SheetBody>
        <SectionCard header="Position">
          <div className="p-4 grid gap-2 text-xs">
            {[
              ['Ticker', ticker, 'text-wb-text-primary'],
              ['Shares held', String(sharesHeld), 'text-wb-sky'],
              ['Effective cost basis', `${fmtMoney(basisPerShare)}/share`, 'text-wb-gold'],
              ['Total premium collected', fmtMoney(totalPremiumCollected), 'text-wb-text-primary']
            ].map(([label, value, colorClass]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-wb-text-secondary">{label}</span>
                <span className={`font-semibold ${colorClass}`}>{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <Field label="Strike" htmlFor="cc-strike" error={fieldErrors.strike}>
          <NumberInput
            id="cc-strike"
            data-testid="cc-strike"
            type="number"
            prefix="$"
            hasError={Boolean(fieldErrors.strike)}
            value={strike}
            onChange={(e) => onStrikeChange(e.target.value)}
            placeholder="182.00"
          />
        </Field>

        {guardrail && guardrail.type !== 'above' && (
          <div data-testid="guardrail-warning">
            <AlertBox variant="warning">{guardrail.message}</AlertBox>
          </div>
        )}
        {guardrail && guardrail.type === 'above' && (
          <AlertBox variant="info">{guardrail.message}</AlertBox>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Premium / Share" htmlFor="cc-premium" error={fieldErrors.premium}>
            <NumberInput
              id="cc-premium"
              data-testid="cc-premium"
              type="number"
              hasError={Boolean(fieldErrors.premium)}
              value={premium}
              onChange={(e) => onPremiumChange(e.target.value)}
              placeholder="2.30"
            />
          </Field>
          <Field
            label="Contracts"
            htmlFor="cc-contracts"
            error={fieldErrors.contracts}
            hint={`Max ${contracts}`}
          >
            <NumberInput
              id="cc-contracts"
              data-testid="cc-contracts"
              type="number"
              hasError={Boolean(fieldErrors.contracts)}
              value={ccContracts}
              onChange={(e) => onContractsChange(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Expiration" htmlFor="cc-expiration" error={fieldErrors.expiration}>
          <DatePicker
            id="cc-expiration"
            data-testid="cc-expiration"
            aria-label="Expiration"
            value={expiration}
            hasError={Boolean(fieldErrors.expiration)}
            onChange={onExpirationChange}
          />
        </Field>

        <Field label="Fill Date" htmlFor="cc-fill-date" error={fieldErrors.fillDate}>
          <DatePicker
            id="cc-fill-date"
            data-testid="cc-fill-date"
            aria-label="Fill Date"
            value={fillDate}
            onChange={onFillDateChange}
          />
        </Field>

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> The position will transition to CC Open. Full leg
          history is preserved.
        </AlertBox>
      </SheetBody>
      <SheetFooter>
        <FormButton label="Cancel" variant="secondary" onClick={onClose} style={{ flex: 1 }} />
        <FormButton
          label="Open Covered Call"
          pendingLabel="Opening…"
          isPending={isPending}
          onClick={onSubmit}
          data-testid="cc-submit"
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </>
  )
}
