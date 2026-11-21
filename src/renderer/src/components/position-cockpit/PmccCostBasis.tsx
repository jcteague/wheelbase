import Decimal from 'decimal.js'
import type { PmccLedgerResult } from '../../api/positions'
import { fmtMoneyGrouped, fmtPct1 } from '../../lib/format'
import { CollapsedDrawer } from './CollapsedDrawer'
import { DrawerCaption } from './DrawerCaption'
import { StatGrid } from '../ui/Stat'
import { money4 } from '../../../../shared/decimal-text'

type PmccCostBasisProps = { ledger: PmccLedgerResult }

/** The PMCC running cash ledger. Credits stay neutral: a credit is cash in, not profit. */
export function PmccCostBasis({ ledger }: PmccCostBasisProps): React.JSX.Element {
  return (
    <CollapsedDrawer title="Cost basis" fieldCount={6} defaultOpen>
      <DrawerCaption>US-103 · cash ledger, never a quote</DrawerCaption>
      <StatGrid
        minWidth={150}
        items={[
          {
            label: 'Cost basis / share',
            value: <span className="text-wb-sky">{fmtMoneyGrouped(ledger.basisPerShare)}</span>
          },
          { label: 'Total', value: fmtMoneyGrouped(ledger.basisTotal) },
          { label: 'LEAPS cost to date', value: fmtMoneyGrouped(ledger.leapsCostPerShare) },
          {
            label: 'Short-call credits to date',
            value: fmtMoneyGrouped(money4(new Decimal(ledger.shortCreditsPerShare).neg()))
          },
          {
            label: 'Effective share cost',
            value: ledger.effectiveShareCost ? fmtMoneyGrouped(ledger.effectiveShareCost) : '—'
          },
          {
            label: 'Premium recovered',
            value: ledger.premiumRecoveredPercent ? fmtPct1(ledger.premiumRecoveredPercent) : '—'
          }
        ]}
      />
    </CollapsedDrawer>
  )
}
