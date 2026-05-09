import React from 'react'
import { TableCell } from './ui/TablePrimitives'
import { fmtMoney } from '../lib/format'
import { hasNoBid, isWideSpread } from '../lib/option-display'

export type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
}

export type OptMidCellLeg = {
  instrumentType: 'PUT' | 'CALL'
}

type OptMidCellProps = {
  ticker: string
  leg: OptMidCellLeg | null
  snapshot: OptionSnapshot | undefined
}

export function OptMidCell({ ticker, leg, snapshot }: OptMidCellProps): React.JSX.Element {
  const testId = `position-card-${ticker}-opt-mid`

  if (leg === null) {
    return (
      <TableCell
        className="font-wb-mono px-4 py-2.5 border-b border-wb-border/40"
        data-testid={testId}
      >
        <div className="text-[0.8125rem] font-semibold text-wb-text-muted tracking-[0.02em]">—</div>
        <div className="text-[0.6rem] mt-px" />
      </TableCell>
    )
  }

  if (snapshot === undefined) {
    return (
      <TableCell
        className="font-wb-mono px-4 py-2.5 border-b border-wb-border/40 cursor-help"
        data-testid={testId}
        title="Option snapshot unavailable"
      >
        <div className="text-[0.8125rem] font-semibold text-wb-text-muted tracking-[0.02em]">—</div>
        <div className="text-[0.6rem] mt-px text-wb-text-muted">unavailable</div>
      </TableCell>
    )
  }

  const wide = isWideSpread(snapshot)
  const noBid = hasNoBid(snapshot)
  const tooltip = `Wide spread: ${fmtMoney(snapshot.bid)} × ${fmtMoney(snapshot.ask)} — P&L may be unreliable`

  return (
    <TableCell
      className="font-wb-mono px-4 py-2.5 border-b border-wb-border/40"
      data-testid={testId}
    >
      <div className="text-[0.8125rem] font-semibold text-wb-text-primary tracking-[0.02em]">
        {fmtMoney(snapshot.mid)}
      </div>
      <div className="text-[0.6rem] mt-px">
        {noBid ? (
          <span className="text-wb-text-muted">no bid</span>
        ) : wide ? (
          <span data-testid="opt-mid-spread-warning" title={tooltip} className="text-wb-gold">
            ⚠
          </span>
        ) : null}
      </div>
    </TableCell>
  )
}
