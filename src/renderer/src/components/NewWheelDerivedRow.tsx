import { parsePositiveInputDecimal } from '../lib/decimal-input'
import { computeDteFromInput } from '../lib/format'
import { fmtYieldPercent } from '../lib/screener-format'
import { Caption } from './ui/Caption'

const SHARES_PER_CONTRACT = 100
const DAYS_PER_YEAR = 365
const PLACEHOLDER = '—'

type NewWheelDerivedRowProps = {
  strike: string
  contracts: string
  premium: string
  expiration: string
  /** True once the trader has overridden the promoted premium. */
  edited?: boolean
}

type Capital = { amount: string; workedOut: string }

function deriveCapital(strike: string, contracts: string): Capital | null {
  const strikeValue = parsePositiveInputDecimal(strike)
  const contractCount = parsePositiveInputDecimal(contracts)
  if (!strikeValue || !contractCount) return null

  const amount = strikeValue.times(SHARES_PER_CONTRACT).times(contractCount)
  return {
    amount: `$${Number(amount.toFixed(0)).toLocaleString('en-US')}`,
    workedOut: `${strikeValue.toString()} × ${SHARES_PER_CONTRACT} × ${contractCount.toString()} ${
      contractCount.equals(1) ? 'contract' : 'contracts'
    }`
  }
}

/** Period and annualized return if the put expires worthless, or `null` when an input
 *  is unusable — an expiration already at or past today has no period to annualize. */
function deriveYield(premium: string, strike: string, expiration: string): string | null {
  const premiumValue = parsePositiveInputDecimal(premium)
  const strikeValue = parsePositiveInputDecimal(strike)
  const dte = computeDteFromInput(expiration)
  if (!premiumValue || !strikeValue || dte === null || dte <= 0) return null

  const period = premiumValue.dividedBy(strikeValue)
  const annualized = period.times(DAYS_PER_YEAR).dividedBy(dte)
  return `${fmtYieldPercent(period.toString())} period · ${fmtYieldPercent(annualized.toString())}/yr`
}

/**
 * [US-68] The consequence of the promoted values, recomputed live as the trader edits:
 * what the put ties up, and what it pays if it expires flat. Rendered only in promoted
 * mode — the plain US-1 form is untouched.
 */
export function NewWheelDerivedRow({
  strike,
  contracts,
  premium,
  expiration,
  edited = false
}: NewWheelDerivedRowProps): React.JSX.Element {
  const capital = deriveCapital(strike, contracts)
  const yieldIfFlat = deriveYield(premium, strike, expiration)

  return (
    <div className="mt-1 flex items-baseline justify-between rounded-md border border-wb-border bg-wb-bg-surface px-[14px] py-3">
      <div data-testid="derived-capital" className="flex flex-col gap-[3px]">
        <Caption>Capital required</Caption>
        <span className="font-wb-mono text-[1.1rem] font-bold text-wb-text-primary">
          {capital?.amount ?? PLACEHOLDER}
        </span>
        {capital && (
          <span className="font-wb-mono text-[0.62rem] text-wb-text-muted">
            {capital.workedOut}
          </span>
        )}
      </div>
      <div data-testid="derived-yield" className="flex flex-col items-end gap-[3px]">
        <Caption>Yield if flat</Caption>
        <span className="font-wb-mono text-[0.9rem] font-semibold text-wb-green">
          {yieldIfFlat ?? PLACEHOLDER}
        </span>
        {edited && (
          <span className="font-wb-mono text-[0.62rem] text-wb-text-muted">
            recomputed from your price
          </span>
        )}
      </div>
    </div>
  )
}
