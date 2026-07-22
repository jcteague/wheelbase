// [US-63] Watchlist service — add / list / remove
import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import type { WatchlistAddPayload, WatchlistEntryRecord } from '../schemas'

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

export function addWatchlistEntry(
  db: Database.Database,
  payload: WatchlistAddPayload
): WatchlistEntryRecord {
  const ticker = normalizeTicker(payload.ticker)

  if (db.prepare(SELECT_EXISTS_QUERY).get(ticker)) {
    throw new ValidationError('ticker', 'duplicate', `${ticker} is already on the watchlist`)
  }

  const notes = payload.notes ?? null
  const ownBelowPrice =
    payload.ownBelowPrice == null ? null : new Decimal(payload.ownBelowPrice).toFixed(4)
  const ivrTrigger = payload.ivrTrigger ?? null
  const addedAt = new Date().toISOString()

  logger.debug({ ticker, ownBelowPrice, ivrTrigger }, 'watchlist_add_input')

  db.prepare(INSERT_QUERY).run(
    ticker,
    notes,
    ownBelowPrice,
    ivrTrigger,
    payload.postEarningsOnly ? 1 : 0,
    payload.coreHolding ? 1 : 0,
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
