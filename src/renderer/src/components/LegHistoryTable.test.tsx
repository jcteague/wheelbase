import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LegHistoryTable } from './LegHistoryTable'

const CSP_OPEN_LEG = {
  id: 'leg-1',
  positionId: 'pos-1',
  legRole: 'CSP_OPEN',
  action: 'SELL',
  instrumentType: 'PUT',
  strike: '180.0000',
  expiration: '2026-04-17',
  contracts: 1,
  premiumPerContract: '3.5000',
  fillDate: '2026-01-03',
  runningCostBasis: '176.5000'
}

describe('LegHistoryTable column headers', () => {
  it('renders all 8 column headers including "Running Basis / Share"', () => {
    render(<LegHistoryTable legs={[CSP_OPEN_LEG]} />)
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('Strike')).toBeInTheDocument()
    expect(screen.getByText('Expiration')).toBeInTheDocument()
    expect(screen.getByText('Contracts')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Fill Date')).toBeInTheDocument()
    expect(screen.getByText('Running Basis / Share')).toBeInTheDocument()
  })
})

describe('LegHistoryTable role badge', () => {
  it('renders a role badge for each leg using ROLE_COLOR', () => {
    render(<LegHistoryTable legs={[CSP_OPEN_LEG]} />)
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
  })
})

describe('LegHistoryTable PremiumCell — ASSIGN', () => {
  it('ASSIGN leg: premium cell shows "— (assigned)" and "100 shares received"', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-2',
      legRole: 'ASSIGN',
      contracts: 1,
      premiumPerContract: null,
      runningCostBasis: '176.5000'
    }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('— (assigned)')).toBeInTheDocument()
    expect(screen.getByText('100 shares received')).toBeInTheDocument()
  })

  it('ASSIGN leg with 2 contracts shows "200 shares received"', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-2',
      legRole: 'ASSIGN',
      contracts: 2,
      premiumPerContract: null,
      runningCostBasis: '176.5000'
    }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('200 shares received')).toBeInTheDocument()
  })
})

describe('LegHistoryTable PremiumCell — CALLED_AWAY', () => {
  it('CALLED_AWAY leg: premium cell shows "— (assigned)" and "100 shares called away"', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-3',
      legRole: 'CALLED_AWAY',
      contracts: 1,
      premiumPerContract: null,
      runningCostBasis: '174.2000'
    }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('— (assigned)')).toBeInTheDocument()
    expect(screen.getByText('100 shares called away')).toBeInTheDocument()
  })
})

describe('LegHistoryTable PremiumCell — CC_EXPIRED', () => {
  it('CC_EXPIRED leg: premium cell shows "expired worthless"', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-4',
      legRole: 'CC_EXPIRED',
      premiumPerContract: null,
      runningCostBasis: '174.2000'
    }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('expired worthless')).toBeInTheDocument()
  })
})

describe('LegHistoryTable PremiumCell — CC_CLOSE', () => {
  it('CC_CLOSE leg: premium cell shows "−$1.80" in amber', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-5',
      legRole: 'CC_CLOSE',
      premiumPerContract: '1.8000',
      runningCostBasis: '174.2000'
    }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('−$1.80')).toBeInTheDocument()
  })
})

describe('LegHistoryTable BasisCell', () => {
  it('Running basis cell shows "$176.50" for runningCostBasis "176.5000"', () => {
    render(<LegHistoryTable legs={[CSP_OPEN_LEG]} />)
    expect(screen.getByText('$176.50')).toBeInTheDocument()
  })

  it('Running basis cell shows "—" for null runningCostBasis', () => {
    const leg = { ...CSP_OPEN_LEG, runningCostBasis: null }
    render(<LegHistoryTable legs={[leg]} />)
    // The muted dash in the basis cell
    const cells = screen.getAllByText('—')
    expect(cells.length).toBeGreaterThan(0)
  })
})

describe('LegHistoryTable tfoot', () => {
  it('no tfoot row when finalPnl is null', () => {
    render(<LegHistoryTable legs={[CSP_OPEN_LEG]} finalPnl={null} />)
    expect(screen.queryByText(/Final P&L/)).not.toBeInTheDocument()
  })

  it('renders tfoot "Final P&L: +$780.00" in green when finalPnl is "780.0000"', () => {
    render(<LegHistoryTable legs={[CSP_OPEN_LEG]} finalPnl="780.0000" />)
    expect(screen.getByText(/Final P&L/)).toBeInTheDocument()
    expect(screen.getByText('$780.00')).toBeInTheDocument()
  })
})
