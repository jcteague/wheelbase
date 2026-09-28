// [US-121] IV-history service: per-ticker collection of the daily IV30 series and recompute from
// stored inputs (the read path is `iv-history-read.ts`). Composes the pure engines (iv30-selection, iv30,
// iv-metrics, trading-calendar) with the store; knows nothing about run state — its callers
// (ivr-collector, ivr-on-demand) own that.
//
// Rules: data-model.md §3; research.md ADRs on gaps, the `end` rule, auth-abort and recompute.
import type Database from 'better-sqlite3'
import { subMinutes } from 'date-fns'
import type { Logger } from 'pino'
import {
  IV30_ENGINE_VERSION,
  computeIv30,
  iv30FromInputs,
  type DailyBar,
  type Iv30Outcome
} from '../core/iv30'
import { planSessionProbe, type SessionProbePlan } from '../core/iv30-selection'
import { RANK_WINDOW_SESSIONS } from '../core/iv-metrics'
import {
  etDateOf,
  getMostRecentCompletedSession,
  type TradingCalendar,
  type TradingSession
} from '../core/trading-calendar'
import {
  MarketDataError,
  type DailyBarRange,
  type IvHistoryBarSource
} from '../integrations/market-data-provider'
import { logger as defaultLogger } from '../logger'
import {
  inputsOf,
  persistIvHistory,
  selectAttemptedSessions,
  selectRecomputeRows,
  updateIv30Values
} from './iv-history-store'

export { persistIvHistory, type PersistIvHistoryInput } from './iv-history-store'

export type CollectorLogger = Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>

export type IvHistoryTickerOutcome =
  | { status: 'collected'; readings: number; gaps: number }
  | { status: 'up_to_date' }
  | { status: 'failed' }
  | { status: 'no_market_data' } // MarketDataError('auth_failed') — no credentials

export type CollectIvHistoryInput = {
  db: Database.Database
  provider: IvHistoryBarSource
  calendar: TradingCalendar
  now: Date
  ticker: string
  logger: CollectorLogger
}

/** The window plus its anchor. */
const REQUIRED_SESSIONS = RANK_WINDOW_SESSIONS + 1

type SessionResult = { session: TradingSession; outcome: Iv30Outcome }

/** Required sessions with neither a reading nor a gap, ascending. */
export function listMissingSessions(
  db: Database.Database,
  ticker: string,
  requiredSessions: readonly string[]
): string[] {
  const attempted = selectAttemptedSessions(db, ticker.toUpperCase())
  return requiredSessions.filter((session) => !attempted.has(session)).sort()
}

/** How long after the close a session's daily bars are treated as final. Options on SPY-style
 *  names trade until 16:15 ET and free-plan SIP bars lag ~15 minutes, and a stored reading is
 *  never re-probed — so a bar pulled minutes after the close would freeze a partial VWAP. The
 *  scheduled run fires at close + 60, comfortably past this. */
const BAR_SETTLE_MINUTES = 45

/** The REQUIRED_SESSIONS most recent sessions whose bars had settled at `now`; null when the
 *  calendar cannot speak for `now`. */
function requiredSessionsAt(calendar: TradingCalendar, now: Date): TradingSession[] | null {
  const newest = getMostRecentCompletedSession(calendar, subMinutes(now, BAR_SETTLE_MINUTES))
  if (newest === null) return null
  return calendar.sessions
    .filter((session) => session.date <= newest.date)
    .slice(-REQUIRED_SESSIONS)
}

/** Never name the current calendar day: omit `end` when the newest completed session is
 *  today's (the evening run), else stop at that session. */
function barRange(start: string, newest: string, now: Date): DailyBarRange {
  return newest < etDateOf(now) ? { start, end: newest } : { start }
}

function planSymbols(plan: SessionProbePlan): string[] {
  return [...(plan.weekly?.symbols ?? []), ...(plan.monthly?.symbols ?? [])]
}

/** session → symbol → that session's bar. */
function indexBySession(bars: Map<string, DailyBar[]>): Map<string, Map<string, DailyBar>> {
  const index = new Map<string, Map<string, DailyBar>>()
  bars.forEach((series, symbol) => {
    series.forEach((bar) => {
      const forSession = index.get(bar.date) ?? new Map<string, DailyBar>()
      forSession.set(symbol, bar)
      index.set(bar.date, forSession)
    })
  })
  return index
}

type ProbeInput = {
  provider: IvHistoryBarSource
  calendar: TradingCalendar
  ticker: string
  missing: readonly TradingSession[]
  newest: string
  now: Date
  logger: CollectorLogger
}

/** Fetches the missing sessions' bars (one stock request, at most one option request) and
 *  runs the engine per session. Throws what the provider throws. */
async function probeMissingSessions(
  input: ProbeInput
): Promise<{ results: SessionResult[]; requests: number }> {
  const { provider, calendar, ticker, missing, newest, now, logger } = input
  const stockRange = barRange(missing[0].date, newest, now)
  logger.debug({ ticker, kind: 'stock', ...stockRange }, 'iv_history_bar_request')
  const stockBars = await provider.getStockDailyBars({ symbol: ticker, ...stockRange })
  const stockByDate = new Map(stockBars.map((bar) => [bar.date, bar]))

  const sessionDates = calendar.sessions.map((session) => session.date)
  const probes = missing.flatMap((session) => {
    const bar = stockByDate.get(session.date)
    if (bar === undefined) return []
    const plan = planSessionProbe({
      underlying: ticker,
      session: session.date,
      underlyingPrice: Number(bar.vwap),
      sessions: sessionDates
    })
    return [{ session, bar, plan }]
  })
  const symbols = [...new Set(probes.flatMap(({ plan }) => planSymbols(plan)))]

  let optionBars = new Map<string, DailyBar[]>()
  if (symbols.length > 0) {
    const optionRange = barRange(probes[0].session.date, newest, now)
    logger.debug(
      { ticker, kind: 'option', symbolCount: symbols.length, ...optionRange },
      'iv_history_bar_request'
    )
    optionBars = await provider.getOptionDailyBars({ symbols, ...optionRange })
  }
  const optionsBySession = indexBySession(optionBars)
  const probeByDate = new Map(probes.map((probe) => [probe.session.date, probe]))

  const results = missing.map((session): SessionResult => {
    const probe = probeByDate.get(session.date)
    const outcome: Iv30Outcome =
      probe === undefined
        ? { status: 'gap', reason: 'no_underlying_bar' }
        : computeIv30({
            plan: probe.plan,
            underlyingBar: probe.bar,
            optionBars: optionsBySession.get(session.date) ?? new Map()
          })
    logger.debug(
      {
        ticker,
        session: session.date,
        status: outcome.status,
        ...(outcome.status === 'gap'
          ? { reason: outcome.reason }
          : { iv30: outcome.reading.iv30, tier: outcome.reading.tier })
      },
      'iv_history_session_outcome'
    )
    return { session, outcome }
  })
  return { results, requests: symbols.length > 0 ? 2 : 1 }
}

/**
 * Brings one ticker's series up to date: recompute stale-version rows, then fetch and read
 * only the required sessions that hold neither a reading nor a gap. A market-data auth failure
 * is `no_market_data`; any other provider or engine error is `failed`. A DB write error
 * propagates — it is systemic, not a ticker outcome.
 */
export async function collectIvHistory(
  input: CollectIvHistoryInput
): Promise<IvHistoryTickerOutcome> {
  const { db, provider, calendar, now, logger } = input
  const ticker = input.ticker.toUpperCase()

  recomputeIvHistory(db, { ticker, logger })

  const required = requiredSessionsAt(calendar, now)
  if (required === null || required.length === 0) {
    logger.warn({ ticker, now: now.toISOString() }, 'iv_history_calendar_unavailable')
    return { status: 'failed' }
  }
  const newest = required[required.length - 1].date
  const missingDates = new Set(
    listMissingSessions(
      db,
      ticker,
      required.map((session) => session.date)
    )
  )
  const missing = required.filter((session) => missingDates.has(session.date))
  logger.debug(
    { ticker, required: required.length, missing: missing.length, oldest: missing[0]?.date },
    'iv_history_missing_sessions'
  )
  if (missing.length === 0) return { status: 'up_to_date' }

  let probed: Awaited<ReturnType<typeof probeMissingSessions>>
  try {
    probed = await probeMissingSessions({
      provider,
      calendar,
      ticker,
      missing,
      newest,
      now,
      logger
    })
  } catch (err) {
    if (err instanceof MarketDataError && err.code === 'auth_failed') {
      logger.info({ ticker }, 'iv_history_no_market_data')
      return { status: 'no_market_data' }
    }
    logger.warn({ ticker, err }, 'iv_history_collect_failed')
    return { status: 'failed' }
  }

  const readings = probed.results.flatMap(({ session, outcome }) =>
    outcome.status === 'reading' ? [{ reading: outcome.reading, observedAt: session.closeAt }] : []
  )
  // The newest session's bar may simply not have arrived yet: retry it next run, never gap it.
  const gaps = probed.results.flatMap(({ session, outcome }) =>
    outcome.status === 'gap' && session.date !== newest
      ? [{ session: session.date, reason: outcome.reason }]
      : []
  )
  persistIvHistory(db, { ticker, attemptedAt: now, readings, gaps })

  logger.info(
    { ticker, readings: readings.length, gaps: gaps.length, requests: probed.requests },
    'iv_history_collected'
  )
  return { status: 'collected', readings: readings.length, gaps: gaps.length }
}

/**
 * Re-runs the IV30 arithmetic over stored inputs for rows behind IV30_ENGINE_VERSION (every
 * row when forced). Makes no market-data request. A row whose inputs no longer invert is left
 * unchanged and counted `unrecomputable`.
 */
export function recomputeIvHistory(
  db: Database.Database,
  opts: { ticker?: string; force?: boolean; logger?: CollectorLogger } = {}
): { recomputed: number; unrecomputable: number } {
  const { force = false, logger = defaultLogger } = opts
  const ticker = opts.ticker?.toUpperCase() ?? null
  const rows = selectRecomputeRows(db, { ticker, force, engineVersion: IV30_ENGINE_VERSION })
  const results = rows.map((row) => {
    const inputs = inputsOf(row)
    return { row, iv30: inputs === null ? null : iv30FromInputs(inputs) }
  })

  const updates = results.flatMap(({ row, iv30 }) =>
    iv30 === null ? [] : [{ row, iv30, engineVersion: IV30_ENGINE_VERSION }]
  )
  const unrecomputable = results.filter(({ iv30 }) => iv30 === null)
  unrecomputable.forEach(({ row }) =>
    logger.warn(
      { ticker: row.underlying, session: row.session, engineVersion: row.engine_version },
      'iv_history_unrecomputable'
    )
  )
  updateIv30Values(db, updates)

  const counts = { recomputed: updates.length, unrecomputable: unrecomputable.length }
  if (rows.length > 0) logger.info({ ticker, force, ...counts }, 'iv_history_recomputed')
  return counts
}
