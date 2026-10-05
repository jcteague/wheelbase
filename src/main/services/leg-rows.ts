// Shared legs reader: every service that needs a position's legs reads them here, in one
// order, mapped to LegRecord the same way.

import Database from 'better-sqlite3'
import type { InstrumentType, LegAction, LegRole } from '../core/types'
import { logger } from '../logger'
import type { LegRecord } from '../schemas'

interface LegRow {
  id: string
  position_id: string
  leg_role: LegRole
  action: LegAction
  instrument_type: InstrumentType
  strike: string
  expiration: string
  contracts: number
  premium_per_contract: string
  fill_price: string | null
  fill_date: string
  roll_chain_id: string | null
  fees: string
  created_at: string
  updated_at: string
}

const LEG_COLUMNS = `
  id, position_id, leg_role, action, instrument_type, strike, expiration,
  contracts, premium_per_contract, fill_price, fill_date, roll_chain_id, fees, created_at, updated_at
`

const LEG_ORDER = 'ORDER BY fill_date ASC, created_at ASC'

const GET_LEGS_QUERY = `
  SELECT ${LEG_COLUMNS}
  FROM legs
  WHERE position_id = ?
  ${LEG_ORDER}
`

function mapLegRow(r: LegRow): LegRecord {
  return {
    id: r.id,
    positionId: r.position_id,
    legRole: r.leg_role,
    action: r.action,
    instrumentType: r.instrument_type,
    strike: r.strike,
    expiration: r.expiration,
    contracts: r.contracts,
    premiumPerContract: r.premium_per_contract,
    fillPrice: r.fill_price,
    fillDate: r.fill_date,
    rollChainId: r.roll_chain_id ?? null,
    fees: r.fees,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** Every leg of one position, oldest fill first. */
export function readLegs(db: Database.Database, positionId: string): LegRecord[] {
  const rows = db.prepare(GET_LEGS_QUERY).all(positionId) as LegRow[]
  return rows.map(mapLegRow)
}

/** One query for every listed position's legs, keyed by position id, in readLegs order. */
export function readLegsByPosition(
  db: Database.Database,
  positionIds: string[]
): Map<string, LegRecord[]> {
  if (positionIds.length === 0) return new Map()
  logger.debug({ ids: positionIds }, 'legs_by_position_read')

  const rows = db
    .prepare(
      `SELECT ${LEG_COLUMNS}
       FROM legs
       WHERE position_id IN (${positionIds.map(() => '?').join(', ')})
       ${LEG_ORDER}`
    )
    .all(...positionIds) as LegRow[]

  return rows
    .map(mapLegRow)
    .reduce(
      (byPosition, leg) =>
        byPosition.set(leg.positionId, [...(byPosition.get(leg.positionId) ?? []), leg]),
      new Map<string, LegRecord[]>()
    )
}
