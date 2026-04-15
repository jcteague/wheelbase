import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RollCcResponse } from './RollCcSuccess'
import { RollCcSuccess } from './RollCcSuccess'

const mockResponse: RollCcResponse = {
  position: { id: 'pos-1', ticker: 'AAPL', phase: 'CC_OPEN', status: 'ACTIVE' },
  rollFromLeg: {
    id: 'leg-from',
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'CALL',
    strike: '182.0000',
    expiration: '2026-04-18',
    contracts: 1,
    premiumPerContract: '1.5000',
    fillDate: '2026-04-13'
  },
  rollToLeg: {
    id: 'leg-to',
    legRole: 'ROLL_TO',
    action: 'SELL',
    instrumentType: 'CALL',
    strike: '185.0000',
    expiration: '2026-05-16',
    contracts: 1,
    premiumPerContract: '2.2000',
    fillDate: '2026-04-13'
  },
  rollChainId: 'chain-abc123',
  costBasisSnapshot: {
    id: 'cbs-1',
    positionId: 'pos-1',
    basisPerShare: '175.8000',
    totalPremiumCollected: '350.0000',
    finalPnl: null,
    snapshotAt: '2026-04-13T00:00:00.000Z',
    createdAt: '2026-04-13T00:00:00.000Z'
  }
}

const DEFAULT_PROPS = {
  response: mockResponse,
  ticker: 'AAPL',
  prevBasisPerShare: '176.5000',
  onClose: vi.fn()
}

describe('RollCcSuccess', () => {
  it('renders "Roll Complete" eyebrow and "CC Rolled Successfully" title', () => {
    render(<RollCcSuccess {...DEFAULT_PROPS} />)
    expect(screen.getByText('Roll Complete')).toBeInTheDocument()
    expect(screen.getByText('CC Rolled Successfully')).toBeInTheDocument()
  })

  it('renders hero box with net credit amount and total', () => {
    render(<RollCcSuccess {...DEFAULT_PROPS} />)
    // net = 2.2 - 1.5 = 0.70, total = 0.70 * 1 * 100 = 70.00
    expect(screen.getByText('+$0.70')).toBeInTheDocument()
    expect(screen.getByText(/total/i)).toBeInTheDocument()
  })

  it('renders summary rows: roll type badge, old leg, new leg, new expiration + DTE, phase badge, cost basis transition', () => {
    render(<RollCcSuccess {...DEFAULT_PROPS} />)
    // Roll type label
    expect(screen.getByText(/Roll type/i)).toBeInTheDocument()
    // Old leg
    expect(screen.getByText(/Old leg/i)).toBeInTheDocument()
    expect(screen.getByText(/Roll From/)).toBeInTheDocument()
    // New leg
    expect(screen.getByText(/New leg/i)).toBeInTheDocument()
    expect(screen.getByText(/Roll To/)).toBeInTheDocument()
    // New expiration with DTE
    expect(screen.getByText(/New expiration/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-05-16/)).toBeInTheDocument()
    expect(screen.getByText(/DTE/)).toBeInTheDocument()
    // Phase
    expect(screen.getByText(/Phase/i)).toBeInTheDocument()
    expect(screen.getByText(/CC Open/)).toBeInTheDocument()
    // Cost basis
    expect(screen.getByText(/Cost basis/i)).toBeInTheDocument()
  })

  it('shows cost basis transition from prevBasisPerShare to new basisPerShare', () => {
    render(<RollCcSuccess {...DEFAULT_PROPS} prevBasisPerShare="176.5000" />)
    // basisPerShare = 175.8000 → formatted as $175.80
    expect(screen.getByText('$176.50 → $175.80/share')).toBeInTheDocument()
  })
})
