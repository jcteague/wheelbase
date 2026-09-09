// [US-70] earnings-dates — the read-through store over the Finnhub earnings
// calendar. The `earnings_date` table is the cache (the feed keeps no success
// cache of its own), so a fetch happens only when the stored row cannot answer
// this caller's question. `unavailable` is produced here at read time and never
// persisted: a failed request is not knowledge about the ticker.
import type Database from 'better-sqlite3'
import { addDays, addHours, differenceInCalendarDays, format, isAfter, parseISO } from 'date-fns'
import { etDateOf } from '../core/trading-calendar'
import type { EarningsLookup } from '../core/screener'
import { fakeEarningsCalendarFetcher } from '../integrations/fake-earnings'
import { fetchEarningsCalendar, type EarningsCalendarRead } from '../integrations/finnhub-earnings'
import { logger } from '../logger'

const EARNINGS_ROW_QUERY = `
  SELECT ticker, next_earnings, last_earnings, checked_through, checked_at
  FROM earnings_date
  WHERE ticker = ?
`

const UPSERT_EARNINGS_ROW = `
  INSERT INTO earnings_date (ticker, next_earnings, last_earnings, checked_through, checked_at, source)
  VALUES (?, ?, ?, ?, ?, 'finnhub')
  ON CONFLICT (ticker) DO UPDATE SET
    next_earnings   = excluded.next_earnings,
    last_earnings   = excluded.last_earnings,
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

export type EarningsCalendarFetcher = (
  tickers: string[],
  opts: { now: Date; lookaheadDays: number }
) => Promise<Record<string, EarningsCalendarRead>>

export type EarningsCalendarKnowledge = {
  next: EarningsLookup
  last: string | null | undefined
}

export type GetEarningsOptions = {
  /** The furthest date the caller needs answered — a date, not a day count. The
   *  DTE-window conversion belongs to the caller (`services/screener.ts`). */
  horizon: Date
  now: Date
  fetch?: EarningsCalendarFetcher
}

/** The live Finnhub feed, or the offline fixture fetcher when an e2e run has armed it.
 *  Resolved per call rather than at import time so a test seam set after module load
 *  still takes effect, and so production pays nothing for it. */
function defaultFetcher(): EarningsCalendarFetcher {
  return fakeEarningsCalendarFetcher() ?? fetchEarningsCalendar
}

type EarningsRow = {
  ticker: string
  next_earnings: string | null
  last_earnings: string | null
  checked_through: string
  checked_at: string
}

type KnownCalendar = Extract<EarningsCalendarRead, { status: 'read' }>

/**
 * The Eastern day `days` after the Eastern day an instant falls on.
 *
 * Every stored date came out of the feed bucketed by Eastern day, so every comparison
 * against one has to use the same basis. A host-local midnight is a *different* day
 * for part of every evening, which on a UTC host silently rejected each print-day read
 * as already-past and threw away the last-print knowledge that came with it.
 */
function etDayPlus(instant: Date, days: number): string {
  const today = etDateOf(instant)
  if (today === '' || days === 0) return today
  return format(addDays(parseISO(today), days), 'yyyy-MM-dd')
}

/**
 * How long a row's answer stands before it is worth re-asking. A date that has already
 * passed tells us nothing about the next print, and a near-term one can be revised
 * across a threshold that matters, so both get the short interval; anything else rides
 * the weekly backstop.
 */
function refreshIntervalHours(row: EarningsRow, now: Date): number {
  if (row.next_earnings === null) return STALE_AFTER_HOURS

  // Near-term subsumes already-passed: both are strictly before the horizon day.
  const nearTerm = row.next_earnings < etDayPlus(now, NEAR_EARNINGS_DAYS)
  return nearTerm ? MIN_REFETCH_HOURS : STALE_AFTER_HOURS
}

/** A ticker is refetched when, and only when, one of these holds. */
function needsRefresh(row: EarningsRow | undefined, horizon: Date, now: Date): boolean {
  // 1. never successfully checked
  if (row === undefined) return true
  // 2. a null date only answers questions no deeper than it looked — a coverage
  //    question, not a freshness one, so no interval gates it
  if (row.next_earnings === null && row.checked_through < etDateOf(horizon)) return true
  // 3. the answer has stood long enough to be worth re-asking. This subsumes the
  //    already-passed case: a stale print is re-read on the short interval rather than
  //    on every call, which is what keeps a 60-second scheduler off the rate limit.
  return isAfter(now, addHours(parseISO(row.checked_at), refreshIntervalHours(row, now)))
}

/** Whether a calendar verdict still answers the caller's next-print question. */
function answersNextPrint(lookup: KnownCalendar, now: Date): boolean {
  return lookup.next === null || lookup.next >= etDateOf(now)
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
function storedVerdict(row: EarningsRow, horizon: Date, now: Date): KnownCalendar | null {
  if (row.next_earnings === null) {
    return row.checked_through < etDateOf(horizon)
      ? null
      : { status: 'read', next: null, last: row.last_earnings }
  }
  const lookup: KnownCalendar = {
    status: 'read',
    next: row.next_earnings,
    last: row.last_earnings
  }
  return answersNextPrint(lookup, now) ? lookup : null
}

/**
 * The most recent print the row evidences, independent of whether it can still answer
 * the *next*-print question.
 *
 * A `next_earnings` that has already passed is exactly that: a print we know happened.
 * Dropping it — which is what returning only `storedVerdict`'s `last` did — left the
 * freshness engine judging a pre-print reading on age alone, so a stale high IVR read
 * as usable on the morning after the print. Recovering it costs no fetch.
 */
function storedLastPrint(row: EarningsRow, now: Date): string | null {
  const today = etDateOf(now)
  const passed = row.next_earnings !== null && row.next_earnings < today ? row.next_earnings : null
  if (passed === null) return row.last_earnings
  if (row.last_earnings === null) return passed
  return passed > row.last_earnings ? passed : row.last_earnings
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
  entries: Array<[string, KnownCalendar]>,
  checkedThrough: string,
  checkedAt: string
): void {
  try {
    const upsert = db.prepare(UPSERT_EARNINGS_ROW)

    db.transaction(() => {
      for (const [ticker, lookup] of entries) {
        upsert.run(ticker, lookup.next, lookup.last, checkedThrough, checkedAt)
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
): Promise<Map<string, EarningsCalendarRead>> {
  if (tickers.length === 0) return new Map()

  const fetched = await fetch(tickers, {
    now,
    lookaheadDays: differenceInCalendarDays(horizon, now)
  })

  const known = tickers.flatMap((ticker): Array<[string, KnownCalendar]> => {
    const lookup = fetched[ticker]
    return lookup === undefined || lookup.status === 'unavailable' ? [] : [[ticker, lookup]]
  })
  if (known.length > 0) {
    persistRows(db, known, format(horizon, 'yyyy-MM-dd'), now.toISOString())
  }

  return new Map(
    tickers.map((ticker): [string, EarningsCalendarRead] => [
      ticker,
      fetched[ticker] ?? { status: 'unavailable' }
    ])
  )
}

function nextLookup(calendar: KnownCalendar): EarningsLookup {
  return calendar.next === null ? { status: 'none' } : { status: 'found', date: calendar.next }
}

/** Shared cache/read-through path for next earnings and IVR last-print knowledge. */
export async function getEarningsCalendar(
  db: Database.Database,
  tickers: string[],
  { horizon, now, fetch = defaultFetcher() }: GetEarningsOptions
): Promise<Map<string, EarningsCalendarKnowledge>> {
  const requested = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))]
  if (requested.length === 0) return new Map()

  const rows = readRows(db, requested)
  const stale = requested.filter((ticker) => needsRefresh(rows.get(ticker), horizon, now))
  const refreshed = await refresh(db, stale, { horizon, now, fetch })

  logger.debug(
    { tickers: requested, dbHits: requested.length - stale.length, fetched: stale.length },
    'earnings_date_read'
  )

  // Resolve each ticker independently. A successful refresh wins, while an unavailable
  // refresh may retain the prior next date but must not reuse its last-print knowledge.
  return new Map(
    requested.map((ticker): [string, EarningsCalendarKnowledge] => {
      const learned = refreshed.get(ticker)
      if (learned?.status === 'read' && answersNextPrint(learned, now)) {
        return [ticker, { next: nextLookup(learned), last: learned.last }]
      }

      const row = rows.get(ticker)
      const fallback = row === undefined ? null : storedVerdict(row, horizon, now)
      // `learned` is present for exactly the tickers this run refreshed, so its
      // presence here means the refresh failed and its stored history is suspect.
      return [
        ticker,
        {
          next: fallback === null ? { status: 'unavailable' } : nextLookup(fallback),
          last: learned !== undefined || row === undefined ? undefined : storedLastPrint(row, now)
        }
      ]
    })
  )
}

/** Existing next-only contract, projected from the shared resolver. */
export async function getEarnings(
  db: Database.Database,
  tickers: string[],
  options: GetEarningsOptions
): Promise<Map<string, EarningsLookup>> {
  const calendar = await getEarningsCalendar(db, tickers, options)
  return new Map([...calendar].map(([ticker, knowledge]) => [ticker, knowledge.next]))
}
