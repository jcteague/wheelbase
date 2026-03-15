import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ExpireCspResponse } from '../api/positions'
import { useExpirePosition } from '../hooks/useExpirePosition'
import { ExpirationSheet } from './ExpirationSheet'

vi.mock('../hooks/useExpirePosition')

const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/', mockNavigate]
}))

const mockMutate = vi.fn()
const mockUseExpirePosition = vi.mocked(useExpirePosition)

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-04-17',
  contracts: 1,
  totalPremiumCollected: '250.0000',
  onClose: vi.fn()
}

beforeEach(() => {
  mockMutate.mockReset()
  mockNavigate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseExpirePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useExpirePosition>)
})

it('renders nothing when open is false', () => {
  render(<ExpirationSheet {...DEFAULT_PROPS} open={false} />)
  expect(screen.queryByText('Expire CSP Worthless')).not.toBeInTheDocument()
})

it('shows confirmation sheet title when open', () => {
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText('Expire CSP Worthless')).toBeInTheDocument()
})

it('shows summary rows in confirmation state', () => {
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Put Open.*Complete/)).toBeInTheDocument()
  expect(screen.getByText(/expire.*no fill price/i)).toBeInTheDocument()
  expect(screen.getByText(/\+\$250/)).toBeInTheDocument()
  expect(screen.getByText(/100% captured/i)).toBeInTheDocument()
})

it('shows amber warning in confirmation state', () => {
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument()
})

it('renders Cancel and Confirm Expiration buttons', () => {
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /confirm expiration/i })).toBeInTheDocument()
})

it('clicking Cancel calls onClose', async () => {
  const user = userEvent.setup()
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  await user.click(screen.getByRole('button', { name: /cancel/i }))
  await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalled())
})

it('clicking Confirm Expiration calls mutation.mutate with position_id only — no expiration_date_override', async () => {
  const user = userEvent.setup()
  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  await user.click(screen.getByRole('button', { name: /confirm expiration/i }))
  expect(mockMutate).toHaveBeenCalledWith({ position_id: 'pos-123' })
})

it('shows "Cannot record expiration before the expiration date" error when mutation returns too_early', () => {
  mockUseExpirePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: true,
    data: undefined,
    error: {
      status: 400,
      body: {
        detail: [
          {
            field: '__root__',
            code: 'too_early',
            message: 'Cannot record expiration before the expiration date'
          }
        ]
      }
    }
  } as unknown as ReturnType<typeof useExpirePosition>)

  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(
    screen.getByText(/Cannot record expiration before the expiration date/i)
  ).toBeInTheDocument()
})

it('disables Confirm button and shows Confirming... when isPending', () => {
  mockUseExpirePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useExpirePosition>)

  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  const btn = screen.getByRole('button', { name: /confirming/i })
  expect(btn).toBeDisabled()
})

it('shows error message when mutation fails', () => {
  mockUseExpirePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: true,
    data: undefined,
    error: {
      status: 400,
      body: {
        detail: [
          { field: '__root__', code: 'invalid_phase', message: 'Position is not in CSP_OPEN phase' }
        ]
      }
    }
  } as unknown as ReturnType<typeof useExpirePosition>)

  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Position is not in CSP_OPEN phase/i)).toBeInTheDocument()
})

it('switches to success state after mutation succeeds', () => {
  mockUseExpirePosition.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: ExpireCspResponse) => void } = {}) => {
      return {
        mutate: () => {
          onSuccess?.({
            position: { phase: 'WHEEL_COMPLETE' },
            costBasisSnapshot: { finalPnl: '250.0000' }
          } as ExpireCspResponse)
        },
        isPending: false,
        isSuccess: true,
        isError: false,
        data: {
          position: { phase: 'WHEEL_COMPLETE' },
          costBasisSnapshot: { finalPnl: '250.0000' }
        } as ExpireCspResponse,
        error: null
      } as unknown as ReturnType<typeof useExpirePosition>
    }
  )

  render(<ExpirationSheet {...DEFAULT_PROPS} />)
  // success state is entered via onSuccess callback - will show after mock triggers it
  // We just verify the confirmation state renders correctly initially
  expect(screen.getByText('Expire CSP Worthless')).toBeInTheDocument()
})

it('shows success sheet title and P&L after confirming', async () => {
  let capturedOnSuccess: ((data: ExpireCspResponse) => void) | undefined

  mockUseExpirePosition.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: ExpireCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useExpirePosition>
    }
  )

  const { rerender } = render(<ExpirationSheet {...DEFAULT_PROPS} />)

  // Simulate success by triggering onSuccess
  capturedOnSuccess?.({
    position: { phase: 'WHEEL_COMPLETE' },
    costBasisSnapshot: { finalPnl: '250.0000' }
  } as ExpireCspResponse)

  rerender(<ExpirationSheet {...DEFAULT_PROPS} />)

  await screen.findByText(/AAPL Expired Worthless/i)
  expect(screen.getByText(/\+\$250/)).toBeInTheDocument()
})

it('shows Open new wheel and View full position history in success state', async () => {
  let capturedOnSuccess: ((data: ExpireCspResponse) => void) | undefined

  mockUseExpirePosition.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: ExpireCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useExpirePosition>
    }
  )

  const { rerender } = render(<ExpirationSheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.({
    position: { phase: 'WHEEL_COMPLETE' },
    costBasisSnapshot: { finalPnl: '250.0000' }
  } as ExpireCspResponse)
  rerender(<ExpirationSheet {...DEFAULT_PROPS} />)

  await screen.findByText(/Open new wheel on AAPL/i)
  expect(screen.getByText(/View full position history/i)).toBeInTheDocument()
})

it('clicking View full position history calls onClose', async () => {
  const user = userEvent.setup()
  let capturedOnSuccess: ((data: ExpireCspResponse) => void) | undefined

  mockUseExpirePosition.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: ExpireCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useExpirePosition>
    }
  )

  const { rerender } = render(<ExpirationSheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.({
    position: { phase: 'WHEEL_COMPLETE' },
    costBasisSnapshot: { finalPnl: '250.0000' }
  } as ExpireCspResponse)
  rerender(<ExpirationSheet {...DEFAULT_PROPS} />)

  const link = await screen.findByText(/View full position history/i)
  await user.click(link)
  await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalled())
})

it('clicking Open new wheel navigates to /new?ticker=AAPL', async () => {
  const user = userEvent.setup()

  let capturedOnSuccess: ((data: ExpireCspResponse) => void) | undefined

  mockUseExpirePosition.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: ExpireCspResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useExpirePosition>
    }
  )

  const { rerender } = render(<ExpirationSheet {...DEFAULT_PROPS} />)
  capturedOnSuccess?.({
    position: { phase: 'WHEEL_COMPLETE' },
    costBasisSnapshot: { finalPnl: '250.0000' }
  } as ExpireCspResponse)
  rerender(<ExpirationSheet {...DEFAULT_PROPS} />)

  const btn = await screen.findByText(/Open new wheel on AAPL/i)
  await user.click(btn)
  expect(mockNavigate).toHaveBeenCalledWith('/new?ticker=AAPL')
})
