// [US-101] The "Opening cash flows" block. Deliberately no maximum profit, no breakeven,
// and no language that treats the short-call credit as earned.
import Decimal from 'decimal.js'
import type { PmccOpeningDebitResult } from '../../../main/core/costbasis'
import { fmtMoneyGrouped } from '../lib/format'

const DASH = '—'

type PmccCashFlowsProps = {
  /** `null` while the entry cannot be priced yet (a fill, strike or quantity missing). */
  debit: PmccOpeningDebitResult | null
}

export function PmccCashFlows({ debit }: PmccCashFlowsProps): React.JSX.Element {
  const money = (value: string | undefined): string =>
    value === undefined ? DASH : fmtMoneyGrouped(value)
  const ratio = debit?.debitToWidthPercent
  const rows = [
    ['LEAPS purchase cost', money(debit?.leapsCost)],
    ['Short-call credit', money(debit?.shortCredit)],
    ['Fees', money(debit?.fees)]
  ]
  return (
    <div className="rounded-lg border border-wb-border p-4 font-wb-mono text-xs">
      <div className="mb-3 font-semibold uppercase tracking-widest text-wb-text-secondary">
        Opening cash flows
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-wb-text-secondary">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col text-wb-text-secondary">
        <span>Strike width / share: {money(debit?.strikeWidthPerShare)}</span>
        <span>
          Debit / strike width, before fees: {ratio ? `${new Decimal(ratio).toFixed(2)}%` : DASH}
        </span>
      </div>
      <p className="mt-2 text-wb-text-muted">Opening credit is not yet realized profit.</p>
    </div>
  )
}
