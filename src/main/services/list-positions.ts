// Service layer — list positions query + mapping.
// No Electron or broker imports here.

import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { computeDte } from '../core/dte'
import { sortPositionsByDte } from '../core/position-order'
import { isOptionInstrument } from '../core/types'
import type { InstrumentType, PmccPhase, StrategyPhase, WheelStatus } from '../core/types'
import { logger } from '../logger'
import type {
  PmccLegSummary,
  PmccListItem,
  PmccListSummary,
  PositionListItem,
  PositionListItemBase,
  WheelListItem
} from '../schemas'
import { activeLegSubquery } from './active-leg-sql'
import {
  pmccInitialNetDebit,
  readPmccOpeningLegs,
  type PmccOpeningLegRow
} from './pmcc-opening-legs'

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

function toLegSummary(leg: PmccOpeningLegRow | undefined): PmccLegSummary | null {
  const dte = computeDte(leg?.expiration ?? null)
  if (!leg || dte === null) return null
  return {
    strike: new Decimal(leg.strike).toFixed(4),
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
  const openingLegs = readPmccOpeningLegs(db, ids)

  return new Map(
    ids.flatMap((id): [string, PmccListSummary][] => {
      const legs = openingLegs.get(id)
      const long = toLegSummary(legs?.long)
      const short = toLegSummary(legs?.short)
      const initialNetDebit = pmccInitialNetDebit(legs)
      if (!long || !short || !initialNetDebit) return []
      return [[id, { long, short, initialNetDebit }]]
    })
  )
}

function toListItemBase(row: PositionRow): PositionListItemBase {
  return {
    id: row.id,
    ticker: row.ticker,
    status: row.status,
    premiumCollected: new Decimal(row.total_premium_collected ?? '0').toFixed(4),
    effectiveCostBasis: new Decimal(row.basis_per_share ?? '0').toFixed(4),
    profitTargetPercent: row.profit_target_percent
  }
}

function toWheelItem(row: WheelPositionRow): WheelListItem {
  return {
    ...toListItemBase(row),
    strategyType: 'WHEEL',
    phase: row.phase,
    pmcc: null,
    strike: row.strike ? new Decimal(row.strike).toFixed(4) : null,
    expiration: row.expiration ?? null,
    dte: computeDte(row.expiration ?? null),
    instrumentType: isOptionInstrument(row.instrument_type) ? row.instrument_type : null,
    contracts: row.contracts ?? null,
    entryPremiumPerContract: row.premium_per_contract
      ? new Decimal(row.premium_per_contract).toFixed(4)
      : null
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
