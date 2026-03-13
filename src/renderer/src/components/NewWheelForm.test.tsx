import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { NewWheelForm } from './NewWheelForm'

vi.mock('../hooks/useCreatePosition')

// DatePicker uses Radix Popover which needs a DOM environment;
// mock it as a controlled text input so tests can type dates directly.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onChange,
    onBlur,
    id,
    'aria-label': ariaLabel
  }: {
    value?: string
    onChange: (v: string) => void
    onBlur?: () => void
    id?: string
    hasError?: boolean
    'aria-label'?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder="YYYY-MM-DD"
    />
  )
}))

const mockMutate = vi.fn()
const mockUseCreatePosition = vi.mocked(useCreatePosition)

const VALID_FORM_VALUES = {
  ticker: 'AAPL',
  strike: '150.00',
  expiration: '2026-04-17',
  contracts: '1',
  premiumPerContract: '3.50'
}

beforeEach(() => {
  mockMutate.mockReset()
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useCreatePosition>)
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

it('renders all required input fields', () => {
  render(<NewWheelForm />)
  expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/strike/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/expiration/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/contracts/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/premium per contract/i)).toBeInTheDocument()
})

it('renders a submit button', () => {
  render(<NewWheelForm />)
  expect(screen.getByRole('button', { name: /open wheel|submit/i })).toBeInTheDocument()
})

it('has advanced section collapsed by default', () => {
  render(<NewWheelForm />)
  const toggle = screen.getByRole('button', { name: /advanced/i })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

// ---------------------------------------------------------------------------
// Validation on blur
// ---------------------------------------------------------------------------

it('shows validation error for ticker on blur when empty', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)
  const tickerInput = screen.getByLabelText(/ticker/i)
  await user.click(tickerInput)
  await user.tab()
  await waitFor(() => {
    expect(
      screen.getByText(/ticker/i, { selector: '[role="alert"], .error, [aria-live]' })
    ).toBeInTheDocument()
  })
})

it('shows validation error for strike on blur when empty', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)
  const strikeInput = screen.getByLabelText(/strike/i)
  await user.click(strikeInput)
  await user.tab()
  await waitFor(() => {
    expect(strikeInput.closest('div, fieldset')).toHaveTextContent(/.+/)
  })
})

// ---------------------------------------------------------------------------
// Pending state
// ---------------------------------------------------------------------------

it('disables submit button while mutation is pending', () => {
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useCreatePosition>)
  render(<NewWheelForm />)
  const submitBtn = screen.getByRole('button', { name: /open wheel|submit/i })
  expect(submitBtn).toBeDisabled()
})

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

it('calls mutation with correct payload on valid submit', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)

  await user.type(screen.getByLabelText(/ticker/i), VALID_FORM_VALUES.ticker)
  await user.type(screen.getByLabelText(/strike/i), VALID_FORM_VALUES.strike)
  await user.type(screen.getByLabelText(/expiration/i), VALID_FORM_VALUES.expiration)
  await user.type(screen.getByLabelText(/contracts/i), VALID_FORM_VALUES.contracts)
  await user.type(
    screen.getByLabelText(/premium per contract/i),
    VALID_FORM_VALUES.premiumPerContract
  )

  await user.click(screen.getByRole('button', { name: /open wheel|submit/i }))

  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledOnce()
  })

  const payload = mockMutate.mock.calls[0][0]
  expect(payload.ticker).toBe('AAPL')
  expect(payload.contracts).toBe(1)
})

it('shows success confirmation panel after successful submission', async () => {
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: true,
    isError: false,
    data: {
      position: { id: '1', ticker: 'AAPL', phase: 'CSP_OPEN', status: 'active' },
      leg: {},
      cost_basis_snapshot: { basis_per_share: '146.5000', total_premium_collected: '350.0000' }
    },
    error: null
  } as unknown as ReturnType<typeof useCreatePosition>)
  render(<NewWheelForm />)
  await waitFor(() => {
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/AAPL/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

it('shows inline field error from 400 response', async () => {
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: true,
    data: undefined,
    error: {
      status: 400,
      body: { detail: [{ field: 'ticker', message: 'invalid format' }] }
    }
  } as unknown as ReturnType<typeof useCreatePosition>)
  render(<NewWheelForm />)
  await waitFor(() => {
    expect(screen.getByText(/invalid format/i)).toBeInTheDocument()
  })
})

it('shows generic server error above submit button on 500', async () => {
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: true,
    data: undefined,
    error: { status: 500, body: { detail: 'Internal server error' } }
  } as unknown as ReturnType<typeof useCreatePosition>)
  render(<NewWheelForm />)
  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Advanced section
// ---------------------------------------------------------------------------

it('expands advanced section and shows fill date field on click', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)
  const toggle = screen.getByRole('button', { name: /advanced/i })
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByLabelText(/fill date/i)).toBeInTheDocument()
})
