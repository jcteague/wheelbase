import { addDays, format, parseISO } from 'date-fns'

import { mapWithConcurrency } from '../concurrency'
import { etDateOf, isIsoDay } from '../core/trading-calendar'
import { logger as defaultLogger, type LoggerLike } from '../logger'
import { loadFinnhubApiKey } from './finnhub-credentials'
import { isNetworkError } from './integration-errors'

const API_URL = 'https://finnhub.io/api/v1/calendar/earnings'
// Failures are backed off briefly so a rate-limited or failing ticker is not
// re-hammered on every 60-second scheduler run against an exhausted quota.
const EARNINGS_FAILURE_TTL_MS = 5 * 60 * 1000
const EARNINGS_LOOKBACK_DAYS = 30
const EARNINGS_LOOKAHEAD_DAYS = 30
// One request per ticker against a 60 req/min free tier — the same 429 hazard the
// screener's quote and chain reads already cap for.
const EARNINGS_FETCH_CONCURRENCY = 4

/** A calendar we successfully read can only say "here it is" or "there isn't one" —
 *  `unavailable` is produced by the caller's catch, never by parsing a live body. */
export type EarningsCalendarRead =
  | { status: 'read'; next: string | null; last: string | null }
  | { status: 'unavailable' }

type ReadCalendar = Extract<EarningsCalendarRead, { status: 'read' }>

/** The invariants every ticker in one batch reads against, bundled so they are not
 *  threaded positionally through each layer of the fetch. */
type EarningsRequest = {
  apiKey: string
  now: Date
  lookaheadDays: number
  logger: LoggerLike
}

// Payload rows are unvalidated JSON: `date` is routinely null or a "TBD"
// placeholder, so it is only trusted after the ISO check in `selectEventDates`.
type CalendarRow = { date?: unknown }

// Successful answers are persisted by `services/earnings-dates.ts`, whose
// `checked_through` column is what keeps a shallow answer from satisfying a deeper
// question. Only failures are held in memory: a failure is not knowledge about the
// ticker, so it is never written to the DB, but it still must throttle retries.
const failureBackoff = new Map<string, number>()
let noApiKeyWarned = false

/** Clears the module's process-local state — the failure backoff and the
 *  warn-once latch for a missing API key. Test-only: nothing in production
 *  needs it now that successful answers live in `earnings_date`. */
export function resetEarningsFeedState(): void {
  failureBackoff.clear()
  noApiKeyWarned = false
}

/** The bounded ET window one batch reads against — the same bounds are sent to
 *  Finnhub and applied to the rows it answers with. */
function calendarWindow(
  now: Date,
  lookaheadDays: number
): { today: string; from: string; to: string } {
  const today = etDateOf(now)
  const parsed = parseISO(today)
  return {
    today,
    from: format(addDays(parsed, -EARNINGS_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    to: format(addDays(parsed, lookaheadDays), 'yyyy-MM-dd')
  }
}

function buildRequestUrl(ticker: string, { apiKey, now, lookaheadDays }: EarningsRequest): string {
  const { from, to } = calendarWindow(now, lookaheadDays)
  const params = new URLSearchParams({ symbol: ticker, from, to, token: apiKey })

  return `${API_URL}?${params.toString()}`
}

function selectEventDates(rows: CalendarRow[], now: Date, lookaheadDays: number): ReadCalendar {
  const { today, from, to } = calendarWindow(now, lookaheadDays)
  // Drop anything that isn't a real YYYY-MM-DD day so a null/TBD date can't
  // displace a valid event, and anything outside the window we asked for.
  const dates = rows
    .map((row) => row.date)
    .filter((date): date is string => typeof date === 'string' && isIsoDay(date))
    .filter((date) => date >= from && date <= to)
    .sort()

  return {
    status: 'read',
    next: dates.find((date) => date >= today) ?? null,
    last: dates.filter((date) => date < today).at(-1) ?? null
  }
}

type FailureCode = 'auth_failed' | 'rate_limited' | 'network_error' | 'unknown'

/** A non-2xx response is thrown carrying its status, which the per-ticker catch
 *  classifies into the code it warns with. */
function httpStatusError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

function httpStatusOf(error: unknown): number | null {
  if (!(error instanceof Error) || !('status' in error)) return null
  return typeof error.status === 'number' ? error.status : null
}

function failureCode(error: unknown): FailureCode {
  switch (httpStatusOf(error)) {
    case 401:
    case 403:
      return 'auth_failed'
    case 429:
      return 'rate_limited'
    default:
      return isNetworkError(error) ? 'network_error' : 'unknown'
  }
}

async function fetchCalendar(ticker: string, request: EarningsRequest): Promise<ReadCalendar> {
  const { logger, now } = request
  logger.debug({ ticker }, 'earnings_fetch_request')

  const response = await fetch(buildRequestUrl(ticker, request))
  if (!response.ok) {
    throw httpStatusError(response.status)
  }

  const body = (await response.json()) as { earningsCalendar?: unknown }
  if (!Array.isArray(body.earningsCalendar)) {
    throw new Error('Expected earningsCalendar array in Finnhub response')
  }

  return selectEventDates(body.earningsCalendar, now, request.lookaheadDays)
}

async function resolveTicker(
  ticker: string,
  request: EarningsRequest
): Promise<EarningsCalendarRead> {
  const { logger, now } = request

  const failedAt = failureBackoff.get(ticker)
  if (failedAt !== undefined && now.getTime() - failedAt < EARNINGS_FAILURE_TTL_MS) {
    logger.debug({ ticker }, 'earnings_failure_backoff_hit')
    return { status: 'unavailable' }
  }

  const lookup = await fetchCalendar(ticker, request)

  logger.debug(
    { ticker, next: lookup.next, last: lookup.last },
    lookup.next === null && lookup.last === null
      ? 'earnings_no_event_in_window'
      : 'earnings_fetch_result'
  )

  return lookup
}

/**
 * The earnings dates on either side of today per requested ticker — the next event
 * within `lookaheadDays`, and the most recent print inside the lookback window.
 *
 * Returns an entry for **every** requested ticker — a missing key is never a valid
 * outcome. Never rejects: a single ticker's failure is caught inside the mapped
 * callback, which is also what writes its backoff entry and logs the classified
 * failure code. `mapWithConcurrency` joins its workers with `Promise.all`, so an
 * escaping throw would take the whole batch down with it.
 */
export async function fetchEarningsCalendar(
  tickers: string[],
  opts: { now?: Date; logger?: LoggerLike; lookaheadDays?: number } = {}
): Promise<Record<string, EarningsCalendarRead>> {
  const { now = new Date(), logger = defaultLogger, lookaheadDays = EARNINGS_LOOKAHEAD_DAYS } = opts

  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))]
  if (uniqueTickers.length === 0) return {}

  const apiKey = loadFinnhubApiKey()
  if (apiKey === '') {
    if (!noApiKeyWarned) {
      logger.warn('earnings_fetch_no_api_key')
      noApiKeyWarned = true
    }
    // A missing key is a can't-ask, so every ticker is unavailable rather than absent.
    return Object.fromEntries(
      uniqueTickers.map((ticker): [string, EarningsCalendarRead] => [
        ticker,
        { status: 'unavailable' }
      ])
    )
  }

  const request: EarningsRequest = { apiKey, now, lookaheadDays, logger }
  const entries = await mapWithConcurrency(
    uniqueTickers,
    EARNINGS_FETCH_CONCURRENCY,
    async (ticker): Promise<[string, EarningsCalendarRead]> => {
      try {
        return [ticker, await resolveTicker(ticker, request)]
      } catch (error) {
        const code = failureCode(error)
        failureBackoff.set(ticker, now.getTime())
        logger.warn({ ticker, code, err: error }, 'earnings_fetch_failed')
        return [ticker, { status: 'unavailable' }]
      }
    }
  )

  return Object.fromEntries(entries)
}
