import { addDays, format } from 'date-fns'

import { mapWithConcurrency } from '../concurrency'
import type { EarningsLookup } from '../core/screener'
import { logger as defaultLogger, type LoggerLike } from '../logger'
import { loadFinnhubApiKey } from './finnhub-credentials'
import { isNetworkError } from './integration-errors'

const API_URL = 'https://finnhub.io/api/v1/calendar/earnings'
// Failures are backed off briefly so a rate-limited or failing ticker is not
// re-hammered on every 60-second scheduler run against an exhausted quota.
const EARNINGS_FAILURE_TTL_MS = 5 * 60 * 1000
const EARNINGS_LOOKBACK_DAYS = 7
const EARNINGS_LOOKAHEAD_DAYS = 30
// One request per ticker against a 60 req/min free tier — the same 429 hazard the
// screener's quote and chain reads already cap for.
const EARNINGS_FETCH_CONCURRENCY = 4
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The engine owns `EarningsLookup` — it is the shape `core/screener.ts` consumes, and
// the engine must not import from `integrations/`. Re-exported here so callers of the
// feed can name its return type without reaching past it.
export type { EarningsLookup }

/** A calendar we successfully read can only say "here it is" or "there isn't one" —
 *  `unavailable` is produced by the caller's catch, never by parsing a live body. */
type ReadCalendar = Exclude<EarningsLookup, { status: 'unavailable' }>

/** The invariants every ticker in one batch reads against, bundled so they are not
 *  threaded positionally through each layer of the fetch. */
type EarningsRequest = {
  apiKey: string
  now: Date
  lookaheadDays: number
  logger: LoggerLike
}

// Payload rows are unvalidated JSON: `date` is routinely null or a "TBD"
// placeholder, so it is only trusted after the ISO check in `selectEventDate`.
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

function buildRequestUrl(ticker: string, { apiKey, now, lookaheadDays }: EarningsRequest): string {
  const params = new URLSearchParams({
    symbol: ticker,
    from: format(addDays(now, -EARNINGS_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    to: format(addDays(now, lookaheadDays), 'yyyy-MM-dd'),
    token: apiKey
  })

  return `${API_URL}?${params.toString()}`
}

function selectEventDate(rows: CalendarRow[], now: Date): ReadCalendar {
  const today = format(now, 'yyyy-MM-dd')
  // Drop anything that isn't a YYYY-MM-DD string so a null/TBD date can't
  // displace a valid event.
  const dates = rows
    .map((row) => row.date)
    .filter((date): date is string => typeof date === 'string' && ISO_DATE_RE.test(date))
    .sort()
  const date = dates.find((candidate) => candidate >= today) ?? dates.at(-1)

  return date === undefined ? { status: 'none' } : { status: 'found', date }
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

  return selectEventDate(body.earningsCalendar, now)
}

async function resolveTicker(ticker: string, request: EarningsRequest): Promise<EarningsLookup> {
  const { logger, now } = request

  const failedAt = failureBackoff.get(ticker)
  if (failedAt !== undefined && now.getTime() - failedAt < EARNINGS_FAILURE_TTL_MS) {
    logger.debug({ ticker }, 'earnings_failure_backoff_hit')
    return { status: 'unavailable' }
  }

  const lookup = await fetchCalendar(ticker, request)

  if (lookup.status === 'none') {
    logger.debug({ ticker }, 'earnings_no_event_in_window')
  } else {
    logger.debug({ ticker, date: lookup.date }, 'earnings_fetch_result')
  }

  return lookup
}

/**
 * The next earnings event per requested ticker, within `lookaheadDays` of `now`.
 *
 * Returns an entry for **every** requested ticker — a missing key is never a valid
 * outcome. Never rejects: a single ticker's failure is caught inside the mapped
 * callback, which is also what writes its backoff entry and logs the classified
 * failure code. `mapWithConcurrency` joins its workers with `Promise.all`, so an
 * escaping throw would take the whole batch down with it.
 */
export async function fetchNextEarnings(
  tickers: string[],
  opts: { now?: Date; logger?: LoggerLike; lookaheadDays?: number } = {}
): Promise<Record<string, EarningsLookup>> {
  const { now = new Date(), logger = defaultLogger, lookaheadDays = EARNINGS_LOOKAHEAD_DAYS } = opts

  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))]
  if (uniqueTickers.length === 0) {
    return {}
  }

  const apiKey = loadFinnhubApiKey()
  if (apiKey === '') {
    if (!noApiKeyWarned) {
      logger.warn('earnings_fetch_no_api_key')
      noApiKeyWarned = true
    }
    // A missing key is a can't-ask, so every ticker is unavailable rather than absent.
    return Object.fromEntries(
      uniqueTickers.map((ticker): [string, EarningsLookup] => [ticker, { status: 'unavailable' }])
    )
  }

  const request: EarningsRequest = { apiKey, now, lookaheadDays, logger }
  const entries = await mapWithConcurrency(
    uniqueTickers,
    EARNINGS_FETCH_CONCURRENCY,
    async (ticker): Promise<[string, EarningsLookup]> => {
      try {
        return [ticker, await resolveTicker(ticker, request)]
      } catch (error) {
        failureBackoff.set(ticker, now.getTime())
        const message = error instanceof Error ? error.message : String(error)
        logger.warn({ ticker, code: failureCode(error), message }, 'earnings_fetch_failed')
        return [ticker, { status: 'unavailable' }]
      }
    }
  )

  return Object.fromEntries(entries)
}
