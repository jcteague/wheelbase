// [US-15] buildRollTimeline and computeCumulativeRollSummary — Red Phase Tests

import { describe, it, expect } from 'vitest'
import { buildRollTimeline, computeCumulativeRollSummary } from './rollGroups'
import type { RollGroup, CumulativeRollSummary } from './rollGroups'

type LegHistoryEntry = {
  id: string
  positionId: string
  legRole: string
  action: string
  instrumentType: string
  strike: string
  expiration: string | null
  contracts: number
  premiumPerContract: string | null
  fillDate: string
  rollChainId: string | null
  runningCostBasis: string | null
}

function makeLeg(overrides: Partial<LegHistoryEntry> = {}): LegHistoryEntry {
  return {
    id: 'leg-1',
    positionId: 'pos-1',
    legRole: 'CSP_OPEN',
    action: 'SELL_TO_OPEN',
    instrumentType: 'PUT',
    strike: '180',
    expiration: '2026-04-18',
    contracts: 1,
    premiumPerContract: '2.00',
    fillDate: '2026-01-15',
    rollChainId: null,
    runningCostBasis: null,
    ...overrides
  }
}

function makeRollGroup(overrides: Partial<RollGroup> = {}): RollGroup {
  return {
    type: 'roll',
    rollNumber: 1,
    rollChainId: 'abc',
    rollType: 'Roll Out',
    rollDetail: 'same $180 strike, Apr → May expiration',
    fillDate: '2026-02-01',
    rollFromLeg: makeLeg({
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    }),
    rollToLeg: makeLeg({
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      fillDate: '2026-02-01'
    }),
    net: {
      isCredit: true,
      perContract: 1.6,
      total: 160
    },
    ...overrides
  }
}

describe('buildRollTimeline', () => {
  it('returns a single normal leg item when there are no roll legs', () => {
    const cspOpen = makeLeg()
    const result = buildRollTimeline([cspOpen])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'leg', leg: cspOpen })
  })

  it('returns leg, roll group, and cumulative item for one roll pair', () => {
    const cspOpen = makeLeg({ id: 'leg-1', fillDate: '2026-01-15' })
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([cspOpen, rollFrom, rollTo])

    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('leg')
    expect(result[1].type).toBe('roll')
    expect(result[2].type).toBe('cumulative')

    const rollItem = result[1] as RollGroup
    expect(rollItem.rollNumber).toBe(1)
    expect(rollItem.rollChainId).toBe('abc')
  })

  it('numbers two roll pairs chronologically as rollNumber 1 and 2', () => {
    const cspOpen = makeLeg({ id: 'leg-1', fillDate: '2026-01-10' })
    const rollFrom1 = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      fillDate: '2026-01-20'
    })
    const rollTo1 = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      fillDate: '2026-01-20'
    })
    const rollFrom2 = makeLeg({
      id: 'leg-4',
      legRole: 'ROLL_FROM',
      rollChainId: 'def',
      premiumPerContract: '1.00',
      fillDate: '2026-02-15'
    })
    const rollTo2 = makeLeg({
      id: 'leg-5',
      legRole: 'ROLL_TO',
      rollChainId: 'def',
      premiumPerContract: '2.00',
      expiration: '2026-06-20',
      fillDate: '2026-02-15'
    })

    const result = buildRollTimeline([cspOpen, rollFrom1, rollTo1, rollFrom2, rollTo2])

    const rollItems = result.filter((item) => item.type === 'roll') as RollGroup[]
    expect(rollItems).toHaveLength(2)
    expect(rollItems[0].rollNumber).toBe(1)
    expect(rollItems[0].rollChainId).toBe('abc')
    expect(rollItems[1].rollNumber).toBe(2)
    expect(rollItems[1].rollChainId).toBe('def')
  })

  it('returns items in order: cspOpen, roll#1, cumulative, assign, ccOpen', () => {
    const cspOpen = makeLeg({ id: 'leg-1', legRole: 'CSP_OPEN', fillDate: '2026-01-15' })
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      fillDate: '2026-02-01'
    })
    const assign = makeLeg({
      id: 'leg-4',
      legRole: 'ASSIGN',
      action: 'ASSIGNED',
      fillDate: '2026-03-01',
      premiumPerContract: null
    })
    const ccOpen = makeLeg({
      id: 'leg-5',
      legRole: 'CC_OPEN',
      action: 'SELL_TO_OPEN',
      instrumentType: 'CALL',
      fillDate: '2026-03-02'
    })

    const result = buildRollTimeline([cspOpen, rollFrom, rollTo, assign, ccOpen])

    expect(result).toHaveLength(5)
    expect(result[0].type).toBe('leg')
    expect(result[1].type).toBe('roll')
    expect(result[2].type).toBe('cumulative')
    expect(result[3].type).toBe('leg')
    expect(result[4].type).toBe('leg')

    const normalLegs = result.filter((item) => item.type === 'leg') as Array<{
      type: 'leg'
      leg: LegHistoryEntry
    }>
    expect(normalLegs[0].leg.legRole).toBe('CSP_OPEN')
    expect(normalLegs[1].leg.legRole).toBe('ASSIGN')
    expect(normalLegs[2].leg.legRole).toBe('CC_OPEN')
  })

  it('computes net credit for ROLL_FROM 1.20 and ROLL_TO 2.80 with 1 contract', () => {
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      contracts: 1,
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      contracts: 1,
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([rollFrom, rollTo])
    const rollItem = result.find((item) => item.type === 'roll') as RollGroup

    expect(rollItem.net.isCredit).toBe(true)
    expect(rollItem.net.perContract).toBeCloseTo(1.6, 10)
    expect(rollItem.net.total).toBeCloseTo(160, 10)
  })

  it('computes net debit for ROLL_FROM 3.00 and ROLL_TO 2.50', () => {
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '3.00',
      contracts: 1,
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.50',
      expiration: '2026-05-16',
      contracts: 1,
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([rollFrom, rollTo])
    const rollItem = result.find((item) => item.type === 'roll') as RollGroup

    expect(rollItem.net.isCredit).toBe(false)
    expect(rollItem.net.perContract).toBeCloseTo(0.5, 10)
  })

  it('derives rollType "Roll Out" when strike is the same but expiration changes', () => {
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      strike: '180',
      expiration: '2026-04-18',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      strike: '180',
      expiration: '2026-05-16',
      premiumPerContract: '2.80',
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([rollFrom, rollTo])
    const rollItem = result.find((item) => item.type === 'roll') as RollGroup

    expect(rollItem.rollType).toBe('Roll Out')
  })

  it('places a roll group before a normal leg that share the same fillDate', () => {
    // A CC_OPEN on the same day as a roll pair should appear after the roll group
    const ccOpen = makeLeg({ id: 'leg-cc', legRole: 'CC_OPEN', fillDate: '2026-02-01' })
    const rollFrom = makeLeg({
      id: 'leg-rf',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-rt',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      premiumPerContract: '2.80',
      expiration: '2026-05-16',
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([ccOpen, rollFrom, rollTo])
    const nonCumulative = result.filter((item) => item.type !== 'cumulative')
    expect(nonCumulative[0].type).toBe('roll')
    expect(nonCumulative[1].type).toBe('leg')
  })

  it('includes an orphaned ROLL_FROM (no matching ROLL_TO) as a normal leg row', () => {
    const cspOpen = makeLeg({ id: 'leg-1', fillDate: '2026-01-15' })
    const orphanFrom = makeLeg({
      id: 'leg-orphan',
      legRole: 'ROLL_FROM',
      rollChainId: 'orphan-chain',
      fillDate: '2026-02-01'
    })
    // No ROLL_TO for orphan-chain

    const result = buildRollTimeline([cspOpen, orphanFrom])

    const legItems = result.filter((item) => item.type === 'leg') as Array<{
      type: 'leg'
      leg: typeof cspOpen
    }>
    expect(legItems).toHaveLength(2)
    expect(legItems.some((item) => item.leg.id === 'leg-orphan')).toBe(true)
    // No roll group should be present
    expect(result.filter((item) => item.type === 'roll')).toHaveLength(0)
  })

  it('includes an orphaned ROLL_TO (no matching ROLL_FROM) as a normal leg row', () => {
    const orphanTo = makeLeg({
      id: 'leg-orphan-to',
      legRole: 'ROLL_TO',
      rollChainId: 'orphan-chain-2',
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([orphanTo])

    const legItems = result.filter((item) => item.type === 'leg') as Array<{
      type: 'leg'
      leg: typeof orphanTo
    }>
    expect(legItems).toHaveLength(1)
    expect(legItems[0].leg.id).toBe('leg-orphan-to')
    expect(result.filter((item) => item.type === 'roll')).toHaveLength(0)
  })

  it('derives rollType "Roll Down & Out" when ROLL_TO strike is lower and expiration changes', () => {
    const rollFrom = makeLeg({
      id: 'leg-2',
      legRole: 'ROLL_FROM',
      rollChainId: 'abc',
      strike: '180',
      expiration: '2026-04-18',
      premiumPerContract: '1.20',
      fillDate: '2026-02-01'
    })
    const rollTo = makeLeg({
      id: 'leg-3',
      legRole: 'ROLL_TO',
      rollChainId: 'abc',
      strike: '175',
      expiration: '2026-05-16',
      premiumPerContract: '2.80',
      fillDate: '2026-02-01'
    })

    const result = buildRollTimeline([rollFrom, rollTo])
    const rollItem = result.find((item) => item.type === 'roll') as RollGroup

    expect(rollItem.rollType).toBe('Roll Down & Out')
  })
})

describe('computeCumulativeRollSummary', () => {
  it('sums total dollars (not perContract) for a 2-contract credit roll', () => {
    // 2 contracts × $1.60/contract = $320 total — must sum total, not perContract
    const group = makeRollGroup({ net: { isCredit: true, perContract: 1.6, total: 320 } })

    const result: CumulativeRollSummary = computeCumulativeRollSummary([group])

    expect(result.totalCredits).toBeCloseTo(320, 10)
    expect(result.net).toBeCloseTo(320, 10)
  })

  it('sums two credit rolls into totalCredits and net', () => {
    const group1 = makeRollGroup({ net: { isCredit: true, perContract: 1.6, total: 160 } })
    const group2 = makeRollGroup({
      rollNumber: 2,
      rollChainId: 'def',
      net: { isCredit: true, perContract: 0.8, total: 80 }
    })

    const result: CumulativeRollSummary = computeCumulativeRollSummary([group1, group2])

    expect(result.totalCredits).toBeCloseTo(240, 10)
    expect(result.totalDebits).toBe(0)
    expect(result.net).toBeCloseTo(240, 10)
    expect(result.rollCount).toBe(2)
  })

  it('separates credit and debit rolls into totalCredits and totalDebits', () => {
    const creditGroup = makeRollGroup({ net: { isCredit: true, perContract: 1.6, total: 160 } })
    const debitGroup = makeRollGroup({
      rollNumber: 2,
      rollChainId: 'def',
      net: { isCredit: false, perContract: 0.5, total: 50 }
    })

    const result: CumulativeRollSummary = computeCumulativeRollSummary([creditGroup, debitGroup])

    expect(result.totalCredits).toBeCloseTo(160, 10)
    expect(result.totalDebits).toBeCloseTo(50, 10)
    expect(result.net).toBeCloseTo(110, 10)
    expect(result.rollCount).toBe(2)
  })
})
