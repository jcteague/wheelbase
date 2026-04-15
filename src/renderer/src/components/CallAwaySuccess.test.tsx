import { render, screen } from '@testing-library/react'
import { CallAwaySuccess } from './CallAwaySuccess'

const DEFAULT_PROPS = {
  ticker: 'AAPL',
  ccStrike: '182.0000',
  ccExpiration: '2026-04-17',
  sharesHeld: 100,
  finalPnl: '780.0000',
  cycleDays: 99,
  annualizedReturn: '16.5084',
  fillDate: '2026-04-17',
  onClose: vi.fn()
}

beforeEach(() => {
  DEFAULT_PROPS.onClose.mockReset()
})

it('renders "WHEEL COMPLETE" heading', () => {
  render(<CallAwaySuccess {...DEFAULT_PROPS} />)
  expect(screen.getByText('WHEEL COMPLETE')).toBeInTheDocument()
})

it('renders the final P&L value', () => {
  render(<CallAwaySuccess {...DEFAULT_PROPS} />)
  expect(screen.getAllByText(/\+?\$?780/).length).toBeGreaterThan(0)
})

it('renders cycle duration', () => {
  render(<CallAwaySuccess {...DEFAULT_PROPS} />)
  expect(screen.getByText(/99/)).toBeInTheDocument()
})

it('renders annualized return', () => {
  render(<CallAwaySuccess {...DEFAULT_PROPS} />)
  expect(screen.getByText(/16\.5/)).toBeInTheDocument()
})

it('renders "Start New Wheel" button', () => {
  render(<CallAwaySuccess {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Start New Wheel/i)).toBeInTheDocument()
})
