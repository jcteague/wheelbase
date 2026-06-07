import { render, screen } from '@testing-library/react'
import type { PositionListItem } from '../api/positions'
import type { OptionSnapshot } from '../api/market-data'
import { PositionRow } from './PositionCard'
import type { StockQuote } from './PriceCell'

function renderRow(
  item: PositionListItem,
  opts: { quote?: StockQuote; snapshot?: OptionSnapshot } = {}
): ReturnType<typeof render> {
  return render(
    <table>
      <tbody>
        <PositionRow item={item} index={0} quote={opts.quote} snapshot={opts.snapshot} />
      </tbody>
    </table>
  )
}

const BASE_ITEM: PositionListItem = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '180.0000',
  expiration: '2026-04-17',
  dte: 42,
  instrumentType: 'PUT',
  contracts: 1,
  entryPremiumPerContract: '3.5000',
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000',
  profitTargetPercent: null
}

const AAPL_SNAPSHOT: OptionSnapshot = {
  bid: '1.20',
  ask: '1.40',
  mid: '1.30',
  lastTrade: '1.30',
  openInterest: 1000,
  volume: 500,
  greeks: { delta: '-0.30', gamma: '0.02', theta: '-0.05', vega: '0.10', iv: '0.25' },
  timestamp: '2026-04-28T10:00:00Z'
}

it('renders ticker', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText('AAPL')).toBeInTheDocument()
})

it('renders phase badge', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText('CSP Open')).toBeInTheDocument()
})

it('renders strike formatted as currency', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText('$180.00')).toBeInTheDocument()
})

it('renders expiration date', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText(/2026-04-17/)).toBeInTheDocument()
})

it('renders DTE as integer', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText(/42/)).toBeInTheDocument()
})

it('renders premium collected formatted as currency', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText('$250.00')).toBeInTheDocument()
})

it('renders effective cost basis formatted as currency', () => {
  renderRow(BASE_ITEM)
  expect(screen.getByText('$177.50')).toBeInTheDocument()
})

it('renders — when dte is null', () => {
  const item: PositionListItem = {
    ...BASE_ITEM,
    ticker: 'SPY',
    phase: 'WHEEL_COMPLETE',
    status: 'CLOSED',
    strike: null,
    expiration: null,
    dte: null,
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null
  }
  renderRow(item)
  // dte null shows dash placeholder; strike and expiration also null
  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
})

it('renders data-testid position-card-closed for a CLOSED position', () => {
  const item: PositionListItem = {
    ...BASE_ITEM,
    phase: 'WHEEL_COMPLETE',
    status: 'CLOSED',
    strike: null,
    expiration: null,
    dte: null,
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null
  }
  renderRow(item)
  expect(screen.getByTestId('position-card-closed')).toBeInTheDocument()
})

it('renders PriceCell in the third column when quote is provided', () => {
  const quote: StockQuote = {
    price: '182.45',
    bid: '182.44',
    ask: '182.46',
    prevClose: '181.00',
    volume: 0,
    timestamp: '2026-01-01T10:00:00Z'
  }
  renderRow(BASE_ITEM, { quote })
  expect(screen.getByText('$182.45')).toBeInTheDocument()
})

it('renders PriceCell with quote=undefined when quote prop is missing', () => {
  renderRow(BASE_ITEM)
  // PriceCell renders — when quote is undefined
  const dashes = screen.getAllByText('—')
  expect(dashes.length).toBeGreaterThan(0)
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0)
})

it('column order is Ticker, Phase, Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis', () => {
  const quote: StockQuote = {
    price: '182.45',
    bid: '182.44',
    ask: '182.46',
    prevClose: '181.00',
    volume: 0,
    timestamp: '2026-01-01T10:00:00Z'
  }
  renderRow(BASE_ITEM, { quote, snapshot: AAPL_SNAPSHOT })
  const cells = screen.getAllByRole('cell')
  // 10 columns: Ticker(0), Phase(1), Price(2), Opt Mid(3), P&L(4), Strike(5), Expiration(6), DTE(7), Premium(8), CostBasis(9)
  expect(cells).toHaveLength(10)
  expect(cells[2]).toHaveTextContent('$182.45')
  expect(cells[3]).toHaveTextContent('$1.30')
  expect(cells[5]).toHaveTextContent('$180.00')
})

it('passes snapshot to OptMidCell so the mid renders as $1.30', () => {
  renderRow(BASE_ITEM, { snapshot: AAPL_SNAPSHOT })
  const cell = screen.getByTestId('position-card-AAPL-opt-mid')
  expect(cell).toHaveTextContent('$1.30')
})

it('passes snapshot to UnrealizedPnlCell so a profit P&L renders', () => {
  // entry 3.50, mid 1.30, contracts 1 -> pnl=+220, percent ≈ 62.86%
  renderRow(BASE_ITEM, { snapshot: AAPL_SNAPSHOT })
  const cell = screen.getByTestId('position-card-AAPL-pnl')
  expect(cell).toHaveTextContent('+$220.00')
})

it('renders TargetBadge next to ticker when target reached at default 50%', () => {
  // entry 3.50, mid 1.30 -> ~62.86% (>= 50% default)
  renderRow(BASE_ITEM, { snapshot: AAPL_SNAPSHOT })
  expect(screen.getByTestId('target-badge')).toBeInTheDocument()
})

it('renders no TargetBadge when below default 50% threshold', () => {
  // entry 3.50, mid 2.50 -> ~28.57% — below 50%
  const snap: OptionSnapshot = { ...AAPL_SNAPSHOT, bid: '2.40', ask: '2.60', mid: '2.50' }
  renderRow(BASE_ITEM, { snapshot: snap })
  expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
})

it('renders no TargetBadge when snapshot is undefined', () => {
  renderRow(BASE_ITEM)
  expect(screen.queryByTestId('target-badge')).not.toBeInTheDocument()
})

it('renders dashes for HOLDING_SHARES row in Opt Mid and P&L cells', () => {
  const item: PositionListItem = {
    ...BASE_ITEM,
    phase: 'HOLDING_SHARES',
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null,
    strike: null,
    expiration: null,
    dte: null
  }
  renderRow(item)
  const optMid = screen.getByTestId('position-card-AAPL-opt-mid')
  const pnl = screen.getByTestId('position-card-AAPL-pnl')
  expect(optMid).toHaveTextContent('—')
  expect(pnl).toHaveTextContent('—')
})

it('renders unavailable helper copy for missing option snapshot on an active option leg', () => {
  renderRow(BASE_ITEM)

  expect(screen.getByTestId('position-card-AAPL-opt-mid')).toHaveTextContent('unavailable')
})

it('renders TargetBadge using per-position override when crossed', () => {
  // override 25%, entry 3.50, mid 2.50 -> ~28.57% (>= 25%)
  const item: PositionListItem = { ...BASE_ITEM, profitTargetPercent: 25 }
  const snap: OptionSnapshot = { ...AAPL_SNAPSHOT, bid: '2.40', ask: '2.60', mid: '2.50' }
  renderRow(item, { snapshot: snap })
  expect(screen.getByTestId('target-badge')).toBeInTheDocument()
})
