import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CloseCcEarlyResponse } from '../api/positions'
import { useCloseCoveredCallEarly } from '../hooks/useCloseCoveredCallEarly'
import { CloseCcEarlySheet } from './CloseCcEarlySheet'

vi.mock('../hooks/useCloseCoveredCallEarly')
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

const mockMutate = vi.fn()
const mockUseCloseCoveredCallEarly = vi.mocked(useCloseCoveredCallEarly)

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  contracts: 1,
  openPremium: '2.3000',
  ccOpenFillDate: '2026-01-20',
  ccExpiration: '2026-02-21',
  strike: '182.0000',
  basisPerShare: '174.2000',
  onClose: vi.fn()
}

const SUCCESS_PROFIT_RESPONSE: CloseCcEarlyResponse = {
  position: {
    id: 'pos-123',
    ticker: 'AAPL',
    phase: 'HOLDING_SHARES',
    status: 'ACTIVE',
    closedDate: null
  },
  leg: {
    id: 'leg-1',
    positionId: 'pos-123',
    legRole: 'CC_CLOSE',
    action: 'BUY',
    instrumentType: 'CALL',
    strike: '182.0000',
    expiration: '2026-02-21',
    contracts: 1,
    premium_per_contract: '1.1000',
    premiumPerContract: '1.1000',
    fillPrice: '1.1000',
    fillDate: '2026-02-01',
    createdAt: '',
    updatedAt: ''
  },
  ccLegPnl: '120.0000'
}

const SUCCESS_LOSS_RESPONSE: CloseCcEarlyResponse = {
  ...SUCCESS_PROFIT_RESPONSE,
  leg: {
    ...SUCCESS_PROFIT_RESPONSE.leg,
    premium_per_contract: '3.5000',
    premiumPerContract: '3.5000',
    fillPrice: '3.5000'
  },
  ccLegPnl: '-120.0000'
}

beforeEach(() => {
  mockMutate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseCloseCoveredCallEarly.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useCloseCoveredCallEarly>)
})

it('does not render when open=false', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} open={false} />)
  expect(screen.queryByText('Close Covered Call Early')).not.toBeInTheDocument()
})

it('renders form header "Close Covered Call Early" when open=true', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText('Close Covered Call Early')).toBeInTheDocument()
})

it('renders position summary card with ticker, contracts, open premium, phase transition, and cost basis', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/AAPL/)).toBeInTheDocument()
  expect(screen.getAllByText(/Sell Call/i).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Holding Shares/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/unchanged/i)).toBeInTheDocument()
})

it('renders close price input and fill date picker', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  expect(screen.getByLabelText(/close price/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/fill date/i)).toBeInTheDocument()
})

it('shows profit P&L preview (+$120.00) when closePrice=1.10 and openPremium=2.30', async () => {
  const user = userEvent.setup()
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  const input = screen.getByLabelText(/close price/i)
  await user.clear(input)
  await user.type(input, '1.10')

  await waitFor(() => {
    expect(screen.getByText(/\+\$120\.00 profit/)).toBeInTheDocument()
  })
})

it('shows loss P&L preview (−$120.00) when closePrice=3.50 and openPremium=2.30', async () => {
  const user = userEvent.setup()
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  const input = screen.getByLabelText(/close price/i)
  await user.clear(input)
  await user.type(input, '3.50')

  await waitFor(() => {
    expect(screen.getByText(/\u2212\$120\.00 loss|-\$120\.00 loss/)).toBeInTheDocument()
  })
})

it('shows irrevocable warning AlertBox', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument()
})

it('shows inline error "Close price must be greater than zero" when submitted with empty price', async () => {
  const user = userEvent.setup()
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  await user.click(screen.getByRole('button', { name: /confirm close/i }))

  await waitFor(() => {
    expect(screen.getByText(/close price must be greater than zero/i)).toBeInTheDocument()
  })
})

it('shows inline error "Fill date cannot be before the CC open date" for fill date before CC open', async () => {
  const user = userEvent.setup()
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  const priceInput = screen.getByLabelText(/close price/i)
  await user.clear(priceInput)
  await user.type(priceInput, '1.10')

  const dateInput = screen.getByLabelText(/fill date/i)
  await user.clear(dateInput)
  await user.type(dateInput, '2026-01-19')

  await user.click(screen.getByRole('button', { name: /confirm close/i }))

  await waitFor(() => {
    expect(screen.getByText(/fill date cannot be before the cc open date/i)).toBeInTheDocument()
  })
})

it('renders success state with hero card "+$120.00" after successful profit close', () => {
  let capturedOnSuccess: ((data: CloseCcEarlyResponse) => void) | undefined

  mockUseCloseCoveredCallEarly.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: CloseCcEarlyResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useCloseCoveredCallEarly>
    }
  )

  const { rerender } = render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  capturedOnSuccess?.(SUCCESS_PROFIT_RESPONSE)
  rerender(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/\+\$120/)).toBeInTheDocument()
})

it('renders success state with hero card "−$120.00" after successful loss close', () => {
  let capturedOnSuccess: ((data: CloseCcEarlyResponse) => void) | undefined

  mockUseCloseCoveredCallEarly.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: CloseCcEarlyResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useCloseCoveredCallEarly>
    }
  )

  const { rerender } = render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  capturedOnSuccess?.(SUCCESS_LOSS_RESPONSE)
  rerender(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/\u2212\$120|-\$120/)).toBeInTheDocument()
})

it('renders "Sell New Covered Call on AAPL →" CTA in success state', () => {
  let capturedOnSuccess: ((data: CloseCcEarlyResponse) => void) | undefined

  mockUseCloseCoveredCallEarly.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: CloseCcEarlyResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useCloseCoveredCallEarly>
    }
  )

  const { rerender } = render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.(SUCCESS_PROFIT_RESPONSE)
  rerender(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/Sell New Covered Call on AAPL/i)).toBeInTheDocument()
})

it('renders phase transition CC_OPEN→HOLDING_SHARES in success summary card', () => {
  let capturedOnSuccess: ((data: CloseCcEarlyResponse) => void) | undefined

  mockUseCloseCoveredCallEarly.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: CloseCcEarlyResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useCloseCoveredCallEarly>
    }
  )

  const { rerender } = render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.(SUCCESS_PROFIT_RESPONSE)
  rerender(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  expect(screen.getAllByText(/Sell Call/i).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Holding Shares/i).length).toBeGreaterThan(0)
})

it('renders cost basis "(unchanged)" in success summary card', () => {
  let capturedOnSuccess: ((data: CloseCcEarlyResponse) => void) | undefined

  mockUseCloseCoveredCallEarly.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: CloseCcEarlyResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useCloseCoveredCallEarly>
    }
  )

  const { rerender } = render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.(SUCCESS_PROFIT_RESPONSE)
  rerender(<CloseCcEarlySheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/unchanged/i)).toBeInTheDocument()
})

it('calls onClose when Cancel is clicked', async () => {
  const user = userEvent.setup()
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  await user.click(screen.getByRole('button', { name: /cancel/i }))
  await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalled())
})

it('contracts field is read-only (displays value, not editable)', () => {
  render(<CloseCcEarlySheet {...DEFAULT_PROPS} />)
  const contractsEl = screen.getByText(/^1$/)
  expect(contractsEl.tagName).not.toBe('INPUT')
})
