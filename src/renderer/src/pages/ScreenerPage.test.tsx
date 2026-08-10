import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { format, parseISO } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenerCandidate, ScreenerExclusion } from '../api/screener'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { ScreenerPage } from './ScreenerPage'

vi.mock('../hooks/useMarketStatusDisplay')

const mockUseMarketStatusDisplay = vi.mocked(useMarketStatusDisplay)
const mockResults = vi.fn()

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
    earningsFlagged: false,
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

function setMarketDisplay(display: MarketStatusDisplay): void {
  mockUseMarketStatusDisplay.mockReturnValue({
    settingsQuery: {} as ReturnType<typeof useMarketStatusDisplay>['settingsQuery'],
    hasBroker: true,
    statusQuery: {} as ReturnType<typeof useMarketStatusDisplay>['statusQuery'],
    display
  })
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ScreenerPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockResults.mockReset()
  setMarketDisplay('LIVE')
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
    expect(screen.queryByTestId('screener-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-excluded-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('screener-row-AAPL')).not.toBeInTheDocument()
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
