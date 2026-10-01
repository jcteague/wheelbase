import { describe, expect, it } from 'vitest'
import type {
  CreatePmccPositionResponse,
  CreatePositionResponse,
  PmccListItem,
  WheelListItem
} from '../api/positions'
import { insertPositionListItem, toPmccListItem, toWheelListItem } from './position-list-items'

const NOW = new Date(2026, 8, 14, 10, 0)

const WHEEL_RESPONSE: CreatePositionResponse = {
  position: { id: 'pos-1', ticker: 'AAPL', phase: 'CSP_OPEN', status: 'ACTIVE' },
  leg: {
    id: 'leg-1',
    instrumentType: 'PUT',
    strike: '150.0000',
    expiration: '2026-10-16',
    contracts: 2,
    premium_per_contract: '3.2500'
  },
  cost_basis_snapshot: {
    id: 'snap-1',
    basis_per_share: '146.7500',
    total_premium_collected: '650.0000'
  }
}

function pmccResponse(overrides: { longExpiration?: string } = {}): CreatePmccPositionResponse {
  const leg = {
    id: 'leg-l',
    positionId: 'pos-2',
    strike: '80.0000',
    expiration: overrides.longExpiration ?? '2027-09-17',
    contracts: 1,
    premiumPerContract: '25.0000',
    fillPrice: '25.0000',
    fillDate: '2026-09-14',
    rollChainId: null,
    fees: '0.0000',
    createdAt: 'now',
    updatedAt: 'now'
  }
  return {
    position: {
      id: 'pos-2',
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      strategyType: 'PMCC',
      openedDate: '2026-09-14',
      closedDate: null,
      accountId: null,
      notes: null,
      thesis: null,
      tags: [],
      profitTargetPercent: null,
      managementWindowDteOverride: null,
      createdAt: 'now',
      updatedAt: 'now'
    },
    longLeg: { ...leg, legRole: 'LEAPS_OPEN', action: 'BUY', instrumentType: 'CALL' },
    shortLeg: {
      ...leg,
      id: 'leg-s',
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '110.0000',
      expiration: '2026-10-16',
      premiumPerContract: '2.0000',
      fillPrice: '2.0000'
    },
    costBasisSnapshot: {
      id: 'snap-2',
      positionId: 'pos-2',
      basisPerShare: '23.0000',
      totalPremiumCollected: '200.0000',
      finalPnl: null,
      triggerEvent: 'PMCC_OPEN',
      snapshotAt: '2026-09-14T00:00:00.000Z',
      createdAt: 'now'
    },
    openingDebit: {
      leapsCost: '2500.0000',
      shortCredit: '200.0000',
      fees: '0.0000',
      initialNetDebit: '2300.0000',
      netDebitBeforeFees: '2300.0000',
      basisPerShare: '23.0000',
      strikeWidthPerShare: '30.0000',
      debitToWidthPercent: '76.6667'
    }
  }
}

describe('toWheelListItem', () => {
  it('builds the wheel list row the positions:list handler would return for the new position', () => {
    expect(toWheelListItem(WHEEL_RESPONSE, NOW)).toEqual<WheelListItem>({
      id: 'pos-1',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      status: 'ACTIVE',
      premium_collected: '650.0000',
      effective_cost_basis: '146.7500',
      profitTargetPercent: null,
      strategyType: 'WHEEL',
      pmcc: null,
      strike: '150.0000',
      expiration: '2026-10-16',
      dte: 32,
      instrumentType: 'PUT',
      contracts: 2,
      entryPremiumPerContract: '3.2500'
    })
  })

  it('leaves instrumentType null when the leg is not an option', () => {
    const res = { ...WHEEL_RESPONSE, leg: { ...WHEEL_RESPONSE.leg, instrumentType: 'STOCK' } }
    expect(toWheelListItem(res, NOW).instrumentType).toBeNull()
  })
})

describe('toPmccListItem', () => {
  it('builds the PMCC list row with both leg summaries and the opening debit', () => {
    expect(toPmccListItem(pmccResponse(), NOW)).toEqual<PmccListItem>({
      id: 'pos-2',
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      premium_collected: '200.0000',
      effective_cost_basis: '23.0000',
      profitTargetPercent: null,
      strategyType: 'PMCC',
      pmcc: {
        long: { strike: '80.0000', expiration: '2027-09-17', dte: 368, contracts: 1 },
        short: { strike: '110.0000', expiration: '2026-10-16', dte: 32, contracts: 1 },
        initialNetDebit: '2300.0000'
      },
      strike: null,
      expiration: null,
      dte: null,
      instrumentType: null,
      contracts: null,
      entryPremiumPerContract: null
    })
  })

  it('returns null when a leg expiration cannot be turned into a DTE (the list omits it too)', () => {
    expect(toPmccListItem(pmccResponse({ longExpiration: 'not-a-date' }), NOW)).toBeNull()
  })
})

describe('insertPositionListItem', () => {
  const row = (id: string, dte: number | null): WheelListItem => ({
    ...toWheelListItem(WHEEL_RESPONSE, NOW),
    id,
    dte
  })

  it('inserts the new row in DTE order with null DTEs last, without mutating the cache', () => {
    const cached = [row('a', 5), row('c', 40), row('n', null)]

    const next = insertPositionListItem(cached, row('b', 20))

    expect(next.map((i) => i.id)).toEqual(['a', 'b', 'c', 'n'])
    expect(cached.map((i) => i.id)).toEqual(['a', 'c', 'n'])
  })

  it('slots a PMCC row in by its short call DTE (32 days here)', () => {
    const cached = [row('a', 5), row('z', 40), row('n', null)]
    const pmcc = toPmccListItem(pmccResponse(), NOW)
    expect(pmcc).not.toBeNull()

    expect(insertPositionListItem(cached, pmcc!).map((i) => i.id)).toEqual(['a', 'pos-2', 'z', 'n'])
  })
})
