import { describe, expect, it } from 'vitest'
import type { LegRecord } from '../schemas'
import { groupRollChains } from './roll-chains'

function makeLeg(overrides: Partial<LegRecord>): LegRecord {
  return {
    id: 'leg-1',
    positionId: 'pos-1',
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'PUT',
    strike: '100.0000',
    expiration: '2026-11-20',
    contracts: 1,
    premiumPerContract: '1.0000',
    fillPrice: null,
    fillDate: '2026-10-01',
    rollChainId: 'chain-1',
    fees: '0.0000',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides
  }
}

function makePair(
  rollChainId: string,
  from: Partial<LegRecord>,
  to: Partial<LegRecord>
): LegRecord[] {
  return [
    makeLeg({ id: `${rollChainId}-from`, rollChainId, legRole: 'ROLL_FROM', ...from }),
    makeLeg({ id: `${rollChainId}-to`, rollChainId, legRole: 'ROLL_TO', ...to })
  ]
}

describe('groupRollChains', () => {
  it('nets a wheel roll pair (BUY to close, SELL to open) as a credit', () => {
    const legs = makePair(
      'chain-1',
      { action: 'BUY', premiumPerContract: '0.8000', contracts: 1, fillDate: '2026-10-02' },
      { action: 'SELL', premiumPerContract: '1.5000', contracts: 2, fillDate: '2026-10-03' }
    )

    const [chain, ...rest] = groupRollChains(legs)

    expect(rest).toEqual([])
    expect(chain.rollChainId).toBe('chain-1')
    expect(chain.rollFrom.id).toBe('chain-1-from')
    expect(chain.rollTo.id).toBe('chain-1-to')
    expect(chain.netCreditPerShare).toBe('0.7000')
    expect(chain.contracts).toBe(2)
    expect(chain.fees).toBe('0.0000')
    expect(chain.fillDate).toBe('2026-10-02')
  })

  it('takes the earlier fillDate when ROLL_TO filled first', () => {
    const legs = makePair(
      'chain-1',
      { action: 'BUY', premiumPerContract: '0.8000', fillDate: '2026-10-05' },
      { action: 'SELL', premiumPerContract: '1.5000', fillDate: '2026-10-04' }
    )

    expect(groupRollChains(legs)[0].fillDate).toBe('2026-10-04')
  })

  it('nets by action not role for an inverted LEAPS pair (SELL to close, BUY to open)', () => {
    const legs = makePair(
      'chain-1',
      { action: 'SELL', premiumPerContract: '26.0000' },
      { action: 'BUY', premiumPerContract: '23.5000' }
    )

    expect(groupRollChains(legs)[0].netCreditPerShare).toBe('2.5000')
  })

  it('returns a negative net for a short roll paid as a debit', () => {
    const legs = makePair(
      'chain-1',
      { action: 'BUY', premiumPerContract: '3.0000' },
      { action: 'SELL', premiumPerContract: '2.4000' }
    )

    expect(groupRollChains(legs)[0].netCreditPerShare).toBe('-0.6000')
  })

  it('sums fees across both halves of the chain', () => {
    const legs = makePair(
      'chain-1',
      { action: 'BUY', premiumPerContract: '0.8000', fees: '0.6500' },
      { action: 'SELL', premiumPerContract: '1.5000', fees: '0.6500' }
    )

    expect(groupRollChains(legs)[0].fees).toBe('1.3000')
  })

  it('orders chains by fillDate then createdAt regardless of input order', () => {
    const sameDayLater = makePair(
      'chain-c',
      { action: 'BUY', fillDate: '2026-10-02', createdAt: '2026-10-02T15:00:00.000Z' },
      { action: 'SELL', fillDate: '2026-10-02', createdAt: '2026-10-02T15:00:00.000Z' }
    )
    const latest = makePair(
      'chain-a',
      { action: 'BUY', fillDate: '2026-10-09' },
      { action: 'SELL', fillDate: '2026-10-09' }
    )
    const sameDayEarlier = makePair(
      'chain-b',
      { action: 'BUY', fillDate: '2026-10-02', createdAt: '2026-10-02T09:00:00.000Z' },
      { action: 'SELL', fillDate: '2026-10-02', createdAt: '2026-10-02T09:00:00.000Z' }
    )

    const chains = groupRollChains([...latest, ...sameDayLater, ...sameDayEarlier])

    expect(chains.map((c) => c.rollChainId)).toEqual(['chain-b', 'chain-c', 'chain-a'])
  })

  it('drops a chain missing its ROLL_TO half', () => {
    const legs = [
      makeLeg({ id: 'orphan', rollChainId: 'chain-x', legRole: 'ROLL_FROM' }),
      ...makePair('chain-1', { action: 'BUY' }, { action: 'SELL' })
    ]

    expect(groupRollChains(legs).map((c) => c.rollChainId)).toEqual(['chain-1'])
  })

  it('ignores non-roll legs', () => {
    const legs = [
      makeLeg({ id: 'csp', legRole: 'CSP_OPEN', action: 'SELL', rollChainId: null }),
      makeLeg({ id: 'cc', legRole: 'CC_OPEN', action: 'SELL', rollChainId: 'chain-1' }),
      ...makePair(
        'chain-1',
        { action: 'BUY', premiumPerContract: '0.8000' },
        { action: 'SELL', premiumPerContract: '1.5000' }
      )
    ]

    const chains = groupRollChains(legs)

    expect(chains).toHaveLength(1)
    expect(chains[0].netCreditPerShare).toBe('0.7000')
  })

  it('returns [] for no legs', () => {
    expect(groupRollChains([])).toEqual([])
  })
})
