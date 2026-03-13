import { render, screen } from '@testing-library/react'
import type { PositionListItem } from '../api/positions'
import { PositionRow } from './PositionCard'

function renderRow(item: PositionListItem): ReturnType<typeof render> {
  return render(
    <table>
      <tbody>
        <PositionRow item={item} index={0} />
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
