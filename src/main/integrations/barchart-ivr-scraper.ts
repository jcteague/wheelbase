import { createRequire } from 'node:module'
import { z } from 'zod'

import { logger } from '../logger'
import { isNetworkError } from './integration-errors'

const require = createRequire(import.meta.url)
const pkg = require('../../../package.json') as { version: string }

const SESSION_URL = 'https://www.barchart.com/stocks/quotes/SPY/options'
const API_URL = 'https://www.barchart.com/proxies/core-api/v1/options/get'
const MAX_RETRIES = 2
const SESSION_TTL_MS = 30 * 60 * 1000
const MIN_API_INTERVAL_MS = 1000
const TICKER_PATTERN = /^[A-Z0-9]{1,5}$/
const PARSE_ERROR_MESSAGE = 'Expected impliedVolatilityRank1y in Barchart response'
const API_FIELDS =
  'baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d'

export const USER_AGENT = `Wheelbase/${pkg.version} (+mailto:jcteague@gmail.com)`

export const IVRDataSchema = z.object({
  ticker: z.string().regex(TICKER_PATTERN),
  ivr: z.number().min(0).max(100),
  ivp: z.number().min(0).max(100).optional(),
  iv30: z.number().positive().optional(),
  observedAt: z.string().datetime(),
  source: z.literal('barchart')
})

export type IVRData = z.infer<typeof IVRDataSchema>

export type IVROk = {
  status: 'ok'
  data: IVRData
}

export type IVRNotAvailable = {
  status: 'not_available'
  error: {
    code: 'TICKER_NOT_COVERED'
    message: string
  }
}

export type IVRParseError = {
  status: 'parse_error'
  error: {
    code: 'PARSE_FAILED'
    message: string
    rawSnippet: string
  }
}

export type IVRNetworkError = {
  status: 'network_error'
  error: {
    code: 'NETWORK_FAILURE'
    message: string
  }
}

export type IVRRateLimited = {
  status: 'rate_limited'
  error: {
    code: 'RATE_LIMITED'
    message: string
  }
}

export type IVRInvalidInput = {
  status: 'invalid_input'
  error: {
    code: 'INVALID_TICKER'
  }
}

export type IVRResult =
  | IVROk
  | IVRNotAvailable
  | IVRParseError
  | IVRNetworkError
  | IVRRateLimited
  | IVRInvalidInput

type Session = {
  cookies: string
  xsrf: string
}

type SessionCache = Session & {
  expiresAt: number
}

type SessionResult =
  | { ok: true; session: Session }
  | { ok: false; error: IVRRateLimited | IVRNetworkError }

type ApiFetchResult =
  | { ok: true; response: Response }
  | { ok: false; error: IVRNetworkError | IVRRateLimited }

type BarchartResponse = {
  count: number
  data: Array<{
    baseSymbol?: string
    raw?: Record<string, unknown>
  }>
}

type RateLimiter = {
  throttle(minMs?: number): Promise<void>
}

function createRateLimiter(): RateLimiter {
  let lastAt = 0

  return {
    async throttle(minMs = MIN_API_INTERVAL_MS): Promise<void> {
      const now = Date.now()
      const elapsed = now - lastAt

      if (lastAt !== 0 && elapsed < minMs) {
        await sleep(minMs - elapsed)
      }

      lastAt = Date.now()
    }
  }
}

const rateLimiter = createRateLimiter()
let sessionCache: SessionCache | null = null

function validateTicker(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker.toUpperCase())
}

function roundTo1dp(value: number): number {
  return Math.round(value * 10) / 10
}

function makeNetworkError(message: string): IVRNetworkError {
  return {
    status: 'network_error',
    error: {
      code: 'NETWORK_FAILURE',
      message
    }
  }
}

function makeInvalidInputError(): IVRInvalidInput {
  return {
    status: 'invalid_input',
    error: {
      code: 'INVALID_TICKER'
    }
  }
}

function makeNotAvailableError(ticker: string): IVRNotAvailable {
  return {
    status: 'not_available',
    error: {
      code: 'TICKER_NOT_COVERED',
      message: `Barchart has no options data for ${ticker}`
    }
  }
}

function makeParseError(rawSnippet: string): IVRParseError {
  return {
    status: 'parse_error',
    error: {
      code: 'PARSE_FAILED',
      message: PARSE_ERROR_MESSAGE,
      rawSnippet
    }
  }
}

function makeRateLimitedError(retryAfter: string | null): IVRRateLimited {
  return {
    status: 'rate_limited',
    error: {
      code: 'RATE_LIMITED',
      message: retryAfter ? `HTTP 429 Retry-After=${retryAfter}` : 'HTTP 429'
    }
  }
}

function extractSetCookies(headers: Headers): string[] {
  const setCookies = 'getSetCookie' in headers ? headers.getSetCookie() : []
  if (setCookies.length > 0) {
    return setCookies
  }

  const singleHeader = headers.get('set-cookie')
  return singleHeader ? [singleHeader] : []
}

function extractXsrf(setCookieHeaders: string[]): string | null {
  const xsrfCookie = setCookieHeaders.find((header) => header.startsWith('XSRF-TOKEN='))
  if (!xsrfCookie) {
    return null
  }

  const encodedValue = xsrfCookie.split(';')[0].slice('XSRF-TOKEN='.length)
  return decodeURIComponent(encodedValue)
}

async function getSession(): Promise<SessionResult> {
  if (sessionCache && Date.now() < sessionCache.expiresAt) {
    return {
      ok: true,
      session: { cookies: sessionCache.cookies, xsrf: sessionCache.xsrf }
    }
  }

  let response: Response
  try {
    response = await fetch(SESSION_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': USER_AGENT
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to acquire Barchart session'
    return { ok: false, error: makeNetworkError(message) }
  }

  if (response.status === 429) {
    return { ok: false, error: makeRateLimitedError(response.headers.get('Retry-After')) }
  }

  if (!response.ok) {
    return { ok: false, error: makeNetworkError(`HTTP ${response.status}`) }
  }

  const setCookieHeaders = extractSetCookies(response.headers)
  const xsrf = extractXsrf(setCookieHeaders)
  if (!xsrf) {
    return { ok: false, error: makeNetworkError('Missing XSRF-TOKEN cookie') }
  }

  const cookies = setCookieHeaders.map((header) => header.split(';')[0]).join('; ')

  sessionCache = {
    cookies,
    xsrf,
    expiresAt: Date.now() + SESSION_TTL_MS
  }

  return { ok: true, session: { cookies, xsrf } }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelay(retryCount: number): number {
  return Math.random() * 1000 * 2 ** retryCount
}

async function fetchApi(url: string, session: Session, retryCount = 0): Promise<ApiFetchResult> {
  await rateLimiter.throttle()

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Cookie: session.cookies,
        'User-Agent': USER_AGENT,
        'X-XSRF-TOKEN': session.xsrf
      }
    })

    if (response.status === 429) {
      return { ok: false, error: makeRateLimitedError(response.headers.get('Retry-After')) }
    }

    if (response.status >= 500) {
      if (retryCount < MAX_RETRIES) {
        await sleep(backoffDelay(retryCount))
        return fetchApi(url, session, retryCount + 1)
      }

      return { ok: false, error: makeNetworkError(`HTTP ${response.status}`) }
    }

    if (!response.ok) {
      return { ok: false, error: makeNetworkError(`HTTP ${response.status}`) }
    }

    return { ok: true, response }
  } catch (error) {
    if (retryCount < MAX_RETRIES && isNetworkError(error)) {
      await sleep(backoffDelay(retryCount))
      return fetchApi(url, session, retryCount + 1)
    }

    const message = error instanceof Error ? error.message : 'network error'
    return { ok: false, error: makeNetworkError(message) }
  }
}

export function parseIVRResponse(ticker: string, body: unknown): IVRResult {
  const parsed = body as BarchartResponse

  if (parsed.count === 0) {
    return makeNotAvailableError(ticker)
  }

  const firstRow = parsed.data[0]
  const raw = firstRow?.raw

  if (typeof raw?.impliedVolatilityRank1y !== 'number') {
    logger.warn({ ticker, raw: firstRow }, PARSE_ERROR_MESSAGE)
    return makeParseError(JSON.stringify(firstRow).slice(0, 500))
  }

  const result: IVROk = {
    status: 'ok',
    data: {
      ticker,
      ivr: roundTo1dp(raw.impliedVolatilityRank1y),
      observedAt: new Date().toISOString(),
      source: 'barchart'
    }
  }

  if (typeof raw.impliedVolatilityPercentile1y === 'number') {
    result.data.ivp = roundTo1dp(raw.impliedVolatilityPercentile1y * 100)
  }

  if (typeof raw.historicVolatility20d === 'number') {
    result.data.iv30 = raw.historicVolatility20d
  }

  return result
}

function buildApiUrl(ticker: string): string {
  const params = new URLSearchParams({
    baseSymbol: ticker,
    fields: API_FIELDS,
    limit: '1',
    raw: '1'
  })

  return `${API_URL}?${params.toString()}`
}

export async function fetchIVR(ticker: string): Promise<IVRResult> {
  const normalizedTicker = ticker.toUpperCase()

  if (!validateTicker(normalizedTicker)) {
    return makeInvalidInputError()
  }

  const sessionResult = await getSession()
  if (!sessionResult.ok) {
    return sessionResult.error
  }

  const apiResult = await fetchApi(buildApiUrl(normalizedTicker), sessionResult.session)
  if (!apiResult.ok) {
    return apiResult.error
  }

  const body = await apiResult.response.json()
  const result = parseIVRResponse(normalizedTicker, body)

  if (result.status === 'ok') {
    logger.info({ ticker: normalizedTicker, ivr: result.data.ivr }, 'Barchart IVR fetched')
  }

  return result
}
