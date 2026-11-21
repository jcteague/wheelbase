// [US-109] PMCC timeline service — legs to timeline events: each leg role and roll chain maps to
// the right event kind, unknown and unpaired legs become neutral rows, and the replayed basis
// agrees with the US-103 ledger.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PmccTimeline } from '../core/pmcc-timeline'
import { logger } from '../logger'
import type { LegRecord } from '../schemas'
import { pmccLedgerFromLegs } from './pmcc-ledger'
import { pmccTimelineFromLegs } from './pmcc-timeline'
import { FIXED_DAY, makePmccLeg, pmccFixtures } from './test-fixtures/pmcc-legs'

const POSITION_ID = 'pmcc-1'
const F = pmccFixtures(POSITION_ID)

const timelineOf = (legs: LegRecord[], valuationDate: string): PmccTimeline | null =>
  pmccTimelineFromLegs(legs, { valuationDate, closedDate: null })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pmccTimelineFromLegs', () => {
  it('turns LEAPS_OPEN + SHORT_CALL_OPEN into one purchase row and one open cycle', () => {
    const timeline = timelineOf(F.OPEN, '2026-10-01')

    expect(timeline?.leapsTrack.rows).toEqual([
      {
        kind: 'PURCHASE',
        date: '2026-09-14',
        contract: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '25.0000' },
        total: '2500.0000',
        dteAtFill: 368,
        basisAfter: '25.0000',
        fees: '0.0000'
      }
    ])
    expect(timeline?.cycles.map(({ status, opening }) => ({ status, opening }))).toEqual([
      {
        status: 'OPEN',
        opening: { strike: '110.0000', expiration: '2026-10-16', pricePerShare: '2.0000' }
      }
    ])
  })

  it('puts a roll chain whose ROLL_FROM is a BUY into the cycle it rolls', () => {
    const timeline = timelineOf(
      [...F.OPEN, ...F.EXPIRE_1, ...F.SHORT_2, ...F.SHORT_ROLL],
      '2026-11-30'
    )

    expect(timeline?.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE'])
    expect(timeline?.cycles.map((cycle) => cycle.rows.map((row) => row.kind))).toEqual([
      ['OPEN', 'END'],
      ['OPEN', 'ROLL']
    ])
    expect(timeline?.cycles[1].rows[1]).toEqual({
      kind: 'ROLL',
      number: 1,
      date: '2026-11-16',
      from: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '3.0000' },
      to: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.4000' },
      net: { direction: 'debit', perShare: '0.6000', total: '60.0000' },
      fees: '0.0000'
    })
  })

  it('puts a roll chain whose ROLL_FROM is a SELL on the LEAPS track as roll #1', () => {
    const timeline = timelineOf([...F.OPEN, ...F.EXPIRE_1, ...F.LEAPS_ROLL_SPLIT], '2026-12-31')

    expect(timeline?.cycles.map((cycle) => cycle.rows.map((row) => row.kind))).toEqual([
      ['OPEN', 'END']
    ])
    expect(timeline?.leapsTrack.current).toEqual({ strike: '85.0000', expiration: '2028-01-21' })
    expect(timeline?.leapsTrack.rows[1]).toEqual({
      kind: 'ROLL',
      number: 1,
      date: '2026-12-07',
      from: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '26.0000' },
      to: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '23.5000' },
      net: { direction: 'credit', perShare: '2.5000', total: '250.0000' },
      // closedOn is the ROLL_FROM's fill (12-07), openedOn the ROLL_TO's (12-09).
      coverage: { unbroken: false, gapDays: 2, extensionDays: 126 },
      basisAfter: '20.5000',
      fees: '0.0000'
    })
  })

  it('puts a LEAPS_CLOSE leg on the LEAPS track as a CLOSE row with no basis after it', () => {
    const timeline = timelineOf([...F.OPEN, ...F.EXPIRE_1, ...F.LEAPS_CLOSE_1], '2026-10-31')

    expect(timeline?.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'CLOSE'])
    // Exact equality: a `basisAfter` key on the close row would fail it.
    expect(timeline?.leapsTrack.rows[1]).toEqual({
      kind: 'CLOSE',
      date: '2026-10-24',
      contract: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '27.5000' },
      total: '2750.0000',
      fees: '0.0000'
    })
  })

  it.each([
    ['SHORT_CALL_EXPIRED', F.EXPIRE_1, '2026-10-16', 'EXPIRED', null, null],
    ['SHORT_CALL_CLOSE', F.CLOSE_1, '2026-10-02', 'CLOSED', '0.5500', '55.0000'],
    ['SHORT_CALL_ASSIGNED', F.ASSIGNED_1, '2026-10-16', 'ASSIGNED', null, null]
  ] as const)(
    'ends the cycle on %s with outcome %s',
    (_role, endLegs, date, outcome, pricePerShare, total) => {
      const timeline = timelineOf([...F.OPEN, ...endLegs], '2026-10-20')

      expect(timeline?.cycles[0]).toEqual(
        expect.objectContaining({ status: 'ENDED', outcome, endedOn: date })
      )
      expect(timeline?.cycles[0].rows.at(-1)).toEqual({
        kind: 'END',
        date,
        outcome,
        contract: { strike: '110.0000', expiration: '2026-10-16' },
        pricePerShare,
        total,
        fees: '0.0000'
      })
    }
  )

  describe('unknown and unpaired legs', () => {
    const legs = [...F.OPEN, ...F.UNKNOWN_ROLE, ...F.EXPIRE_1, ...F.UNPAIRED_ROLL_TO]

    it('shows a wheel-role leg as an UNKNOWN row with its raw role in the cycle open on its date', () => {
      const cycle = timelineOf(legs, '2026-10-31')?.cycles[0]

      expect(cycle?.rows.map((row) => row.kind)).toEqual(['OPEN', 'UNKNOWN', 'END'])
      expect(cycle?.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2026-09-19', role: 'CC_CLOSE' })
    })

    it('shows a ROLL_TO with no partner as an UNKNOWN row on the LEAPS track when no cycle is open', () => {
      const rows = timelineOf(legs, '2026-10-31')?.leapsTrack.rows

      expect(rows?.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
      expect(rows?.[1]).toEqual({ kind: 'UNKNOWN', date: '2026-10-24', role: 'ROLL_TO' })
    })

    it('shows a ROLL_FROM with no roll chain id as an UNKNOWN row', () => {
      const orphan = makePmccLeg(POSITION_ID, {
        legRole: 'ROLL_FROM',
        action: 'BUY',
        strike: '110.0000',
        expiration: FIXED_DAY(32),
        fillDate: FIXED_DAY(10),
        premiumPerContract: '1.2500'
      })
      const cycle = timelineOf([...F.OPEN, orphan], '2026-10-01')?.cycles[0]

      expect(cycle?.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2026-09-24', role: 'ROLL_FROM' })
    })

    it('counts neither into the cycle net nor the basis, which matches the US-103 ledger', () => {
      const timeline = timelineOf(legs, '2026-10-31')

      expect(timeline?.cycles[0].netPerShare).toBe('2.0000')
      expect(timeline?.summary.basisPerShare).toBe('23.0000')
      expect(timeline?.summary.basisPerShare).toBe(pmccLedgerFromLegs(legs)?.basisPerShare)
    })
  })

  it('sums the fees on both legs of a short roll once into that cycle net', () => {
    const timeline = timelineOf(
      [...F.OPEN, ...F.EXPIRE_1, ...F.SHORT_2, ...F.SHORT_ROLL_FEES],
      '2026-11-30'
    )
    const cycle = timeline?.cycles[1]

    // 1.80 sold − 3.00 bought back + 2.40 sold = $120.00, less $0.65 × 2 fees.
    expect({ netPerShare: cycle?.netPerShare, netTotal: cycle?.netTotal }).toEqual({
      netPerShare: '1.1870',
      netTotal: '118.7000'
    })
    expect(cycle?.rows[1]).toEqual(
      expect.objectContaining({
        kind: 'ROLL',
        net: { direction: 'debit', perShare: '0.6130', total: '61.3000' },
        fees: '1.3000'
      })
    )
  })

  it('normalises strikes and prices to 4 dp so an end pairs with the cycle that holds it', () => {
    const bare = (leg: LegRecord): LegRecord => ({
      ...leg,
      strike: leg.strike.replace('.0000', ''),
      premiumPerContract: leg.premiumPerContract.replace('.0000', '')
    })
    // Cycle 2 opens before cycle 1 expires; the expiry's '110.0000' must match cycle 1's '110'.
    const overlapping = { ...F.SHORT_2[0], fillDate: FIXED_DAY(20) }
    const timeline = timelineOf([...F.OPEN.map(bare), overlapping, ...F.EXPIRE_1], '2026-10-20')

    expect(timeline?.leapsTrack.rows[0]).toEqual(
      expect.objectContaining({
        contract: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '25.0000' }
      })
    )
    expect(timeline?.cycles.map(({ status, opening }) => ({ status, opening }))).toEqual([
      {
        status: 'ENDED',
        opening: { strike: '110.0000', expiration: '2026-10-16', pricePerShare: '2.0000' }
      },
      {
        status: 'OPEN',
        opening: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '1.8000' }
      }
    ])
  })

  it.each([
    ['only a short call', F.SHORT_2],
    ['no legs', []]
  ])('returns null when there is no LEAPS leg (%s)', (_label, legs) => {
    expect(timelineOf(legs, '2026-10-31')).toBeNull()
  })

  it('logs the event kinds and dates at DEBUG and nothing at INFO', () => {
    const debugSpy = vi.spyOn(logger, 'debug')
    const infoSpy = vi.spyOn(logger, 'info')

    timelineOf(F.OPEN, '2026-10-01')

    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          { kind: 'LEAPS_OPEN', date: '2026-09-14' },
          { kind: 'SHORT_OPEN', date: '2026-09-14' }
        ]
      }),
      'pmcc_timeline_events'
    )
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('warns pmcc_ledger_unknown_leg_role once when a request builds both the ledger and the timeline', () => {
    const warnSpy = vi.spyOn(logger, 'warn')
    const legs = [...F.OPEN, ...F.UNKNOWN_ROLE]

    pmccLedgerFromLegs(legs)
    timelineOf(legs, '2026-10-01')

    const unknownRoleWarnings = warnSpy.mock.calls.filter(
      ([, message]) => message === 'pmcc_ledger_unknown_leg_role'
    )
    expect(unknownRoleWarnings).toEqual([
      [expect.objectContaining({ legRole: 'CC_CLOSE' }), 'pmcc_ledger_unknown_leg_role']
    ])
  })
})
