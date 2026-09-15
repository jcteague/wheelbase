import Database from 'better-sqlite3'
import { addDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { Logger } from 'pino'
import { fetchIVR, type IVRResult } from '../integrations/barchart-ivr-scraper'
import { etDateOf, getTradingSession } from '../core/trading-calendar'
import type { MarketCalendarSource } from '../integrations/market-data-provider'
import { readTradingCalendar, refreshTradingCalendar } from './trading-calendar-store'
import { logger as defaultLogger } from '../logger'

export const IVR_COLLECT_JOB_NAME = 'ivr-collect'

export type CollectIVRSnapshotsResult = {
  successCount: number
  errorCount: number
  skippedCount: number
  skippedReason: 'market_closed' | null
}

type Clock = {
  now(): Date
}

type CollectIVRSnapshotsInput = {
  db: Database.Database
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: Clock
  /** Refreshes the cached exchange calendar before the run reads it. The market-data
   *  factory always constructs, so in the app this is always supplied; absence is a
   *  test shape, and the run then uses whatever is already cached. */
  marketDataProvider?: MarketCalendarSource
  /** Aborts the run at the next ticker boundary — set by the app's before-quit hook so
   *  a watchlist-sized batch does not stall shutdown for the scheduler's drain timeout. */
  signal?: AbortSignal
}

const COLLECTION_TARGETS_QUERY = `
  SELECT ticker
  FROM positions
  WHERE status != 'CLOSED'
  UNION
  SELECT ticker
  FROM watchlist
`

const DEFAULT_CLOCK: Clock = {
  now: () => new Date()
}

function listCollectionTargets(db: Database.Database): string[] {
  const rows = db.prepare(COLLECTION_TARGETS_QUERY).all() as Array<{ ticker: string }>

  return [...new Set(rows.map((row) => row.ticker.toUpperCase()))].sort((a, b) =>
    a.localeCompare(b)
  )
}

function utcDayBounds(isoTimestamp: string): { start: string; end: string } {
  const observedAt = parseISO(isoTimestamp)
  const dayStart = new Date(
    Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), observedAt.getUTCDate())
  )

  return {
    start: dayStart.toISOString(),
    end: addDays(dayStart, 1).toISOString()
  }
}

function persistSnapshot(
  db: Database.Database,
  result: Extract<IVRResult, { status: 'ok' }>
): void {
  const { start, end } = utcDayBounds(result.data.observedAt)
  const deleteExisting = db.prepare(
    `DELETE FROM ivr_snapshot
     WHERE underlying = ?
       AND observed_at >= ?
       AND observed_at < ?`
  )
  const insertSnapshot = db.prepare(
    `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  db.transaction(() => {
    deleteExisting.run(result.data.ticker, start, end)
    insertSnapshot.run(
      result.data.ticker,
      result.data.observedAt,
      new Decimal(result.data.ivr).toFixed(1),
      result.data.ivp === undefined ? null : new Decimal(result.data.ivp).toFixed(1),
      result.data.iv30 === undefined ? null : new Decimal(result.data.iv30).toString(),
      result.data.source
    )
  })()
}

export async function collectIVRSnapshots({
  db,
  logger = defaultLogger,
  fetchIvr = fetchIVR,
  clock = DEFAULT_CLOCK,
  marketDataProvider,
  signal
}: CollectIVRSnapshotsInput): Promise<CollectIVRSnapshotsResult> {
  const now = clock.now()
  // Best effort, and deliberately before the read: a provider outage must leave the
  // batch to run on whatever is already cached rather than skip it.
  if (marketDataProvider !== undefined) {
    await refreshTradingCalendar(db, marketDataProvider, now)
  }

  const etDate = etDateOf(now)
  const session = getTradingSession(readTradingCalendar(db, now), etDate)
  logger.debug({ etDate, calendarStatus: session.status }, 'ivr_collection_calendar_verdict')

  if (session.status === 'unavailable') {
    logger.warn({ etDate }, 'IVR collection calendar coverage unavailable; continuing best effort')
  }

  if (session.status === 'closed') {
    logger.info({ etDate }, 'Skipping IVR collection because market is closed')
    return {
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_closed'
    }
  }

  const underlyings = listCollectionTargets(db)
  logger.debug({ underlyings }, 'ivr_collection_targets_loaded')

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  // Request pacing is the scraper's job: `fetchIVR` awaits its own 1 req/s rate
  // limiter before every Barchart call, so the loop adds no sleep of its own.
  for (const ticker of underlyings) {
    if (signal?.aborted) {
      logger.info(
        { successCount, errorCount, skippedCount, remaining: underlyings.length },
        'IVR snapshot collection aborted before completion'
      )
      break
    }

    // Per-ticker isolation is mandatory for the fetch: `fetchIvr` rejects on a
    // non-JSON response body, and an unguarded throw would abort the run and lose
    // every ticker after the offending one. `persistSnapshot` stays OUTSIDE the
    // try on purpose — a DB write failing is systemic (read-only file, bad
    // migration), and downgrading it to per-ticker warns would report a broken
    // run as "completed with N errors".
    let result: IVRResult
    try {
      result = await fetchIvr(ticker)
    } catch (err) {
      // `err`, not `error`: pino's Error serializer is bound to the `err` key.
      errorCount++
      logger.warn({ ticker, err }, 'IVR collection threw for ticker')
      continue
    }

    switch (result.status) {
      case 'ok':
        persistSnapshot(db, result)
        successCount++
        break
      case 'not_available':
        skippedCount++
        logger.info({ ticker }, 'ticker not covered by Barchart IVR')
        break
      case 'parse_error':
      case 'network_error':
      case 'rate_limited':
      case 'invalid_input':
        errorCount++
        logger.warn({ ticker, error: result.error }, 'IVR collection failed for ticker')
        break
    }
  }

  logger.info({ successCount, errorCount, skippedCount }, 'IVR snapshot collection completed')

  return {
    successCount,
    errorCount,
    skippedCount,
    skippedReason: null
  }
}
