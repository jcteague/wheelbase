/**
 * Tests for PositionCard component — T011
 * Run: cd frontend && pnpm test --run
 */

import { render, screen } from '@testing-library/preact';
import type { PositionListItem } from '../api/positions';
import { PositionCard } from './PositionCard';

const BASE_ITEM: PositionListItem = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  status: 'active',
  strike: '180.0000',
  expiration: '2026-04-17',
  dte: 42,
  premium_collected: '250.0000',
  effective_cost_basis: '177.5000',
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

it('renders ticker', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText('AAPL')).toBeInTheDocument();
});

it('renders phase badge', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText('CSP Open')).toBeInTheDocument();
});

it('renders strike formatted as currency', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText('$180.00')).toBeInTheDocument();
});

it('renders expiration date', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText(/2026-04-17/)).toBeInTheDocument();
});

it('renders DTE as integer', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText(/42/)).toBeInTheDocument();
});

it('renders premium collected formatted as currency', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText('$250.00')).toBeInTheDocument();
});

it('renders effective cost basis formatted as currency', () => {
  render(<PositionCard item={BASE_ITEM} />);
  expect(screen.getByText('$177.50')).toBeInTheDocument();
});

it('renders Expired when dte is null', () => {
  const item: PositionListItem = {
    ...BASE_ITEM,
    ticker: 'SPY',
    phase: 'WHEEL_COMPLETE',
    status: 'closed',
    strike: null,
    expiration: null,
    dte: null,
  };
  render(<PositionCard item={item} />);
  expect(screen.getByText(/expired/i)).toBeInTheDocument();
});
