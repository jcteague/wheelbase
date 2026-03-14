import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { PositionListItem } from '../api/positions'
import { usePositions } from '../hooks/usePositions'
import { PositionsListPage } from './PositionsListPage'

vi.mock('../hooks/usePositions')
vi.mock('../components/PositionCard', () => ({
  PositionRow: ({ item, isClosed }: { item: PositionListItem; isClosed?: boolean }) => (
    <tr data-testid={isClosed ? 'position-card-closed' : 'position-card'}>
      <td>{item.ticker}</td>
    </tr>
  )
}))

const mockUsePositions = vi.mocked(usePositions)

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
  ticker: 'AAPL',
  phase: 'WHEEL_COMPLETE',
  status: 'CLOSED',
  strike: null,
  expiration: null,
  dte: null,
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000'
}

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
