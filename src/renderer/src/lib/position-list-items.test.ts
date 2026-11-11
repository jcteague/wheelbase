import { describe, expect, it } from 'vitest'
import type { CreatePositionResponse, WheelListItem } from '../api/positions'
import { insertPositionListItem, toWheelListItem } from './position-list-items'
import { legRecord, positionRecord, snapshotRecord } from '../test-fixtures/position-records'
import { XYZ_BACKGROUND } from '../test-fixtures/wheel-cards'

const NOW = new Date(2026, 8, 14, 10, 0)

const WHEEL_RESPONSE: CreatePositionResponse = {
  position: positionRecord({
    id: 'pos-1',
    ticker: 'AAPL',
    strategyType: 'WHEEL',
    phase: 'CSP_OPEN'
  }),
  leg: legRecord({
    id: 'leg-1',
    instrumentType: 'PUT',
    strike: '150.0000',
    expiration: '2026-10-16',
    contracts: 2,
    premiumPerContract: '3.2500'
  }),
  costBasisSnapshot: snapshotRecord({
    id: 'snap-1',
    basisPerShare: '146.7500',
    totalPremiumCollected: '650.0000'
  })
}

describe('toWheelListItem', () => {
  it('builds the wheel list row the positions:list handler would return for the new position', () => {
    expect(toWheelListItem(WHEEL_RESPONSE, NOW)).toEqual<WheelListItem>({
      id: 'pos-1',
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      status: 'ACTIVE',
      premiumCollected: '650.0000',
      effectiveCostBasis: '146.7500',
      profitTargetPercent: null,
      strategyType: 'WHEEL',
      pmcc: null,
      strike: '150.0000',
      expiration: '2026-10-16',
      dte: 32,
      instrumentType: 'PUT',
      contracts: 2,
      entryPremiumPerContract: '3.2500',
      nextEarnings: null
    })
  })

  it('leaves instrumentType null when the leg is not an option', () => {
    const res = {
      ...WHEEL_RESPONSE,
      leg: { ...WHEEL_RESPONSE.leg, instrumentType: 'STOCK' as const }
    }
    expect(toWheelListItem(res, NOW).instrumentType).toBeNull()
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

  it('slots a PMCC row in by its short call DTE (14 days here)', () => {
    const cached = [row('a', 5), row('z', 40), row('n', null)]

    expect(insertPositionListItem(cached, XYZ_BACKGROUND).map((i) => i.id)).toEqual([
      'a',
      XYZ_BACKGROUND.id,
      'z',
      'n'
    ])
  })
})
