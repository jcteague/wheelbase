import { render } from '@testing-library/react'
import { CcSuccess } from './OpenCcSuccess'

const DEFAULT_PROPS = {
  ticker: 'AAPL',
  strike: '185.0000',
  expiration: '2026-05-16',
  contracts: 2,
  basisPerShare: '172.4000',
  totalPremiumCollected: '660.0000',
  onClose: vi.fn()
}

it('renders the CC success state with ticker', () => {
  render(<CcSuccess {...DEFAULT_PROPS} />)
  expect(document.body.textContent).toContain('AAPL')
})
