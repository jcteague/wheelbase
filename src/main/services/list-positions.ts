// Service layer — list positions query + mapping.
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import type { WheelPhase, WheelStatus } from '../core/types'
import { logger } from '../logger'
import type { PositionListItem } from '../schemas'
import { activeLegSubquery } from './active-leg-sql'

// ---------------------------------------------------------------------------
// Internal DB row type
// ---------------------------------------------------------------------------

interface PositionRow {
  id: string
  ticker: string
  phase: WheelPhase
  status: WheelStatus
  strike: string | null
  expiration: string | null
  basis_per_share: string | null
  total_premium_collected: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_QUERY = `
  SELECT
    p.id, p.ticker, p.phase, p.status,
    l.strike, l.expiration,
    cbs.basis_per_share, cbs.total_premium_collected
  FROM positions p
  LEFT JOIN legs l ON l.id = (
    ${activeLegSubquery()}
  )
  LEFT JOIN cost_basis_snapshots cbs ON cbs.id = (
    SELECT id FROM cost_basis_snapshots
    WHERE position_id = p.id
    ORDER BY snapshot_at DESC, rowid DESC
    LIMIT 1
  )
`

function computeDte(expiration: string | null): number | null {
  if (!expiration) return null
  const [ey, em, ed] = expiration.split('-').map(Number)
  const now = new Date()
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const expirationMs = Date.UTC(ey, em - 1, ed)
  return Math.round((expirationMs - todayMs) / 86_400_000)
}

function dteSortKey(item: PositionListItem): [boolean, number] {
  return [item.dte === null, item.dte ?? 0]
}

// ---------------------------------------------------------------------------
// listPositions
// ---------------------------------------------------------------------------

export function listPositions(db: Database.Database): PositionListItem[] {
  logger.debug('list_positions_query_start')

  const rows = db.prepare(LIST_QUERY).all() as PositionRow[]

  logger.debug({ count: rows.length }, 'list_positions_query_complete')

  const items = rows.map(
    (row): PositionListItem => ({
      id: row.id,
      ticker: row.ticker,
      phase: row.phase,
      status: row.status,
      strike: row.strike ? new Decimal(row.strike).toFixed(4) : null,
      expiration: row.expiration ?? null,
      dte: computeDte(row.expiration ?? null),
      premiumCollected: new Decimal(row.total_premium_collected ?? '0').toFixed(4),
      effectiveCostBasis: new Decimal(row.basis_per_share ?? '0').toFixed(4)
    })
  )

  items.sort((a, b) => {
    const [aNullish, aVal] = dteSortKey(a)
    const [bNullish, bVal] = dteSortKey(b)
    if (aNullish !== bNullish) return aNullish ? 1 : -1
    return aVal - bVal
  })

  logger.info({ count: items.length }, 'positions_listed')
  return items
}
