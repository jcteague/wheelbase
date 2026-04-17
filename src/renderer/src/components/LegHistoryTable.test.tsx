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
  rollChainId: null as string | null,
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

describe('LegHistoryTable PremiumCell — ROLL_FROM', () => {
  it('ROLL_FROM leg: premium cell shows "−$1.20" in red (cost to close, not a credit)', () => {
    const leg = {
      ...CSP_OPEN_LEG,
      id: 'leg-rf',
      legRole: 'ROLL_FROM',
      action: 'BUY',
      premiumPerContract: '1.2000',
      rollChainId: 'abc' as string | null,
      runningCostBasis: null
    }
    // Pair with a ROLL_TO so the row renders inside a roll group (production path)
    const pair = {
      ...CSP_OPEN_LEG,
      id: 'leg-rt',
      legRole: 'ROLL_TO',
      action: 'SELL',
      premiumPerContract: '2.8000',
      rollChainId: 'abc' as string | null,
      runningCostBasis: '174.9000'
    }
    render(<LegHistoryTable legs={[leg, pair]} />)
    const negative = screen.getByText('−$1.20')
    expect(negative).toBeInTheDocument()
    expect(negative).toHaveClass('text-wb-red')
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

describe('LegHistoryTable with explicit rollChainId: null', () => {
  it('renders a role badge and no roll group header when rollChainId is null', () => {
    const leg = { ...CSP_OPEN_LEG }
    render(<LegHistoryTable legs={[leg]} />)
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
    expect(screen.queryByText(/Roll #/)).not.toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────────────────────────
// Layer 3 — Roll pair rendering tests (Area 4)
// ──────────────────────────────────────────────────────────────────

const ROLL_FROM_LEG = {
  id: 'leg-rf',
  positionId: 'pos-1',
  legRole: 'ROLL_FROM',
  action: 'BUY',
  instrumentType: 'PUT',
  strike: '180.0000',
  expiration: '2026-04-18',
  contracts: 1,
  premiumPerContract: '1.2000',
  fillDate: '2026-04-01',
  rollChainId: 'abc' as string | null,
  runningCostBasis: null as string | null
}

const ROLL_TO_LEG = {
  id: 'leg-rt',
  positionId: 'pos-1',
  legRole: 'ROLL_TO',
  action: 'SELL',
  instrumentType: 'PUT',
  strike: '180.0000',
  expiration: '2026-05-16',
  contracts: 1,
  premiumPerContract: '2.8000',
  fillDate: '2026-04-01',
  rollChainId: 'abc' as string | null,
  runningCostBasis: '174.9000' as string | null
}

const ASSIGN_LEG = {
  id: 'leg-assign',
  positionId: 'pos-1',
  legRole: 'ASSIGN',
  action: 'BUY',
  instrumentType: 'SHARES',
  strike: '180.0000',
  expiration: null,
  contracts: 1,
  premiumPerContract: null,
  fillDate: '2026-04-02',
  rollChainId: null as string | null,
  runningCostBasis: '174.9000' as string | null
}

describe('LegHistoryTable roll pair grouping', () => {
  it('renders "Roll #1" and "Roll Out" for a same-strike different-expiration roll pair', () => {
    render(<LegHistoryTable legs={[ROLL_FROM_LEG, ROLL_TO_LEG]} />)
    expect(screen.getByText(/Roll #1/)).toBeInTheDocument()
    expect(screen.getByText(/Roll Out/)).toBeInTheDocument()
  })

  it('renders "+$1.60/contract" for a net credit roll (FROM $1.20, TO $2.80)', () => {
    render(<LegHistoryTable legs={[ROLL_FROM_LEG, ROLL_TO_LEG]} />)
    expect(screen.getByText(/\+\$1\.60\/contract/)).toBeInTheDocument()
  })

  it('renders a debit amount for a net debit roll (FROM $3.00, TO $2.50)', () => {
    const debitFrom = { ...ROLL_FROM_LEG, id: 'leg-df', premiumPerContract: '3.0000' }
    const debitTo = { ...ROLL_TO_LEG, id: 'leg-dt', premiumPerContract: '2.5000' }
    render(<LegHistoryTable legs={[debitFrom, debitTo]} />)
    expect(screen.getByText(/0\.50\/contract/)).toBeInTheDocument()
  })

  it('renders "Roll #1", "Roll #2", "Roll #3" headers for three roll pairs', () => {
    const legs = [
      { ...ROLL_FROM_LEG, id: 'rf1', rollChainId: 'c1', fillDate: '2026-04-01' },
      { ...ROLL_TO_LEG, id: 'rt1', rollChainId: 'c1', fillDate: '2026-04-01' },
      {
        ...ROLL_FROM_LEG,
        id: 'rf2',
        rollChainId: 'c2',
        fillDate: '2026-04-15',
        expiration: '2026-05-16'
      },
      {
        ...ROLL_TO_LEG,
        id: 'rt2',
        rollChainId: 'c2',
        fillDate: '2026-04-15',
        expiration: '2026-06-20'
      },
      {
        ...ROLL_FROM_LEG,
        id: 'rf3',
        rollChainId: 'c3',
        fillDate: '2026-05-01',
        expiration: '2026-05-16'
      },
      {
        ...ROLL_TO_LEG,
        id: 'rt3',
        rollChainId: 'c3',
        fillDate: '2026-05-01',
        expiration: '2026-07-18'
      }
    ]
    render(<LegHistoryTable legs={legs} />)
    expect(screen.getByText(/Roll #1/)).toBeInTheDocument()
    expect(screen.getByText(/Roll #2/)).toBeInTheDocument()
    expect(screen.getByText(/Roll #3/)).toBeInTheDocument()
  })

  it('renders "Net Credit" label and "$160.00 total" in roll group header for 1-contract credit roll', () => {
    render(<LegHistoryTable legs={[ROLL_FROM_LEG, ROLL_TO_LEG]} />)
    expect(screen.getByText(/Net Credit/)).toBeInTheDocument()
    expect(screen.getByText(/\$160\.00 total/)).toBeInTheDocument()
  })

  it('renders "Net Debit" label in roll group header for a debit roll', () => {
    const debitFrom = { ...ROLL_FROM_LEG, id: 'leg-df', premiumPerContract: '3.0000' }
    const debitTo = { ...ROLL_TO_LEG, id: 'leg-dt', premiumPerContract: '2.5000' }
    render(<LegHistoryTable legs={[debitFrom, debitTo]} />)
    expect(screen.getByText(/Net Debit/)).toBeInTheDocument()
  })

  it('renders cumulative summary with total dollars for a single credit roll', () => {
    // ROLL_FROM_LEG: 1 contract, $1.20 → ROLL_TO_LEG: $2.80 → net $1.60/contract × 100 = $160.00
    render(<LegHistoryTable legs={[ROLL_FROM_LEG, ROLL_TO_LEG]} />)
    expect(screen.getByText(/Credits: \+\$160\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Net: \+\$160\.00/)).toBeInTheDocument()
  })

  it('renders CSP Open before roll group and Assign after cumulative summary', () => {
    const legs = [CSP_OPEN_LEG, ROLL_FROM_LEG, ROLL_TO_LEG, ASSIGN_LEG]
    render(<LegHistoryTable legs={legs} />)
    expect(screen.getByText('CSP Open')).toBeInTheDocument()
    expect(screen.getByText(/Assign/)).toBeInTheDocument()
    // Verify DOM order: CSP Open → Roll #1 → cumulative → Assign
    const allText = document.body.textContent ?? ''
    const cspIdx = allText.indexOf('CSP Open')
    const rollIdx = allText.indexOf('Roll #1')
    const creditsIdx = allText.indexOf('Credits')
    const assignIdx = allText.lastIndexOf('Assign')
    expect(cspIdx).toBeLessThan(rollIdx)
    expect(rollIdx).toBeLessThan(creditsIdx)
    expect(creditsIdx).toBeLessThan(assignIdx)
  })

  it('ROLL_FROM leg row shows empty basis cell and ROLL_TO row shows the running cost basis inside a roll group', () => {
    const fromWithNullBasis = { ...ROLL_FROM_LEG, runningCostBasis: null }
    const toWithBasis = { ...ROLL_TO_LEG, runningCostBasis: '174.90' }
    render(<LegHistoryTable legs={[fromWithNullBasis, toWithBasis]} />)
    // Roll group header must be present (requires roll group rendering)
    expect(screen.getByText(/Roll #1/)).toBeInTheDocument()
    // ROLL_TO basis must be visible in the basis column
    expect(screen.getByText('$174.90')).toBeInTheDocument()
    // ROLL_FROM has null basis — BasisCell renders "—" (muted dash) not a dollar value
    // Verify no "$174.90" duplicates (ROLL_FROM should not show the same value)
    expect(screen.getAllByText('$174.90')).toHaveLength(1)
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
