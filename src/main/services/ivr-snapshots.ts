// [US-65] ivr-snapshots — read path for the latest IVR per underlying. Write-only
// collection lives in `ivr-collector.ts`; this module never writes.
import type Database from 'better-sqlite3'
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
