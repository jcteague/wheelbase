import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { format, parseISO } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenerCandidate, ScreenerExclusion } from '../api/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import type { WatchlistEntry } from '../api/watchlist'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useSettingsStatus } from '../hooks/useSettings'
import { useSaveScreeningCriteria, useScreeningCriteria } from '../hooks/useScreeningCriteria'
import { useWatchlist } from '../hooks/useWatchlist'
import { parsePromotedParams } from '../lib/promote'
import { ScreenerPage } from './ScreenerPage'

vi.mock('../hooks/useMarketStatusDisplay')
// [US-67] Both criteria hooks are mocked here: the page reads the criteria with
// one and the sheet it renders saves with the other, and neither should reach IPC.
vi.mock('../hooks/useScreeningCriteria')
// [US-68] The promote click reads the ticker's watchlist note to seed the thesis,
// and navigates to the pre-filled new-wheel form.
vi.mock('../hooks/useWatchlist')
// [US-99] The outage card distinguishes "Alpaca not connected yet" from "Alpaca is down".
vi.mock('../hooks/useSettings')
// Hoisted so the factory can close over the spy — `vi.mock` runs before module init.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
vi.mock('wouter', () => ({ useLocation: () => ['/screener', mockNavigate] }))

const mockUseWatchlist = vi.mocked(useWatchlist)
const mockUseMarketStatusDisplay = vi.mocked(useMarketStatusDisplay)
const mockUseScreeningCriteria = vi.mocked(useScreeningCriteria)
const mockUseSaveScreeningCriteria = vi.mocked(useSaveScreeningCriteria)
const mockUseSettingsStatus = vi.mocked(useSettingsStatus)
const mockResults = vi.fn()
const mockSaveMutate = vi.fn()

// Quote time from the mockup's fixtures — 16:00:02 in the market's own zone.
// Assertions format it locally with date-fns so they hold in any TZ.
const QUOTE_TIMESTAMP = '2026-08-07T16:00:02-04:00'
const QUOTE_TIME = format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')

function candidate(overrides: Partial<ScreenerCandidate> = {}): ScreenerCandidate {
  return {
    ticker: 'AAPL',
    contractId: 'AAPL260821P00180000',
    strike: '180.0000',
    expiration: '2026-08-21',
    dte: 37,
    bid: '2.67',
    ask: '2.73',
    mark: '2.70',
    spreadAbsolute: '0.06',
    spreadPercent: '2.22',
    delta: '0.2800',
    openInterest: 4200,
    volume: null,
    ivRank: { value: '44.0', observedAt: QUOTE_TIMESTAMP },
    capitalSecured: '18000.00',
    periodYield: '0.0150',
    annualizedYield: '0.1480',
    yieldPerDelta: '0.5286',
    earnings: { status: 'clear' },
    timestamp: QUOTE_TIMESTAMP,
    ...overrides
  }
}

const RANKED: ScreenerCandidate[] = [
  candidate({ ticker: 'KO', contractId: 'KO260821P00060000', yieldPerDelta: '0.7100' }),
  candidate(),
  candidate({
    ticker: 'MSFT',
    contractId: 'MSFT260828P00410000',
    ivRank: null,
    yieldPerDelta: '0.5018'
  })
]

const EXCLUDED: ScreenerExclusion[] = [
  { ticker: 'TSLA', code: 'spread', reason: 'spread 22% exceeds 10%' },
  { ticker: 'NVDA', code: 'delta_band', reason: 'no strike within delta band 0.15–0.30' },
  { ticker: 'PLTR', code: 'open_interest', reason: 'open interest 40 below 100' },
  { ticker: 'SOFI', code: 'no_options_listed', reason: 'no options listed' }
]

// The story's Background: delta 0.20–0.30, DTE 30–45, OI 500, spread 10%,
// price ceiling off, IV-rank floor off, earnings "Exclude".
const PERSISTED_CRITERIA: ScreeningCriteria = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: 30,
  dteMax: 45,
  minOpenInterest: 500,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  maxUnderlyingPrice: null,
  minIvRank: null,
  earningsHandling: 'exclude'
}

// What "Save & re-screen" persists in the save scenario.
const SAVED_CRITERIA: ScreeningCriteria = {
  ...PERSISTED_CRITERIA,
  deltaMin: '0.15',
  deltaMax: '0.20',
  dteMin: 40
}

// Regex, not the bare string: the banner's ✓ glyph may or may not share the
// text node with the copy.
const SAVED_CONFIRMATION = /Screening criteria saved/

type SaveOptions = Parameters<typeof useSaveScreeningCriteria>[0]
type MutateOptions = { onSuccess?: (criteria: ScreeningCriteria) => void }

/** `undefined` puts the criteria query in its loading state. */
function setCriteria(criteria: ScreeningCriteria | undefined): void {
  const isLoading = criteria === undefined
  mockUseScreeningCriteria.mockReturnValue({
    data: criteria,
    isLoading,
    isPending: isLoading,
    isFetching: isLoading,
    isSuccess: !isLoading,
    isError: false,
    error: null,
    status: isLoading ? 'pending' : 'success',
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useScreeningCriteria>)
}

/** Puts the criteria query in its error state — the rejected `screener.getCriteria`. */
function setCriteriaError(): void {
  mockUseScreeningCriteria.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isSuccess: false,
    isError: true,
    error: new Error('An unexpected error occurred'),
    status: 'error',
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useScreeningCriteria>)
}

/** A background refetch that failed after the query had already succeeded: TanStack
 *  keeps serving the last good `data` alongside the raised error flag. */
function setCriteriaStaleError(criteria: ScreeningCriteria): void {
  mockUseScreeningCriteria.mockReturnValue({
    data: criteria,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isSuccess: false,
    isError: true,
    error: new Error('An unexpected error occurred'),
    status: 'error',
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useScreeningCriteria>)
}

/**
 * Fires the save mutation's success callbacks the way TanStack Query would:
 * only the hook instance that actually ran `mutate` gets its callbacks called,
 * plus the per-call options handed to that `mutate`. A second, non-mutating
 * `useSaveScreeningCriteria()` instance never fires in production, so it must
 * not fire here either — the saved banner has to hang off the mutation that runs.
 */
async function fireSaveSuccess(saved: ScreeningCriteria): Promise<void> {
  const call = mockSaveMutate.mock.calls.at(-1)
  expect(call, 'the save mutation was never invoked').toBeDefined()

  const callbacks = [
    (call?.[1] as MutateOptions | undefined)?.onSuccess,
    (call?.[2] as SaveOptions)?.onSuccess
  ].filter((cb): cb is (criteria: ScreeningCriteria) => void => typeof cb === 'function')
  expect(callbacks.length, 'no onSuccess callback was wired to the save mutation').toBeGreaterThan(
    0
  )

  await act(async () => {
    callbacks.forEach((cb) => cb(saved))
  })
}

/** The nearest element containing both nodes — proves header co-location. */
function commonAncestor(a: HTMLElement, b: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = a.parentElement
  while (node && !node.contains(b)) node = node.parentElement
  return node
}

const criteriaButton = (): HTMLElement => screen.getByRole('button', { name: /^⚙?\s*Criteria$/ })

function setMarketDisplay(display: MarketStatusDisplay): void {
  mockUseMarketStatusDisplay.mockReturnValue({
    settingsQuery: {} as ReturnType<typeof useMarketStatusDisplay>['settingsQuery'],
    hasBroker: true,
    statusQuery: {} as ReturnType<typeof useMarketStatusDisplay>['statusQuery'],
    display
  })
}

/** Returns a `rerender` bound to the same client, for re-reading a changed hook mock. */
function renderPage(): { rerender: () => void } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A fresh element each time — React bails out of re-rendering an identical
  // element reference, which would hide a changed hook mock.
  const ui = (): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>
      <ScreenerPage />
    </QueryClientProvider>
  )
  const { rerender } = render(ui())
  return { rerender: () => rerender(ui()) }
}

/** `undefined` leaves the watchlist query unresolved — promote must not wait on it. */
function setWatchlist(entries: WatchlistEntry[] | undefined): void {
  mockUseWatchlist.mockReturnValue({
    data: entries,
    isLoading: entries === undefined,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useWatchlist>)
}

function watchlistEntry(ticker: string, notes: string | null): WatchlistEntry {
  return {
    ticker,
    notes,
    ownBelowPrice: null,
    ivrTrigger: null,
    postEarningsOnly: false,
    coreHolding: false,
    addedAt: '2026-08-01T12:00:00Z'
  }
}

beforeEach(() => {
  mockResults.mockReset()
  mockSaveMutate.mockReset()
  mockNavigate.mockReset()
  // Credentials present by default; the two US-99 cases override to 'missing'.
  mockUseSettingsStatus.mockReturnValue({
    data: { marketData: 'configured' },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  setMarketDisplay('LIVE')
  setCriteria(PERSISTED_CRITERIA)
  setWatchlist([])
  mockUseSaveScreeningCriteria.mockReset()
  mockUseSaveScreeningCriteria.mockImplementation(
    (hookOptions: SaveOptions) =>
      ({
        mutate: (payload: unknown, mutateOptions?: MutateOptions) =>
          mockSaveMutate(payload, mutateOptions, hookOptions),
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null,
        reset: vi.fn()
      }) as unknown as ReturnType<typeof useSaveScreeningCriteria>
  )
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: { results: mockResults }
    }
  })
})

describe('ScreenerPage — query states', () => {
  it('renders the loading state while the screener query is pending', () => {
    mockResults.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an error alert when the IPC envelope fails', async () => {
    mockResults.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('ScreenerPage — ranked results', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  it('renders the results table, count line, market status pill, and collapsed excluded section', async () => {
    renderPage()

    expect(await screen.findByTestId('screener-row-KO')).toBeInTheDocument()
    expect(screen.getByTestId('screener-row-AAPL')).toBeInTheDocument()
    expect(screen.getByTestId('screener-row-MSFT')).toBeInTheDocument()
    expect(screen.getByTestId('screener-count')).toHaveTextContent('3 candidates · 4 excluded')
    expect(screen.getByTestId('market-status-pill')).toHaveTextContent('LIVE')
    expect(screen.getByTestId('screener-excluded-toggle')).toHaveTextContent('Excluded (4)')
    expect(screen.queryByTestId('screener-excluded-row-TSLA')).not.toBeInTheDocument()
  })

  it('renders no state cards when candidates are ranked', async () => {
    renderPage()

    await screen.findByTestId('screener-row-KO')
    expect(screen.queryByTestId('screener-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-unavailable')).not.toBeInTheDocument()
  })
})

describe('ScreenerPage — empty results', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [],
      excluded: EXCLUDED,
      quoteTimestamp: null
    })
  })

  it('renders the neutral empty card with the excluded section still below it', async () => {
    renderPage()

    const empty = await screen.findByTestId('screener-empty')
    expect(empty).toHaveAttribute('data-tone', 'neutral')
    expect(empty).toHaveTextContent('No candidates match your criteria')
    expect(screen.getByTestId('screener-excluded-toggle')).toHaveTextContent('Excluded (4)')
    expect(screen.queryByTestId('screener-row-AAPL')).not.toBeInTheDocument()
  })
})

describe('ScreenerPage — provider outage', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
  })

  it('renders the error-tone unavailable card instead of the empty state or the table', async () => {
    renderPage()

    const unavailable = await screen.findByTestId('screener-unavailable')
    expect(unavailable).toHaveAttribute('data-tone', 'error')
    expect(unavailable).toHaveTextContent('Market data unavailable')
    expect(unavailable).toHaveTextContent(
      "Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available."
    )
    expect(screen.queryByTestId('screener-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-excluded-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-row-AAPL')).not.toBeInTheDocument()
  })

  // [US-99] With no keys saved the vendor was never contacted, so "couldn't be reached"
  // would be a lie — and it points the trader at an outage instead of at Settings.
  it('tells the trader to connect Alpaca when no credentials are configured', async () => {
    mockUseSettingsStatus.mockReturnValue({
      data: { marketData: 'missing' },
      isLoading: false,
      isError: false,
      error: null
    } as ReturnType<typeof useSettingsStatus>)

    renderPage()

    const unavailable = await screen.findByTestId('screener-unavailable')
    expect(unavailable).toHaveTextContent('Market data not connected')
    expect(unavailable).toHaveTextContent(
      'Connect Alpaca in Settings to score candidates — no market-data credentials are saved yet.'
    )
    expect(unavailable).not.toHaveTextContent("couldn't be reached")
  })

  // While the status query is pending (or has errored) `data` is undefined. Defaulting that
  // to "not connected" would offer Open Settings to a trader whose keys are fine and whose
  // actual problem is an outage they should retry.
  it('falls back to the outage card while the credential status is unknown', async () => {
    mockUseSettingsStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null
    } as ReturnType<typeof useSettingsStatus>)

    renderPage()

    const unavailable = await screen.findByTestId('screener-unavailable')
    expect(unavailable).toHaveTextContent("couldn't be reached")
    expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeInTheDocument()
  })

  it('offers Retry refresh only when credentials exist to retry with', async () => {
    mockUseSettingsStatus.mockReturnValue({
      data: { marketData: 'missing' },
      isLoading: false,
      isError: false,
      error: null
    } as ReturnType<typeof useSettingsStatus>)

    renderPage()

    await screen.findByTestId('screener-unavailable')
    expect(screen.queryByRole('button', { name: 'Retry refresh' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  // An outage empties ranked and excluded without emptying the watchlist, so the
  // sheet must not claim the criteria apply to zero tickers.
  it('omits the watchlist count from the sheet subtitle during an outage', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('screener-unavailable')
    await user.click(criteriaButton())

    const subtitle = await screen.findByTestId('sheet-subtitle')
    expect(subtitle).toHaveTextContent('Classic Wheel · CSP')
    expect(subtitle).not.toHaveTextContent('0 watchlist tickers')
  })

  it('re-invokes the screener IPC when the outage card retry is clicked', async () => {
    renderPage()

    await screen.findByTestId('screener-unavailable')
    expect(mockResults).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))

    await waitFor(() => expect(mockResults).toHaveBeenCalledTimes(2))
  })
})

describe('ScreenerPage — stale snapshot', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  it('badges the results as a stale snapshot with the quote time when the market is CLOSED', async () => {
    setMarketDisplay('CLOSED')
    renderPage()

    await screen.findByTestId('screener-row-KO')
    const badge = screen.getByTestId('screener-stale-badge')
    expect(badge).toHaveTextContent('Stale snapshot')
    expect(badge.className).toContain('wb-gold')
    expect(screen.getByTestId('screener-stale-caption')).toHaveTextContent(
      `Quoted ${QUOTE_TIME} · after-hours option marks are unreliable`
    )
    expect(screen.getByTestId('screener-count')).toHaveTextContent(
      `3 candidates · quoted ${QUOTE_TIME}`
    )
  })

  it('shows no stale badge when the market display is LIVE', async () => {
    renderPage()

    await screen.findByTestId('screener-row-KO')
    expect(screen.queryByTestId('screener-stale-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-stale-caption')).not.toBeInTheDocument()
    expect(screen.getByTestId('screener-count')).toHaveTextContent('3 candidates · 4 excluded')
  })
})

// [US-67] Three entry points, one sheet: the header button, the summary strip,
// and the empty card's action all open the same screening-criteria sheet.
describe('ScreenerPage — criteria entry points', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  it('renders the ⚙ Criteria button in the page header alongside the market-status pill', async () => {
    renderPage()

    await screen.findByTestId('screener-row-KO')
    const button = criteriaButton()
    const pill = screen.getByTestId('market-status-pill')

    // The pill is untouched by this story — still LIVE/EXT/CLOSED only.
    expect(pill).toHaveTextContent('LIVE')
    // Button first, then the pill.
    expect(button.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Grouped together in the header, not merely both somewhere on the page.
    expect(commonAncestor(button, pill)).not.toContainElement(screen.getByTestId('screener-row-KO'))
  })

  it('does not render the criteria sheet until an entry point is used', async () => {
    renderPage()

    await screen.findByTestId('screener-row-KO')
    // Both entry points are on screen…
    expect(criteriaButton()).toBeInTheDocument()
    expect(screen.getByTestId('screener-criteria-strip')).toBeInTheDocument()
    // …but neither has been used, so the sheet is not mounted.
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-scrim')).not.toBeInTheDocument()
  })

  it('opens the criteria sheet when the header ⚙ Criteria button is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('screener-row-KO')
    await user.click(criteriaButton())

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
    expect(screen.getByLabelText('Minimum delta')).toHaveValue('0.20')
    expect(screen.getByLabelText('Maximum delta')).toHaveValue('0.30')
  })

  it('opens the same criteria sheet when the summary strip is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('screener-row-KO')
    await user.click(screen.getByTestId('screener-criteria-strip'))

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })

  it('renders the criteria summary strip above the results table, not below it', async () => {
    renderPage()

    const firstRow = await screen.findByTestId('screener-row-KO')
    const strip = screen.getByTestId('screener-criteria-strip')

    expect(strip.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tells the sheet how many watchlist tickers the criteria apply to', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('screener-row-KO')
    await user.click(criteriaButton())

    // One row per watchlist ticker: 3 ranked + 4 excluded.
    expect(
      await screen.findByText('Applies to all 7 watchlist tickers · Classic Wheel · CSP')
    ).toBeInTheDocument()
  })
})

// [US-67] The empty card loses its dangling "Screener settings" pointer (US-66)
// and gains the third entry point into the sheet.
describe('ScreenerPage — empty state adjusts criteria in place', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [],
      excluded: EXCLUDED,
      quoteTimestamp: null
    })
  })

  it('no longer points at Screener settings in the empty card body', async () => {
    renderPage()

    const empty = await screen.findByTestId('screener-empty')
    expect(empty).not.toHaveTextContent('Screener settings')
    expect(empty).toHaveTextContent(
      'Every strike on your watchlist was filtered out. Loosen your delta band or DTE window.'
    )
  })

  it('opens the criteria sheet from the empty card Adjust criteria action', async () => {
    const user = userEvent.setup()
    renderPage()

    const empty = await screen.findByTestId('screener-empty')
    const adjust = screen.getByRole('button', { name: 'Adjust criteria' })
    expect(empty).toContainElement(adjust)

    await user.click(adjust)

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })
})

// [US-67] "Save & re-screen" closes the sheet and confirms on the page itself.
describe('ScreenerPage — saved confirmation', () => {
  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  async function saveFromSheet(): Promise<void> {
    const user = userEvent.setup()
    await screen.findByTestId('screener-row-KO')
    await user.click(criteriaButton())
    await screen.findByText('Screening Criteria')

    await user.click(screen.getByRole('button', { name: 'Save & re-screen' }))
    await waitFor(() => expect(mockSaveMutate).toHaveBeenCalled())
    await fireSaveSuccess(SAVED_CRITERIA)
  }

  it('shows "Screening criteria saved" and closes the sheet after a successful save', async () => {
    renderPage()

    expect(screen.queryByText(SAVED_CONFIRMATION)).not.toBeInTheDocument()
    await saveFromSheet()

    expect(screen.getByText(SAVED_CONFIRMATION)).toBeInTheDocument()
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
  })

  it('clears the saved confirmation when the sheet is reopened for a second edit', async () => {
    const user = userEvent.setup()
    renderPage()

    await saveFromSheet()
    expect(screen.getByText(SAVED_CONFIRMATION)).toBeInTheDocument()

    await user.click(criteriaButton())

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
    expect(screen.queryByText(SAVED_CONFIRMATION)).not.toBeInTheDocument()
  })
})

// [US-67] The criteria query resolves independently of the results query.
describe('ScreenerPage — criteria still loading', () => {
  beforeEach(() => {
    setCriteria(undefined)
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  it('renders the results without the summary strip while the criteria are still loading', async () => {
    const { rerender } = renderPage()

    expect(await screen.findByTestId('screener-row-KO')).toBeInTheDocument()
    expect(screen.queryByTestId('screener-criteria-strip')).not.toBeInTheDocument()
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()

    // …and the strip appears as soon as the criteria land, so the absence above
    // is the loading guard rather than a missing strip.
    setCriteria(PERSISTED_CRITERIA)
    act(() => rerender())

    expect(await screen.findByTestId('screener-criteria-strip')).toBeInTheDocument()
  })

  // Pending is not an error: the button stays live, and the click it takes while
  // the query is in flight is honoured the moment the criteria land. This is the
  // behaviour that distinguishes the loading state from the error state below.
  it('honours a click made while the criteria are still loading, without a second click', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPage()

    const button = await screen.findByRole('button', { name: /Criteria/ })
    expect(button).toBeEnabled()
    await user.click(button)

    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()

    setCriteria(PERSISTED_CRITERIA)
    act(() => rerender())

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })
})

// [US-67] A failed criteria query must not leave the entry points as dead
// buttons: the trader gets an explanation, and nothing invites a click that
// cannot open the sheet.
describe('ScreenerPage — criteria query fails', () => {
  beforeEach(() => {
    setCriteriaError()
  })

  it('renders a visible error alert explaining the criteria could not be loaded', async () => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
    renderPage()

    // The results query succeeded, so the only alert on the page is the
    // criteria one — the results-query message must not be what surfaces.
    await screen.findByTestId('screener-row-KO')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/screening criteria/i)
    expect(alert).not.toHaveTextContent('Failed to screen the watchlist')
    // The strip still has no criteria to summarise.
    expect(screen.queryByTestId('screener-criteria-strip')).not.toBeInTheDocument()
  })

  it('leaves no dead click on the header ⚙ Criteria button when the criteria cannot load', async () => {
    const user = userEvent.setup()
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
    renderPage()

    await screen.findByTestId('screener-row-KO')
    const button = criteriaButton()
    expect(button).toBeDisabled()

    await user.click(button)

    // Still no sheet — and the button never went gold as though one had opened.
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-scrim')).not.toBeInTheDocument()
    expect(button.className).not.toContain('bg-wb-gold-dim')
  })

  it('leaves no dead click on the empty card Adjust criteria action either', async () => {
    const user = userEvent.setup()
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: [],
      excluded: EXCLUDED,
      quoteTimestamp: null
    })
    renderPage()

    await screen.findByTestId('screener-empty')
    const adjust = screen.getByRole('button', { name: 'Adjust criteria' })
    expect(adjust).toBeDisabled()

    await user.click(adjust)

    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
  })

  it('recovers every entry point once a refetch lands the criteria', async () => {
    const user = userEvent.setup()
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
    const { rerender } = renderPage()

    await screen.findByTestId('screener-row-KO')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    setCriteria(PERSISTED_CRITERIA)
    act(() => rerender())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(criteriaButton()).toBeEnabled()
    await user.click(criteriaButton())
    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })

  // A query that succeeded once keeps serving its data when a later refetch fails,
  // and the client refetches on window focus. The trader is still looking at
  // usable criteria, so a raised error flag alone must not strand them.
  it('keeps the entry points live when a background refetch fails over good criteria', async () => {
    const user = userEvent.setup()
    setCriteriaStaleError(PERSISTED_CRITERIA)
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
    renderPage()

    await screen.findByTestId('screener-row-KO')

    // No false alarm, and the strip is still showing the criteria it claims are unloadable.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('screener-criteria-strip')).toBeInTheDocument()

    expect(criteriaButton()).toBeEnabled()
    await user.click(criteriaButton())
    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })
})

// [US-68] Promote hands the candidate to the new-wheel form as query-string
// defaults, seeding the thesis from the ticker's watchlist note when there is one.
describe('ScreenerPage — promote to trade', () => {
  const NOTE = 'Would own below $170; waiting for IV to lift'

  beforeEach(() => {
    mockResults.mockResolvedValue({
      ok: true,
      status: 'ok',
      ranked: RANKED,
      excluded: EXCLUDED,
      quoteTimestamp: QUOTE_TIMESTAMP
    })
  })

  async function promoteAapl(): Promise<void> {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('screener-row-AAPL')
    await user.click(screen.getByTestId('screener-promote-AAPL'))
  }

  /** The promoted payload the navigation carries, decoded through the codec. */
  function promotedFromNavigation(): ReturnType<typeof parsePromotedParams> {
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    const [path] = mockNavigate.mock.calls[0] as [string]
    expect(path.startsWith('/new?')).toBe(true)
    return parsePromotedParams(path.slice('/new?'.length))
  }

  it('navigates to the new-wheel form carrying the clicked candidate', async () => {
    await promoteAapl()

    expect(promotedFromNavigation()).toMatchObject({
      ticker: 'AAPL',
      strike: '180',
      expiration: '2026-08-21',
      premium: '2.70',
      quotedAt: QUOTE_TIMESTAMP
    })
  })

  it('seeds the thesis from the ticker’s watchlist note', async () => {
    setWatchlist([watchlistEntry('AAPL', NOTE), watchlistEntry('KO', 'unrelated')])

    await promoteAapl()

    expect(promotedFromNavigation()?.thesis).toBe(NOTE)
  })

  it('omits the thesis when the ticker has no watchlist note', async () => {
    setWatchlist([watchlistEntry('AAPL', null), watchlistEntry('KO', NOTE)])

    await promoteAapl()

    expect(promotedFromNavigation()?.thesis).toBeUndefined()
  })

  it('omits the thesis when the note is empty rather than sending a blank one', async () => {
    setWatchlist([watchlistEntry('AAPL', '   ')])

    await promoteAapl()

    expect(promotedFromNavigation()?.thesis).toBeUndefined()
  })

  it('is never blocked by an unresolved watchlist query', async () => {
    setWatchlist(undefined)

    await promoteAapl()

    const promoted = promotedFromNavigation()
    expect(promoted?.ticker).toBe('AAPL')
    expect(promoted?.thesis).toBeUndefined()
  })

  it('creates no position — it only navigates', async () => {
    const createPosition = vi.fn()
    Object.assign(window, { api: { ...(window.api ?? {}), createPosition } })

    await promoteAapl()

    expect(createPosition).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })
})
