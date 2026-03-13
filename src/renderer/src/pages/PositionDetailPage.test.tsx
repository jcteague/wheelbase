import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { usePosition } from '../hooks/usePosition'
import { PositionDetailPage } from './PositionDetailPage'

vi.mock('../hooks/usePosition')

// Mock CloseCspForm to avoid testing it in isolation here
vi.mock('../components/CloseCspForm', () => ({
  CloseCspForm: () => <div data-testid="close-csp-form">CloseCspForm</div>
}))

// Mock wouter so useParams works
vi.mock('wouter', () => ({
  useParams: () => ({ id: 'pos-123' }),
  useLocation: () => ['/', vi.fn()]
}))

const mockUsePosition = vi.mocked(usePosition)

const CSP_OPEN_DETAIL = {
  position: {
    id: 'pos-123',
    ticker: 'AAPL',
    phase: 'CSP_OPEN' as const,
    status: 'ACTIVE' as const,
    strategyType: 'WHEEL' as const,
    openedDate: '2026-03-01',
    closedDate: null,
    accountId: null,
    notes: null,
    thesis: null,
    tags: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  },
  activeLeg: {
    id: 'leg-1',
    positionId: 'pos-123',
    legRole: 'CSP_OPEN' as const,
    action: 'SELL' as const,
    optionType: 'PUT' as const,
    strike: '180.0000',
    expiration: '2026-04-17',
    contracts: 1,
    premiumPerContract: '2.5000',
    fillDate: '2026-03-01',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  },
  costBasisSnapshot: {
    id: 'cbs-1',
    positionId: 'pos-123',
    basisPerShare: '177.5000',
    totalPremiumCollected: '250.0000',
    finalPnl: null,
    snapshotAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z'
  }
}

it('shows position details and CloseCspForm for a CSP_OPEN position', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  expect(screen.getByText(/AAPL/)).toBeInTheDocument()
  expect(screen.getByText(/CSP/i)).toBeInTheDocument()
  expect(screen.getByTestId('position-detail')).toBeInTheDocument()
  expect(screen.getByTestId('close-csp-form')).toBeInTheDocument()
})

it('shows loading spinner when position is loading', () => {
  mockUsePosition.mockReturnValue({
    isLoading: true,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('shows error message when position fails to load', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: true,
    data: undefined,
    error: { status: 404, body: 'Not found' }
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

it('does not render CloseCspForm for a closed position', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: {
        ...CSP_OPEN_DETAIL.position,
        phase: 'CSP_CLOSED_PROFIT',
        status: 'CLOSED',
        closedDate: '2026-03-10'
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByTestId('close-csp-form')).not.toBeInTheDocument()
})
