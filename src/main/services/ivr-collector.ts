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
  sleep(ms: number): Promise<void>
}

type CollectIVRSnapshotsInput = {
  db: Database.Database
  brokerProvider: BrokerProvider
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: Clock
}

const ACTIVE_UNDERLYINGS_QUERY = `
  SELECT ticker
  FROM positions
  WHERE status != 'CLOSED'
`

const DEFAULT_CLOCK: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}

function isTradingDay(now: Date, session: MarketStatus['session']): boolean {
  if (session !== 'closed') return true

  const day = now.getUTCDay()
  return day !== 0 && day !== 6
}

function listActiveUnderlyings(db: Database.Database): string[] {
  const rows = db.prepare(ACTIVE_UNDERLYINGS_QUERY).all() as Array<{ ticker: string }>

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

async function sleepBetweenRequests(clock: Clock, index: number, total: number): Promise<void> {
  if (index < total - 1) {
    await clock.sleep(1000)
  }
}

export async function collectIVRSnapshots({
  db,
  brokerProvider,
  logger = defaultLogger,
  fetchIvr = fetchIVR,
  clock = DEFAULT_CLOCK
}: CollectIVRSnapshotsInput): Promise<CollectIVRSnapshotsResult> {
  logger.debug('ivr_collection_market_status_start')
  const marketStatus = await brokerProvider.getMarketStatus()

  if (!isTradingDay(clock.now(), marketStatus.session)) {
    logger.info({ marketStatus }, 'Skipping IVR collection because market is closed')
    return {
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_closed'
    }
  }

  const underlyings = listActiveUnderlyings(db)
  logger.debug({ underlyings }, 'ivr_collection_targets_loaded')

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  for (const [index, ticker] of underlyings.entries()) {
    const result = await fetchIvr(ticker)

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

    await sleepBetweenRequests(clock, index, underlyings.length)
  }

  logger.info({ successCount, errorCount, skippedCount }, 'IVR snapshot collection completed')

  return {
    successCount,
    errorCount,
    skippedCount,
    skippedReason: null
  }
}
