import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import type { PositionListItem } from '../api/positions'
import type { StockQuote } from '../api/market-data'
import { usePositions } from '../hooks/usePositions'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { PositionsListPage } from './PositionsListPage'

vi.mock('../hooks/usePositions')
vi.mock('../hooks/useStockQuotes')
vi.mock('../hooks/useMarketStatus')
vi.mock('../components/PositionCard', () => ({
  PositionRow: ({
    item,
    isClosed,
    quote
  }: {
    item: PositionListItem
    isClosed?: boolean
    quote?: StockQuote
  }) => (
    <tr data-testid={isClosed ? 'position-card-closed' : 'position-card'}>
      <td>{item.ticker}</td>
      <td data-testid={`mock-quote-${item.ticker}`}>{quote?.price ?? 'NO_QUOTE'}</td>
    </tr>
  )
}))

const mockUsePositions = vi.mocked(usePositions)
const mockUseStockQuotes = vi.mocked(useStockQuotes)
const mockUseMarketStatus = vi.mocked(useMarketStatus)

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
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000'
}

const ITEM_2: PositionListItem = {
  id: 'bbb',
  ticker: 'MSFT',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '400.0000',
  expiration: '2026-04-04',
  dte: 27,
  premium_collected: '300.0000',
  effective_cost_basis: '397.0000'
}

const CLOSED_ITEM: PositionListItem = {
  id: 'ccc',
  ticker: 'BBB',
  phase: 'WHEEL_COMPLETE',
  status: 'CLOSED',
  strike: null,
  expiration: null,
  dte: null,
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000'
}

const TSLA_ITEM: PositionListItem = {
  id: 'ddd',
  ticker: 'TSLA',
  phase: 'CSP_OPEN',
  status: 'ACTIVE',
  strike: '200.0000',
  expiration: '2026-04-17',
  dte: 40,
  premium_collected: '100.0000',
  effective_cost_basis: '198.0000'
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

beforeEach(() => {
  mockUseStockQuotes.mockReturnValue(makeStockQuotesResult())
  mockUseMarketStatus.mockReturnValue(makeMarketStatusResult())
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

it('shows MarketStatusPill with state DELAYED when streamError is set', () => {
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
  expect(screen.getByTestId('market-status-pill')).toHaveTextContent('DELAYED')
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

// ── Area 13: column order ────────────────────────────────────────────────────

it('Price column header renders between Phase and Strike', () => {
  mockUsePositions.mockReturnValue(makePositionsResult([ITEM_1]))

  render(<PositionsListPage />)
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
  expect(headers).toEqual([
    'Ticker',
    'Phase',
    'Price',
    'Strike',
    'Expiration',
    'DTE',
    'Premium',
    'Cost Basis'
  ])
})
