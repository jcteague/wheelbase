import Decimal from 'decimal.js'
import type { MarketStatus, StockQuote } from '../../api/market-data'
import { fmtMoney } from '../../lib/format'
import { SUB } from './styles'

function ChangeLine({ price, prevClose }: { price: string; prevClose: string }): React.JSX.Element {
  const change = new Decimal(price).minus(prevClose)
  const isUp = change.gte(0)
  return (
    <div
      className={`font-wb-mono text-[10.5px] tabular-nums ${isUp ? 'text-wb-green' : 'text-wb-red'}`}
    >
      {isUp ? '+' : '-'}
      {fmtMoney(change.abs().toFixed(2))}
    </div>
  )
}

type PriceBlockProps = {
  price: string | null
  sub: string
  testId?: string
  /** A closed card's price is closed, not unavailable: no tooltip, note or change line. */
  closed?: boolean
  /** Source of the change line; omitted for cards with no live quote. */
  quote?: StockQuote
  session?: MarketStatus['session']
}

export function PriceBlock({
  price,
  sub,
  testId,
  closed = false,
  quote,
  session
}: PriceBlockProps): React.JSX.Element {
  const unavailable = price === null && !closed
  return (
    <span
      data-testid={testId}
      title={unavailable ? 'Price unavailable' : undefined}
      className="text-right"
    >
      <div className="font-wb-mono text-[12.5px] tabular-nums text-wb-text-primary">
        {price === null ? '—' : fmtMoney(price)}
      </div>
      {unavailable && <div className={SUB}>unavailable</div>}
      {!closed && quote?.prevClose != null && session !== 'closed' && (
        <ChangeLine price={quote.price} prevClose={quote.prevClose} />
      )}
      <div className={SUB}>{sub}</div>
    </span>
  )
}
