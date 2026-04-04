import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { usePosition } from '../hooks/usePosition'
import { PositionDetailPage } from './PositionDetailPage'

vi.mock('../hooks/usePosition')

// Mock CloseCspForm to avoid testing it in isolation here
vi.mock('../components/CloseCspForm', () => ({
  CloseCspForm: () => <div data-testid="close-csp-form">CloseCspForm</div>
}))

// Mock ExpirationSheet to avoid testing it in isolation here
vi.mock('../components/ExpirationSheet', () => ({
  ExpirationSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="expiration-sheet">Expire CSP Worthless</div> : null
}))

// Mock AssignmentSheet to avoid testing it in isolation here
vi.mock('../components/AssignmentSheet', () => ({
  AssignmentSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="assignment-sheet">Assign CSP to Shares</div> : null
}))

// Mock CloseCcEarlySheet to avoid testing it in isolation here
vi.mock('../components/CloseCcEarlySheet', () => ({
  CloseCcEarlySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="close-cc-early-sheet">Close Covered Call Early</div> : null
}))

// Mock CallAwaySheet to avoid testing it in isolation here
vi.mock('../components/CallAwaySheet', () => ({
  CallAwaySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="call-away-sheet">Record Call-Away</div> : null
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
    instrumentType: 'PUT' as const,
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
  },
  legs: []
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

it('renders Record Expiration button when position is CSP_OPEN', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('record-expiration-btn')).toBeInTheDocument()
})

it('opens ExpirationSheet when Record Expiration button is clicked', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('record-expiration-btn'))
  expect(screen.getByText('Expire CSP Worthless')).toBeInTheDocument()
})

it('shows "Record Assignment →" button when phase is CSP_OPEN', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('record-assignment-btn')).toBeInTheDocument()
})

it('does not show "Record Assignment →" button when phase is HOLDING_SHARES', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: {
        ...CSP_OPEN_DETAIL.position,
        phase: 'HOLDING_SHARES'
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByTestId('record-assignment-btn')).not.toBeInTheDocument()
})

it('opens AssignmentSheet when "Record Assignment →" is clicked', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('record-assignment-btn'))
  expect(screen.getByTestId('assignment-sheet')).toBeInTheDocument()
})

it('blurs and disables the detail page content when AssignmentSheet is open', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  const detail = screen.getByTestId('position-detail')

  await user.click(screen.getByTestId('record-assignment-btn'))

  expect(detail).toHaveStyle({ filter: 'blur(1.5px)', opacity: '0.35', pointerEvents: 'none' })
})

it('does not render Record Expiration button and shows closed banner for WHEEL_COMPLETE', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: {
        ...CSP_OPEN_DETAIL.position,
        phase: 'WHEEL_COMPLETE',
        status: 'CLOSED',
        closedDate: '2026-04-17'
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByTestId('record-expiration-btn')).not.toBeInTheDocument()
  expect(screen.getByText(/Closed on/i)).toBeInTheDocument()
})

it('renders leg history section with two legs in order', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      legs: [
        {
          id: 'leg-1',
          positionId: 'pos-123',
          legRole: 'CSP_OPEN',
          action: 'SELL',
          instrumentType: 'PUT',
          strike: '180.0000',
          expiration: '2026-04-17',
          contracts: 1,
          premiumPerContract: '2.5000',
          fillDate: '2026-03-01',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z'
        },
        {
          id: 'leg-2',
          positionId: 'pos-123',
          legRole: 'CSP_CLOSE',
          action: 'BUY',
          instrumentType: 'PUT',
          strike: '180.0000',
          expiration: '2026-04-17',
          contracts: 1,
          premiumPerContract: '1.0000',
          fillDate: '2026-03-10',
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z'
        }
      ]
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  const rows = screen.getAllByRole('row')
  // First data row should be the open leg (CSP_OPEN / SELL)
  expect(rows[1]).toHaveTextContent('SELL')
  // Second data row should be the close leg (CSP_CLOSE / BUY)
  expect(rows[2]).toHaveTextContent('BUY')
})

it('does not render leg history section when legs array is empty', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByText('Leg History')).not.toBeInTheDocument()
})

it('renders thesis and notes when both are present', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: {
        ...CSP_OPEN_DETAIL.position,
        thesis: 'Bullish on services revenue',
        notes: 'Selling at support level'
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByText('Bullish on services revenue')).toBeInTheDocument()
  expect(screen.getByText('Selling at support level')).toBeInTheDocument()
})

it('does not render notes section when both thesis and notes are null', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByText(/Notes/i)).not.toBeInTheDocument()
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

const CC_OPEN_DETAIL = {
  ...CSP_OPEN_DETAIL,
  position: {
    ...CSP_OPEN_DETAIL.position,
    phase: 'CC_OPEN' as const
  },
  activeLeg: {
    id: 'leg-cc',
    positionId: 'pos-123',
    legRole: 'CC_OPEN' as const,
    action: 'SELL' as const,
    instrumentType: 'CALL' as const,
    strike: '182.0000',
    expiration: '2026-02-21',
    contracts: 1,
    premiumPerContract: '2.3000',
    fillDate: '2026-01-20',
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-01-20T00:00:00.000Z'
  }
}

it('shows "Close CC Early →" button when position phase is CC_OPEN', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('close-cc-early-btn')).toBeInTheDocument()
})

it('does not show "Close CC Early →" button when phase is HOLDING_SHARES', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CC_OPEN_DETAIL,
      position: { ...CC_OPEN_DETAIL.position, phase: 'HOLDING_SHARES' as const }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByTestId('close-cc-early-btn')).not.toBeInTheDocument()
})

it('opens CloseCcEarlySheet when "Close CC Early →" button is clicked', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('close-cc-early-btn'))
  expect(screen.getByTestId('close-cc-early-sheet')).toBeInTheDocument()
})

it('opens CallAwaySheet and blurs the detail page when "Record Call-Away →" is clicked', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  const detail = screen.getByTestId('position-detail')

  await user.click(screen.getByTestId('record-call-away-btn'))

  expect(screen.getByTestId('call-away-sheet')).toBeInTheDocument()
  expect(detail).toHaveStyle({ filter: 'blur(1.5px)', opacity: '0.35', pointerEvents: 'none' })
})
