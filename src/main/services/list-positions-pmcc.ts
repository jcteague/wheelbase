// Service layer — the PMCC arm of the positions list: each PMCC's open legs, cycle count, entry
// debit, management window and running ledger, read in one legs query for every PMCC row.

import Database from 'better-sqlite3'
import { money4 } from '../../shared/decimal-text'
import { resolveManagementWindowDte } from '../core/alerts'
import { computeDte } from '../core/dte'
import { logger } from '../logger'
import type { LegRecord, PmccLegSummary, PmccListSummary } from '../schemas'
import { getAlertDefaults } from './alert-defaults'
import { readLegsByPosition } from './leg-rows'
import { pmccLedgerFromLegs, pmccOpenLegs } from './pmcc-ledger'
import { pmccEntryDebit } from './pmcc-opening-legs'

/** The `positions` columns a PMCC summary reads. */
export interface PmccSummaryRow {
  id: string
  opened_date: string
  management_window_dte_override: number | null
}

/** The one place a `LegRecord` becomes a `PmccLegSummary`; null when its expiration has no DTE. */
function toLegSummary<S extends PmccLegSummary['side']>(
  leg: LegRecord,
  side: S,
  now: Date
): (PmccLegSummary & { side: S }) | null {
  const dte = computeDte(leg.expiration, now)
  if (dte === null) return null
  return {
    legId: leg.id,
    side,
    strike: money4(leg.strike),
    expiration: leg.expiration,
    dte,
    contracts: leg.contracts,
    fillPerShare: money4(leg.premiumPerContract)
  }
}

/** Every short call sold to open; a roll's ROLL_TO stays in the cycle it rolled. */
function countCycles(legs: LegRecord[]): number {
  return legs.filter((leg) => leg.legRole === 'SHORT_CALL_OPEN').length
}

/** The open legs the detail page shows, LEAPS first: a roll's ROLL_TO, and no short between
 *  short calls. Null when there is no LEAPS or an open leg's expiration yields no DTE. */
function openLegSummaries(legs: LegRecord[], now: Date): PmccListSummary['legs'] | null {
  const open = pmccOpenLegs(legs)
  if (!open) return null
  const long = toLegSummary(open.long, 'LONG', now)
  if (!long) return null
  if (open.short === null) return [long]
  const short = toLegSummary(open.short, 'SHORT', now)
  return short ? [long, short] : null
}

interface PmccSummaryInput {
  row: PmccSummaryRow
  legs: LegRecord[]
  defaultWindowDte: number
  now: Date
}

function toPmccSummary({
  row,
  legs,
  defaultWindowDte,
  now
}: PmccSummaryInput): PmccListSummary | null {
  const openLegs = openLegSummaries(legs, now)
  const ledger = pmccLedgerFromLegs(legs)
  if (!openLegs || !ledger) return null
  logger.debug(
    { positionId: row.id, legIds: openLegs.map((leg) => leg.legId) },
    'pmcc_list_legs_selected'
  )
  return {
    legs: openLegs,
    cycles: countCycles(legs),
    entryDebit: pmccEntryDebit(legs),
    openedAt: row.opened_date,
    managementWindowDte: resolveManagementWindowDte(
      row.management_window_dte_override,
      defaultWindowDte
    ),
    basisPerShare: ledger.basisPerShare,
    basisTotal: ledger.basisTotal,
    leapsCostPerShare: ledger.leapsCostPerShare,
    shortCreditsPerShare: ledger.shortCreditsPerShare,
    shortCreditsTotal: ledger.shortCreditsTotal,
    premiumRecoveredPercent: ledger.premiumRecoveredPercent
  }
}

/** Summaries by position id; a PMCC whose summary is incomplete is absent from the map. */
export function readPmccSummaries(
  db: Database.Database,
  rows: readonly PmccSummaryRow[],
  now: Date
): Map<string, PmccListSummary> {
  if (rows.length === 0) return new Map()
  const legsByPosition = readLegsByPosition(
    db,
    rows.map((row) => row.id)
  )
  const defaultWindowDte = getAlertDefaults(db).managementWindowDte

  return new Map(
    rows.flatMap((row): [string, PmccListSummary][] => {
      const legs = legsByPosition.get(row.id) ?? []
      const summary = toPmccSummary({ row, legs, defaultWindowDte, now })
      return summary ? [[row.id, summary]] : []
    })
  )
}
