import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, vi } from 'vitest'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { usePromotedQuote } from '../hooks/usePromotedQuote'
import type { PromotedCandidate, PromotedQuote } from '../lib/promote'
import { fmtQuoteTime } from '../lib/screener-format'
import type { MarketStatusDisplay } from './MarketStatusPill'
import { NewWheelForm } from './NewWheelForm'

vi.mock('../hooks/useCreatePosition')
// [US-68] Promoted mode reconciles against a one-shot quote and the market session;
// neither should reach IPC from a form unit test.
vi.mock('../hooks/usePromotedQuote')
vi.mock('../hooks/useMarketStatusDisplay')

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
const mockUsePromotedQuote = vi.mocked(usePromotedQuote)
const mockUseMarketStatusDisplay = vi.mocked(useMarketStatusDisplay)

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

it('navigates to the created position 2 seconds after mutation success', async () => {
  vi.useFakeTimers()
  try {
    const navigate = vi.fn()
    const successData = {
      position: { id: 'pos-456', ticker: 'AAPL', phase: 'CSP_OPEN' },
      cost_basis_snapshot: { total_premium_collected: '350.00', basis_per_share: '146.50' }
    }

    const { rerender } = render(<NewWheelForm navigate={navigate} />)

    // Simulate mutation transitioning to success
    mockUseCreatePosition.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isSuccess: true,
      isError: false,
      data: successData,
      error: null
    } as unknown as ReturnType<typeof useCreatePosition>)

    rerender(<NewWheelForm navigate={navigate} />)

    expect(navigate).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(navigate).toHaveBeenCalledWith('/positions/pos-456')
  } finally {
    vi.useRealTimers()
  }
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

it('shows inline field error from the 400 mutation error callback', async () => {
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

  const options = mockMutate.mock.calls[0][1]

  act(() => {
    options.onError({
      status: 400,
      body: { detail: [{ field: 'ticker', message: 'invalid format' }] }
    })
  })

  await waitFor(() => {
    expect(screen.getByText(/invalid format/i)).toBeInTheDocument()
  })
})

it('maps 400 field errors onto form fields from the mutation error callback', async () => {
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
            field: 'premium_per_contract',
            code: 'must_be_positive',
            message: 'Premium must be positive'
          }
        ]
      }
    })
  })

  await waitFor(() => {
    expect(screen.getByText(/premium must be positive/i)).toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// defaultTicker prop
// ---------------------------------------------------------------------------

it('pre-populates ticker input when defaultTicker is provided', () => {
  render(<NewWheelForm defaultTicker="AAPL" />)
  expect(screen.getByLabelText(/ticker/i)).toHaveValue('AAPL')
})

it('leaves ticker input empty when no defaultTicker is provided', () => {
  render(<NewWheelForm />)
  expect(screen.getByLabelText(/ticker/i)).toHaveValue('')
})

// ---------------------------------------------------------------------------
// [US-68] Promoted mode
// ---------------------------------------------------------------------------

const PROMOTED_QUOTED_AT = '2026-08-07T20:00:02Z'
const PROMOTED_FRESH_AT = '2026-08-07T20:11:40Z'
const PROMOTED_NOTE = 'Would own below $170; waiting for IV to lift'

const PROMOTED: PromotedCandidate = {
  ticker: 'AAPL',
  strike: '180',
  expiration: '2026-08-21',
  premium: '2.70',
  quotedAt: PROMOTED_QUOTED_AT,
  thesis: PROMOTED_NOTE
}

function setPromotedQuote(quote: PromotedQuote): void {
  mockUsePromotedQuote.mockReturnValue({ quote })
}

function setMarketDisplay(display: MarketStatusDisplay): void {
  mockUseMarketStatusDisplay.mockReturnValue({
    settingsQuery: {} as ReturnType<typeof useMarketStatusDisplay>['settingsQuery'],
    hasBroker: true,
    statusQuery: {} as ReturnType<typeof useMarketStatusDisplay>['statusQuery'],
    display
  })
}

const banner = (): HTMLElement => screen.getByTestId('promote-banner')
const premiumInput = (): HTMLElement => screen.getByLabelText(/premium per contract/i)

beforeEach(() => {
  // Call history, not just the return value: the "mounts no market-data hooks" test
  // asserts these were never invoked, which earlier renders would otherwise satisfy.
  mockUsePromotedQuote.mockClear()
  mockUseMarketStatusDisplay.mockClear()
  setPromotedQuote('pending')
  setMarketDisplay('LIVE')
})

describe('NewWheelForm — promoted mode', () => {
  it('pre-fills every structural field from the promoted candidate', () => {
    render(<NewWheelForm promoted={PROMOTED} />)

    expect(screen.getByLabelText(/ticker/i)).toHaveValue('AAPL')
    expect(screen.getByLabelText(/strike/i)).toHaveValue('180')
    expect(screen.getByLabelText(/expiration/i)).toHaveValue('2026-08-21')
    expect(screen.getByLabelText(/contracts/i)).toHaveValue('1')
    expect(premiumInput()).toHaveValue('2.70')
  })

  it('surfaces the seeded thesis without making the trader hunt for it', () => {
    render(<NewWheelForm promoted={PROMOTED} />)

    expect(screen.getByLabelText(/thesis/i)).toHaveValue(PROMOTED_NOTE)
  })

  it('shows the capital the promoted put would tie up', () => {
    render(<NewWheelForm promoted={PROMOTED} />)

    expect(screen.getByTestId('derived-capital')).toHaveTextContent('$18,000')
  })

  it('names the screener as the source, with the promoted quote time', () => {
    render(<NewWheelForm promoted={PROMOTED} />)

    expect(screen.getByTestId('promote-provenance')).toHaveTextContent(
      `Quoted ${fmtQuoteTime(PROMOTED_QUOTED_AT)}`
    )
  })

  it('accepts an edit to the pre-filled premium', async () => {
    const user = userEvent.setup()
    render(<NewWheelForm promoted={PROMOTED} />)

    await user.clear(premiumInput())
    await user.type(premiumInput(), '2.65')

    expect(premiumInput()).toHaveValue('2.65')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('records the edited premium, not the screener snapshot', async () => {
    const user = userEvent.setup()
    render(<NewWheelForm promoted={PROMOTED} />)

    await user.clear(premiumInput())
    await user.type(premiumInput(), '2.65')
    await user.click(screen.getByRole('button', { name: /open wheel|submit/i }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalledOnce())
    expect(mockMutate.mock.calls[0][0]).toMatchObject({
      ticker: 'AAPL',
      strike: 180,
      contracts: 1,
      premium_per_contract: 2.65
    })
  })

  it('never submits on its own', () => {
    render(<NewWheelForm promoted={PROMOTED} />)

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('shows the fresh quote’s time and confirms the match, leaving the premium alone', async () => {
    setPromotedQuote({ mark: '2.68', timestamp: PROMOTED_FRESH_AT })
    render(<NewWheelForm promoted={PROMOTED} />)

    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'match'))
    expect(screen.getByTestId('promote-provenance')).toHaveTextContent(
      `Quoted ${fmtQuoteTime(PROMOTED_FRESH_AT)}`
    )
    expect(premiumInput()).toHaveValue('2.70')
  })

  it('warns that the price moved without overwriting or blocking the form', async () => {
    setPromotedQuote({ mark: '2.50', timestamp: PROMOTED_FRESH_AT })
    render(<NewWheelForm promoted={PROMOTED} />)

    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'moved'))
    expect(banner()).toHaveTextContent(
      'Price moved: quoted $2.70 → now $2.50 — review before submitting.'
    )
    expect(premiumInput()).toHaveValue('2.70')
    expect(screen.getByRole('button', { name: /open wheel|submit/i })).toBeEnabled()
  })

  it('degrades to the screener snapshot when the fresh quote cannot be fetched', async () => {
    setPromotedQuote('failed')
    render(<NewWheelForm promoted={PROMOTED} />)

    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'offline'))
    expect(banner()).toHaveTextContent(
      `Couldn't refresh quote — showing screener snapshot from ${fmtQuoteTime(PROMOTED_QUOTED_AT)}`
    )
    expect(premiumInput()).toHaveValue('2.70')
    expect(screen.getByRole('button', { name: /open wheel|submit/i })).toBeEnabled()
  })

  it.each(['CLOSED', 'EXT'] as const)(
    'flags the pre-filled mark as a stale after-hours snapshot when the market reads %s',
    async (display) => {
      setMarketDisplay(display)
      setPromotedQuote({ mark: '2.70', timestamp: PROMOTED_FRESH_AT })
      render(<NewWheelForm promoted={PROMOTED} />)

      await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'stale'))
      expect(banner()).toHaveTextContent(/stale (after-hours )?snapshot/)
      // The pill reads EXT during a post session, so the copy must not say "closed".
      if (display === 'EXT') expect(banner()).not.toHaveTextContent('Market closed')
      expect(screen.getByRole('button', { name: /open wheel|submit/i })).toBeEnabled()
    }
  )

  it('confirms the trader’s own price once they override the promoted mark', async () => {
    const user = userEvent.setup()
    setPromotedQuote({ mark: '2.70', timestamp: PROMOTED_FRESH_AT })
    render(<NewWheelForm promoted={PROMOTED} />)

    await user.clear(premiumInput())
    await user.type(premiumInput(), '2.65')

    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'edited'))
    expect(banner()).toHaveTextContent(
      'Recording your entered price ($2.65), not the screener snapshot ($2.70).'
    )
  })

  it('recomputes the yield from the overridden premium while the capital holds', async () => {
    const user = userEvent.setup()
    render(<NewWheelForm promoted={PROMOTED} />)

    await user.clear(premiumInput())
    await user.type(premiumInput(), '2.65')

    await waitFor(() =>
      expect(screen.getByTestId('derived-yield')).toHaveTextContent('recomputed from your price')
    )
    expect(screen.getByTestId('derived-capital')).toHaveTextContent('$18,000')
  })

  it('leaves the plain form untouched when nothing was promoted', () => {
    render(<NewWheelForm defaultTicker="AAPL" />)

    expect(screen.getByLabelText(/ticker/i)).toHaveValue('AAPL')
    expect(screen.queryByTestId('promote-provenance')).not.toBeInTheDocument()
    expect(screen.queryByTestId('promote-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('derived-capital')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  // Not merely a disabled query: the market-data hooks must not mount at all, or the
  // plain US-1 form would start `useMarketStatusDisplay`'s 60s broker-status poll on
  // a page that makes no market calls.
  it('mounts no market-data hooks for a form that was not promoted', () => {
    render(<NewWheelForm />)

    expect(mockUsePromotedQuote).not.toHaveBeenCalled()
    expect(mockUseMarketStatusDisplay).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Error and navigation paths
// ---------------------------------------------------------------------------

async function submitValidForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/ticker/i), VALID_FORM_VALUES.ticker)
  await user.type(screen.getByLabelText(/strike/i), VALID_FORM_VALUES.strike)
  await user.type(screen.getByLabelText(/expiration/i), VALID_FORM_VALUES.expiration)
  await user.type(screen.getByLabelText(/contracts/i), VALID_FORM_VALUES.contracts)
  await user.type(
    screen.getByLabelText(/premium per contract/i),
    VALID_FORM_VALUES.premiumPerContract
  )
  await user.click(screen.getByRole('button', { name: /open wheel|submit/i }))
  await waitFor(() => expect(mockMutate).toHaveBeenCalledOnce())
}

it('maps no field errors when the mutation fails with a non-400 status', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)
  await submitValidForm(user)

  act(() => {
    mockMutate.mock.calls[0][1].onError({ status: 500, body: { detail: 'boom' } })
  })

  // A 500 carries no per-field detail, so nothing may be pinned to an input.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('ignores a 400 field error naming a field the form does not have', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)
  await submitValidForm(user)

  act(() => {
    mockMutate.mock.calls[0][1].onError({
      status: 400,
      body: { detail: [{ field: 'unmapped_column', message: 'nowhere to show this' }] }
    })
  })

  expect(screen.queryByText(/nowhere to show this/i)).not.toBeInTheDocument()
})

it('navigates immediately when the success card’s View position action is used', async () => {
  const user = userEvent.setup()
  const navigate = vi.fn()
  mockUseCreatePosition.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: true,
    isError: false,
    data: {
      position: { id: 'pos-789', ticker: 'AAPL', phase: 'CSP_OPEN' },
      cost_basis_snapshot: { total_premium_collected: '350.00', basis_per_share: '146.50' }
    },
    error: null
  } as unknown as ReturnType<typeof useCreatePosition>)

  render(<NewWheelForm navigate={navigate} />)
  await user.click(screen.getByRole('button', { name: /view position/i }))

  expect(navigate).toHaveBeenCalledWith('/positions/pos-789')
})

it('survives a successful mutation when no navigate handler was supplied', () => {
  vi.useFakeTimers()
  try {
    mockUseCreatePosition.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isSuccess: true,
      isError: false,
      data: {
        position: { id: 'pos-000', ticker: 'AAPL', phase: 'CSP_OPEN' },
        cost_basis_snapshot: { total_premium_collected: '350.00', basis_per_share: '146.50' }
      },
      error: null
    } as unknown as ReturnType<typeof useCreatePosition>)

    render(<NewWheelForm />)
    expect(() => act(() => void vi.advanceTimersByTime(2000))).not.toThrow()
  } finally {
    vi.useRealTimers()
  }
})

it('does not run date validation on blur while a date field is still empty', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm />)

  await user.click(screen.getByRole('button', { name: /advanced/i }))
  await user.click(screen.getByLabelText(/expiration/i))
  await user.tab()
  await user.click(screen.getByLabelText(/fill date/i))
  await user.tab()

  // Touching and leaving an untouched date field must not raise "required" noise.
  expect(screen.queryByText(/date must be/i)).not.toBeInTheDocument()
})

it('drops the DTE hint rather than showing NaN when a promoted expiration is cleared', async () => {
  const user = userEvent.setup()
  render(<NewWheelForm promoted={PROMOTED} />)

  await user.clear(screen.getByLabelText(/expiration/i))

  await waitFor(() => expect(screen.queryByText(/DTE$/)).not.toBeInTheDocument())
  expect(screen.getByTestId('derived-yield')).toHaveTextContent('—')
  expect(screen.getByTestId('derived-yield')).not.toHaveTextContent('NaN')
})

// ---------------------------------------------------------------------------
// [US-68] Promoted mode — provenance vs banner, and override independence
// ---------------------------------------------------------------------------

describe('NewWheelForm — promoted mode, quote provenance', () => {
  // Two different instants, each naming what it describes: the strip reports the
  // freshest mark we hold; the banner reports the mark actually in the premium field.
  it('reports the fresh quote in the strip and the pre-filled mark’s own time in the banner', async () => {
    setMarketDisplay('CLOSED')
    setPromotedQuote({ mark: '2.70', timestamp: PROMOTED_FRESH_AT })
    render(<NewWheelForm promoted={PROMOTED} />)

    await waitFor(() => expect(banner()).toHaveAttribute('data-kind', 'stale'))

    expect(screen.getByTestId('promote-provenance')).toHaveTextContent(
      `Quoted ${fmtQuoteTime(PROMOTED_FRESH_AT)}`
    )
    // The pre-filled mark is the screener's, so its quoted time is the screener's.
    expect(banner()).toHaveTextContent(`(quoted ${fmtQuoteTime(PROMOTED_QUOTED_AT)})`)
    expect(banner()).not.toHaveTextContent(fmtQuoteTime(PROMOTED_FRESH_AT))
  })

  it.each([
    ['CLOSED' as const, 'pending' as const],
    ['LIVE' as const, 'failed' as const]
  ])(
    'still credits the trader’s own price in the derived row when a %s/%s banner takes the slot',
    async (display, quote) => {
      const user = userEvent.setup()
      setMarketDisplay(display)
      setPromotedQuote(quote)
      render(<NewWheelForm promoted={PROMOTED} />)

      await user.clear(premiumInput())
      await user.type(premiumInput(), '2.65')

      // A higher-precedence banner owns the slot…
      await waitFor(() => expect(banner()).not.toHaveAttribute('data-kind', 'edited'))
      // …but the yield really was recomputed from 2.65, so the row must say so.
      expect(screen.getByTestId('derived-yield')).toHaveTextContent('recomputed from your price')
    }
  )

  it('does not claim a recomputation when the premium is only half-typed', async () => {
    const user = userEvent.setup()
    render(<NewWheelForm promoted={PROMOTED} />)

    await user.clear(premiumInput())
    await user.type(premiumInput(), '2.')

    expect(screen.getByTestId('derived-yield')).not.toHaveTextContent('recomputed from your price')
  })
})
