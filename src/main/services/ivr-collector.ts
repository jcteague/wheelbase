import Database from 'better-sqlite3'
import { addDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { Logger } from 'pino'
import { fetchIVR, type IVRResult } from '../integrations/barchart-ivr-scraper'
import type { BrokerProvider, MarketStatus } from '../integrations/broker-provider'
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
  /** null when no broker is configured — Barchart needs none, so collection proceeds
   *  on the assumption that today is a trading day. */
  brokerProvider: BrokerProvider | null
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: Clock
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

function isTradingDay(now: Date, session: MarketStatus['session']): boolean {
  if (session !== 'closed') return true

  const day = now.getUTCDay()
  return day !== 0 && day !== 6
}

/** Boundary I/O degrades rather than rejects (CLAUDE.md batch-job rule): with no
 *  broker configured or the clock endpoint down, the run assumes a trading day —
 *  Barchart itself needs no broker, and a wasted weekend fetch beats a lost batch. */
async function fetchMarketStatusOrNull(
  brokerProvider: BrokerProvider | null,
  logger: Pick<Logger, 'warn' | 'debug'>
): Promise<MarketStatus | null> {
  if (brokerProvider === null) {
    logger.debug('ivr_collection_no_broker_assuming_trading_day')
    return null
  }

  try {
    return await brokerProvider.getMarketStatus()
  } catch (err) {
    logger.warn({ err }, 'IVR collection could not read market status; assuming trading day')
    return null
  }
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
  brokerProvider,
  logger = defaultLogger,
  fetchIvr = fetchIVR,
  clock = DEFAULT_CLOCK,
  signal
}: CollectIVRSnapshotsInput): Promise<CollectIVRSnapshotsResult> {
  logger.debug('ivr_collection_market_status_start')
  const marketStatus = await fetchMarketStatusOrNull(brokerProvider, logger)

  if (marketStatus !== null && !isTradingDay(clock.now(), marketStatus.session)) {
    logger.info({ marketStatus }, 'Skipping IVR collection because market is closed')
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
