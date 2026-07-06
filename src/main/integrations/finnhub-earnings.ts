import { addDays, format } from 'date-fns'

import { logger as defaultLogger, type LoggerLike } from '../logger'
import { loadFinnhubApiKey } from './finnhub-credentials'
import { isNetworkError } from './integration-errors'

const API_URL = 'https://finnhub.io/api/v1/calendar/earnings'
const EARNINGS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
// Failures are cached briefly so a rate-limited or failing ticker is not
// re-hammered on every 60-second scheduler run against an exhausted quota.
const EARNINGS_FAILURE_TTL_MS = 5 * 60 * 1000
const EARNINGS_LOOKBACK_DAYS = 7
const EARNINGS_LOOKAHEAD_DAYS = 30

type FinnhubEarningsEvent = {
  date: string
  symbol: string
}

type CacheEntry = {
  date: string | null
  fetchedAt: number
  failed?: boolean
}

const cache = new Map<string, CacheEntry>()
let noApiKeyWarned = false

export function clearEarningsCache(): void {
  cache.clear()
  noApiKeyWarned = false
}

function buildRequestUrl(ticker: string, apiKey: string, now: Date): string {
  const params = new URLSearchParams({
    symbol: ticker,
    from: format(addDays(now, -EARNINGS_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    to: format(addDays(now, EARNINGS_LOOKAHEAD_DAYS), 'yyyy-MM-dd'),
    token: apiKey
  })

  return `${API_URL}?${params.toString()}`
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function selectEventDate(events: FinnhubEarningsEvent[], now: Date): string | null {
  const today = format(now, 'yyyy-MM-dd')
  // The payload rows are unvalidated JSON — drop anything that isn't a
  // YYYY-MM-DD string so a null/TBD date can't displace a valid event.
  const dates = events
    .map((event) => event.date)
    .filter((date): date is string => typeof date === 'string' && ISO_DATE_RE.test(date))
    .sort()
  const upcoming = dates.find((date) => date >= today)

  return upcoming ?? dates[dates.length - 1] ?? null
}

function makeHttpStatusError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

function httpStatusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    return typeof status === 'number' ? status : null
  }
  return null
}

function failureCode(error: unknown): 'auth_failed' | 'rate_limited' | 'network_error' | 'unknown' {
  const status = httpStatusOf(error)
  if (status === 401 || status === 403) return 'auth_failed'
  if (status === 429) return 'rate_limited'
  if (isNetworkError(error)) return 'network_error'
  return 'unknown'
}

async function fetchCalendar(
  ticker: string,
  apiKey: string,
  now: Date,
  logger: LoggerLike
): Promise<string | null> {
  logger.debug({ ticker }, 'earnings_fetch_request')

  const response = await fetch(buildRequestUrl(ticker, apiKey, now))
  if (!response.ok) {
    throw makeHttpStatusError(response.status)
  }

  const body = (await response.json()) as { earningsCalendar?: unknown }
  if (!Array.isArray(body.earningsCalendar)) {
    throw new Error('Expected earningsCalendar array in Finnhub response')
  }

  return selectEventDate(body.earningsCalendar as FinnhubEarningsEvent[], now)
}

async function resolveTicker(
  ticker: string,
  apiKey: string,
  now: Date,
  logger: LoggerLike
): Promise<string | null> {
  const cached = cache.get(ticker)
  const ttl = cached?.failed ? EARNINGS_FAILURE_TTL_MS : EARNINGS_CACHE_TTL_MS
  if (cached && now.getTime() - cached.fetchedAt < ttl) {
    logger.debug({ ticker, date: cached.date }, 'earnings_cache_hit')
    return cached.date
  }

  const date = await fetchCalendar(ticker, apiKey, now, logger)
  cache.set(ticker, { date, fetchedAt: now.getTime() })

  if (date === null) {
    logger.debug({ ticker }, 'earnings_no_event_in_window')
  } else {
    logger.debug({ ticker, date }, 'earnings_fetch_result')
  }

  return date
}

export async function fetchNextEarningsDates(
  tickers: string[],
  opts: { now?: Date; logger?: LoggerLike } = {}
): Promise<Record<string, string>> {
  const { now = new Date(), logger = defaultLogger } = opts

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
    return {}
  }

  const entries = await Promise.all(
    uniqueTickers.map(async (ticker): Promise<[string, string | null]> => {
      try {
        return [ticker, await resolveTicker(ticker, apiKey, now, logger)]
      } catch (error) {
        cache.set(ticker, { date: null, fetchedAt: now.getTime(), failed: true })
        const message = error instanceof Error ? error.message : String(error)
        logger.warn({ ticker, code: failureCode(error), message }, 'earnings_fetch_failed')
        return [ticker, null]
      }
    })
  )

  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null))
}
