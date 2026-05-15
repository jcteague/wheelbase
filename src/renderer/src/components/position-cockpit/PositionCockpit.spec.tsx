import { render, screen, fireEvent } from '@testing-library/react'
import { PositionCockpit } from './PositionCockpit'
import type { PositionDetail, LegDetail, SnapshotDetail } from '../../api/positions'
import type { OptionSnapshot } from '../../api/market-data'

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const baseLeg: LegDetail = {
  id: 'leg-1',
  positionId: 'pos-1',
  legRole: 'OPEN',
  action: 'SELL',
  instrumentType: 'PUT',
  strike: '180.00',
  expiration: daysFromToday(30),
  contracts: 1,
  premiumPerContract: '3.50',
  fillDate: '2024-01-15',
  rollChainId: null,
  createdAt: '2024-01-15T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z'
}

const baseSnapshot: SnapshotDetail = {
  id: 'snap-1',
  positionId: 'pos-1',
  basisPerShare: '176.50',
  totalPremiumCollected: '350.00',
  finalPnl: null,
  snapshotAt: '2024-01-15T00:00:00Z',
  createdAt: '2024-01-15T00:00:00Z'
}

const baseDetail: PositionDetail = {
  position: {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    strategyType: 'WHEEL',
    openedDate: '2024-01-15',
    closedDate: null,
    accountId: null,
    notes: null,
    thesis: null,
    tags: [],
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z'
  },
  activeLeg: baseLeg,
  costBasisSnapshot: baseSnapshot,
  legs: [baseLeg],
  allSnapshots: [baseSnapshot]
}

const baseOptionSnapshot: OptionSnapshot = {
  bid: '1.70',
  ask: '1.80',
  mid: '1.75',
  lastTrade: '1.72',
  openInterest: 100,
  volume: 50,
  greeks: {
    delta: '-0.25',
    gamma: '0.02',
    theta: '-0.05',
    vega: '0.12',
    iv: '0.30'
  },
  timestamp: '2024-01-15T16:00:00Z'
}

const assignLeg: LegDetail = {
  ...baseLeg,
  id: 'leg-assign',
  legRole: 'ASSIGN',
  action: 'ASSIGN',
  instrumentType: 'STOCK',
  contracts: 1
}

const noActiveLegDetail: PositionDetail = {
  ...baseDetail,
  position: { ...baseDetail.position, phase: 'HOLDING_SHARES' },
  activeLeg: null,
  legs: [baseLeg, assignLeg]
}

const wheelCompleteDetail: PositionDetail = {
  ...noActiveLegDetail,
  position: {
    ...noActiveLegDetail.position,
    phase: 'WHEEL_COMPLETE',
    status: 'CLOSED',
    closedDate: '2024-03-01'
  }
}

describe('PositionCockpit', () => {
  it('renders VerdictBlock with ticker when active leg exists and snapshot present', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('renders RiskSnapshot when snapshot and underlyingPrice are present', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    expect(screen.getByText('Risk snapshot')).toBeInTheDocument()
  })

  it('renders ContextStrip when snapshot with greeks is present', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    expect(screen.getByText('Context')).toBeInTheDocument()
  })

  it('renders "Leg reference" CollapsedDrawer when active leg exists', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    expect(screen.getByText(/Leg reference/i)).toBeInTheDocument()
  })

  it('renders "Cost basis & history" CollapsedDrawer when costBasisSnapshot is present', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    expect(screen.getByText(/Cost basis & history/i)).toBeInTheDocument()
  })

  it('"Cost basis & history" drawer header shows "3 fields" and Cycles label', () => {
    const calledAwayLeg: LegDetail = {
      ...baseLeg,
      id: 'leg-ca',
      legRole: 'CALLED_AWAY',
      action: 'EXERCISE',
      instrumentType: 'STOCK',
      contracts: 2 // distinct from cycles count so label-value pairs are unambiguous
    }
    const detailWithCycle: PositionDetail = {
      ...baseDetail,
      legs: [baseLeg, calledAwayLeg]
    }
    render(<PositionCockpit detail={detailWithCycle} underlyingPrice="185.00" />)
    // header shows "3 fields" (Effective Basis, Premium Collected, Cycles)
    expect(screen.getByText('3 fields')).toBeInTheDocument()
    // expand drawer to see Cycles
    const trigger = screen.getByRole('button', { name: /Cost basis & history/i })
    fireEvent.click(trigger)
    const cyclesLabel = screen.getByText('Cycles')
    expect(cyclesLabel).toBeInTheDocument()
    // 1 CALLED_AWAY leg → 1 cycle; scope to the same Stat block as the label
    const cyclesStat = cyclesLabel.parentElement
    expect(cyclesStat?.textContent).toContain('1')
  })

  it('"Cost basis & history" Cycles shows 0 when no CALLED_AWAY legs', () => {
    render(<PositionCockpit detail={baseDetail} underlyingPrice="185.00" />)
    const trigger = screen.getByRole('button', { name: /Cost basis & history/i })
    fireEvent.click(trigger)
    expect(screen.getByText('Cycles')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('no-active-leg: renders VerdictBlock with NO ACTIVE LEG label', () => {
    render(<PositionCockpit detail={noActiveLegDetail} />)
    expect(screen.getByText('NO ACTIVE LEG')).toBeInTheDocument()
  })

  it('no-active-leg: does not render RiskSnapshot', () => {
    render(<PositionCockpit detail={noActiveLegDetail} />)
    expect(screen.queryByText('Risk snapshot')).not.toBeInTheDocument()
  })

  it('no-active-leg: does not render ContextStrip', () => {
    render(<PositionCockpit detail={noActiveLegDetail} />)
    expect(screen.queryByText('Context')).not.toBeInTheDocument()
  })

  it('no-active-leg: "Cost basis & history" drawer is open by default', () => {
    render(<PositionCockpit detail={noActiveLegDetail} />)
    const trigger = screen.getByRole('button', { name: /Cost basis & history/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('HOLDING_SHARES: renders Position card with Shares/Avg Basis/Current/Unrealized', () => {
    // Use $182.00 so Current is distinct from strike $180.00 (which shows in the
    // collapsed Cost Basis drawer's leg history if expanded).
    render(<PositionCockpit detail={noActiveLegDetail} underlyingPrice="182.00" />)
    expect(screen.getByText('Shares')).toBeInTheDocument()
    expect(screen.getByText('Avg Basis')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Unrealized')).toBeInTheDocument()
    // ASSIGN leg has contracts=1 → 100 shares
    expect(screen.getByText('100')).toBeInTheDocument()
    // current $182.00
    expect(screen.getByText('$182.00')).toBeInTheDocument()
    // unrealized = (182 - 176.50) × 100 = $550.00
    expect(screen.getByText('+$550.00')).toBeInTheDocument()
  })

  it('HOLDING_SHARES: Position card hides Current and Unrealized when underlying is null', () => {
    render(<PositionCockpit detail={noActiveLegDetail} underlyingPrice={null} />)
    expect(screen.getByText('Shares')).toBeInTheDocument()
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
    expect(screen.queryByText('Unrealized')).not.toBeInTheDocument()
  })

  it('WHEEL_COMPLETE: Position card is not rendered (shares called away)', () => {
    render(<PositionCockpit detail={wheelCompleteDetail} underlyingPrice="180.00" />)
    expect(screen.queryByText('Shares')).not.toBeInTheDocument()
    expect(screen.queryByText('Unrealized')).not.toBeInTheDocument()
  })

  it('snapshot-absent: renders cockpit without RiskSnapshot or ContextStrip', () => {
    render(<PositionCockpit detail={baseDetail} />)
    expect(screen.queryByText('Risk snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Context')).not.toBeInTheDocument()
  })

  it('underlying price null: renders RiskSnapshot with Greeks but hides distance-to-strike cell', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice={null} />
    )
    expect(screen.getByText('Risk snapshot')).toBeInTheDocument()
    expect(screen.queryByText('Distance to strike')).not.toBeInTheDocument()
  })

  it('forwards pnlStale to VerdictBlock so P&L panel dims when snapshot is stale', () => {
    render(
      <PositionCockpit
        detail={baseDetail}
        snapshot={baseOptionSnapshot}
        underlyingPrice="185.00"
        pnlStale
      />
    )
    expect(screen.getByTestId('pnl-summary')).toHaveClass('opacity-50')
  })

  it('leg history table appears inside "Cost basis & history" drawer content', () => {
    render(
      <PositionCockpit detail={baseDetail} snapshot={baseOptionSnapshot} underlyingPrice="185.00" />
    )
    const costBasisTrigger = screen.getByRole('button', { name: /Cost basis & history/i })
    fireEvent.click(costBasisTrigger)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
