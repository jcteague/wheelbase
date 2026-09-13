import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { format, parseISO } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiError } from '../api/error'
import type { ScreenerResults } from '../api/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import type { WatchlistSnapshot, WatchlistSnapshotRow } from '../api/watchlist'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import { candidate, entry, row, unmet, verdict } from '../components/bench-test-utils'
import { useAddToWatchlist } from '../hooks/useAddToWatchlist'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useRemoveFromWatchlist } from '../hooks/useRemoveFromWatchlist'
import { useScreenerResults } from '../hooks/useScreenerResults'
import { useSaveScreeningCriteria, useScreeningCriteria } from '../hooks/useScreeningCriteria'
import { useSettingsStatus } from '../hooks/useSettings'
import { useWatchlistSnapshot } from '../hooks/useWatchlistSnapshot'
import { parsePromotedParams } from '../lib/promote'
import { WatchlistPage } from './WatchlistPage'

// [US-96] The combined bench: the watchlist and the screener on one page. Every data
// hook is mocked, so these tests only exercise what the page itself composes — the
// join lives in `lib/bench.ts` and the cards in `BenchCard`/`BenchDetail`, each with
// their own suite.

vi.mock('../hooks/useWatchlistSnapshot')
vi.mock('../hooks/useScreenerResults')
vi.mock('../hooks/useScreeningCriteria')
vi.mock('../hooks/useMarketStatusDisplay')
vi.mock('../hooks/useSettings')
// The add form and the card's ✕ own these; the page never calls IPC itself.
vi.mock('../hooks/useAddToWatchlist')
vi.mock('../hooks/useRemoveFromWatchlist')
// Hoisted so the factory can close over the spy — `vi.mock` runs before module init.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
vi.mock('wouter', () => ({ useLocation: () => ['/watchlist', mockNavigate] }))

const mockUseWatchlistSnapshot = vi.mocked(useWatchlistSnapshot)
const mockUseScreenerResults = vi.mocked(useScreenerResults)
const mockUseScreeningCriteria = vi.mocked(useScreeningCriteria)
const mockUseSaveScreeningCriteria = vi.mocked(useSaveScreeningCriteria)
const mockUseMarketStatusDisplay = vi.mocked(useMarketStatusDisplay)
const mockUseSettingsStatus = vi.mocked(useSettingsStatus)
const mockUseAddToWatchlist = vi.mocked(useAddToWatchlist)
const mockUseRemoveFromWatchlist = vi.mocked(useRemoveFromWatchlist)

const snapshotRefetch = vi.fn()
const screenerRefetch = vi.fn()
const mockSaveMutate = vi.fn()
const mockRemoveMutate = vi.fn()

const QUOTE_TIMESTAMP = '2026-09-11T16:00:02-04:00'
const QUOTE_TIME = format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')

const KO_NOTE = 'Core wheel. Comfortable owning through a full cycle.'

// KO clears every gate and the screener ranked a put for it; AAPL's IV condition is
// unmet, so it waits. That is the smallest bench with one stock in each section.
const KO_ROW = row()
const AAPL_ROW = row({
  entry: entry({ ticker: 'AAPL', notes: 'Would own below $170', ivrTrigger: 50 }),
  verdict: verdict({ iv: unmet('IV low') })
})

const KO_CANDIDATE = candidate({ timestamp: QUOTE_TIMESTAMP })

const OK_RESULTS: ScreenerResults = {
  status: 'ok',
  ranked: [KO_CANDIDATE],
  excluded: [],
  quoteTimestamp: QUOTE_TIMESTAMP
}

const OUTAGE_RESULTS: ScreenerResults = {
  status: 'provider_unavailable',
  ranked: [],
  excluded: [],
  quoteTimestamp: null
}

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

const OUTAGE_COPY =
  'Market data is unavailable. Saved stocks and theses are still here. Prices are last-known; IV ranks come from the local snapshot store and keep their own age. No stocks are marked as meeting criteria.'

const FOOTER_COPY =
  'Meets criteria = saved stock conditions pass on a usable IV reading + a qualifying put. Aging readings (2–3 sessions) still count; a stale, earnings-predating, or missing reading is unknown and never satisfies a condition. Stocks without personal conditions use screening defaults.'

const DETAIL_CAPTION =
  'Select a stock to see its thesis, condition checks, IV-reading status, and matching contract here.'

function snapshot(rows: WatchlistSnapshotRow[]): WatchlistSnapshot {
  return { rows, asOf: QUOTE_TIMESTAMP }
}

function setSnapshot(rows: WatchlistSnapshotRow[]): void {
  mockUseWatchlistSnapshot.mockReturnValue({
    data: snapshot(rows),
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: snapshotRefetch
  } as unknown as ReturnType<typeof useWatchlistSnapshot>)
}

function setSnapshotLoading(): void {
  mockUseWatchlistSnapshot.mockReturnValue({
    data: undefined,
    isLoading: true,
    isPending: true,
    isError: false,
    error: null,
    refetch: snapshotRefetch
  } as unknown as ReturnType<typeof useWatchlistSnapshot>)
}

function setSnapshotError(): void {
  mockUseWatchlistSnapshot.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    isError: true,
    error: apiError(500, {}),
    refetch: snapshotRefetch
  } as unknown as ReturnType<typeof useWatchlistSnapshot>)
}

function setResults(results: ScreenerResults): void {
  mockUseScreenerResults.mockReturnValue({
    data: results,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: screenerRefetch
  } as unknown as ReturnType<typeof useScreenerResults>)
}

function setResultsLoading(): void {
  mockUseScreenerResults.mockReturnValue({
    data: undefined,
    isLoading: true,
    isPending: true,
    isError: false,
    error: null,
    refetch: screenerRefetch
  } as unknown as ReturnType<typeof useScreenerResults>)
}

function setResultsError(): void {
  mockUseScreenerResults.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    isError: true,
    error: apiError(500, {}),
    refetch: screenerRefetch
  } as unknown as ReturnType<typeof useScreenerResults>)
}

function setCriteria(criteria: ScreeningCriteria | undefined): void {
  mockUseScreeningCriteria.mockReturnValue({
    data: criteria,
    isLoading: criteria === undefined,
    isPending: criteria === undefined,
    isError: false,
    error: null,
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useScreeningCriteria>)
}

/** A criteria query that failed with nothing cached — the sheet cannot be opened. */
function setCriteriaError(): void {
  mockUseScreeningCriteria.mockReturnValue({
    data: undefined,
    isLoading: false,
    isPending: false,
    isError: true,
    error: apiError(500, {}),
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useScreeningCriteria>)
}

function setMarketDisplay(display: MarketStatusDisplay): void {
  mockUseMarketStatusDisplay.mockReturnValue({
    settingsQuery: {} as ReturnType<typeof useMarketStatusDisplay>['settingsQuery'],
    hasBroker: true,
    statusQuery: {} as ReturnType<typeof useMarketStatusDisplay>['statusQuery'],
    display
  })
}

function setMarketDataCredential(marketData: 'configured' | 'missing' | undefined): void {
  mockUseSettingsStatus.mockReturnValue({
    data: marketData === undefined ? undefined : { marketData },
    isLoading: marketData === undefined,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
}

/** Returns a `rerender` bound to the same client, for re-reading a changed hook mock. */
function renderPage(): { rerender: () => void } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A fresh element each time — React bails out of re-rendering an identical element
  // reference, which would hide a changed hook mock.
  const ui = (): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>
      <WatchlistPage />
    </QueryClientProvider>
  )
  const { rerender } = render(ui())
  return { rerender: () => rerender(ui()) }
}

const criteriaButton = (): HTMLElement => screen.getByTestId('bench-criteria')
const section = (title: string): HTMLElement => screen.getByRole('region', { name: title })

/** Fires the save mutation's per-call `onSuccess` the way TanStack Query would. */
async function fireSaveSuccess(): Promise<void> {
  const call = mockSaveMutate.mock.calls.at(-1)
  expect(call, 'the save mutation was never invoked').toBeDefined()
  const onSuccess = (call?.[1] as { onSuccess?: (c: ScreeningCriteria) => void } | undefined)
    ?.onSuccess
  expect(onSuccess, 'no onSuccess callback was wired to the save mutation').toBeDefined()
  await act(async () => {
    onSuccess?.(PERSISTED_CRITERIA)
  })
}

/** Opens the criteria sheet from the header and saves it unchanged. */
async function saveFromSheet(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(criteriaButton())
  await screen.findByText('Screening Criteria')
  await user.click(screen.getByRole('button', { name: 'Save & re-screen' }))
  await fireSaveSuccess()
}

beforeEach(() => {
  snapshotRefetch.mockReset()
  screenerRefetch.mockReset()
  mockSaveMutate.mockReset()
  mockRemoveMutate.mockReset()
  mockNavigate.mockReset()

  setSnapshot([KO_ROW, AAPL_ROW])
  setResults(OK_RESULTS)
  setCriteria(PERSISTED_CRITERIA)
  setMarketDisplay('LIVE')
  setMarketDataCredential('configured')

  mockUseAddToWatchlist.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn()
  } as unknown as ReturnType<typeof useAddToWatchlist>)
  mockUseRemoveFromWatchlist.mockReturnValue({
    mutate: mockRemoveMutate,
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn()
  } as unknown as ReturnType<typeof useRemoveFromWatchlist>)
  mockUseSaveScreeningCriteria.mockImplementation(
    () =>
      ({
        mutate: mockSaveMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null,
        reset: vi.fn()
      }) as unknown as ReturnType<typeof useSaveScreeningCriteria>
  )
})

describe('WatchlistPage — header', () => {
  it('titles the page Watchlist and counts the snapshot rows', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeInTheDocument()
    expect(screen.getByTestId('bench-count')).toHaveTextContent('2')
  })

  it('renders the market status pill and the three header actions', () => {
    renderPage()

    expect(screen.getByTestId('market-status-pill')).toHaveTextContent('LIVE')
    expect(screen.getByTestId('bench-criteria')).toHaveTextContent('Screening criteria')
    expect(screen.getByTestId('bench-refresh')).toHaveTextContent('↻ Refresh')
    expect(screen.getByTestId('bench-add-toggle')).toHaveTextContent('+ Add stock')
  })

  it('refetches both the snapshot and the screener when Refresh is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('bench-refresh'))

    expect(snapshotRefetch).toHaveBeenCalledTimes(1)
    expect(screenerRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders the footer explaining what "meets criteria" means', () => {
    renderPage()

    expect(screen.getByText(FOOTER_COPY)).toBeInTheDocument()
  })
})

describe('WatchlistPage — stale snapshot', () => {
  it('badges the bench stale with the quote time when the market is CLOSED', () => {
    setMarketDisplay('CLOSED')
    renderPage()

    expect(screen.getByTestId('screener-stale-badge')).toHaveTextContent('Stale snapshot')
    expect(screen.getByTestId('screener-stale-caption')).toHaveTextContent(`quoted ${QUOTE_TIME}`)
  })

  it('shows no stale badge while the market display is LIVE', () => {
    renderPage()

    expect(screen.queryByTestId('screener-stale-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-stale-caption')).not.toBeInTheDocument()
  })

  // Nothing met criteria, so there are no marks to call stale in the first place.
  it('shows no stale badge when no stock meets criteria', () => {
    setMarketDisplay('CLOSED')
    setResults({ ...OK_RESULTS, ranked: [] })
    renderPage()

    expect(screen.queryByTestId('screener-stale-badge')).not.toBeInTheDocument()
  })
})

describe('WatchlistPage — criteria', () => {
  it('renders the criteria summary strip above the bench sections', () => {
    renderPage()

    const strip = screen.getByTestId('screener-criteria-strip')
    const meets = section('Meets criteria')
    expect(strip.compareDocumentPosition(meets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not mount the criteria sheet until an entry point is used', () => {
    renderPage()

    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
  })

  it('opens the criteria sheet from the header Screening criteria button', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(criteriaButton())

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })

  it('opens the same criteria sheet from the summary strip', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('screener-criteria-strip'))

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })

  it('tells the sheet the criteria apply to every watchlist row', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(criteriaButton())

    expect(
      await screen.findByText('Applies to all 2 watchlist tickers · Classic Wheel · CSP')
    ).toBeInTheDocument()
  })

  it('confirms a save on the page and refetches the snapshot behind it', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByText(/Screening criteria saved/)).not.toBeInTheDocument()
    await saveFromSheet(user)

    expect(screen.getByText(/Screening criteria saved/)).toBeInTheDocument()
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
    expect(snapshotRefetch).toHaveBeenCalled()
  })

  it('explains an unloadable criteria query and leaves no dead entry points', async () => {
    const user = userEvent.setup()
    setCriteriaError()
    setResults({ ...OK_RESULTS, ranked: [] })
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/screening criteria/i)
    expect(screen.queryByTestId('screener-criteria-strip')).not.toBeInTheDocument()
    expect(criteriaButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adjust criteria' })).toBeDisabled()

    await user.click(criteriaButton())
    expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
  })
})

describe('WatchlistPage — add form', () => {
  it('keeps the add form hidden until + Add stock is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByTestId('watchlist-add-submit')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('bench-add-toggle'))
    expect(screen.getByTestId('watchlist-add-submit')).toBeInTheDocument()

    await user.click(screen.getByTestId('bench-add-toggle'))
    expect(screen.queryByTestId('watchlist-add-submit')).not.toBeInTheDocument()
  })

  it('shows the add form beside the empty-state guidance when nothing is saved', () => {
    setSnapshot([])
    renderPage()

    expect(screen.getByText('No tickers yet')).toBeInTheDocument()
    expect(screen.getByTestId('watchlist-add-submit')).toBeInTheDocument()
    expect(screen.getByTestId('bench-count')).toHaveTextContent('0')
  })
})

describe('WatchlistPage — bench sections', () => {
  it('splits the bench into Meets criteria and Stocks of interest', () => {
    renderPage()

    expect(within(section('Meets criteria')).getByTestId('watchlist-row-KO')).toBeInTheDocument()
    expect(
      within(section('Stocks of interest')).getByTestId('watchlist-row-AAPL')
    ).toBeInTheDocument()
  })

  // Good news, not an error state: an empty waiting list means every saved stock cleared
  // both halves, so it must not reuse the Meets section's "loosen your criteria" prompt.
  it('says the waiting list is empty because everything met criteria', () => {
    setSnapshot([KO_ROW])
    renderPage()

    const waiting = section('Stocks of interest')
    expect(waiting).toHaveTextContent('Nothing waiting — every saved stock meets criteria.')
    expect(within(waiting).queryByTestId('screener-empty')).toBeNull()
  })

  it('lays the sections and the sticky detail panel out as a two-column grid', () => {
    renderPage()

    const grid = screen.getByTestId('bench-grid')
    expect(grid.className).toContain('xl:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)]')
    expect(grid).toContainElement(section('Meets criteria'))

    const panel = screen.getByTestId('bench-detail-panel')
    expect(panel.className).toContain('xl:sticky')
    expect(panel).toContainElement(screen.getByTestId('bench-detail-ticker'))
    expect(panel).toHaveTextContent(DETAIL_CAPTION)
  })

  it('offers Adjust criteria in the meets section when nothing matches', () => {
    setResults({ ...OK_RESULTS, ranked: [] })
    renderPage()

    const empty = screen.getByTestId('screener-empty')
    expect(section('Meets criteria')).toContainElement(empty)
    expect(empty).toHaveTextContent('No candidates match your criteria')
    expect(within(empty).getByRole('button', { name: 'Adjust criteria' })).toBeEnabled()
    expect(
      within(section('Stocks of interest')).getByTestId('watchlist-row-KO')
    ).toBeInTheDocument()
  })

  it('opens the criteria sheet from the empty card', async () => {
    const user = userEvent.setup()
    setResults({ ...OK_RESULTS, ranked: [] })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Adjust criteria' }))

    expect(await screen.findByText('Screening Criteria')).toBeInTheDocument()
  })
})

describe('WatchlistPage — provider outage', () => {
  beforeEach(() => {
    setResults(OUTAGE_RESULTS)
  })

  it('warns about the outage above the sections while every card still renders', () => {
    renderPage()

    const unavailable = screen.getByTestId('screener-unavailable')
    expect(unavailable).toHaveTextContent('Market data unavailable')
    expect(within(unavailable).getByRole('button', { name: 'Retry refresh' })).toBeInTheDocument()
    expect(screen.getByText(OUTAGE_COPY)).toBeInTheDocument()
    expect(
      unavailable.compareDocumentPosition(section('Meets criteria')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    const waiting = section('Stocks of interest')
    expect(within(waiting).getByTestId('watchlist-row-KO')).toBeInTheDocument()
    expect(within(waiting).getByTestId('watchlist-row-AAPL')).toBeInTheDocument()
    expect(
      within(within(waiting).getByTestId('watchlist-row-KO')).getByTestId('watchlist-reason')
    ).toHaveTextContent('Data unavailable · not evaluated')
  })

  it('re-screens when the outage card retry is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Retry refresh' }))

    expect(screenerRefetch).toHaveBeenCalled()
  })

  // [US-96] The screen never ran, so "every strike was filtered out — loosen your delta
  // band" is a false account of why nothing meets criteria, and pointing the trader at
  // their criteria sends them to fix something that is not broken. This is the exact
  // confusion US-66's "an outage is distinguished from no results" AC exists to prevent.
  it('does not blame the criteria for an empty bench the screen never produced', () => {
    renderPage()

    const meets = section('Meets criteria')
    expect(within(meets).queryByTestId('screener-empty')).not.toBeInTheDocument()
    expect(within(meets).queryByRole('button', { name: 'Adjust criteria' })).not.toBeInTheDocument()
    expect(meets).toHaveTextContent('Waiting for market data')
  })

  it('points at Settings when no market-data credentials are saved', async () => {
    const user = userEvent.setup()
    setMarketDataCredential('missing')
    renderPage()

    const unavailable = screen.getByTestId('screener-unavailable')
    expect(unavailable).toHaveTextContent('Market data not connected')
    expect(screen.queryByRole('button', { name: 'Retry refresh' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  // An unresolved status must not claim the trader has no credentials — that swaps a
  // usable Retry for a pointless trip to Settings.
  it('falls back to the outage card while the credential status is unknown', () => {
    setMarketDataCredential(undefined)
    renderPage()

    expect(screen.getByTestId('screener-unavailable')).toHaveTextContent('Market data unavailable')
  })
})

describe('WatchlistPage — selection', () => {
  it('opens on the first meets-criteria stock', () => {
    renderPage()

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
  })

  it('selects the stock whose ticker is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    const aapl = screen.getByTestId('watchlist-row-AAPL')
    await user.click(within(aapl).getByTestId('watchlist-ticker'))

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('AAPL')
  })

  it('falls back to the default when the selected stock is removed', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPage()

    await user.click(
      within(screen.getByTestId('watchlist-row-AAPL')).getByTestId('watchlist-ticker')
    )
    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('AAPL')

    setSnapshot([KO_ROW])
    act(() => rerender())

    expect(screen.getByTestId('bench-detail-ticker')).toHaveTextContent('KO')
  })

  it('removes a stock from its own card', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('watchlist-remove-AAPL'))

    expect(mockRemoveMutate).toHaveBeenCalledWith('AAPL')
  })

  it('surfaces a failed remove as an alert', () => {
    mockUseRemoveFromWatchlist.mockReturnValue({
      mutate: mockRemoveMutate,
      isPending: false,
      isError: true,
      error: apiError(400, {
        detail: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]
      }),
      isSuccess: false,
      reset: vi.fn()
    } as unknown as ReturnType<typeof useRemoveFromWatchlist>)
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent('AAPL is not on the watchlist')
  })
})

describe('WatchlistPage — review trade', () => {
  it('hands the selected stock’s put to the pre-filled new-wheel form', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('bench-review-KO'))

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    const [path] = mockNavigate.mock.calls[0] as [string]
    expect(path.startsWith('/new?')).toBe(true)
    expect(parsePromotedParams(path.slice('/new?'.length))).toMatchObject({
      ticker: 'KO',
      strike: '60',
      expiration: KO_CANDIDATE.expiration,
      premium: '0.95',
      quotedAt: QUOTE_TIMESTAMP,
      thesis: KO_NOTE
    })
  })
})

describe('WatchlistPage — query states', () => {
  it('renders a loading state while the snapshot is still pending', () => {
    setSnapshotLoading()
    renderPage()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders a loading state while the screener is still pending', () => {
    setResultsLoading()
    renderPage()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('alerts when the snapshot query fails', () => {
    setSnapshotError()
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load the watchlist — check that the database is accessible.'
    )
  })

  it('alerts when the screener query fails', () => {
    setResultsError()
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to screen the watchlist — check that market data is reachable.'
    )
  })
})
