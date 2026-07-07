import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import type { PositionListItem } from '../api/positions'
import type { OptionSnapshot, StockQuote } from '../api/market-data'
import { usePositions } from '../hooks/usePositions'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { useOptionSnapshots } from '../hooks/useOptionSnapshots'
import { useAlertDefaults, useSettingsStatus } from '../hooks/useSettings'
import { useManagementQueue } from '../hooks/useManagementQueue'
import { PositionsListPage } from './PositionsListPage'

vi.mock('../hooks/usePositions')
vi.mock('../hooks/useStockQuotes')
vi.mock('../hooks/useMarketStatus')
vi.mock('../hooks/useOptionSnapshots')
vi.mock('../hooks/useSettings')
vi.mock('../hooks/useManagementQueue')
vi.mock('../components/AssignmentNotificationBanner', () => ({
  AssignmentNotificationBanner: () => null
}))

const { mockUsePendingAssignments } = vi.hoisted(() => ({
  mockUsePendingAssignments: vi.fn()
}))
vi.mock('../api/assignments', () => ({
  usePendingAssignments: mockUsePendingAssignments
}))
vi.mock('../components/PositionCard', () => ({
  PositionRow: ({
    item,
    isClosed,
    quote,
    snapshot,
    hasPendingAssignment
  }: {
    item: PositionListItem
    isClosed?: boolean
    quote?: StockQuote
    snapshot?: OptionSnapshot
    hasPendingAssignment?: boolean
  }) => (
    <tr data-testid={isClosed ? 'position-card-closed' : 'position-card'}>
      <td>
        {item.ticker}
        {hasPendingAssignment && (
          <span
            data-testid={`pending-assignment-indicator-${item.id}`}
            className="inline-block w-2 h-2 rounded-full bg-wb-gold animate-wb-pulse"
            aria-label="Assignment pending"
          />
        )}
      </td>
      <td data-testid={`mock-quote-${item.ticker}`}>{quote?.price ?? 'NO_QUOTE'}</td>
      <td data-testid={`mock-snapshot-${item.ticker}`}>{snapshot?.mid ?? 'NO_SNAPSHOT'}</td>
    </tr>
  )
}))

const mockUsePositions = vi.mocked(usePositions)
const mockUseStockQuotes = vi.mocked(useStockQuotes)
const mockUseMarketStatus = vi.mocked(useMarketStatus)
const mockUseOptionSnapshots = vi.mocked(useOptionSnapshots)
const mockUseSettingsStatus = vi.mocked(useSettingsStatus)
const mockUseAlertDefaults = vi.mocked(useAlertDefaults)
const mockUseManagementQueue = vi.mocked(useManagementQueue)

function makeQueueResult(items: ManagementQueueItem[]): ReturnType<typeof useManagementQueue> {
  return { data: items } as unknown as ReturnType<typeof useManagementQueue>
}

const QUEUE_ITEM: ManagementQueueItem = {
  alertId: 'q1',
  positionId: 'aaa',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  urgency: 'high',
  summary: 'Expires in 3 days at $180.00 strike',
  quickAction: 'Review position',
  triggeredAt: '2026-06-25T12:00:00.000Z'
}

const AAPL_QUOTE: StockQuote = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  prevClose: '181.00',
  volume: 10000,
  timestamp: '2026-04-28T10:00:00Z'
}

const MSFT_QUOTE: StockQuote = {
  price: '418.30',
  bid: '418.28',
  ask: '418.32',
  prevClose: '420.00',
  volume: 5000,
  timestamp: '2026-04-28T10:00:00Z'
}

const ITEM_1: PositionListItem = {
  id: 'aaa',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '180.0000',
  expiration: '2026-04-17',
  dte: 40,
  instrumentType: 'PUT',
  contracts: 1,
  entryPremiumPerContract: '3.5000',
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000',
  profitTargetPercent: null
}

const ITEM_2: PositionListItem = {
  id: 'bbb',
  ticker: 'MSFT',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '400.0000',
  expiration: '2026-04-04',
  dte: 27,
  instrumentType: 'PUT',
  contracts: 1,
  entryPremiumPerContract: '5.0000',
  premium_collected: '300.0000',
  effective_cost_basis: '397.0000',
  profitTargetPercent: null
}

const CLOSED_ITEM: PositionListItem = {
  id: 'ccc',
  ticker: 'BBB',
  phase: 'WHEEL_COMPLETE',
  status: 'CLOSED',
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000',
  profitTargetPercent: null
}

const TSLA_ITEM: PositionListItem = {
  id: 'ddd',
  ticker: 'TSLA',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '200.0000',
  expiration: '2026-04-17',
  dte: 40,
  instrumentType: 'PUT',
  contracts: 1,
  entryPremiumPerContract: '4.0000',
  premium_collected: '100.0000',
  effective_cost_basis: '198.0000',
  profitTargetPercent: null
}

const HOLDING_ITEM: PositionListItem = {
  id: 'hhh',
  ticker: 'NVDA',
  phase: 'HOLDING_SHARES',
  status: 'ACTIVE',
  strike: null,
  expiration: null,
  dte: null,
  instrumentType: null,
  contracts: null,
  entryPremiumPerContract: null,
  premium_collected: '500.0000',
  effective_cost_basis: '450.0000',
  profitTargetPercent: null
}

function makeOptionSnapshot(mid: string): OptionSnapshot {
  return {
    bid: mid,
    ask: mid,
    mid,
    lastTrade: mid,
    openInterest: 100,
    volume: 50,
    greeks: { delta: '-0.30', gamma: '0.02', theta: '-0.05', vega: '0.10', iv: '0.25' },
    timestamp: '2026-04-28T10:00:00Z'
  }
}

function makePositionsResult(items: PositionListItem[]): ReturnType<typeof usePositions> {
  return {
    isLoading: false,
    data: items,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>
}

function makeStockQuotesResult(
  overrides: Partial<{
    data: Record<string, StockQuote> | undefined
    streamError: IpcStreamErrorEvent | null
    dataUpdatedAt: number
    stale: boolean
    minutesAgo: number
  }> = {}
): ReturnType<typeof useStockQuotes> {
  return {
    data: { AAPL: AAPL_QUOTE, MSFT: MSFT_QUOTE },
    streamError: null,
    dataUpdatedAt: Date.now(),
    stale: false,
    minutesAgo: 0,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides
  } as unknown as ReturnType<typeof useStockQuotes>
}

function makeMarketStatusResult(
  session: 'regular' | 'pre' | 'post' | 'closed' = 'regular'
): ReturnType<typeof useMarketStatus> {
  return {
    data: {
      isOpen: session === 'regular',
      nextOpen: '2026-04-29T09:30:00Z',
      nextClose: '2026-04-28T16:00:00Z',
      session
    },
    isLoading: false,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useMarketStatus>
}

function makeOptionSnapshotsResult(
  data: Record<string, OptionSnapshot> = {},
  { unavailable = false }: { unavailable?: boolean } = {}
): ReturnType<typeof useOptionSnapshots> {
  return {
    data,
    unavailable,
    isLoading: false,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof useOptionSnapshots>
}

beforeEach(() => {
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult())
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult())
  mockUseOptionSnapshots.mockReturnValue(makeOptionSnapshotsResult())
  mockUsePendingAssignments.mockReturnValue({ data: [], isLoading: false, isError: false })
  mockUseManagementQueue.mockReturnValue(makeQueueResult([]))
  mockUseSettingsStatus.mockReturnValue({
    data: {
      massive: 'configured',
      alpacaPaper: 'configured',
      alpacaLive: 'missing',
      activeBrokerEnv: 'paper',
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: 'PA…ABC',
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseAlertDefaults.mockReturnValue({
    data: { profitTargetPercent: 50, managementWindowDte: 21 },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useAlertDefaults>)
})

it('renders a new wheel button in the header', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByRole('link', { name: /\+ new wheel/i })).toHaveAttribute('href', '#/new')
})

it('renders loading state', () => {
  mockUsePositions.mockReturnValue({
    isLoading: true,
    data: undefined,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('renders empty state when no positions', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByText(/no positions yet/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /open your first wheel/i })).toHaveAttribute(
    'href',
    '#/new'
  )
})

it('renders a card for each position', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, ITEM_2],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getAllByTestId('position-card')).toHaveLength(2)
})

it('renders all expected tickers when populated', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, ITEM_2],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByText('AAPL')).toBeInTheDocument()
  expect(screen.getByText('MSFT')).toBeInTheDocument()
})

it('renders Active section header above active positions', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, CLOSED_ITEM],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByText(/^Active$/i)).toBeInTheDocument()
})

it('renders Closed section header when closed positions exist', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, CLOSED_ITEM],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByText(/^Closed$/i)).toBeInTheDocument()
})

it('does not render Closed section header when no closed positions', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, ITEM_2],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.queryByText(/^Closed$/i)).not.toBeInTheDocument()
})

it('renders closed position card with isClosed testid', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, CLOSED_ITEM],
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)

  render(<PositionsListPage />)
  expect(screen.getByTestId('position-card-closed')).toBeInTheDocument()
})

// ── Area 13: market status pill ──────────────────────────────────────────────

it('shows MarketStatusPill with state LIVE during regular session', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('regular'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('LIVE')
})

it('shows MarketStatusPill with state EXT during pre session', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('pre'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('EXT')
})

it('shows MarketStatusPill with state EXT during post session', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('post'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('EXT')
})

it('shows MarketStatusPill with state CLOSED when session is closed', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('closed'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('CLOSED')
})

it('shows MarketStatusPill with state DELAYED when stale flag is true', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult({ stale: true, minutesAgo: 6 }))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('regular'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('DELAYED')
})

it('shows MarketStatusPill with state LIVE when streamError is set but data is fresh', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseStockQuotes.mockReturnValue(
    makeStockQuotesResult({
      streamError: {
        feed: 'stockQuotes',
        code: 'stream_disconnected',
        message: 'Lost connection',
        reconnectable: true
      }
    })
  )
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('regular'))

  render(<PositionsListPage />)
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('LIVE')
})

// ── Area 13: stale data banner ───────────────────────────────────────────────

it('renders StaleDataBanner with correct minutesAgo when stale', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult({ stale: true, minutesAgo: 6 }))

  render(<PositionsListPage />)
  const banner = screen.getByTestId('stale-data-banner')
  expect(banner).toBeInTheDocument()
  expect(banner).toHaveTextContent('last updated 6m ago')
})

it('does not render StaleDataBanner when not stale', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult({ stale: false, minutesAgo: 0 }))

  render(<PositionsListPage />)
  expect(screen.queryByTestId('stale-data-banner')).not.toBeInTheDocument()
})

// ── Area 13: quote passing ───────────────────────────────────────────────────

it('passes quote to each PositionRow', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2]))
  mockUseStockQuotes.mockReturnValue(
    makeStockQuotesResult({ data: { AAPL: AAPL_QUOTE, MSFT: MSFT_QUOTE } })
  )

  render(<PositionsListPage />)
  expect(screen.getByTestId('mock-quote-AAPL')).toHaveTextContent('182.45')
  expect(screen.getByTestId('mock-quote-MSFT')).toHaveTextContent('418.30')
})

it('passes undefined quote when ticker missing from quotes', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, TSLA_ITEM]))
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult({ data: { AAPL: AAPL_QUOTE } }))

  render(<PositionsListPage />)
  expect(screen.getByTestId('mock-quote-AAPL')).toHaveTextContent('182.45')
  expect(screen.getByTestId('mock-quote-TSLA')).toHaveTextContent('NO_QUOTE')
})

it('derives ticker list from active positions only', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, CLOSED_ITEM]))

  render(<PositionsListPage />)
  expect(mockUseStockQuotes).toHaveBeenCalledWith(['AAPL'])
})

// ── Area 14: column order with Opt Mid + P&L ────────────────────────────────

it('header row contains Ticker, Phase, Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))

  render(<PositionsListPage />)
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
  expect(headers).toEqual([
    'Ticker',
    'Phase',
    'Price',
    'Opt Mid',
    'P&L',
    'Strike',
    'Expiration',
    'DTE',
    'Premium',
    'Cost Basis'
  ])
})

// ── Area 14: derive ActiveLegSummary[] from active positions ────────────────

it('derives ActiveLegSummary[] from active positions and passes to useOptionSnapshots', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2, CLOSED_ITEM]))

  render(<PositionsListPage />)
  // Last call should have received exactly the two active legs
  const calls = mockUseOptionSnapshots.mock.calls
  const lastCall = calls[calls.length - 1]
  const legsArg = lastCall[0]
  expect(legsArg).toEqual([
    { ticker: 'AAPL', expiration: '2026-04-17', strike: '180.0000', instrumentType: 'PUT' },
    { ticker: 'MSFT', expiration: '2026-04-04', strike: '400.0000', instrumentType: 'PUT' }
  ])
})

it('passes session to useOptionSnapshots so polling stops when market is closed', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult('closed'))

  render(<PositionsListPage />)
  const calls = mockUseOptionSnapshots.mock.calls
  const lastCall = calls[calls.length - 1]
  expect(lastCall[1]).toEqual({ session: 'closed' })
})

// ── Area 14: snapshots route to matching rows ───────────────────────────────

it('passes the matching snapshot to each row keyed by OCC symbol', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2]))
  // AAPL OCC symbol for 2026-04-17 / $180 / PUT: AAPL260417P00180000
  mockUseOptionSnapshots.mockReturnValue(
    makeOptionSnapshotsResult({ AAPL260417P00180000: makeOptionSnapshot('1.30') })
  )

  render(<PositionsListPage />)
  expect(screen.getByTestId('mock-snapshot-AAPL')).toHaveTextContent('1.30')
  expect(screen.getByTestId('mock-snapshot-MSFT')).toHaveTextContent('NO_SNAPSHOT')
})

it('passes undefined snapshot to closed positions', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, CLOSED_ITEM]))
  mockUseOptionSnapshots.mockReturnValue(
    makeOptionSnapshotsResult({ AAPL260417P00180000: makeOptionSnapshot('1.30') })
  )

  render(<PositionsListPage />)
  expect(screen.getByTestId('mock-snapshot-BBB')).toHaveTextContent('NO_SNAPSHOT')
})

it('passes undefined snapshot for HOLDING_SHARES row', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([HOLDING_ITEM]))
  mockUseOptionSnapshots.mockReturnValue(makeOptionSnapshotsResult({}))

  render(<PositionsListPage />)
  expect(screen.getByTestId('mock-snapshot-NVDA')).toHaveTextContent('NO_SNAPSHOT')
})

// ── Area 15: options unavailable notice ─────────────────────────────────────

it('shows options unavailable notice when snapshotsQuery.unavailable is true', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseOptionSnapshots.mockReturnValue(makeOptionSnapshotsResult({}, { unavailable: true }))

  render(<PositionsListPage />)
  expect(screen.getByText(/Options data unavailable/)).toBeInTheDocument()
})

it('does not show options unavailable notice when snapshotsQuery.unavailable is false', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseOptionSnapshots.mockReturnValue(makeOptionSnapshotsResult({}, { unavailable: false }))

  render(<PositionsListPage />)
  expect(screen.queryByText(/Options data unavailable/)).not.toBeInTheDocument()
})

// ── US-35: pulsing amber indicator on rows with a pending assignment ─────────

it('renders a pulsing amber indicator on a position row that has a pending assignment', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2]))
  mockUsePendingAssignments.mockReturnValue({
    data: [
      {
        id: 1,
        ticker: 'AAPL',
        strike: '180.00',
        expiration: '2026-04-17',
        contractType: 'put',
        qty: 1,
        transactionTime: '2026-04-17T16:00:00Z',
        positionId: ITEM_1.id
      }
    ],
    isLoading: false,
    isError: false
  })

  render(<PositionsListPage />)

  const indicator = screen.getByTestId(`pending-assignment-indicator-${ITEM_1.id}`)
  expect(indicator).toBeInTheDocument()
  expect(indicator.className).toMatch(/animate-wb-pulse/)
  expect(indicator.className).toMatch(/bg-wb-gold/)

  // Position rows without a pending assignment must NOT show the indicator.
  expect(screen.queryByTestId(`pending-assignment-indicator-${ITEM_2.id}`)).not.toBeInTheDocument()
})

it('does not render a pulsing indicator on any row when there are no pending assignments', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2]))
  mockUsePendingAssignments.mockReturnValue({ data: [], isLoading: false, isError: false })

  render(<PositionsListPage />)

  expect(screen.queryByTestId(`pending-assignment-indicator-${ITEM_1.id}`)).not.toBeInTheDocument()
  expect(screen.queryByTestId(`pending-assignment-indicator-${ITEM_2.id}`)).not.toBeInTheDocument()
})

// ── US-37: settings + auth banners ───────────────────────────────────────────

it('shows the setup banner when Massive is app-provided and Alpaca is not configured', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseSettingsStatus.mockReturnValue({
    data: {
      massive: 'missing',
      alpacaPaper: 'missing',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult({ data: undefined }))

  render(<PositionsListPage />)

  expect(screen.getByText(/massive is app-provided/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /alpaca setup/i })).toHaveAttribute('href', '#/settings')
})

it('shows setup and broker banners even when there are no positions yet', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([]))
  mockUseSettingsStatus.mockReturnValue({
    data: {
      massive: 'missing',
      alpacaPaper: 'missing',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<PositionsListPage />)

  expect(screen.getByText(/no positions yet/i)).toBeInTheDocument()
  expect(screen.getByText(/massive is app-provided/i)).toBeInTheDocument()
  expect(
    screen.getByText(/connect alpaca to enable broker activity and buying power/i)
  ).toBeInTheDocument()
})

it('shows auth prompts even when there are no positions yet', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([]))
  mockUseStockQuotes.mockReturnValue(
    makeStockQuotesResult({
      data: undefined,
      streamError: { code: 'auth_failed', message: 'nope' } as IpcStreamErrorEvent
    })
  )
  mockUseMarketStatus.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: {
      body: { detail: [{ code: 'auth_failed' }] }
    } as unknown,
    refetch: vi.fn()
  } as unknown as ReturnType<typeof useMarketStatus>)

  render(<PositionsListPage />)

  expect(screen.getByText(/massive authentication failed/i)).toBeInTheDocument()
  expect(screen.getByText(/alpaca authentication failed/i)).toBeInTheDocument()
})

it('continues to render live prices and mids from Massive when no Alpaca credentials are configured', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))
  mockUseSettingsStatus.mockReturnValue({
    data: {
      massive: 'configured',
      alpacaPaper: 'missing',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseOptionSnapshots.mockReturnValue(
    makeOptionSnapshotsResult({ AAPL260417P00180000: makeOptionSnapshot('1.30') })
  )

  render(<PositionsListPage />)

  expect(screen.getByTestId('mock-quote-AAPL')).toHaveTextContent('182.45')
  expect(screen.getByTestId('mock-snapshot-AAPL')).toHaveTextContent('1.30')
  expect(screen.getByText(/connect alpaca to enable/i)).toBeInTheDocument()
})

// ── US-51: management queue placement ─────────────────────────────────────────

it('renders the management queue above the positions grid', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1, ITEM_2]))
  mockUseManagementQueue.mockReturnValue(makeQueueResult([QUEUE_ITEM]))

  render(<PositionsListPage />)

  const queueHeading = screen.getByText('What Needs Attention First')
  const firstCard = screen.getAllByTestId('position-card')[0]

  expect(queueHeading.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  )
})

it('renders the management queue even when there are no positions', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([]))
  mockUseManagementQueue.mockReturnValue(makeQueueResult([]))

  render(<PositionsListPage />)

  expect(screen.getByText('No positions need attention right now')).toBeInTheDocument()
})
