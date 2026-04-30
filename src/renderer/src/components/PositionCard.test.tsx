import { render, screen } from '@testing-library/react'
import type { PositionListItem } from '../api/positions'
import { PositionRow } from './PositionCard'
import type { StockQuote } from './PriceCell'

function renderRow(item: PositionListItem, quote?: StockQuote): ReturnType<typeof render> {
  return render(
    <table>
      <tbody>
        <PositionRow item={item} index={0} quote={quote} />
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
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000'
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
    dte: null
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
    dte: null
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
  renderRow(BASE_ITEM, quote)
  expect(screen.getByText('$182.45')).toBeInTheDocument()
})

it('renders PriceCell with quote=undefined when quote prop is missing', () => {
  renderRow(BASE_ITEM)
  // PriceCell renders — when quote is undefined
  const dashes = screen.getAllByText('—')
  expect(dashes.length).toBeGreaterThan(0)
})

it('column order is Ticker, Phase, Price, Strike, Expiration, DTE, Premium, Cost Basis', () => {
  const quote: StockQuote = {
    price: '182.45',
    bid: '182.44',
    ask: '182.46',
    prevClose: '181.00',
    volume: 0,
    timestamp: '2026-01-01T10:00:00Z'
  }
  renderRow(BASE_ITEM, quote)
  const cells = screen.getAllByRole('cell')
  // 8 columns: Ticker(0), Phase(1), Price(2), Strike(3), Expiration(4), DTE(5), Premium(6), CostBasis(7)
  expect(cells).toHaveLength(8)
  expect(cells[2]).toHaveTextContent('$182.45')
  expect(cells[3]).toHaveTextContent('$180.00')
})
