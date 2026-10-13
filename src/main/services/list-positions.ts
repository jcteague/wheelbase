// Service layer — list positions query + mapping.
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import { money4 } from '../../shared/decimal-text'
import { computeDte } from '../core/dte'
import { sortPositionsByDte } from '../core/position-order'
import { isOptionInstrument } from '../core/types'
import type { InstrumentType, PmccPhase, StrategyPhase, WheelStatus } from '../core/types'
import { logger } from '../logger'
import type {
  LegRecord,
  PmccLegSummary,
  PmccListItem,
  PmccListSummary,
  PositionListItem,
  PositionListItemBase,
  WheelListItem
} from '../schemas'
import { activeLegSubquery } from './active-leg-sql'
import { readLegsByPosition } from './leg-rows'
import { pmccLedgerFromLegs, pmccOpenLegs } from './pmcc-ledger'

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
}

type WheelPositionRow = PositionRowBase & {
  strategy_type: 'WHEEL'
  phase: StrategyPhase<'WHEEL'>
}
type PmccPositionRow = PositionRowBase & { strategy_type: 'PMCC'; phase: PmccPhase }
// The strategy fixes which phases a row can hold, so a strategy_type check narrows the phase.
type PositionRow = WheelPositionRow | PmccPositionRow

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_QUERY = `
  SELECT
    p.id, p.ticker, p.strategy_type, p.phase, p.status,
    p.profit_target_percent,
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

function toLegSummary(leg: LegRecord): PmccLegSummary | null {
  const dte = computeDte(leg.expiration)
  if (dte === null) return null
  return {
    strike: money4(leg.strike),
    expiration: leg.expiration,
    dte,
    contracts: leg.contracts
  }
}

function readPmccSummaries(
  db: Database.Database,
  rows: PositionRow[]
): Map<string, PmccListSummary> {
  const ids = rows.filter((row) => row.strategy_type === 'PMCC').map((row) => row.id)
  const legsByPosition = readLegsByPosition(db, ids)

  return new Map(
    ids.flatMap((id): [string, PmccListSummary][] => {
      const legs = legsByPosition.get(id) ?? []
      // The open legs the detail page shows: a roll's ROLL_TO, and no short between short calls.
      const open = pmccOpenLegs(legs)
      const ledger = pmccLedgerFromLegs(legs)
      if (!open || !ledger) return []
      const long = toLegSummary(open.long)
      const short = open.short === null ? null : toLegSummary(open.short)
      // An unparseable expiration on either open leg leaves the summary incomplete.
      if (!long || (open.short !== null && short === null)) return []
      const { basisPerShare, basisTotal } = ledger
      return [[id, { long, short, basisPerShare, basisTotal }]]
    })
  )
}

function toListItemBase(row: PositionRow): PositionListItemBase {
  return {
    id: row.id,
    ticker: row.ticker,
    status: row.status,
    premiumCollected: money4(row.total_premium_collected ?? '0'),
    effectiveCostBasis: money4(row.basis_per_share ?? '0'),
    profitTargetPercent: row.profit_target_percent
  }
}

function toWheelItem(row: WheelPositionRow): WheelListItem {
  return {
    ...toListItemBase(row),
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

function toPmccItem(row: PmccPositionRow, summary: PmccListSummary): PmccListItem {
  return {
    ...toListItemBase(row),
    strategyType: 'PMCC',
    phase: row.phase,
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

export function listPositions(db: Database.Database): PositionListItem[] {
  logger.debug('list_positions_query_start')

  const rows = db.prepare(LIST_QUERY).all() as PositionRow[]

  logger.debug({ count: rows.length }, 'list_positions_query_complete')

  const pmccSummaries = readPmccSummaries(db, rows)

  const items = rows.flatMap((row): PositionListItem[] => {
    if (row.strategy_type !== 'PMCC') return [toWheelItem(row)]
    const summary = pmccSummaries.get(row.id)
    if (summary) return [toPmccItem(row, summary)]
    logger.warn({ positionId: row.id }, 'pmcc_list_summary_incomplete')
    return []
  })

  const ordered = sortPositionsByDte(items)

  logger.info({ count: ordered.length }, 'positions_listed')
  return ordered
}
