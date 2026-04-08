import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { RollCspResponse } from '../api/positions'
import { useRollCsp } from '../hooks/useRollCsp'
import { RollCspSheet } from './RollCspSheet'

vi.mock('../hooks/useRollCsp')
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
const mockUseRollCsp = vi.mocked(useRollCsp)

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-04-18',
  contracts: 1,
  premiumPerContract: '3.5000',
  basisPerShare: '176.5000',
  totalPremiumCollected: '350.0000',
  onClose: vi.fn()
}

const SUCCESS_DEBIT_RESPONSE: RollCspResponse = {
  position: { id: 'pos-123', ticker: 'AAPL', phase: 'CSP_OPEN', status: 'ACTIVE' },
  rollFromLeg: {
    id: 'leg-from-2',
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'PUT',
    strike: '180.0000',
    expiration: '2026-04-18',
    contracts: 1,
    premium_per_contract: '3.0000',
    premiumPerContract: '3.0000',
    fillDate: '2026-04-04'
  },
  rollToLeg: {
    id: 'leg-to-2',
    legRole: 'ROLL_TO',
    action: 'SELL',
    instrumentType: 'PUT',
    strike: '180.0000',
    expiration: '2026-05-16',
    contracts: 1,
    premium_per_contract: '2.5000',
    premiumPerContract: '2.5000',
    fillDate: '2026-04-04'
  },
  rollChainId: 'chain-uuid-5678',
  costBasisSnapshot: {
    id: 'snap-2',
    positionId: 'pos-123',
    basisPerShare: '177.0000',
    totalPremiumCollected: '300.0000',
    finalPnl: null,
    snapshotAt: '2026-04-04T00:00:00.000Z',
    createdAt: '2026-04-04T00:00:00.000Z'
  }
}

const SUCCESS_CREDIT_RESPONSE: RollCspResponse = {
  position: { id: 'pos-123', ticker: 'AAPL', phase: 'CSP_OPEN', status: 'ACTIVE' },
  rollFromLeg: {
    id: 'leg-from-1',
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'PUT',
    strike: '180.0000',
    expiration: '2026-04-18',
    contracts: 1,
    premium_per_contract: '1.2000',
    premiumPerContract: '1.2000',
    fillDate: '2026-04-04'
  },
  rollToLeg: {
    id: 'leg-to-1',
    legRole: 'ROLL_TO',
    action: 'SELL',
    instrumentType: 'PUT',
    strike: '180.0000',
    expiration: '2026-05-16',
    contracts: 1,
    premium_per_contract: '2.8000',
    premiumPerContract: '2.8000',
    fillDate: '2026-04-04'
  },
  rollChainId: 'chain-uuid-1234',
  costBasisSnapshot: {
    id: 'snap-1',
    positionId: 'pos-123',
    basisPerShare: '174.9000',
    totalPremiumCollected: '510.0000',
    finalPnl: null,
    snapshotAt: '2026-04-04T00:00:00.000Z',
    createdAt: '2026-04-04T00:00:00.000Z'
  }
}

beforeEach(() => {
  mockMutate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseRollCsp.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useRollCsp>)
})

it('does not render when open=false', () => {
  render(<RollCspSheet {...DEFAULT_PROPS} open={false} />)
  expect(screen.queryByText('Roll Cash-Secured Put')).not.toBeInTheDocument()
})

it('renders title "Roll Cash-Secured Put" and eyebrow "Roll Out" when open=true', () => {
  render(<RollCspSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText('Roll Cash-Secured Put')).toBeInTheDocument()
  expect(screen.getByText('Roll Out')).toBeInTheDocument()
})

it('shows current leg section with strike, expiration, DTE, premium collected, cost basis', () => {
  render(<RollCspSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Current Leg/i)).toBeInTheDocument()
  // Strike appears in multiple places (header, current leg, input)
  expect(screen.getAllByText(/\$180\.00/).length).toBeGreaterThan(0)
  // Expiration with DTE — unique to current leg section
  expect(screen.getByText(/2026-04-18.*DTE/)).toBeInTheDocument()
  expect(screen.getByText(/\$350\.00/)).toBeInTheDocument()
  expect(screen.getByText(/\$176\.50.*\/share/)).toBeInTheDocument()
})

it('shows new leg fields: New Strike (pre-filled), New Expiration, Cost to Close, New Premium, Fill Date', () => {
  render(<RollCspSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/New Leg/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/new strike/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/new expiration/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/cost to close/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/new premium/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/fill date/i)).toBeInTheDocument()
})

it('shows net credit preview (green) when cost $1.20 and premium $2.80: "+$1.60/contract ($160.00 total)"', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.80')

  await waitFor(() => {
    expect(screen.getByText(/Net Credit/)).toBeInTheDocument()
    expect(screen.getByText(/\+\$1\.60\/contract/)).toBeInTheDocument()
    expect(screen.getByText(/\$160\.00 total/)).toBeInTheDocument()
  })
})

it('shows net debit preview (amber) when cost $3.00 and premium $2.50: "-$0.50/contract ($50.00 total)" with warning', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '3.00')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.50')

  await waitFor(() => {
    expect(screen.getByText(/Net Debit/)).toBeInTheDocument()
    expect(screen.getByText(/-\$0\.50\/contract/)).toBeInTheDocument()
    expect(screen.getByText(/\$50\.00 total/)).toBeInTheDocument()
    expect(
      screen.getByText(/This roll costs more to close than the new premium provides/)
    ).toBeInTheDocument()
  })
})

it('shows validation error "New expiration must be after the current expiration" on submit with earlier date', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.80')

  const expInput = screen.getByLabelText(/new expiration/i)
  await user.clear(expInput)
  await user.type(expInput, '2026-04-11')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(
      screen.getByText(/New expiration must be after the current expiration/i)
    ).toBeInTheDocument()
  })
})

it('shows validation error "Cost to close must be greater than zero" on submit with $0', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/Cost to close must be greater than zero/i)).toBeInTheDocument()
  })
})

it('shows validation error "New premium must be greater than zero" on submit with $0', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/New premium must be greater than zero/i)).toBeInTheDocument()
  })
})

it('renders success state with green header "Roll Complete", hero net credit, and summary card after onSuccess', () => {
  let capturedOnSuccess: ((data: RollCspResponse) => void) | undefined

  mockUseRollCsp.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: RollCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useRollCsp>
    }
  )

  const { rerender } = render(<RollCspSheet {...DEFAULT_PROPS} />)

  capturedOnSuccess?.(SUCCESS_CREDIT_RESPONSE)
  rerender(<RollCspSheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/Roll Complete/)).toBeInTheDocument()
  expect(screen.getByText(/CSP Rolled Successfully/)).toBeInTheDocument()
  expect(screen.getByText(/\+\$1\.60/)).toBeInTheDocument()
  expect(screen.getByText(/ROLL_FROM/)).toBeInTheDocument()
  expect(screen.getByText(/ROLL_TO/)).toBeInTheDocument()
  expect(screen.getByText(/\$176\.50/)).toBeInTheDocument()
  expect(screen.getByText(/\$174\.90/)).toBeInTheDocument()
})

it('renders success state for net-debit roll with gold/amber hero colors, not green', () => {
  let capturedOnSuccess: ((data: RollCspResponse) => void) | undefined

  mockUseRollCsp.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: RollCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useRollCsp>
    }
  )

  const { rerender } = render(<RollCspSheet {...DEFAULT_PROPS} />)

  capturedOnSuccess?.(SUCCESS_DEBIT_RESPONSE)
  rerender(<RollCspSheet {...DEFAULT_PROPS} />)

  // Should show "Roll Net Debit" label
  expect(screen.getByText(/Roll Net Debit/)).toBeInTheDocument()

  // The hero amount element should use gold/amber color, not green
  const heroAmount = screen.getByText(/-\$0\.50/)
  expect(heroAmount).toBeInTheDocument()
  const style = heroAmount.style
  expect(style.color).toContain('gold')
})

it('shows validation error when strike field is cleared and submitted', async () => {
  const user = userEvent.setup()
  render(<RollCspSheet {...DEFAULT_PROPS} />)

  const strikeInput = screen.getByLabelText(/new strike/i)
  await user.clear(strikeInput)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.80')

  const expInput = screen.getByLabelText(/new expiration/i)
  await user.clear(expInput)
  await user.type(expInput, '2026-05-16')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  // Should show a strike validation error instead of submitting NaN
  await waitFor(() => {
    expect(screen.getByText(/strike must be greater than zero/i)).toBeInTheDocument()
  })
  expect(mockMutate).not.toHaveBeenCalled()
})
