// Service layer — list positions query + mapping.
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import { money4 } from '../../shared/decimal-text'
import { computeDte } from '../core/dte'
import { sortPositionsByDte } from '../core/position-order'
import { isOptionInstrument } from '../core/types'
import type { InstrumentType, StrategyPhase, WheelStatus } from '../core/types'
import { logger } from '../logger'
import { toPmccListPhase } from '../pmcc-phase'
import type {
  PmccListItem,
  PmccListSummary,
  PositionListItem,
  PositionListItemBase,
  WheelListItem
} from '../schemas'
import { activeLegSubquery } from './active-leg-sql'
import { readStoredNextEarnings } from './earnings-dates'
import { readPmccSummaries } from './list-positions-pmcc'

// ---------------------------------------------------------------------------
// Internal DB row type
// ---------------------------------------------------------------------------

interface PositionRowBase {
  id: string
  ticker: string
  status: WheelStatus
  strike: string | null
  expiration: string | null
  instrument_type: InstrumentType | null
  contracts: number | null
  premium_per_contract: string | null
  basis_per_share: string | null
  total_premium_collected: string | null
  profit_target_percent: number | null
  opened_date: string
  management_window_dte_override: number | null
}

type WheelPositionRow = PositionRowBase & {
  strategy_type: 'WHEEL'
  phase: StrategyPhase<'WHEEL'>
}
// `phase` is free TEXT: a PMCC phase from a later story is read as data, not trusted as known.
type PmccPositionRow = PositionRowBase & { strategy_type: 'PMCC'; phase: string }
// The strategy fixes which phases a row can hold, so a strategy_type check narrows the phase.
type PositionRow = WheelPositionRow | PmccPositionRow

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_QUERY = `
  SELECT
    p.id, p.ticker, p.strategy_type, p.phase, p.status,
    p.profit_target_percent, p.opened_date, p.management_window_dte_override,
    l.strike, l.expiration,
    l.instrument_type, l.contracts, l.premium_per_contract,
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

function toListItemBase(row: PositionRow, nextEarnings: string | null): PositionListItemBase {
  return {
    id: row.id,
    ticker: row.ticker,
    status: row.status,
    premiumCollected: money4(row.total_premium_collected ?? '0'),
    effectiveCostBasis: money4(row.basis_per_share ?? '0'),
    profitTargetPercent: row.profit_target_percent,
    nextEarnings
  }
}

function toWheelItem(row: WheelPositionRow, nextEarnings: string | null): WheelListItem {
  return {
    ...toListItemBase(row, nextEarnings),
    strategyType: 'WHEEL',
    phase: row.phase,
    pmcc: null,
    strike: row.strike ? money4(row.strike) : null,
    expiration: row.expiration ?? null,
    dte: computeDte(row.expiration ?? null),
    instrumentType: isOptionInstrument(row.instrument_type) ? row.instrument_type : null,
    contracts: row.contracts ?? null,
    entryPremiumPerContract: row.premium_per_contract ? money4(row.premium_per_contract) : null
  }
}

function toPmccItem(
  row: PmccPositionRow,
  summary: PmccListSummary,
  nextEarnings: string | null
): PmccListItem {
  return {
    ...toListItemBase(row, nextEarnings),
    strategyType: 'PMCC',
    phase: toPmccListPhase(row.phase),
    pmcc: summary,
    strike: null,
    expiration: null,
    dte: null,
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null
  }
}

// ---------------------------------------------------------------------------
// listPositions
// ---------------------------------------------------------------------------

/** The list rows for `rows`, unordered; a PMCC whose summary is incomplete is omitted. */
function toListItems(db: Database.Database, rows: PositionRow[], now: Date): PositionListItem[] {
  const pmccSummaries = readPmccSummaries(
    db,
    rows.filter((row): row is PmccPositionRow => row.strategy_type === 'PMCC'),
    now
  )
  const earnings = readStoredNextEarnings(
    db,
    rows.map((row) => row.ticker),
    now
  )
  logger.debug({ count: earnings.size }, 'list_positions_earnings_joined')

  return rows.flatMap((row): PositionListItem[] => {
    const nextEarnings = earnings.get(row.ticker) ?? null
    if (row.strategy_type !== 'PMCC') return [toWheelItem(row, nextEarnings)]
    const summary = pmccSummaries.get(row.id)
    if (summary) return [toPmccItem(row, summary, nextEarnings)]
    logger.warn({ positionId: row.id }, 'pmcc_list_summary_incomplete')
    return []
  })
}

export function listPositions(db: Database.Database): PositionListItem[] {
  logger.debug('list_positions_query_start')

  const rows = db.prepare<[], PositionRow>(LIST_QUERY).all()

  logger.debug({ count: rows.length }, 'list_positions_query_complete')

  const ordered = sortPositionsByDte(toListItems(db, rows, new Date()))

  logger.info({ count: ordered.length }, 'positions_listed')
  return ordered
}

/** The PMCC row `listPositions` returns for one position; null for a wheel, or when the list omits or lacks it. */
export function readPmccListItem(db: Database.Database, positionId: string): PmccListItem | null {
  const rows = db.prepare<[string], PositionRow>(`${LIST_QUERY} WHERE p.id = ?`).all(positionId)
  const [item = null] = toListItems(db, rows, new Date())
  const pmcc = item?.strategyType === 'PMCC' ? item : null
  logger.debug({ positionId, found: pmcc !== null }, 'pmcc_list_item_read')
  return pmcc
}
