import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { CcForm } from './OpenCcForm'

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    'aria-label': ariaLabel,
    'data-testid': dataTestId
  }: {
    id?: string
    value?: string
    onChange: (value: string) => void
    'aria-label'?: string
    'data-testid'?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

const DEFAULT_PROPS = {
  ticker: 'AAPL',
  contracts: 2,
  sharesHeld: 200,
  basisPerShare: '174.2000',
  totalPremiumCollected: '510.0000',
  strike: '',
  premium: '',
  ccContracts: '2',
  expiration: '',
  fillDate: '',
  fieldErrors: {},
  guardrail: null,
  isPending: false,
  onStrikeChange: vi.fn(),
  onPremiumChange: vi.fn(),
  onContractsChange: vi.fn(),
  onExpirationChange: vi.fn(),
  onFillDateChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn()
}

it('renders the CC form with strike input', () => {
  render(<CcForm {...DEFAULT_PROPS} />)
  const input = document.querySelector('[data-testid="cc-strike"]')
  expect(input).toBeInTheDocument()
})

it('renders "Ticker" position summary label', () => {
  render(<CcForm {...DEFAULT_PROPS} />)
  expect(screen.getByText('Ticker')).toBeInTheDocument()
})
