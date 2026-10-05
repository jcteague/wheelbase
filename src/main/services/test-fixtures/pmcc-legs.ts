// [US-103] PMCC ledger leg fixtures — data-model.md § 5. The AC's XYZ trade, 1 contract, $0 fees
// unless a fixture says otherwise. Dates come from a `day(offset)` function so pure tests use a
// fixed calendar and service tests that go through createPmccPosition use the run day.

import Database from 'better-sqlite3'
import { addDays, format, parseISO } from 'date-fns'
import { randomUUID } from 'node:crypto'
import type { LegRecord } from '../../schemas'

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
  LEAPS_ROLL: LegRecord[]
  CYCLES: LegRecord[]
  FEES: LegRecord[]
  THREE: LegRecord[]
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
    SHORT_ROLL: [
      leg(
        {
          legRole: 'ROLL_FROM',
          action: 'BUY',
          strike: '108.0000',
          expiration: day(67),
          fillDate: day(63),
          premiumPerContract: '3.0000',
          rollChainId: 'rc-1'
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
          rollChainId: 'rc-1'
        },
        1
      )
    ],
    LEAPS_ROLL: [
      leg(
        {
          legRole: 'ROLL_FROM',
          action: 'SELL',
          strike: '80.0000',
          expiration: day(368),
          fillDate: day(84),
          premiumPerContract: '26.0000',
          rollChainId: 'rc-2'
        },
        0
      ),
      leg(
        {
          legRole: 'ROLL_TO',
          action: 'BUY',
          strike: '85.0000',
          expiration: day(494),
          fillDate: day(84),
          premiumPerContract: '23.5000',
          rollChainId: 'rc-2'
        },
        1
      )
    ],
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
    THREE: openLegs({ contracts: 3 })
  }
}

const INSERT_LEG_SQL = `INSERT INTO legs
  (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts,
   premium_per_contract, fill_price, fill_date, roll_chain_id, fees, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

/** Writes fixture legs straight into `legs`, as a consumer story's service would. */
export function insertLegs(db: Database.Database, legs: LegRecord[]): void {
  const insert = db.prepare(INSERT_LEG_SQL)
  legs.forEach((l) =>
    insert.run(
      l.id,
      l.positionId,
      l.legRole,
      l.action,
      l.instrumentType,
      l.strike,
      l.expiration,
      l.contracts,
      l.premiumPerContract,
      l.fillPrice,
      l.fillDate,
      l.rollChainId,
      l.fees,
      l.createdAt,
      l.updatedAt
    )
  )
}
