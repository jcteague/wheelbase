import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { CloseCcEarlySuccess } from './CloseCcEarlySuccess'

const BASE_PROPS = {
  ticker: 'AAPL',
  strike: '182.0000',
  basisPerShare: '174.2000',
  closePrice: '1.1000',
  fillDate: '2026-02-01',
  openPremium: '2.3000',
  onClose: vi.fn()
}

it('renders the success header with ticker CC Closed', () => {
  render(<CloseCcEarlySuccess {...BASE_PROPS} ccLegPnl="120.0000" />)
  expect(screen.getByText(/AAPL CC Closed/i)).toBeInTheDocument()
})
