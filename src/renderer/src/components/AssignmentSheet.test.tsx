import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onChange,
    onBlur,
    id,
    'aria-label': ariaLabel
  }: {
    value?: string
    onChange: (value: string) => void
    onBlur?: () => void
    id?: string
    'aria-label'?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      placeholder="YYYY-MM-DD"
    />
  )
}))

const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/', mockNavigate]
}))

const mockMutate = vi.fn()
const mockUseAssignPosition = vi.fn()
vi.mock('../hooks/useAssignPosition', () => ({
  useAssignPosition: mockUseAssignPosition
}))

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-04-17',
  contracts: 1,
  openFillDate: '2026-03-01',
  premiumWaterfall: [
    { label: 'CSP premium', amount: '2.5000' },
    { label: 'Roll credit', amount: '0.2500' }
  ],
  projectedBasisPerShare: '177.2500',
  onClose: vi.fn(),
  onOpenCoveredCall: vi.fn()
}

const SUCCESS_RESPONSE = {
  position: { id: 'pos-123', ticker: 'AAPL', phase: 'HOLDING_SHARES', status: 'ACTIVE' },
  leg: { fillDate: '2026-04-17', contracts: 1, strike: '180.0000' },
  costBasisSnapshot: { basisPerShare: '177.2500', totalPremiumCollected: '2.7500' },
  premiumWaterfall: DEFAULT_PROPS.premiumWaterfall
}

const renderAssignmentSheet = async (): Promise<import('@testing-library/react').RenderResult> => {
  const module = await import('./AssignmentSheet')
  return render(<module.AssignmentSheet {...DEFAULT_PROPS} />)
}

describe('AssignmentSheet', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockMutate.mockReset()
    mockUseAssignPosition.mockReset()
    DEFAULT_PROPS.onClose.mockReset()
    mockUseAssignPosition.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null
    })
  })

  it('renders the summary card with premium waterfall lines when open', async () => {
    await renderAssignmentSheet()

    expect(screen.getByText('Assign CSP to Shares')).toBeInTheDocument()
    expect(screen.getByText(/Assignment strike/i)).toBeInTheDocument()
    expect(screen.getByText(/CSP premium/i)).toBeInTheDocument()
    expect(screen.getByText(/Roll credit/i)).toBeInTheDocument()
    expect(screen.getByText(/Effective cost basis/i)).toBeInTheDocument()
  })

  it('shows phase transition badges: Sell Put → Holding Shares', async () => {
    await renderAssignmentSheet()

    expect(screen.getByText('Sell Put')).toBeInTheDocument()
    expect(screen.getAllByText('Holding Shares').length).toBeGreaterThan(0)
  })

  it('shows shares to receive as contracts × 100', async () => {
    await renderAssignmentSheet()

    expect(screen.getByText(/Shares to receive/i)).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('shows Confirm Assignment button enabled with a valid date', async () => {
    const user = userEvent.setup()
    await renderAssignmentSheet()

    await user.type(screen.getByLabelText(/assignment date/i), '2026-04-17')

    expect(screen.getByRole('button', { name: /confirm assignment/i })).toBeEnabled()
  })

  it('shows red inline error "Assignment date is required" when submitted with no date', async () => {
    const user = userEvent.setup()
    await renderAssignmentSheet()

    await user.click(screen.getByRole('button', { name: /confirm assignment/i }))

    expect(screen.getByText('Assignment date is required')).toBeInTheDocument()
  })

  it('shows red inline error "Assignment date cannot be before the CSP open date" for a date before openFillDate', async () => {
    const user = userEvent.setup()
    await renderAssignmentSheet()

    await user.type(screen.getByLabelText(/assignment date/i), '2026-02-28')
    await user.click(screen.getByRole('button', { name: /confirm assignment/i }))

    expect(
      screen.getByText('Assignment date cannot be before the CSP open date')
    ).toBeInTheDocument()
  })

  it('shows gold soft warning "This date is in the future — are you sure?" for a future date and keeps Confirm Assignment enabled', async () => {
    const user = userEvent.setup()
    await renderAssignmentSheet()

    await user.type(screen.getByLabelText(/assignment date/i), '2099-01-01')

    expect(screen.getByText('This date is in the future — are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm assignment/i })).toBeEnabled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    await renderAssignmentSheet()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalled())
  })

  it('renders success state with hero card "HOLDING 100 SHARES" and effective cost basis after mutation succeeds', async () => {
    let capturedOnSuccess: ((data: typeof SUCCESS_RESPONSE) => void) | undefined

    mockUseAssignPosition.mockImplementation(
      ({ onSuccess }: { onSuccess?: (data: typeof SUCCESS_RESPONSE) => void } = {}) => {
        capturedOnSuccess = onSuccess
        return {
          mutate: mockMutate,
          isPending: false,
          isSuccess: false,
          isError: false,
          data: undefined,
          error: null
        }
      }
    )

    const { rerender } = await renderAssignmentSheet()
    capturedOnSuccess?.(SUCCESS_RESPONSE)
    const module = await import('./AssignmentSheet')
    rerender(<module.AssignmentSheet {...DEFAULT_PROPS} />)

    expect(screen.getByText('HOLDING 100 SHARES')).toBeInTheDocument()
    expect(screen.getByText(/Effective Cost Basis/i)).toBeInTheDocument()
  })

  it('success state shows strategic nudge text about waiting 1–3 days', async () => {
    let capturedOnSuccess: ((data: typeof SUCCESS_RESPONSE) => void) | undefined

    mockUseAssignPosition.mockImplementation(
      ({ onSuccess }: { onSuccess?: (data: typeof SUCCESS_RESPONSE) => void } = {}) => {
        capturedOnSuccess = onSuccess
        return {
          mutate: mockMutate,
          isPending: false,
          isSuccess: false,
          isError: false,
          data: undefined,
          error: null
        }
      }
    )

    const { rerender } = await renderAssignmentSheet()
    capturedOnSuccess?.(SUCCESS_RESPONSE)
    const module = await import('./AssignmentSheet')
    rerender(<module.AssignmentSheet {...DEFAULT_PROPS} />)

    expect(screen.getByText(/1–3 days/i)).toBeInTheDocument()
  })

  it('success state shows "Open Covered Call" CTA button', async () => {
    let capturedOnSuccess: ((data: typeof SUCCESS_RESPONSE) => void) | undefined

    mockUseAssignPosition.mockImplementation(
      ({ onSuccess }: { onSuccess?: (data: typeof SUCCESS_RESPONSE) => void } = {}) => {
        capturedOnSuccess = onSuccess
        return {
          mutate: mockMutate,
          isPending: false,
          isSuccess: false,
          isError: false,
          data: undefined,
          error: null
        }
      }
    )

    const { rerender } = await renderAssignmentSheet()
    capturedOnSuccess?.(SUCCESS_RESPONSE)
    const module = await import('./AssignmentSheet')
    rerender(<module.AssignmentSheet {...DEFAULT_PROPS} />)

    expect(screen.getByRole('button', { name: /open covered call/i })).toBeInTheDocument()
  })
})
