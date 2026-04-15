import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { CloseCcEarlyForm } from './CloseCcEarlyForm'

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
  strike: '182.0000',
  contracts: 1,
  openPremium: '2.3000',
  basisPerShare: '174.2000',
  ccExpiration: '2026-02-21',
  closePrice: '',
  fillDate: '',
  priceError: null,
  dateError: null,
  isPending: false,
  isError: false,
  error: null,
  onClosePriceChange: vi.fn(),
  onFillDateChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn()
}

it('renders the form header "Close Covered Call Early"', () => {
  render(<CloseCcEarlyForm {...DEFAULT_PROPS} />)
  expect(screen.getByText('Close Covered Call Early')).toBeInTheDocument()
})

it('renders close price input and fill date picker', () => {
  render(<CloseCcEarlyForm {...DEFAULT_PROPS} />)
  expect(screen.getByLabelText(/close price/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/fill date/i)).toBeInTheDocument()
})
