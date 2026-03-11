/**
 * Tests for PositionsListPage component — T014
 * Run: cd frontend && pnpm test --run
 */

import { render, screen } from '@testing-library/preact';
import { vi } from 'vitest';
import type { PositionListItem } from '../api/positions';
import { usePositions } from '../hooks/usePositions';
import { PositionsListPage } from './PositionsListPage';

vi.mock('../hooks/usePositions');
vi.mock('../components/PositionCard', () => ({
  PositionCard: ({ item }: { item: PositionListItem }) => (
    <div data-testid="position-card">{item.ticker}</div>
  ),
}));

const mockUsePositions = vi.mocked(usePositions);

const ITEM_1: PositionListItem = {
  id: 'aaa',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  status: 'active',
  strike: '180.0000',
  expiration: '2026-04-17',
  dte: 40,
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000',
};

const ITEM_2: PositionListItem = {
  id: 'bbb',
  ticker: 'MSFT',
  phase: 'CSP_OPEN',
  status: 'active',
  strike: '400.0000',
  expiration: '2026-04-04',
  dte: 27,
  premium_collected: '300.0000',
  effective_cost_basis: '397.0000',
};

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

it('renders loading state', () => {
  mockUsePositions.mockReturnValue({
    isLoading: true,
    data: undefined,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePositions>);

  render(<PositionsListPage />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});

it('renders empty state when no positions', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [],
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePositions>);

  render(<PositionsListPage />);
  expect(screen.getByText(/no positions yet/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open your first wheel/i })).toHaveAttribute('href', '/');
});

it('renders a card for each position', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, ITEM_2],
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePositions>);

  render(<PositionsListPage />);
  expect(screen.getAllByTestId('position-card')).toHaveLength(2);
});

it('renders all expected tickers when populated', () => {
  mockUsePositions.mockReturnValue({
    isLoading: false,
    data: [ITEM_1, ITEM_2],
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePositions>);

  render(<PositionsListPage />);
  expect(screen.getByText('AAPL')).toBeInTheDocument();
  expect(screen.getByText('MSFT')).toBeInTheDocument();
});
