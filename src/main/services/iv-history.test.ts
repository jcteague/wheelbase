// [US-121] IV-history service: per-ticker collection, recompute from stored inputs, metrics read.
import type Database from 'better-sqlite3'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { blackScholesPrice } from '../core/black-scholes'
import { IV30_ENGINE_VERSION } from '../core/iv30'
import { planSessionProbe } from '../core/iv30-selection'
import { parseOccSymbol } from '../core/option-symbol'
import { etDateOf, type TradingCalendar } from '../core/trading-calendar'
import {
  MarketDataError,
  type DailyBar,
  type DailyBarRange,
  type IvHistoryBarSource
} from '../integrations/market-data-provider'
import {
  makeSpyLogger,
  makeTestDb,
  makeTradingCalendar,
  seedIv30Series,
  type SpyLogger
} from '../test-utils'
import {
  collectIvHistory,
  listMissingSessions,
  persistIvHistory,
  recomputeIvHistory
} from './iv-history'

const TICKER = 'AAPL'
const PRICE = 100
const RATE = 0.045

// Friday 2026-09-25 17:00 ET — after that day's close, so the Friday is the newest completed session.
const FRIDAY_EVENING = new Date('2026-09-25T21:00:00Z')
// Saturday 2026-09-26 11:00 ET.
const SATURDAY = new Date('2026-09-26T15:00:00Z')
// Thursday 2026-09-24 10:00 ET — before that day's close, so Wednesday is the newest completed session.
const THURSDAY_MORNING = new Date('2026-09-24T14:00:00Z')

/** A short calendar (September sessions only) so most tests backfill a handful of sessions. */
const SHORT_CALENDAR = makeTradingCalendar('2026-09-01', '2026-12-31')
/** Enough history for a full 253-session requirement at FRIDAY_EVENING. */
const LONG_CALENDAR = makeTradingCalendar('2025-06-01', '2026-12-31')

function completedSessions(calendar: TradingCalendar, now: Date): string[] {
  return calendar.sessions.filter((s) => new Date(s.closeAt) <= now).map((s) => s.date)
}

type SourceOptions = {
  /** σ each option leg is priced at for a session; null leaves the session's options untraded. */
  sigmaFor?: (session: string) => number | null
  /** Sessions whose underlying bar is missing. */
  noStockBar?: string[]
  /** Error the given call rejects with. */
  failStock?: Error
  failOptions?: Error
}

type BarSourceMock = IvHistoryBarSource & {
  getStockDailyBars: ReturnType<typeof vi.fn>
  getOptionDailyBars: ReturnType<typeof vi.fn>
}

/**
 * A mock bar source over `calendar`: the stock trades flat at PRICE every session, and every
 * requested OCC symbol is priced with Black–Scholes at the session's programmed σ — so a
 * correct engine reads back exactly that σ.
 */
function makeBarSource(calendar: TradingCalendar, opts: SourceOptions = {}): BarSourceMock {
  const sigmaFor = opts.sigmaFor ?? (() => 0.26)
  const noStock = new Set(opts.noStockBar ?? [])
  const inRange = (range: DailyBarRange): string[] =>
    calendar.sessions
      .map((s) => s.date)
      .filter((d) => d >= range.start && (range.end === undefined || d <= range.end))

  const getStockDailyBars = vi.fn(
    async (input: { symbol: string } & DailyBarRange): Promise<DailyBar[]> => {
      if (opts.failStock) throw opts.failStock
      const price = PRICE.toFixed(4)
      return inRange(input)
        .filter((date) => !noStock.has(date))
        .map((date) => ({ date, vwap: price, close: price, volume: 1_000_000, tradeCount: 10_000 }))
    }
  )

  const getOptionDailyBars = vi.fn(
    async (input: { symbols: string[] } & DailyBarRange): Promise<Map<string, DailyBar[]>> => {
      if (opts.failOptions) throw opts.failOptions
      const sessions = inRange(input)
      const entries = input.symbols.map((symbol): [string, DailyBar[]] => {
        const id = parseOccSymbol(symbol)!
        const bars = sessions.flatMap((session): DailyBar[] => {
          const sigma = sigmaFor(session)
          const dte = differenceInCalendarDays(parseISO(id.expiration), parseISO(session))
          if (sigma === null || dte <= 0) return []
          const vwap = blackScholesPrice({
            type: id.contractType,
            spot: PRICE,
            strike: Number(id.strike),
            yearsToExpiry: dte / 365,
            rate: RATE,
            dividendYield: 0,
            volatility: sigma
          }).toFixed(4)
          return [{ date: session, vwap, close: vwap, volume: 100, tradeCount: 100 }]
        })
        return [symbol, bars]
      })
      return new Map(entries.filter(([, bars]) => bars.length > 0))
    }
  )

  return { getStockDailyBars, getOptionDailyBars }
}

type ReadingRow = {
  underlying: string
  session: string
  engine_version: number
  observed_at: string
  iv30: string
  far_expiration: string | null
}

function readings(db: Database.Database, ticker = TICKER): ReadingRow[] {
  return db
    .prepare(
      `SELECT underlying, session, engine_version, observed_at, iv30, far_expiration
       FROM iv30_reading WHERE underlying = ? ORDER BY session`
    )
    .all(ticker) as ReadingRow[]
}

function gaps(db: Database.Database, ticker = TICKER): Array<{ session: string; reason: string }> {
  return db
    .prepare('SELECT session, reason FROM iv30_gap WHERE underlying = ? ORDER BY session')
    .all(ticker) as Array<{ session: string; reason: string }>
}

function insertGap(db: Database.Database, session: string, reason = 'no_tradeable_pair'): void {
  db.prepare(
    `INSERT INTO iv30_gap (underlying, session, method, reason, attempted_at)
     VALUES (?, ?, 'daily_vwap', ?, '2026-09-01T00:00:00.000Z')`
  ).run(TICKER, session, reason)
}

function loggedMessages(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map((call) => call[1] as string)
}

describe('iv-history service', () => {
  let db: Database.Database
  let logger: SpyLogger

  beforeEach(() => {
    db = makeTestDb()
    logger = makeSpyLogger()
  })

  const collect = (
    provider: IvHistoryBarSource,
    now = FRIDAY_EVENING,
    calendar = SHORT_CALENDAR,
    ticker = TICKER
  ): ReturnType<typeof collectIvHistory> =>
    collectIvHistory({ db, provider, calendar, now, ticker, logger })

  describe('listMissingSessions', () => {
    it('returns required sessions with neither a reading nor a gap, ascending', () => {
      seedIv30Series(db, TICKER, [['2026-09-22', '0.2500']])
      insertGap(db, '2026-09-24')

      const missing = listMissingSessions(db, 'aapl', [
        '2026-09-25',
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24'
      ])

      expect(missing).toEqual(['2026-09-21', '2026-09-23', '2026-09-25'])
    })

    it('does not count another ticker’s rows', () => {
      seedIv30Series(db, 'MSFT', [['2026-09-22', '0.2500']])
      expect(listMissingSessions(db, TICKER, ['2026-09-22'])).toEqual(['2026-09-22'])
    })
  })

  describe('collectIvHistory', () => {
    it('backfills an empty table over a 253-session requirement in one stock and one option request', async () => {
      const source = makeBarSource(LONG_CALENDAR)
      const required = completedSessions(LONG_CALENDAR, FRIDAY_EVENING).slice(-253)

      const outcome = await collect(source, FRIDAY_EVENING, LONG_CALENDAR)

      expect(outcome).toEqual({ status: 'collected', readings: 253, gaps: 0 })
      expect(source.getStockDailyBars).toHaveBeenCalledTimes(1)
      expect(source.getStockDailyBars).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: TICKER, start: required[0] })
      )

      const requested = new Set(
        source.getOptionDailyBars.mock.calls.flatMap(
          ([input]) => (input as { symbols: string[] }).symbols
        )
      )
      const sessions = LONG_CALENDAR.sessions.map((s) => s.date)
      const planned = required.flatMap((session) => {
        const plan = planSessionProbe({
          underlying: TICKER,
          session,
          underlyingPrice: PRICE,
          sessions
        })
        return [...(plan.weekly?.symbols ?? []), ...(plan.monthly?.symbols ?? [])]
      })
      expect(planned.every((symbol) => requested.has(symbol))).toBe(true)

      const rows = readings(db)
      expect(rows.map((r) => r.session)).toEqual(required)
      expect(rows.every((r) => r.iv30 === '0.2600')).toBe(true)
      expect(rows.every((r) => r.engine_version === IV30_ENGINE_VERSION)).toBe(true)
      const closeOf = new Map(LONG_CALENDAR.sessions.map((s) => [s.date, s.closeAt]))
      expect(rows.every((r) => r.observed_at === closeOf.get(r.session))).toBe(true)
      expect(loggedMessages(logger.info)).toContain('iv_history_collected')
    })

    it('stores the ticker upper-cased', async () => {
      await collect(makeBarSource(SHORT_CALENDAR), FRIDAY_EVENING, SHORT_CALENDAR, 'aapl')
      expect(readings(db, 'AAPL').length).toBeGreaterThan(0)
    })

    it('returns up_to_date with zero provider calls when nothing is missing', async () => {
      await collect(makeBarSource(SHORT_CALENDAR))
      const second = makeBarSource(SHORT_CALENDAR)

      const outcome = await collect(second)

      expect(outcome).toEqual({ status: 'up_to_date' })
      expect(second.getStockDailyBars).not.toHaveBeenCalled()
      expect(second.getOptionDailyBars).not.toHaveBeenCalled()
    })

    it('requests only the three sessions a three-session-stale series is missing', async () => {
      await collect(makeBarSource(LONG_CALENDAR), new Date('2026-09-22T21:00:00Z'), LONG_CALENDAR)
      const source = makeBarSource(LONG_CALENDAR)

      const outcome = await collect(source, FRIDAY_EVENING, LONG_CALENDAR)

      expect(outcome).toEqual({ status: 'collected', readings: 3, gaps: 0 })
      expect(source.getStockDailyBars).toHaveBeenCalledWith(
        expect.objectContaining({ start: '2026-09-23' })
      )
      expect(source.getOptionDailyBars).toHaveBeenCalledWith(
        expect.objectContaining({ start: '2026-09-23' })
      )
      expect(readings(db)).toHaveLength(256)
    })

    it('is up_to_date on a Saturday when Friday is stored, making no request', async () => {
      await collect(makeBarSource(SHORT_CALENDAR), FRIDAY_EVENING)
      const source = makeBarSource(SHORT_CALENDAR)

      expect(await collect(source, SATURDAY)).toEqual({ status: 'up_to_date' })
      expect(source.getStockDailyBars).not.toHaveBeenCalled()
    })

    describe('end rule', () => {
      const endsOf = (source: BarSourceMock): Array<string | undefined> =>
        [...source.getStockDailyBars.mock.calls, ...source.getOptionDailyBars.mock.calls].map(
          ([input]) => (input as DailyBarRange).end
        )

      it('omits end when the newest completed session is today (after the close)', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        await collect(source, FRIDAY_EVENING)

        const ends = endsOf(source)
        expect(ends).toHaveLength(2)
        expect(ends.every((end) => end === undefined)).toBe(true)
      })

      // Options on SPY-style names trade until 16:15 and free-plan SIP bars lag ~15 minutes, so
      // a daily bar pulled minutes after the close is still forming — and a reading is never
      // re-probed once stored. Today only counts as complete once its bars have settled.
      it('leaves today out until its bars have settled after the close', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        // Friday 16:10 ET — ten minutes after the close.
        await collect(source, new Date('2026-09-25T20:10:00Z'))

        expect(endsOf(source)).toEqual(['2026-09-24', '2026-09-24'])
        expect(readings(db).at(-1)?.session).toBe('2026-09-24')
      })

      it('counts today as complete once its bars have settled', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        // Friday 16:45 ET.
        await collect(source, new Date('2026-09-25T20:45:00Z'))

        expect(endsOf(source).every((end) => end === undefined)).toBe(true)
        expect(readings(db).at(-1)?.session).toBe('2026-09-25')
      })

      it('names Friday as end on a Saturday', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        await collect(source, SATURDAY)

        const ends = endsOf(source)
        expect(ends).toEqual(['2026-09-25', '2026-09-25'])
        expect(ends).not.toContain(etDateOf(SATURDAY))
      })

      it('names the previous session as end before today’s close', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        await collect(source, THURSDAY_MORNING)

        const ends = endsOf(source)
        expect(ends).toEqual(['2026-09-23', '2026-09-23'])
        expect(ends).not.toContain(etDateOf(THURSDAY_MORNING))
        expect(readings(db).at(-1)?.session).toBe('2026-09-23')
      })
    })

    describe('gaps', () => {
      it('records a no_tradeable_pair gap for an older session whose bars fail the gate', async () => {
        const source = makeBarSource(SHORT_CALENDAR, {
          sigmaFor: (session) => (session === '2026-09-22' ? null : 0.26)
        })

        const outcome = await collect(source)

        expect(gaps(db)).toEqual([{ session: '2026-09-22', reason: 'no_tradeable_pair' }])
        expect(readings(db).map((r) => r.session)).not.toContain('2026-09-22')
        const required = completedSessions(SHORT_CALENDAR, FRIDAY_EVENING)
        expect(outcome).toEqual({ status: 'collected', readings: required.length - 1, gaps: 1 })
      })

      it('never writes a gap for the newest completed session, which stays missing', async () => {
        const source = makeBarSource(SHORT_CALENDAR, {
          sigmaFor: (session) => (session === '2026-09-25' ? null : 0.26)
        })

        await collect(source)

        expect(gaps(db)).toEqual([])
        const required = completedSessions(SHORT_CALENDAR, FRIDAY_EVENING)
        expect(listMissingSessions(db, TICKER, required)).toEqual(['2026-09-25'])

        const retry = makeBarSource(SHORT_CALENDAR)
        expect(await collect(retry)).toEqual({ status: 'collected', readings: 1, gaps: 0 })
        expect(retry.getStockDailyBars).toHaveBeenCalledWith(
          expect.objectContaining({ start: '2026-09-25' })
        )
      })

      it('records a no_underlying_bar gap when the stock bar is missing', async () => {
        const source = makeBarSource(SHORT_CALENDAR, { noStockBar: ['2026-09-21'] })

        await collect(source)

        expect(gaps(db)).toEqual([{ session: '2026-09-21', reason: 'no_underlying_bar' }])
      })

      it('does not gap the newest session for a missing stock bar either', async () => {
        await collect(makeBarSource(SHORT_CALENDAR, { noStockBar: ['2026-09-25'] }))
        expect(gaps(db)).toEqual([])
      })

      it('makes no option request when no missing session has a stock bar', async () => {
        await collect(makeBarSource(SHORT_CALENDAR), new Date('2026-09-24T21:00:00Z'))
        const source = makeBarSource(SHORT_CALENDAR, { noStockBar: ['2026-09-25'] })

        await collect(source)

        expect(source.getOptionDailyBars).not.toHaveBeenCalled()
      })

      it('a reading written for a gapped session deletes the gap in the same write', () => {
        insertGap(db, '2026-09-22')

        persistIvHistory(db, {
          ticker: TICKER,
          attemptedAt: FRIDAY_EVENING,
          readings: [
            {
              observedAt: '2026-09-22T20:00:00.000Z',
              reading: {
                session: '2026-09-22',
                underlyingVwap: '100.0000',
                tier: 'monthly',
                near: {
                  expiration: '2026-10-16',
                  strike: '100.0000',
                  callVwap: '3.0000',
                  callTrades: 10,
                  putVwap: '3.0000',
                  putTrades: 10
                },
                far: null,
                rate: '0.0450',
                dividendYield: '0.0000',
                iv30: '0.2500',
                engineVersion: IV30_ENGINE_VERSION
              }
            }
          ],
          gaps: []
        })

        expect(gaps(db)).toEqual([])
        expect(readings(db).map((r) => r.session)).toEqual(['2026-09-22'])
      })
    })

    describe('failures', () => {
      it('auth_failed → no_market_data with one INFO line and nothing persisted', async () => {
        const source = makeBarSource(SHORT_CALENDAR, {
          failStock: new MarketDataError('auth_failed', 'no credentials')
        })

        expect(await collect(source)).toEqual({ status: 'no_market_data' })
        expect(
          loggedMessages(logger.info).filter((m) => m === 'iv_history_no_market_data')
        ).toHaveLength(1)
        expect(logger.warn).not.toHaveBeenCalled()
        expect(readings(db)).toEqual([])
        expect(gaps(db)).toEqual([])
      })

      it('auth_failed on the option request is also no_market_data', async () => {
        const source = makeBarSource(SHORT_CALENDAR, {
          failOptions: new MarketDataError('auth_failed', 'no credentials')
        })
        expect(await collect(source)).toEqual({ status: 'no_market_data' })
        expect(readings(db)).toEqual([])
      })

      it('network_error → failed with a WARN carrying err, nothing persisted', async () => {
        const err = new MarketDataError('network_error', 'socket hang up')
        const source = makeBarSource(SHORT_CALENDAR, { failOptions: err })

        expect(await collect(source)).toEqual({ status: 'failed' })
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ err, ticker: TICKER }),
          expect.any(String)
        )
        expect(readings(db)).toEqual([])
        expect(gaps(db)).toEqual([])
      })

      it('a calendar that cannot speak for now → failed with a WARN and no request', async () => {
        const source = makeBarSource(SHORT_CALENDAR)
        const outcome = await collect(
          source,
          FRIDAY_EVENING,
          makeTradingCalendar('2026-01-01', '2026-06-30')
        )

        expect(outcome).toEqual({ status: 'failed' })
        expect(loggedMessages(logger.warn)).toContain('iv_history_calendar_unavailable')
        expect(source.getStockDailyBars).not.toHaveBeenCalled()
      })

      it('does not catch a SqliteError from the write', async () => {
        db.exec(
          `CREATE TRIGGER iv30_reading_fail BEFORE INSERT ON iv30_reading
           BEGIN SELECT RAISE(ABORT, 'disk full'); END`
        )

        await expect(collect(makeBarSource(SHORT_CALENDAR))).rejects.toMatchObject({
          code: 'SQLITE_CONSTRAINT_TRIGGER'
        })
      })
    })

    it('recomputes stale-version rows before computing missing sessions', async () => {
      await collect(makeBarSource(SHORT_CALENDAR), new Date('2026-09-24T21:00:00Z'))
      db.prepare(
        `UPDATE iv30_reading SET iv30 = '0.5200', engine_version = 0 WHERE session = '2026-09-22'`
      ).run()
      logger = makeSpyLogger()

      await collect(makeBarSource(SHORT_CALENDAR))

      const recomputed = logger.info.mock.calls.findIndex((c) => c[1] === 'iv_history_recomputed')
      const missing = logger.debug.mock.calls.findIndex(
        (c) => c[1] === 'iv_history_missing_sessions'
      )
      expect(recomputed).toBeGreaterThanOrEqual(0)
      expect(missing).toBeGreaterThanOrEqual(0)
      expect(logger.info.mock.invocationCallOrder[recomputed]).toBeLessThan(
        logger.debug.mock.invocationCallOrder[missing]
      )
      expect(readings(db).find((r) => r.session === '2026-09-22')?.iv30).toBe('0.2600')
    })
  })

  describe('recomputeIvHistory', () => {
    beforeEach(async () => {
      await collect(makeBarSource(SHORT_CALENDAR))
    })

    const setRow = (session: string, set: string, ticker = TICKER): void => {
      db.prepare(`UPDATE iv30_reading SET ${set} WHERE underlying = ? AND session = ?`).run(
        ticker,
        session
      )
    }

    it('rewrites stale-version rows from stored inputs and leaves current rows alone', () => {
      setRow('2026-09-22', `iv30 = '0.5200', engine_version = 0`)
      setRow('2026-09-23', `iv30 = '0.9999'`) // current version: must not be touched

      const counts = recomputeIvHistory(db, { ticker: TICKER, logger })

      expect(counts).toEqual({ recomputed: 1, unrecomputable: 0 })
      const bySession = new Map(readings(db).map((r) => [r.session, r]))
      expect(bySession.get('2026-09-22')).toMatchObject({
        iv30: '0.2600',
        engine_version: IV30_ENGINE_VERSION
      })
      expect(bySession.get('2026-09-23')?.iv30).toBe('0.9999')
      expect(loggedMessages(logger.info)).toContain('iv_history_recomputed')
    })

    it('force rewrites current-version rows too', () => {
      setRow('2026-09-23', `iv30 = '0.9999'`)
      const total = readings(db).length

      const counts = recomputeIvHistory(db, { ticker: TICKER, force: true, logger })

      expect(counts).toEqual({ recomputed: total, unrecomputable: 0 })
      expect(readings(db).every((r) => r.iv30 === '0.2600')).toBe(true)
    })

    it('counts a row whose inputs no longer invert as unrecomputable, unchanged, with a WARN', () => {
      setRow('2026-09-22', `iv30 = '0.5200', engine_version = 0, near_call_vwap = '0.0000'`)

      const counts = recomputeIvHistory(db, { ticker: TICKER, logger })

      expect(counts).toEqual({ recomputed: 0, unrecomputable: 1 })
      expect(readings(db).find((r) => r.session === '2026-09-22')).toMatchObject({
        iv30: '0.5200',
        engine_version: 0
      })
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: TICKER, session: '2026-09-22' }),
        expect.any(String)
      )
    })

    // The writer sets all six far_* columns or none; a half-written set is not a single-
    // expiration reading, so it must not be recomputed as one.
    it('counts a row with a half-written far expiration as unrecomputable', () => {
      expect(readings(db).find((r) => r.session === '2026-09-22')?.far_expiration).not.toBeNull()
      setRow('2026-09-22', `iv30 = '0.5200', engine_version = 0, far_strike = NULL`)

      const counts = recomputeIvHistory(db, { ticker: TICKER, logger })

      expect(counts).toEqual({ recomputed: 0, unrecomputable: 1 })
      expect(readings(db).find((r) => r.session === '2026-09-22')?.iv30).toBe('0.5200')
    })

    it('limits itself to the given ticker', async () => {
      await collect(makeBarSource(SHORT_CALENDAR), FRIDAY_EVENING, SHORT_CALENDAR, 'MSFT')
      setRow('2026-09-22', `iv30 = '0.5200', engine_version = 0`, 'MSFT')

      expect(recomputeIvHistory(db, { ticker: TICKER, logger })).toEqual({
        recomputed: 0,
        unrecomputable: 0
      })
      expect(readings(db, 'MSFT').find((r) => r.session === '2026-09-22')?.iv30).toBe('0.5200')
      expect(recomputeIvHistory(db, { logger })).toEqual({ recomputed: 1, unrecomputable: 0 })
    })

    it('takes no provider', () => {
      expectTypeOf(recomputeIvHistory).parameter(0).toEqualTypeOf<Database.Database>()
      expectTypeOf<NonNullable<Parameters<typeof recomputeIvHistory>[1]>>().not.toHaveProperty(
        'provider'
      )
      expectTypeOf(recomputeIvHistory).returns.toEqualTypeOf<{
        recomputed: number
        unrecomputable: number
      }>()
    })
  })
})
