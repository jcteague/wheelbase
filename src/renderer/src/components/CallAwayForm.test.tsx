import { render, screen } from '@testing-library/react'
import { CallAwayForm } from './CallAwayForm'

const DEFAULT_PROPS = {
  ticker: 'AAPL',
  ccStrike: '182.0000',
  ccExpiration: '2026-04-17',
  contracts: 1,
  sharesHeld: 100,
  basisPerShare: '174.2000',
  appreciationPerShare: '7.8000',
  appreciationTotal: '780.0000',
  finalPnl: '780.0000',
  capitalDeployed: '17420.0000',
  isPending: false,
  onSubmit: vi.fn(),
  onClose: vi.fn()
}

beforeEach(() => {
  DEFAULT_PROPS.onSubmit.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
})

it('renders the P&L Breakdown section', () => {
  render(<CallAwayForm {...DEFAULT_PROPS} />)
  expect(screen.getByText(/P&L Breakdown/i)).toBeInTheDocument()
})

it('renders the Fill Date label', () => {
  render(<CallAwayForm {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Fill Date/i)).toBeInTheDocument()
})

it('renders the Confirm Call-Away button', () => {
  render(<CallAwayForm {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /confirm call-away/i })).toBeInTheDocument()
})

it('renders the Cancel button', () => {
  render(<CallAwayForm {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
})
