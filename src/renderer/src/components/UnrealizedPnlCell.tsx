import React from 'react'
import Decimal from 'decimal.js'
import { computeUnrealizedPnl } from '../../../main/core/costbasis'
import { formatSignedMoney } from '../lib/format'
import { formatPnlPercentForDisplay } from '../lib/option-display'

type UnrealizedPnlLeg = {
  contracts: number
  entryPremiumPerContract: string
}

type UnrealizedPnlSnapshot = {
  mid: string
}

type UnrealizedPnlCellProps = {
  ticker: string
  leg: UnrealizedPnlLeg | null
  snapshot: UnrealizedPnlSnapshot | undefined
}

const CELL_CLASS = 'font-wb-mono px-4 py-2.5 border-b border-wb-border/40 align-top'

function formatSignedPercent(value: string): string {
  const display = formatPnlPercentForDisplay(value)
  const isNonNegative = new Decimal(value).gte(0)
  const withSign = isNonNegative && !display.startsWith('-') ? `+${display}` : display
  return `${withSign}%`
}

export function UnrealizedPnlCell({
  ticker,
  leg,
  snapshot
}: UnrealizedPnlCellProps): React.JSX.Element {
  const testId = `position-card-${ticker}-pnl`

  if (leg === null || snapshot === undefined) {
    return (
      <td data-testid={testId} className={CELL_CLASS}>
        <div className="text-[0.8125rem] font-semibold text-wb-text-muted">—</div>
      </td>
    )
  }

  const { pnl, pnlPercent } = computeUnrealizedPnl({
    entryPremium: leg.entryPremiumPerContract,
    currentMid: snapshot.mid,
    contracts: leg.contracts
  })

  const isNonNegative = new Decimal(pnl).gte(0)
  const colorClass = isNonNegative ? 'text-wb-green' : 'text-wb-red'
  const dollarText = formatSignedMoney(pnl)
  const percentText = formatSignedPercent(pnlPercent)
  const titleText = `${formatPnlPercentForDisplay(pnlPercent)}% of max profit`

  return (
    <td data-testid={testId} title={titleText} className={CELL_CLASS}>
      <div className={`text-[0.8125rem] font-semibold ${colorClass}`}>{dollarText}</div>
      <div className={`text-[0.68rem] font-medium mt-px ${colorClass}`}>{percentText}</div>
    </td>
  )
}
