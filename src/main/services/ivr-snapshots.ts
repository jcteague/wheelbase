// [US-65] ivr-snapshots — read path for the latest IVR per underlying. Write-only
// collection lives in `ivr-collector.ts`; this module never writes.
import type Database from 'better-sqlite3'
import { assessIvRank, type AssessedIvRank } from '../core/ivr-freshness'
import type { TradingCalendar } from '../core/trading-calendar'
import type { IvRank } from '../core/screener'
import { logger } from '../logger'

const LATEST_IVR_QUERY = `
  SELECT ivr, observed_at
  FROM ivr_snapshot
  WHERE underlying = ?
  ORDER BY observed_at DESC
  LIMIT 1
`

/**
 * Latest observed IVR per requested underlying, keyed by upper-cased ticker, in the
 * engine's `IvRank` shape. `observedAt` is when *we* fetched the value, not a
 * Barchart-reported observation time, so it is an upper bound on freshness rather
 * than a guarantee. Underlyings with no snapshot are absent from the map — never
 * null or '0', so callers surface "unknown" rather than a fabricated zero.
 */
export function getLatestIvrByUnderlying(
  db: Database.Database,
  underlyings: string[]
): Map<string, IvRank> {
  if (underlyings.length === 0) return new Map()

  const statement = db.prepare(LATEST_IVR_QUERY)
  const entries = underlyings.flatMap((underlying): Array<[string, IvRank]> => {
    const ticker = underlying.toUpperCase()
    const row = statement.get(ticker) as { ivr: string; observed_at: string } | undefined
    return row === undefined ? [] : [[ticker, { value: row.ivr, observedAt: row.observed_at }]]
  })

  const ivrs = new Map(entries)

  logger.debug({ underlyings, hitCount: ivrs.size }, 'ivr_snapshot_read')
  return ivrs
}

export type AssessedIvrOptions = {
  now: Date
  lastEarnings: ReadonlyMap<string, string | null | undefined>
  calendar: TradingCalendar
}

/**
 * Reads persisted IVR snapshots only. Assessment is kept here at the service
 * boundary so the core remains pure and no screener/watchlist caller can
 * accidentally trigger a fresh scrape or earnings request per row.
 *
 * A ticker we hold a row for but cannot assess is logged rather than passed through
 * as a silent `null`: that combination means a corrupt value or a calendar that
 * cannot reach the observation, both of which are degradation the operator should
 * see, and both of which look identical to "no snapshot" on screen.
 */
export function getAssessedIvrByUnderlying(
  db: Database.Database,
  underlyings: string[],
  { now, lastEarnings, calendar }: AssessedIvrOptions
): Map<string, AssessedIvRank | null> {
  const tickers = [...new Set(underlyings.map((ticker) => ticker.trim().toUpperCase()))]
  if (tickers.length === 0) return new Map()

  const raw = readSnapshotsOrEmpty(db, tickers)
  logger.debug({ tickers, hitCount: raw.size }, 'ivr_assessment_read')

  return new Map(
    tickers.map((ticker): [string, AssessedIvRank | null] => {
      const reading = raw.get(ticker)
      if (reading === undefined) return [ticker, null]

      const assessment = assessIvRank(reading, {
        now,
        calendar,
        lastEarnings: lastEarnings.get(ticker)
      })
      if (assessment.status === 'unreadable') {
        logger.warn({ ticker, reading }, 'ivr_assessment_unreadable_snapshot')
      }
      return [ticker, assessment.status === 'assessed' ? assessment.reading : null]
    })
  )
}

/** The snapshot read degrades to "unknown for everyone": IVR is display-only here,
 *  so losing it must not cost the caller its whole batch. */
function readSnapshotsOrEmpty(db: Database.Database, tickers: string[]): Map<string, IvRank> {
  try {
    return getLatestIvrByUnderlying(db, tickers)
  } catch (err) {
    logger.warn({ err, tickers }, 'ivr_assessment_snapshot_read_failed')
    return new Map()
  }
}
