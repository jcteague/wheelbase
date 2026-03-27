import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { useExpireCoveredCall } from '../hooks/useExpireCoveredCall'
import { CcExpirationSheet } from './CcExpirationSheet'

vi.mock('../hooks/useExpireCoveredCall')

const mockMutate = vi.fn()
const mockUseExpireCoveredCall = vi.mocked(useExpireCoveredCall)

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  strike: '182.0000',
  expiration: '2026-02-21',
  expirationDisplay: 'Feb 21, 2026',
  contracts: 1,
  premiumPerContract: '2.3000',
  sharesHeld: 100,
  onClose: vi.fn()
}

beforeEach(() => {
  mockMutate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseExpireCoveredCall.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useExpireCoveredCall>)
})

// ---------------------------------------------------------------------------
// Confirmation state
// ---------------------------------------------------------------------------

it('renders position summary in confirmation state: ticker, strike, expiration', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/AAPL.*CALL.*\$182/i)).toBeInTheDocument()
  expect(screen.getByText(/Feb 21, 2026/i)).toBeInTheDocument()
})

it('renders contracts in confirmation state', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/1/)).toBeInTheDocument()
})

it('renders phase transition "Call Open → Holding" in confirmation state', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  // PhaseBadge for CC_OPEN and HOLDING_SHARES should both appear
  expect(screen.getByText(/call open|cc.open/i)).toBeInTheDocument()
  expect(screen.getByText(/holding/i)).toBeInTheDocument()
})

it('renders premium captured highlight row in confirmation state', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/premium captured/i)).toBeInTheDocument()
  expect(screen.getByText(/\+\$230/)).toBeInTheDocument()
  expect(screen.getByText(/100%/)).toBeInTheDocument()
})

it('renders irrevocable warning "This cannot be undone." in confirmation state', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument()
})

it('renders Cancel and "Confirm Expiration" footer buttons', () => {
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /confirm expiration/i })).toBeInTheDocument()
})

it('clicking "Confirm Expiration" calls useExpireCoveredCall.mutate with { position_id: positionId }', async () => {
  const user = userEvent.setup()
  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  await user.click(screen.getByRole('button', { name: /confirm expiration/i }))
  expect(mockMutate).toHaveBeenCalledWith({ position_id: 'pos-123' })
})

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------

function renderSuccess(): Promise<void> {
  let capturedOnSuccess: ((data: unknown) => void) | undefined
  mockUseExpireCoveredCall.mockImplementation(
    (options?: { onSuccess?: (data: unknown) => void }) => {
      capturedOnSuccess = options?.onSuccess
      return {
        mutate: () => {
          capturedOnSuccess?.({
            position: {
              id: 'pos-123',
              ticker: 'AAPL',
              phase: 'HOLDING_SHARES',
              status: 'ACTIVE',
              closedDate: null
            },
            leg: {
              legRole: 'EXPIRE',
              action: 'EXPIRE',
              instrumentType: 'CALL',
              fillDate: '2026-02-21',
              premiumPerContract: '0.0000'
            },
            costBasisSnapshot: { basisPerShare: '174.2000', totalPremiumCollected: '580.0000' },
            sharesHeld: 100
          })
        },
        isPending: false,
        isSuccess: true,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useExpireCoveredCall>
    }
  )

  render(<CcExpirationSheet {...DEFAULT_PROPS} />)
  // Trigger mutation to enter success state
  return userEvent.setup().click(screen.getByRole('button', { name: /confirm expiration/i }))
}

it('success state renders green hero card with "+$230 premium captured (100%)"', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(screen.getByText(/\+\$230/)).toBeInTheDocument()
    expect(screen.getByText(/100%.*premium captured|premium captured.*100%/i)).toBeInTheDocument()
  })
})

it('success state renders "Still Holding: 100 shares of AAPL" badge inside hero card', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(screen.getByText(/100 shares of AAPL/i)).toBeInTheDocument()
  })
})

it('success state renders result summary: leg recorded (expire · Feb 21, 2026)', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(screen.getByText(/expire/i)).toBeInTheDocument()
    expect(screen.getByText(/Feb 21, 2026/i)).toBeInTheDocument()
  })
})

it('success state renders Phase badge for HOLDING_SHARES', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(screen.getAllByText(/holding/i).length).toBeGreaterThan(0)
  })
})

it('success state renders CC premium collected highlight row', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(screen.getByText(/CC premium collected/i)).toBeInTheDocument()
  })
})

it('success state renders strategic nudge text in info AlertBox', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(
      screen.getByText(/Many traders wait 1.3 days before selling the next covered call/i)
    ).toBeInTheDocument()
  })
})

it('success state renders "Sell New Covered Call on AAPL →" FormButton', async () => {
  await renderSuccess()
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: /Sell New Covered Call on AAPL/i })
    ).toBeInTheDocument()
  })
})

it('clicking "Sell New Covered Call on AAPL →" calls onClose', async () => {
  await renderSuccess()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Sell New Covered Call on AAPL/i })
    ).toBeInTheDocument()
  )
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: /Sell New Covered Call on AAPL/i }))
  expect(DEFAULT_PROPS.onClose).toHaveBeenCalled()
})
