import React from 'react'
import Decimal from 'decimal.js'
import { fmtMoney } from '../lib/format'

export type StockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}

type PriceCellProps = {
  quote: StockQuote | undefined
  session?: string
  testId?: string
}

function ChangeLine({ price, prevClose }: { price: string; prevClose: string }): React.JSX.Element {
  const change = new Decimal(price).minus(new Decimal(prevClose))
  const isUp = change.gte(0)
  const sign = isUp ? '+' : '-'
  const absFormatted = fmtMoney(Math.abs(change.toNumber()).toFixed(2))

  return (
    <div className={isUp ? 'text-wb-green' : 'text-wb-red'}>
      {sign}
      {absFormatted}
    </div>
  )
}

export function PriceCell({ quote, session, testId }: PriceCellProps): React.JSX.Element {
  if (quote === undefined) {
    return (
      <td data-testid={testId} title="Price unavailable" className="cursor-help">
        <div>—</div>
        <div className="text-[0.75em] text-wb-text-muted">unavailable</div>
      </td>
    )
  }

  const isClosed = session === 'closed'
  const displayPrice = isClosed && quote.prevClose !== null ? quote.prevClose : quote.price

  return (
    <td data-testid={testId}>
      <div>{fmtMoney(displayPrice)}</div>
      {!isClosed && quote.prevClose !== null && (
        <ChangeLine price={quote.price} prevClose={quote.prevClose} />
      )}
    </td>
  )
}
