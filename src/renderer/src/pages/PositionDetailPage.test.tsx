import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { usePosition } from '../hooks/usePosition'
import { PositionDetail } from '../api/positions'
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

// Mock CcExpirationSheet to avoid testing it in isolation here
vi.mock('../components/CcExpirationSheet', () => ({
  CcExpirationSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="cc-expiration-sheet">Expire CC Worthless</div> : null
}))

// Mock RollCcSheet to avoid testing it in isolation here
vi.mock('../components/RollCcSheet', () => ({
  RollCcSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="roll-cc-sheet">
        <button data-testid="roll-cc-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null
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
    rollChainId: null,
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
  legs: [],
  allSnapshots: []
}

// RED: TypeScript will error here until PositionDetail gains the allSnapshots field
const _typecheckAllSnapshots: PositionDetail = {
  ...CSP_OPEN_DETAIL,
  allSnapshots: []
}
void _typecheckAllSnapshots

const CSP_OPEN_WITH_SNAPSHOTS = {
  ...CSP_OPEN_DETAIL,
  allSnapshots: [
    {
      id: 's1',
      positionId: 'pos-123',
      basisPerShare: '177.5000',
      totalPremiumCollected: '250.0000',
      finalPnl: null,
      snapshotAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z'
    }
  ]
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
  expect(screen.getAllByText(/CSP/i).length).toBeGreaterThan(0)
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
    rollChainId: null,
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

// ---------------------------------------------------------------------------
// CC Expiration wiring (US-9)
// ---------------------------------------------------------------------------

// CC_OPEN_DETAIL uses expiration '2026-02-21' which is in the past (today 2026-03-26)
// so computeDte <= 0 → the "Record Expiration →" button should appear

it('renders "record-cc-expiration-btn" when phase is CC_OPEN and CC expiration is in the past (DTE ≤ 0)', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('record-cc-expiration-btn')).toBeInTheDocument()
  expect(screen.getByTestId('record-cc-expiration-btn')).toHaveTextContent('Record Expiration')
})

it('does NOT render "record-cc-expiration-btn" when CC_OPEN expiration is in the future (DTE > 0)', () => {
  // Use a far-future expiration so DTE > 0
  const futureExpiration = '2099-12-31'
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CC_OPEN_DETAIL,
      activeLeg: { ...CC_OPEN_DETAIL.activeLeg, expiration: futureExpiration }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.queryByTestId('record-cc-expiration-btn')).not.toBeInTheDocument()
})

it('does NOT render "record-cc-expiration-btn" when phase is HOLDING_SHARES', () => {
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
  expect(screen.queryByTestId('record-cc-expiration-btn')).not.toBeInTheDocument()
})

it('clicking "record-cc-expiration-btn" opens CcExpirationSheet (renders cc-expiration-sheet)', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('record-cc-expiration-btn'))
  expect(screen.getByTestId('cc-expiration-sheet')).toBeInTheDocument()
})

it('renders without errors when allSnapshots is populated', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_OPEN_WITH_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  render(<PositionDetailPage />)
  expect(screen.getByTestId('position-detail')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Area 6 — deriveRunningBasis wiring (US-11)
// ---------------------------------------------------------------------------

const CSP_WITH_LEGS_AND_SNAPSHOTS = {
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
    }
  ],
  // basisPerShare '176.5000' ($176.50) is distinct from costBasisSnapshot.basisPerShare
  // ('177.5000' / $177.50) so it only appears in the leg table after deriveRunningBasis runs
  allSnapshots: [
    {
      id: 's1',
      positionId: 'pos-123',
      basisPerShare: '176.5000',
      totalPremiumCollected: '350.0000',
      finalPnl: null,
      snapshotAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z'
    }
  ]
}

it('leg history table shows running cost basis column header', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  render(<PositionDetailPage />)
  expect(screen.getByText('Running Basis / Share')).toBeInTheDocument()
})

it('leg history table shows running basis value for CSP_OPEN leg', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  render(<PositionDetailPage />)
  // $176.50 only appears in the Running Basis column (distinct from costBasisSnapshot $177.50)
  expect(screen.getByText('$176.50')).toBeInTheDocument()
})

it('leg history table renders final P&L footer for WHEEL_COMPLETE position', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_WITH_LEGS_AND_SNAPSHOTS,
      position: {
        ...CSP_OPEN_DETAIL.position,
        phase: 'WHEEL_COMPLETE' as const,
        status: 'CLOSED' as const,
        closedDate: '2026-04-17'
      },
      costBasisSnapshot: {
        id: 'cbs-1',
        positionId: 'pos-123',
        basisPerShare: '177.5000',
        totalPremiumCollected: '250.0000',
        finalPnl: '780.0000',
        snapshotAt: '2026-03-01T00:00:00.000Z',
        createdAt: '2026-03-01T00:00:00.000Z'
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  render(<PositionDetailPage />)
  // "Final P&L" appears in the Cost Basis stats AND the tfoot — both must be present
  const pnlLabels = screen.getAllByText(/Final P&L/)
  expect(pnlLabels.length).toBeGreaterThanOrEqual(2)
  const amounts = screen.getAllByText('$780.00')
  expect(amounts.length).toBeGreaterThanOrEqual(2)
})

it('leg history table has no P&L footer when finalPnl is null', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  render(<PositionDetailPage />)
  expect(screen.queryByText(/Final P&L/)).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Area 13 — RollCcSheet wiring (US-14)
// ---------------------------------------------------------------------------

it('PositionDetailPage: shows "Roll CC →" button when position is in CC_OPEN phase', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
})

it('PositionDetailPage: opens RollCcSheet when "Roll CC →" is clicked', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('roll-cc-btn'))
  expect(screen.getByTestId('roll-cc-sheet')).toBeInTheDocument()
})

it('PositionDetailPage: closes RollCcSheet when cancelled', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  await user.click(screen.getByTestId('roll-cc-btn'))
  expect(screen.getByTestId('roll-cc-sheet')).toBeInTheDocument()
  await user.click(screen.getByTestId('roll-cc-sheet-close'))
  expect(screen.queryByTestId('roll-cc-sheet')).not.toBeInTheDocument()
})

it('PositionDetailPage: blurs content when RollCcSheet is open (overlayOpen=true)', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CC_OPEN_DETAIL,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  const detail = screen.getByTestId('position-detail')

  await user.click(screen.getByTestId('roll-cc-btn'))

  expect(detail).toHaveStyle({ filter: 'blur(1.5px)', opacity: '0.35', pointerEvents: 'none' })
})
