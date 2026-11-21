// [US-103] PMCC ledger leg fixtures — data-model.md § 5. The AC's XYZ trade, 1 contract, $0 fees
// unless a fixture says otherwise. Dates come from a `day(offset)` function so pure tests use a
// fixed calendar and service tests that go through createPmccPosition use the run day.

import Database from 'better-sqlite3'
import { addDays, format, parseISO } from 'date-fns'
import { randomUUID } from 'node:crypto'
import type { CreatePmccPositionPayload, LegRecord, PmccTriggerEvent } from '../../schemas'
import { insertLegRow } from '../leg-rows'
import { appendPmccSnapshot } from '../pmcc-ledger'

export type DayFn = (offset: number) => string

/** Fixed calendar anchored on the worked ledger's open date (research.md § Worked ledger). */
export const FIXED_DAY: DayFn = (offset) =>
  format(addDays(parseISO('2026-09-14'), offset), 'yyyy-MM-dd')

type LegFields = Pick<LegRecord, 'legRole' | 'action' | 'strike' | 'expiration' | 'fillDate'> &
  Partial<LegRecord> & { premiumPerContract: string }

/** One PMCC leg row. `seq` orders legs that share a fill date (created_at tie-break). */
export function makePmccLeg(positionId: string, fields: LegFields, seq = 0): LegRecord {
  const createdAt = `${fields.fillDate}T00:00:00.${String(seq).padStart(3, '0')}Z`
  return {
    id: randomUUID(),
    positionId,
    instrumentType: 'CALL',
    contracts: 1,
    fillPrice: fields.premiumPerContract,
    rollChainId: null,
    fees: '0.0000',
    createdAt,
    updatedAt: createdAt,
    ...fields
  }
}

export interface PmccFixtures {
  OPEN: LegRecord[]
  EXPIRE_1: LegRecord[]
  SHORT_2: LegRecord[]
  SHORT_ROLL: LegRecord[]
  EXPIRE_2: LegRecord[]
  LEAPS_ROLL: LegRecord[]
  CYCLES: LegRecord[]
  FEES: LegRecord[]
  THREE: LegRecord[]
  /** [US-109] Cycle 1 bought back early at 0.55 on day 18. */
  CLOSE_1: LegRecord[]
  /** [US-109] Cycle 1 assigned at expiration. */
  ASSIGNED_1: LegRecord[]
  /** [US-109] `SHORT_ROLL` with $0.65 fees on each leg. */
  SHORT_ROLL_FEES: LegRecord[]
  /** [US-109] `LEAPS_ROLL` sold on day 84, its replacement bought two days later. */
  LEAPS_ROLL_SPLIT: LegRecord[]
  /** [US-109] A wheel-role leg (`CC_CLOSE`) on a PMCC, dated inside cycle 1. */
  UNKNOWN_ROLE: LegRecord[]
  /** [US-109] A `ROLL_TO` whose `ROLL_FROM` was never recorded, dated after cycle 1 expired. */
  UNPAIRED_ROLL_TO: LegRecord[]
  /** [US-109] The `OPEN` LEAPS sold to close at 27.50 on day 40, after cycle 1 expired. */
  LEAPS_CLOSE_1: LegRecord[]
}

export function pmccFixtures(positionId: string, day: DayFn = FIXED_DAY): PmccFixtures {
  const leg = (fields: LegFields, seq = 0): LegRecord => makePmccLeg(positionId, fields, seq)

  const openLegs = (overrides: Partial<LegRecord> = {}): LegRecord[] => [
    leg(
      {
        legRole: 'LEAPS_OPEN',
        action: 'BUY',
        strike: '80.0000',
        expiration: day(368),
        fillDate: day(0),
        premiumPerContract: '25.0000',
        ...overrides
      },
      0
    ),
    leg(
      {
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: '110.0000',
        expiration: day(32),
        fillDate: day(0),
        premiumPerContract: '2.0000',
        ...overrides
      },
      1
    )
  ]

  const shortRollLegs = (rollChainId: string, overrides: Partial<LegRecord> = {}): LegRecord[] => [
    leg(
      {
        legRole: 'ROLL_FROM',
        action: 'BUY',
        strike: '108.0000',
        expiration: day(67),
        fillDate: day(63),
        premiumPerContract: '3.0000',
        rollChainId,
        ...overrides
      },
      0
    ),
    leg(
      {
        legRole: 'ROLL_TO',
        action: 'SELL',
        strike: '112.0000',
        expiration: day(95),
        fillDate: day(63),
        premiumPerContract: '2.4000',
        rollChainId,
        ...overrides
      },
      1
    )
  ]

  const leapsRollLegs = (rollChainId: string, rollToFillDate = day(84)): LegRecord[] => [
    leg(
      {
        legRole: 'ROLL_FROM',
        action: 'SELL',
        strike: '80.0000',
        expiration: day(368),
        fillDate: day(84),
        premiumPerContract: '26.0000',
        rollChainId
      },
      0
    ),
    leg(
      {
        legRole: 'ROLL_TO',
        action: 'BUY',
        strike: '85.0000',
        expiration: day(494),
        fillDate: rollToFillDate,
        premiumPerContract: '23.5000',
        rollChainId
      },
      1
    )
  ]

  const cycle1End = (
    fields: Pick<LegRecord, 'legRole' | 'action' | 'fillDate'>,
    premium: string
  ): LegRecord =>
    leg({ strike: '110.0000', expiration: day(32), premiumPerContract: premium, ...fields })

  return {
    OPEN: openLegs(),
    EXPIRE_1: [
      leg({
        legRole: 'SHORT_CALL_EXPIRED',
        action: 'EXPIRE',
        strike: '110.0000',
        expiration: day(32),
        fillDate: day(32),
        premiumPerContract: '0.0000'
      })
    ],
    SHORT_2: [
      leg({
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: '108.0000',
        expiration: day(67),
        fillDate: day(35),
        premiumPerContract: '1.8000'
      })
    ],
    SHORT_ROLL: shortRollLegs('rc-1'),
    EXPIRE_2: [
      leg({
        legRole: 'SHORT_CALL_EXPIRED',
        action: 'EXPIRE',
        strike: '112.0000',
        expiration: day(95),
        fillDate: day(95),
        premiumPerContract: '0.0000'
      })
    ],
    LEAPS_ROLL: leapsRollLegs('rc-2'),
    CYCLES: [
      leg({
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: '118.0000',
        expiration: day(120),
        fillDate: day(100),
        premiumPerContract: '19.7000'
      })
    ],
    FEES: openLegs({ fees: '1.0000' }),
    THREE: openLegs({ contracts: 3 }),
    CLOSE_1: [
      cycle1End({ legRole: 'SHORT_CALL_CLOSE', action: 'BUY', fillDate: day(18) }, '0.5500')
    ],
    ASSIGNED_1: [
      cycle1End({ legRole: 'SHORT_CALL_ASSIGNED', action: 'ASSIGN', fillDate: day(32) }, '0.0000')
    ],
    SHORT_ROLL_FEES: shortRollLegs('rc-fees', { fees: '0.6500' }),
    LEAPS_ROLL_SPLIT: leapsRollLegs('rc-split', day(86)),
    UNKNOWN_ROLE: [
      leg({
        legRole: 'CC_CLOSE',
        action: 'BUY',
        strike: '110.0000',
        expiration: day(32),
        fillDate: day(5),
        premiumPerContract: '1.0000'
      })
    ],
    UNPAIRED_ROLL_TO: [
      leg({
        legRole: 'ROLL_TO',
        action: 'SELL',
        strike: '112.0000',
        expiration: day(70),
        fillDate: day(40),
        premiumPerContract: '1.5000',
        rollChainId: 'rc-orphan'
      })
    ],
    LEAPS_CLOSE_1: [
      leg({
        legRole: 'LEAPS_CLOSE',
        action: 'SELL',
        strike: '80.0000',
        expiration: day(368),
        fillDate: day(40),
        premiumPerContract: '27.5000'
      })
    ]
  }
}

/** Writes fixture legs straight into `legs`, as a consumer story's service would. */
export function insertLegs(db: Database.Database, legs: LegRecord[]): void {
  legs.forEach((leg) => insertLegRow(db, leg))
}

/** Fixture legs plus their PMCC snapshot in one transaction, as a recording service would. */
export function recordPmccLegEvent(
  db: Database.Database,
  positionId: string,
  legs: LegRecord[],
  triggerEvent: PmccTriggerEvent
): void {
  db.transaction(() => {
    insertLegs(db, legs)
    appendPmccSnapshot(db, positionId, {
      triggerEvent,
      eventDate: legs[0].fillDate,
      now: new Date().toISOString()
    })
  })()
}

/** The AC's XYZ opening as a createPmccPosition payload — the `OPEN` fixture's terms. */
export function pmccOpenPayload(day: DayFn): CreatePmccPositionPayload {
  const leg = {
    underlying: 'XYZ',
    instrumentType: 'CALL' as const,
    deliverableShares: 100,
    contracts: 1
  }
  return {
    strategy: 'PMCC',
    ticker: 'XYZ',
    long: { ...leg, strike: 80, expiration: day(368), fillPrice: 25.0, fillDate: day(0), fees: 0 },
    short: { ...leg, strike: 110, expiration: day(32), fillPrice: 2.0, fillDate: day(0), fees: 0 }
  }
}
