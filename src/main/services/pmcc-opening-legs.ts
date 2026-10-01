// Shared PMCC opening-leg reader for listPositions and getPosition, so both derive the
// initial net debit from the same rows the same way.

import Database from 'better-sqlite3'
import { calculatePmccOpeningDebit } from '../core/costbasis'
import { logger } from '../logger'

export interface PmccOpeningLegRow {
  position_id: string
  leg_role: 'LEAPS_OPEN' | 'SHORT_CALL_OPEN'
  strike: string
  expiration: string
  contracts: number
  fill_price: string | null
  fees: string
}

export interface PmccOpeningLegs {
  long?: PmccOpeningLegRow
  short?: PmccOpeningLegRow
}

/** One query for every position's LEAPS_OPEN and SHORT_CALL_OPEN legs, keyed by position id. */
export function readPmccOpeningLegs(
  db: Database.Database,
  positionIds: string[]
): Map<string, PmccOpeningLegs> {
  if (positionIds.length === 0) return new Map()
  logger.debug({ ids: positionIds }, 'pmcc_opening_legs_read')

  const rows = db
    .prepare(
      `SELECT position_id, leg_role, strike, expiration, contracts, fill_price, fees
       FROM legs
       WHERE position_id IN (${positionIds.map(() => '?').join(', ')})
         AND leg_role IN ('LEAPS_OPEN', 'SHORT_CALL_OPEN')
       ORDER BY created_at, rowid`
    )
    .all(...positionIds) as PmccOpeningLegRow[]

  // Later rows win, so a future roll's newer leg supersedes the opening one.
  return rows.reduce((byPosition, row) => {
    const side = row.leg_role === 'LEAPS_OPEN' ? 'long' : 'short'
    return byPosition.set(row.position_id, { ...byPosition.get(row.position_id), [side]: row })
  }, new Map<string, PmccOpeningLegs>())
}

/**
 * Dollars, 4 dp, recomputed from both legs' fills and fees — never from the rounded
 * basis_per_share, which drifts. Null when either leg or its fill price is missing.
 */
export function pmccInitialNetDebit(legs: PmccOpeningLegs | undefined): string | null {
  const long = legs?.long
  const short = legs?.short
  if (!long?.fill_price || !short?.fill_price) return null
  return calculatePmccOpeningDebit({
    contracts: long.contracts,
    long: { strike: long.strike, fillPrice: long.fill_price, fees: long.fees },
    short: { strike: short.strike, fillPrice: short.fill_price, fees: short.fees }
  }).initialNetDebit
}
