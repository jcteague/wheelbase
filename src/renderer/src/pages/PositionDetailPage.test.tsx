import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { usePosition } from '../hooks/usePosition'
import { useOptionSnapshots } from '../hooks/useOptionSnapshots'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { PositionDetail } from '../api/positions'
import type { OptionSnapshotsBySymbol, StockQuotesByTicker } from '../api/market-data'
import { PositionDetailPage } from './PositionDetailPage'

vi.mock('../hooks/usePosition')
vi.mock('../hooks/useOptionSnapshots')
vi.mock('../hooks/useStockQuotes')

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

// Mock PositionAlertOverridesForm to avoid testing it in isolation here
vi.mock('../components/PositionAlertOverridesForm', () => ({
  PositionAlertOverridesForm: ({
    positionId,
    profitTargetPercent,
    managementWindowDteOverride
  }: {
    positionId: string
    profitTargetPercent: number | null
    managementWindowDteOverride: number | null
  }) => (
    <div data-testid="position-alert-overrides-form">
      {positionId}:{String(profitTargetPercent)}:{String(managementWindowDteOverride)}
    </div>
  )
}))

// Mock wouter so useParams works
vi.mock('wouter', () => ({
  useParams: () => ({ id: 'pos-123' }),
  useLocation: () => ['/', vi.fn()]
}))

const mockUsePosition = vi.mocked(usePosition)
const mockUseOptionSnapshots = vi.mocked(useOptionSnapshots)
const mockUseStockQuotes = vi.mocked(useStockQuotes)

function mockSnapshots(snapshots: OptionSnapshotsBySymbol | undefined): void {
  mockUseOptionSnapshots.mockReturnValue({
    data: snapshots,
    isLoading: false,
    isError: false,
    error: null,
    fetchStatus: snapshots === undefined ? 'idle' : 'idle'
  } as unknown as ReturnType<typeof useOptionSnapshots>)
}

function mockStockQuotes(data: StockQuotesByTicker | undefined): void {
  mockUseStockQuotes.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    streamError: null,
    stale: false,
    minutesAgo: 0,
    fetchStatus: 'idle'
  } as unknown as ReturnType<typeof useStockQuotes>)
}

// Default mocks — no snapshots, no stock quotes
beforeEach(() => {
  mockSnapshots(undefined)
  mockStockQuotes(undefined)
})

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
    profitTargetPercent: null,
    managementWindowDteOverride: null,
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

  expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/CSP/i).length).toBeGreaterThan(0)
  expect(screen.getByTestId('position-detail')).toBeInTheDocument()
  expect(screen.getByTestId('close-csp-form')).toBeInTheDocument()
})

it('renders PositionAlertOverridesForm with the position’s alert override fields', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: {
        ...CSP_OPEN_DETAIL.position,
        profitTargetPercent: 25,
        managementWindowDteOverride: 14
      }
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)
  expect(screen.getByTestId('position-alert-overrides-form')).toHaveTextContent('pos-123:25:14')
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

it('renders leg history section with two legs in order', async () => {
  const user = userEvent.setup()
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

  // Leg history is now inside the "Cost basis & history" CollapsedDrawer (collapsed by default)
  const costBasisBtn = screen.getByRole('button', { name: /cost basis/i })
  await user.click(costBasisBtn)

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

  // "Cost basis & history" drawer should be present (costBasisSnapshot exists)
  expect(screen.getByRole('button', { name: /cost basis/i })).toBeInTheDocument()
  // But no table inside — no legs means no LegHistoryTable
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
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

it('leg history table shows running cost basis column header', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  // Leg history lives inside the "Cost basis & history" drawer — expand it first
  const costBasisBtn = screen.getByRole('button', { name: /cost basis/i })
  await user.click(costBasisBtn)

  expect(screen.getByText('Running Basis / Share')).toBeInTheDocument()
})

it('leg history table shows running basis value for CSP_OPEN leg', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  const costBasisBtn = screen.getByRole('button', { name: /cost basis/i })
  await user.click(costBasisBtn)

  // $176.50 only appears in the Running Basis column (distinct from costBasisSnapshot $177.50)
  expect(screen.getByText('$176.50')).toBeInTheDocument()
})

it('leg history table renders final P&L footer for WHEEL_COMPLETE position', async () => {
  const user = userEvent.setup()
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

  const costBasisBtn = screen.getByRole('button', { name: /cost basis/i })
  await user.click(costBasisBtn)

  // Final P&L appears in the LegHistoryTable tfoot
  expect(screen.getByText(/Final P&L/)).toBeInTheDocument()
  expect(screen.getByText('$780.00')).toBeInTheDocument()
})

it('leg history table has no P&L footer when finalPnl is null', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: CSP_WITH_LEGS_AND_SNAPSHOTS,
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  const costBasisBtn = screen.getByRole('button', { name: /cost basis/i })
  await user.click(costBasisBtn)

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

// ---------------------------------------------------------------------------
// Area 15 — Open Leg snapshot stats (US-33 → US-34 cockpit rewire)
// ---------------------------------------------------------------------------
//
// CSP_OPEN_DETAIL has activeLeg with ticker=AAPL, strike=180, expiration=2026-04-17,
// PUT, contracts=1. The OCC symbol is AAPL260417P00180000.
const AAPL_OCC = 'AAPL260417P00180000'

const PROFIT_SNAPSHOT = {
  bid: '1.20',
  ask: '1.40',
  mid: '1.30',
  lastTrade: '1.30',
  openInterest: 100,
  volume: 50,
  greeks: { delta: '-0.30', gamma: '0.01', theta: '-0.05', vega: '0.10', iv: '0.25' },
  timestamp: '2026-04-01T15:00:00.000Z'
}

const LOSS_SNAPSHOT = {
  ...PROFIT_SNAPSHOT,
  bid: '5.10',
  ask: '5.30',
  mid: '5.20'
}

// Override premium to 3.50 so it matches the spec's example numbers
// (entryPremium=3.50, contracts=1 → maxProfit=$350.00)
const OPEN_LEG_DETAIL_3_50 = {
  ...CSP_OPEN_DETAIL,
  activeLeg: {
    ...CSP_OPEN_DETAIL.activeLeg,
    premiumPerContract: '3.5000'
  }
}

it('Open Leg section renders Current Mid stat with $1.30 when snapshot is present', async () => {
  const user = userEvent.setup()
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // Current Mid is inside the "Leg reference" CollapsedDrawer (collapsed by default)
  const legRefBtn = screen.getByRole('button', { name: /leg reference/i })
  await user.click(legRefBtn)

  expect(screen.getByText('Current Mid')).toBeInTheDocument()
  expect(screen.getByText('$1.30')).toBeInTheDocument()
})

it('Open Leg section renders Unrealized P&L stat +$220.00 with green class for profit', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // P&L is no longer a labeled stat; it appears as "% captured" in VerdictBlock's PnlSummary
  expect(screen.getByText(/captured/)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('Open Leg section renders Unrealized P&L stat -$170.00 with red class for loss', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: LOSS_SNAPSHOT })

  render(<PositionDetailPage />)

  // P&L is now shown as "% captured" in VerdictBlock — no separate "Unrealized P&L" stat
  expect(screen.getByText(/captured/)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('Open Leg section renders % of Max Profit stat as 62.9%', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // % of max profit is now shown as "% captured" in VerdictBlock's PnlSummary
  expect(screen.getByText(/captured/)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('Open Leg section omits the three snapshot stats when activeLeg is null', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { ...OPEN_LEG_DETAIL_3_50, activeLeg: null },
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // No-active-leg branch: VerdictBlock shows NO ACTIVE LEG, no P&L captured
  expect(screen.getByText('NO ACTIVE LEG')).toBeInTheDocument()
  expect(screen.queryByText(/captured/)).not.toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it('Open Leg section omits the three snapshot stats when snapshot is undefined', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots(undefined)

  render(<PositionDetailPage />)

  // No snapshot → greeks null, currentMid null → verdict = HOLD 'Awaiting market data', no P&L
  expect(screen.getByText('Awaiting market data')).toBeInTheDocument()
  expect(screen.queryByText(/captured/)).not.toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Area 10 (US-34) — PositionCockpit wiring in PositionDetailPage
// ---------------------------------------------------------------------------

it('renders VerdictBlock with verdict pill when active leg and snapshot present', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // greeks present but underlying=null → computeVerdict returns HOLD 'Awaiting market data'
  // currentMid=1.30, premium=3.50 → pnl.pct ≈ 63% → PnlSummary renders 'captured' + progressbar
  expect(screen.getByText('Awaiting market data')).toBeInTheDocument()
  expect(screen.getByText(/captured/)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('renders NO ACTIVE LEG verdict when position is HOLDING_SHARES with no active leg', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ...CSP_OPEN_DETAIL,
      position: { ...CSP_OPEN_DETAIL.position, phase: 'HOLDING_SHARES' as const },
      activeLeg: null
    },
    error: null
  } as unknown as ReturnType<typeof usePosition>)

  render(<PositionDetailPage />)

  expect(screen.getByText('NO ACTIVE LEG')).toBeInTheDocument()
  expect(screen.queryByText('Risk snapshot')).not.toBeInTheDocument()
})

it('renders ContextStrip theta/IV/vega/gamma when snapshot with greeks is present', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  mockSnapshots({ [AAPL_OCC]: PROFIT_SNAPSHOT })

  render(<PositionDetailPage />)

  // ContextStrip renders four labeled cells when greeks are available
  expect(screen.getByText('Theta')).toBeInTheDocument()
  expect(screen.getByText('IV')).toBeInTheDocument()
  expect(screen.getByText('Vega')).toBeInTheDocument()
  expect(screen.getByText('Gamma')).toBeInTheDocument()
})

it('dims the P&L summary when the option snapshot is older than 5 minutes', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  const oldSnapshot = {
    ...PROFIT_SNAPSHOT,
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min ago
  }
  mockSnapshots({ [AAPL_OCC]: oldSnapshot })

  render(<PositionDetailPage />)

  expect(screen.getByTestId('pnl-summary')).toHaveClass('opacity-50')
})

it('does not dim the P&L summary when the option snapshot is fresh', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  const freshSnapshot = {
    ...PROFIT_SNAPSHOT,
    timestamp: new Date(Date.now() - 30 * 1000).toISOString() // 30s ago
  }
  mockSnapshots({ [AAPL_OCC]: freshSnapshot })

  render(<PositionDetailPage />)

  expect(screen.getByTestId('pnl-summary')).not.toHaveClass('opacity-50')
})

it('does not render RiskSnapshot when snapshot is absent', () => {
  mockUsePosition.mockReturnValue({
    isLoading: false,
    isError: false,
    data: OPEN_LEG_DETAIL_3_50,
    error: null
  } as unknown as ReturnType<typeof usePosition>)
  // No snapshot — greeks null, currentMid null

  render(<PositionDetailPage />)

  // Cockpit renders HOLD verdict with 'Awaiting market data' (confirms cockpit is wired up)
  expect(screen.getByText('Awaiting market data')).toBeInTheDocument()
  // No "Risk snapshot" section — dist is null when underlying is null
  expect(screen.queryByText('Risk snapshot')).not.toBeInTheDocument()
})
