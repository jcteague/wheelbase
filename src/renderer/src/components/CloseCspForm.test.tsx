import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { useClosePosition } from '../hooks/useClosePosition'
import { CloseCspForm } from './CloseCspForm'

vi.mock('../hooks/useClosePosition')

const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/', mockNavigate]
}))

const mockMutate = vi.fn()
const mockUseClosePosition = vi.mocked(useClosePosition)

const DEFAULT_PROPS = {
  positionId: 'pos-123',
  openPremiumPerContract: '2.50',
  contracts: 1,
  expiration: '2026-04-17',
  openFillDate: '2026-03-01'
}

beforeEach(() => {
  mockMutate.mockReset()
  mockNavigate.mockReset()
  mockUseClosePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useClosePosition>)
})

it('renders close price input and submit button', () => {
  render(<CloseCspForm {...DEFAULT_PROPS} />)
  expect(screen.getByTestId('close-price-input')).toBeInTheDocument()
  expect(screen.getByTestId('close-csp-submit')).toBeInTheDocument()
})

it('shows P&L preview for a profit close (close < premium)', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '1.00')

  await waitFor(() => {
    expect(screen.getByText(/Net P&L.*\$1\.50/i)).toBeInTheDocument()
    expect(screen.getByText(/Total P&L.*\$150\.00/i)).toBeInTheDocument()
    expect(screen.getByText(/60%/)).toBeInTheDocument()
  })
})

it('shows P&L preview for a loss close (close > premium)', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '3.50')

  await waitFor(() => {
    expect(screen.getByText(/-\$1\.00/)).toBeInTheDocument()
    expect(screen.getByText(/-\$100\.00/)).toBeInTheDocument()
    expect(screen.getByText(/-40%/)).toBeInTheDocument()
  })
})

it('shows validation error when close price is empty on submit', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.click(screen.getByTestId('close-csp-submit'))

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

it('shows validation error when close price is 0', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '0')
  await user.click(screen.getByTestId('close-csp-submit'))

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

it('shows loading state when mutation is pending', () => {
  mockUseClosePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useClosePosition>)

  render(<CloseCspForm {...DEFAULT_PROPS} />)
  const btn = screen.getByTestId('close-csp-submit')
  expect(btn).toBeDisabled()
})

it('navigates home from the mutation success callback after submit', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '1.00')
  await user.click(screen.getByTestId('close-csp-submit'))

  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  const options = mockMutate.mock.calls[0][1]
  expect(options).toEqual(
    expect.objectContaining({
      onSuccess: expect.any(Function)
    })
  )

  act(() => {
    options.onSuccess()
  })

  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('shows server validation error from the mutation error callback', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '1.00')
  await user.click(screen.getByTestId('close-csp-submit'))

  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  const options = mockMutate.mock.calls[0][1]

  act(() => {
    options.onError({
      status: 400,
      body: {
        detail: [
          {
            field: 'close_price_per_contract',
            code: 'must_be_positive',
            message: 'Close price must be positive'
          }
        ]
      }
    })
  })

  await waitFor(() => {
    expect(screen.getByText(/close price must be positive/i)).toBeInTheDocument()
  })
})

it('maps server field errors from the mutation error callback', async () => {
  const user = userEvent.setup()
  render(<CloseCspForm {...DEFAULT_PROPS} />)

  await user.type(screen.getByTestId('close-price-input'), '1.00')
  await user.click(screen.getByTestId('close-csp-submit'))

  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  const options = mockMutate.mock.calls[0][1]
  expect(options).toEqual(
    expect.objectContaining({
      onError: expect.any(Function)
    })
  )

  act(() => {
    options.onError({
      status: 400,
      body: {
        detail: [
          {
            field: 'close_price_per_contract',
            code: 'must_be_positive',
            message: 'Close price must be positive'
          }
        ]
      }
    })
  })

  await waitFor(() => {
    expect(screen.getByText(/close price must be positive/i)).toBeInTheDocument()
  })
})
