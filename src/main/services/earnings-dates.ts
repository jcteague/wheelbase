// [US-70] earnings-dates — the read-through store over the Finnhub earnings
// calendar. The `earnings_date` table is the cache (the feed keeps no success
// cache of its own), so a fetch happens only when the stored row cannot answer
// this caller's question. `unavailable` is produced here at read time and never
// persisted: a failed request is not knowledge about the ticker.
import type Database from 'better-sqlite3'
import {
  addDays,
  addHours,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay
} from 'date-fns'
import type { EarningsLookup } from '../core/screener'
import { fakeEarningsFetcher } from '../integrations/fake-earnings'
import { fetchNextEarnings } from '../integrations/finnhub-earnings'
import { logger } from '../logger'

const EARNINGS_ROW_QUERY = `
  SELECT ticker, next_earnings, checked_through, checked_at
  FROM earnings_date
  WHERE ticker = ?
`

const UPSERT_EARNINGS_ROW = `
  INSERT INTO earnings_date (ticker, next_earnings, checked_through, checked_at, source)
  VALUES (?, ?, ?, ?, 'finnhub')
  ON CONFLICT (ticker) DO UPDATE SET
    next_earnings   = excluded.next_earnings,
    checked_through = excluded.checked_through,
    checked_at      = excluded.checked_at,
    source          = excluded.source
`

/** Finnhub dates are estimates that move, so a row is re-read even when its date is
 *  still in the future — the revision backstop. A distant date can drift a long way
 *  without changing any verdict, so weekly is enough for it. */
const STALE_AFTER_HOURS = 7 * 24

/**
 * The floor on how often one ticker is re-asked, and the interval for any row whose
 * answer is close enough to matter.
 *
 * Two jobs. It bounds request volume: the feed no longer keeps a success cache, so
 * without a floor a row whose print has just passed would re-fetch on every 60-second
 * alert tick — thousands of requests per ticker against a 60 req/min free tier. And it
 * keeps US-56 timely: that rule fires on a 10-day threshold, so a revision inside
 * ~2 weeks can move the answer across it, and a weekly backstop would miss the window
 * entirely. 12 hours restores the cadence US-56 had before the store replaced its
 * in-memory TTL.
 */
const MIN_REFETCH_HOURS = 12

/** Inside this many days, a stored date is re-read on `MIN_REFETCH_HOURS` rather than
 *  the weekly backstop — comfortably wider than US-56's 10-day alert threshold. */
const NEAR_EARNINGS_DAYS = 14

export type EarningsFetcher = (
  tickers: string[],
  opts: { now: Date; lookaheadDays: number }
) => Promise<Record<string, EarningsLookup>>

export type GetEarningsOptions = {
  /** The furthest date the caller needs answered — a date, not a day count. The
   *  DTE-window conversion belongs to the caller (`services/screener.ts`). */
  horizon: Date
  now: Date
  fetch?: EarningsFetcher
}

/** The live Finnhub feed, or the offline fixture fetcher when an e2e run has armed it.
 *  Resolved per call rather than at import time so a test seam set after module load
 *  still takes effect, and so production pays nothing for it. */
function defaultFetcher(): EarningsFetcher {
  return fakeEarningsFetcher() ?? fetchNextEarnings
}

type EarningsRow = {
  ticker: string
  next_earnings: string | null
  checked_through: string
  checked_at: string
}

/** Anything the feed positively knew — the only two states worth persisting. */
type KnownLookup = Exclude<EarningsLookup, { status: 'unavailable' }>

/**
 * How long a row's answer stands before it is worth re-asking. A date that has already
 * passed tells us nothing about the next print, and a near-term one can be revised
 * across a threshold that matters, so both get the short interval; anything else rides
 * the weekly backstop.
 */
function refreshIntervalHours(row: EarningsRow, now: Date): number {
  if (row.next_earnings === null) return STALE_AFTER_HOURS

  const earnings = parseISO(row.next_earnings)
  const alreadyPassed = isBefore(earnings, startOfDay(now))
  const nearTerm = isBefore(earnings, addDays(startOfDay(now), NEAR_EARNINGS_DAYS))

  return alreadyPassed || nearTerm ? MIN_REFETCH_HOURS : STALE_AFTER_HOURS
}

/** A ticker is refetched when, and only when, one of these holds. */
function needsRefresh(row: EarningsRow | undefined, horizon: Date, now: Date): boolean {
  // 1. never successfully checked
  if (row === undefined) return true
  // 2. a null date only answers questions no deeper than it looked — a coverage
  //    question, not a freshness one, so no interval gates it
  if (row.next_earnings === null && isBefore(parseISO(row.checked_through), startOfDay(horizon)))
    return true
  // 3. the answer has stood long enough to be worth re-asking. This subsumes the
  //    already-passed case: a stale print is re-read on the short interval rather than
  //    on every call, which is what keeps a 60-second scheduler off the rate limit.
  return isAfter(now, addHours(parseISO(row.checked_at), refreshIntervalHours(row, now)))
}

/**
 * Whether a verdict actually answers "when is the next earnings print?".
 *
 * A `found` date that has **already happened** does not. The feed returns one as an
 * ordinary outcome — its window opens at `now - EARNINGS_LOOKBACK_DAYS` and
 * `selectEventDate` falls back to the latest past date — so for the week after every
 * print this is the normal reply, and on the alert path's shallow horizon it is the
 * dominant one, since the next print sits a quarter away. Passed through, the engine
 * reads a past date as "history, not gap risk", scores it `clear`, and hands the ticker a
 * rank number with no badge and no exclusion — while the real next print may land inside
 * the expiry. That is the silent pass this story exists to prevent.
 *
 * Applied to the fetched value and the stored row alike: the invariant belongs to the
 * verdict, not to the path it arrived by, and gating only one path had the two disagree
 * on identical data.
 */
function answersNextPrint(lookup: KnownLookup, now: Date): boolean {
  return lookup.status === 'none' || !isBefore(parseISO(lookup.date), startOfDay(now))
}

/**
 * What a stored row can honestly tell *this* caller, or `null` when it cannot answer at
 * all.
 *
 * Deliberately not the negation of `needsRefresh`. Being merely time-stale does not
 * disqualify a row — a future date we read a week ago is the best knowledge we have and
 * is exactly what should carry the trader through an outage. Two rows are different:
 * they look like answers and are not.
 *
 *  - A print that has already happened — see `answersNextPrint`.
 *  - A `NULL` that only looked as far as `checked_through` cannot speak for a deeper
 *    horizon. Served as `none`, it would assert "calendar read, no event" over a window
 *    it never examined, collapsing the outage-vs-empty-calendar distinction.
 *
 * Both fall through to `unavailable`, which is honest and carries the tier-1 demotion.
 */
function storedVerdict(row: EarningsRow, horizon: Date, now: Date): KnownLookup | null {
  if (row.next_earnings === null) {
    return isBefore(parseISO(row.checked_through), startOfDay(horizon)) ? null : { status: 'none' }
  }
  const lookup: KnownLookup = { status: 'found', date: row.next_earnings }
  return answersNextPrint(lookup, now) ? lookup : null
}

/** Degrades to "no rows" on a read failure so the run refetches every ticker
 *  rather than losing the whole screen to a locked database. */
function readRows(db: Database.Database, tickers: string[]): Map<string, EarningsRow> {
  try {
    const statement = db.prepare(EARNINGS_ROW_QUERY)
    return new Map(
      tickers.flatMap((ticker): Array<[string, EarningsRow]> => {
        const row = statement.get(ticker) as EarningsRow | undefined
        return row === undefined ? [] : [[ticker, row]]
      })
    )
  } catch (err) {
    logger.warn({ err, tickers }, 'earnings_date_read_failed')
    return new Map()
  }
}

/** Caching is a side benefit, never the point of the call: a write failure is logged and
 *  swallowed so a locked database cannot turn a completely successful fetch into "no
 *  earnings for anyone" at the caller's degrade path. */
function persistRows(
  db: Database.Database,
  entries: Array<[string, KnownLookup]>,
  checkedThrough: string,
  checkedAt: string
): void {
  try {
    const upsert = db.prepare(UPSERT_EARNINGS_ROW)

    db.transaction(() => {
      for (const [ticker, lookup] of entries) {
        upsert.run(
          ticker,
          lookup.status === 'found' ? lookup.date : null,
          checkedThrough,
          checkedAt
        )
      }
    })()
  } catch (err) {
    logger.warn({ err, tickers: entries.map(([ticker]) => ticker) }, 'earnings_date_write_failed')
  }
}

/**
 * Fetches the tickers no stored row can answer and writes back everything the feed
 * positively knew, in one transaction. A ticker whose fetch failed comes back
 * `{ status: 'unavailable' }` and leaves no row, so the next run tries again.
 */
async function refresh(
  db: Database.Database,
  tickers: string[],
  { horizon, now, fetch }: Required<GetEarningsOptions>
): Promise<Map<string, EarningsLookup>> {
  if (tickers.length === 0) return new Map()

  const fetched = await fetch(tickers, {
    now,
    lookaheadDays: differenceInCalendarDays(horizon, now)
  })

  const known = tickers.flatMap((ticker): Array<[string, KnownLookup]> => {
    const lookup = fetched[ticker]
    return lookup === undefined || lookup.status === 'unavailable' ? [] : [[ticker, lookup]]
  })
  if (known.length > 0) {
    persistRows(db, known, format(horizon, 'yyyy-MM-dd'), now.toISOString())
  }

  return new Map(
    tickers.map((ticker): [string, EarningsLookup] => [
      ticker,
      fetched[ticker] ?? { status: 'unavailable' }
    ])
  )
}

/**
 * What we know about each requested ticker's next earnings date through `horizon`,
 * keyed by upper-cased ticker. Rows that can still answer the question are served
 * from the table with no HTTP call; the rest are refreshed through the feed.
 */
export async function getEarnings(
  db: Database.Database,
  tickers: string[],
  { horizon, now, fetch = defaultFetcher() }: GetEarningsOptions
): Promise<Map<string, EarningsLookup>> {
  const requested = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))]
  if (requested.length === 0) return new Map()

  const rows = readRows(db, requested)
  const stale = requested.filter((ticker) => needsRefresh(rows.get(ticker), horizon, now))
  const refreshed = await refresh(db, stale, { horizon, now, fetch })

  logger.debug(
    { tickers: requested, dbHits: requested.length - stale.length, fetched: stale.length },
    'earnings_date_read'
  )

  // Resolved per requested ticker rather than by merging partial maps, so every ticker
  // gets exactly one verdict and none can be dropped. A refresh wins when it learned
  // something; otherwise the row answers if it honestly can — the store exists to carry
  // the trader through an outage — and failing that the honest answer is `unavailable`.
  return new Map(
    requested.map((ticker): [string, EarningsLookup] => {
      const learned = refreshed.get(ticker)
      if (
        learned !== undefined &&
        learned.status !== 'unavailable' &&
        answersNextPrint(learned, now)
      ) {
        return [ticker, learned]
      }

      const row = rows.get(ticker)
      const fallback = row === undefined ? null : storedVerdict(row, horizon, now)
      return [ticker, fallback ?? { status: 'unavailable' }]
    })
  )
}
