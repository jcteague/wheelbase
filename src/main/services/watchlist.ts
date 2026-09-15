// [US-63] Watchlist service — add / list / remove; update is [US-69]
import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { WatchlistEntryPayload, WatchlistEntryRecord } from '../schemas'

interface WatchlistRow {
  ticker: string
  notes: string | null
  own_below_price: string | null
  ivr_trigger: number | null
  post_earnings_only: number
  core_holding: number
  added_at: string
}

const SELECT_EXISTS_QUERY = 'SELECT 1 FROM watchlist WHERE ticker = ?'

const INSERT_QUERY = `
  INSERT INTO watchlist
    (ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`

const LIST_QUERY = `
  SELECT ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at
  FROM watchlist
  ORDER BY added_at DESC
`

const DELETE_QUERY = 'DELETE FROM watchlist WHERE ticker = ?'

const UPDATE_QUERY = `
  UPDATE watchlist
  SET notes = ?, own_below_price = ?, ivr_trigger = ?, post_earnings_only = ?, core_holding = ?
  WHERE ticker = ?
`

const SELECT_ONE_QUERY = `
  SELECT ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at
  FROM watchlist
  WHERE ticker = ?
`

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

function mapRow(row: WatchlistRow): WatchlistEntryRecord {
  return {
    ticker: row.ticker,
    notes: row.notes,
    ownBelowPrice: row.own_below_price,
    ivrTrigger: row.ivr_trigger,
    postEarningsOnly: row.post_earnings_only === 1,
    coreHolding: row.core_holding === 1,
    addedAt: row.added_at
  }
}

/** The editable columns in their stored encoding. Add and update share it so a bound or
 *  a normalisation can only ever be changed in one place. An empty thesis stores NULL:
 *  the detail panel reads `null` as "No thesis yet." but would render '' as a blank line. */
function toStoredFields(payload: WatchlistEntryPayload): {
  notes: string | null
  ownBelowPrice: string | null
  ivrTrigger: number | null
  postEarningsOnly: 0 | 1
  coreHolding: 0 | 1
} {
  return {
    notes: payload.notes ? payload.notes : null,
    ownBelowPrice:
      payload.ownBelowPrice == null ? null : new Decimal(payload.ownBelowPrice).toFixed(4),
    ivrTrigger: payload.ivrTrigger ?? null,
    postEarningsOnly: payload.postEarningsOnly ? 1 : 0,
    coreHolding: payload.coreHolding ? 1 : 0
  }
}

export function addWatchlistEntry(
  db: Database.Database,
  payload: WatchlistEntryPayload
): WatchlistEntryRecord {
  const ticker = normalizeTicker(payload.ticker)

  if (db.prepare(SELECT_EXISTS_QUERY).get(ticker)) {
    throw new ValidationError('ticker', 'duplicate', `${ticker} is already on the watchlist`)
  }

  const { notes, ownBelowPrice, ivrTrigger, postEarningsOnly, coreHolding } =
    toStoredFields(payload)
  const addedAt = new Date().toISOString()

  logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_add_input')

  db.prepare(INSERT_QUERY).run(
    ticker,
    notes,
    ownBelowPrice,
    ivrTrigger,
    postEarningsOnly,
    coreHolding,
    addedAt
  )

  logger.info({ ticker }, 'watchlist_entry_added')

  return {
    ticker,
    notes,
    ownBelowPrice,
    ivrTrigger,
    postEarningsOnly: payload.postEarningsOnly,
    coreHolding: payload.coreHolding,
    addedAt
  }
}

/** [US-69] Replaces every editable field of an existing entry. `added_at` is not in the
 *  SET list and the ticker is only the key, so an edit cannot reorder the bench or
 *  rename a row — renaming is remove + re-add. */
export function updateWatchlistEntry(
  db: Database.Database,
  payload: WatchlistEntryPayload
): WatchlistEntryRecord {
  const ticker = normalizeTicker(payload.ticker)
  const { notes, ownBelowPrice, ivrTrigger, postEarningsOnly, coreHolding } =
    toStoredFields(payload)

  logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_update_input')

  const result = db
    .prepare(UPDATE_QUERY)
    .run(notes, ownBelowPrice, ivrTrigger, postEarningsOnly, coreHolding, ticker)

  if (result.changes === 0) {
    throw new ValidationError('ticker', 'not_found', `${ticker} is not on the watchlist`)
  }

  logger.info({ ticker }, 'watchlist_entry_updated')

  return mapRow(db.prepare(SELECT_ONE_QUERY).get(ticker) as WatchlistRow)
}

export function listWatchlist(db: Database.Database): WatchlistEntryRecord[] {
  const rows = db.prepare(LIST_QUERY).all() as WatchlistRow[]
  logger.debug({ count: rows.length }, 'watchlist_list')
  return rows.map(mapRow)
}

export function removeWatchlistEntry(db: Database.Database, ticker: string): void {
  const normalized = normalizeTicker(ticker)
  const result = db.prepare(DELETE_QUERY).run(normalized)

  if (result.changes === 0) {
    throw new ValidationError('ticker', 'not_found', `${normalized} is not on the watchlist`)
  }

  logger.info({ ticker: normalized }, 'watchlist_entry_removed')
}
