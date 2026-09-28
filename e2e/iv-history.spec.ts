// [US-121] IV rank computed from the app's own IV history — E2E acceptance tests.
//
// One `it()` per acceptance scenario (and per Scenario Outline row) in Linear OPT-27, named
// verbatim. Background: AAPL is on the bench, and Barchart is gone — every reading on screen
// comes from the real IV30 engine inverting daily bars the fake provider priced from a
// programmed IV series (WHEELBASE_FAKE_IV_SERIES). Nothing stubs a rank.
//
// Scenarios that name a calendar date (2026-03-12) are placed on a window session derived
// from BASE_DAY instead, so the suite keeps working after that date leaves the rank window.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDate,
  isFriday,
  parseISO,
  startOfMonth
} from 'date-fns'
import electronPath from 'electron'
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { APP_CWD, cleanupDb, getPage, launchElectron, tmpDb } from './assignment-helpers'
import {
  FAKE_NOW_DAY,
  buildIvrLaunchEnv,
  collectIvrNow,
  collectIvrScheduled,
  corruptIv30,
  flatSeries,
  readDailyBarRequests,
  readIv30Gaps,
  readIv30History,
  readingNote,
  recomputeIvHistory,
  seedWatchlist,
  seriesEnding,
  seriesForRank,
  seriesWithPercentile,
  seriesWithRange,
  setIvSeries,
  setIvrNow,
  sparseSeries,
  tableExists,
  waitForIvHistory,
  type FakeIvSeries,
  type FakeIvSeriesFixture,
  type Iv30ReadingRow,
  type IvrLaunchOpts
} from './ivr-helpers'
import {
  KO_PUT,
  cardReason,
  hoverIvrRing,
  ivrCell,
  launchScreener,
  goToBench,
  meetsTickers,
  reloadBench,
  selectCard,
  setIvRankFloor,
  waitForBenchCard,
  waitForMeetsCardCount,
  type PutFixtureSpec
} from './screener-helpers'
import {
  BASE_DAY,
  afterCloseOn,
  mostRecent,
  sessionCloseOn,
  sessionsBefore,
  sessionsBetween,
  weekdayCalendar
} from './trading-day-fixtures'

// ── Local helpers ─────────────────────────────────────────────────────────────

type BenchLaunchOpts = IvrLaunchOpts & {
  /** Tickers seeded onto the watchlist through the production IPC. */
  watchlist: string[]
  /** Wait for every watchlist ticker's backfill before opening the bench. Default true. */
  settle?: boolean
  /** Extra env layered over the IV launch env. */
  env?: Record<string, string>
}

/** Boot the app, seed the watchlist (which backfills each ticker), open the bench. */
async function launchBench(
  dbPath: string,
  { watchlist, settle = true, env: extra = {}, ...opts }: BenchLaunchOpts
): Promise<{ app: ElectronApplication; page: Page }> {
  // An armed earnings seam keeps the bench off the live Finnhub API.
  const env = { ...buildIvrLaunchEnv(dbPath, opts), WHEELBASE_MOCK_EARNINGS: '{}', ...extra }
  const app = await launchElectron(env)
  const page = await getPage(app)
  try {
    await seedWatchlist(page, watchlist)
    if (settle) await waitForIvHistory(page, watchlist)
    await goToBench(page)
    for (const ticker of watchlist) await waitForBenchCard(page, ticker)
  } catch (err) {
    await app.close()
    throw err
  }
  return { app, page }
}

/** Hover a card's IV reading and return the tooltip's full text. */
async function tooltipText(page: Page, ticker: string): Promise<string> {
  await hoverIvrRing(page, ticker)
  return (await page.textContent('[data-testid="ivr-tooltip"]')) ?? ''
}

/** Replace one session's spec in a series. */
function withSession(
  series: FakeIvSeries,
  session: string,
  spec: FakeIvSeries['sessions'][string]
): FakeIvSeries {
  return { ...series, sessions: { ...series.sessions, [session]: spec } }
}

/** The window sessions (oldest first, anchor excluded) a series holds readings for. */
function windowSessions(series: FakeIvSeries): string[] {
  return Object.keys(series.sessions)
    .sort()
    .filter((day) => day < FAKE_NOW_DAY)
}

function rowsFor<T extends { underlying: string }>(rows: T[], ticker: string): T[] {
  return rows.filter((row) => row.underlying === ticker)
}

/** A put chain for a ticker with no shared fixture — KO's contract, re-keyed. */
function putFor(ticker: string): PutFixtureSpec {
  return { ...KO_PUT, ticker }
}

/** The third Friday of the month `monthsBack` months before BASE_DAY. */
function thirdFridayMonthsBack(monthsBack: number): string {
  let day = addDays(startOfMonth(addMonths(parseISO(BASE_DAY), -monthsBack)), 14)
  while (!isFriday(day)) day = addDays(day, 1)
  return format(day, 'yyyy-MM-dd')
}

function daysBefore(day: string, days: number): string {
  return format(addDays(parseISO(day), -days), 'yyyy-MM-dd')
}

function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

function isThirdFridayDay(day: string): boolean {
  const date = parseISO(day)
  return isFriday(date) && getDate(date) >= 15 && getDate(date) <= 21
}

/**
 * Before launch: build the pre-upgrade schema (migrations 001–015) in `dbPath`, with AAPL on
 * the watchlist and one Barchart `ivr_snapshot` row for it from last week.
 *
 * better-sqlite3 in this worktree is compiled for Electron's ABI, so the Vitest (system Node)
 * process cannot load it. The script runs under the Electron binary in node mode
 * (ELECTRON_RUN_AS_NODE), which is the ABI it was built for.
 */
function seedLegacyDb(dbPath: string): void {
  const script = `
    const fs = require('node:fs')
    const path = require('node:path')
    const Database = require(require.resolve('better-sqlite3', { paths: [process.cwd()] }))
    const [dbPath, observedAt, addedAt] = process.argv.slice(1)
    const db = new Database(dbPath)
    db.exec('CREATE TABLE _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL)')
    const files = fs.readdirSync('migrations').filter((f) => f.endsWith('.sql') && f < '016').sort()
    for (const file of files) {
      db.exec(fs.readFileSync(path.join('migrations', file), 'utf-8'))
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, addedAt)
    }
    db.prepare("INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source) VALUES ('AAPL', ?, '72.4', '80.1', '0.3100', 'barchart')").run(observedAt)
    db.prepare("INSERT INTO watchlist (ticker, added_at) VALUES ('AAPL', ?)").run(addedAt)
    db.close()
  `
  execFileSync(
    electronPath as unknown as string,
    [
      '-e',
      script,
      dbPath,
      sessionCloseOn(sessionsBefore(BASE_DAY, 5)),
      `${BASE_DAY}T12:00:00.000Z`
    ],
    { cwd: path.resolve(APP_CWD), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  )
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("US-121: IV rank from the app's own IV history", () => {
  let app: ElectronApplication | undefined
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    app = undefined
    cleanupDb(dbPath)
  })

  async function bench(prefix: string, opts: BenchLaunchOpts): Promise<Page> {
    dbPath = tmpDb(`wb-e2e-us121-${prefix}`)
    const launched = await launchBench(dbPath, opts)
    app = launched.app
    return launched.page
  }

  /** Backfill `ivSeries` for its tickers without opening the bench. */
  async function backfill(
    prefix: string,
    ivSeries: FakeIvSeriesFixture,
    opts: IvrLaunchOpts = {}
  ): Promise<Page> {
    dbPath = tmpDb(`wb-e2e-us121-${prefix}`)
    app = await launchElectron({
      ...buildIvrLaunchEnv(dbPath, { ...opts, ivSeries }),
      WHEELBASE_MOCK_EARNINGS: '{}'
    })
    const page = await getPage(app)
    await seedWatchlist(page, Object.keys(ivSeries))
    await waitForIvHistory(page, Object.keys(ivSeries))
    return page
  }

  const AAPL_RANGE = seriesWithRange({ low: 0.18, high: 0.45, today: 0.2475 })

  it("IV rank is computed from the app's own IV history", async () => {
    const page = await bench('ac1', { ivSeries: { AAPL: AAPL_RANGE }, watchlist: ['AAPL'] })

    expect(rowsFor(await readIv30History(page), 'AAPL')).toHaveLength(253)
    const cell = await ivrCell(page, 'AAPL')
    expect(cell.state).toBe('fresh')
    expect(cell.text).toBe('25')
  })

  it('IV percentile is computed alongside IV rank', async () => {
    const page = await bench('ac2', {
      ivSeries: { AAPL: seriesWithPercentile({ belowCount: 180, today: 0.2475 }) },
      watchlist: ['AAPL']
    })

    expect(await tooltipText(page, 'AAPL')).toContain('IV percentile 71')
  })

  it('The IV range behind the rank is reported with it', async () => {
    const page = await bench('ac3', { ivSeries: { AAPL: AAPL_RANGE }, watchlist: ['AAPL'] })

    const tooltip = await tooltipText(page, 'AAPL')
    expect(tooltip).toContain('52-wk IV 0.1800–0.4500')
    expect(tooltip).toContain('IV percentile')
    // Beside the freshness copy: the tier title and body share the tooltip with the range.
    expect(tooltip).toMatch(/Current as of the last session close\. 52-wk IV/)
    expect((await ivrCell(page, 'AAPL')).label).toContain('52-week IV 0.1800 to 0.4500')
  })

  it("A reading outside the window's range is clamped", async () => {
    const page = await bench('ac4', {
      ivSeries: { AAPL: seriesWithRange({ low: 0.18, high: 0.45, today: 0.47 }) },
      watchlist: ['AAPL']
    })

    expect((await ivrCell(page, 'AAPL')).text).toBe('100')
    expect(await tooltipText(page, 'AAPL')).toContain('52-wk IV 0.1800–0.4500')
  })

  it('A flat window withholds rank but not percentile', async () => {
    const page = await bench('ac5', { ivSeries: { AAPL: flatSeries(0.2) }, watchlist: ['AAPL'] })

    const cell = await ivrCell(page, 'AAPL')
    expect(cell.text).toBe('n/a')
    // A reading exists — it carries a tier, unlike an absent one (`empty`).
    expect(cell.state).toBe('fresh')
    expect(await tooltipText(page, 'AAPL')).toContain('IV percentile 0')
  })

  it('A corrected engine recomputes every derived metric from stored inputs', async () => {
    const corrected = windowSessions(AAPL_RANGE)[140]
    const page = await bench('ac6', {
      ivSeries: { AAPL: withSession(AAPL_RANGE, corrected, 0.26) },
      watchlist: ['AAPL']
    })
    const before = {
      cell: (await ivrCell(page, 'AAPL')).text,
      tip: await tooltipText(page, 'AAPL')
    }
    const requests = (await readDailyBarRequests(page)).length

    await corruptIv30(page, { ticker: 'AAPL', session: corrected, iv30: '0.5200' })
    await reloadBench(page)
    // The defect is visible: the stored 0.52 became the window's high.
    expect(await tooltipText(page, 'AAPL')).toContain('52-wk IV 0.1800–0.5200')

    expect((await recomputeIvHistory(page)).recomputed).toBe(1)
    const rows = rowsFor(await readIv30History(page), 'AAPL')
    const row = rows.find((r) => r.session === corrected)!
    expect(row.iv30).toBe('0.2600')
    expect(row.engine_version).toBe(rows[0].engine_version)
    expect(row.engine_version).toBeGreaterThan(0)

    await reloadBench(page)
    expect((await ivrCell(page, 'AAPL')).text).toBe(before.cell)
    expect(await tooltipText(page, 'AAPL')).toBe(before.tip)
    expect((await readDailyBarRequests(page)).length).toBe(requests)
  })

  it('Reading IV metrics makes no market-data request', async () => {
    const page = await bench('ac7', { ivSeries: { AAPL: AAPL_RANGE }, watchlist: ['AAPL'] })
    const requests = await readDailyBarRequests(page)
    expect(requests.length).toBeGreaterThan(0)

    await reloadBench(page)
    await waitForBenchCard(page, 'AAPL')
    expect(await tooltipText(page, 'AAPL')).toContain('52-wk IV 0.1800–0.4500 · IV percentile')
    await reloadBench(page)
    await waitForBenchCard(page, 'AAPL')
    expect((await ivrCell(page, 'AAPL')).text).toBe('25')

    expect(await readDailyBarRequests(page)).toEqual(requests)
  })

  it('A reading is withheld while the window is too sparse to trust', async () => {
    const page = await bench('ac8', {
      ivSeries: { AAPL: AAPL_RANGE, NVDA: sparseSeries(150) },
      watchlist: ['AAPL', 'NVDA']
    })

    const cell = await ivrCell(page, 'NVDA')
    expect(cell.text).toBe('n/a')
    expect(cell.state).toBe('empty')
    expect(cell.reason).toBe('insufficient_history')
    expect(cell.title).toBe('IV history covers 150 of the last 252 sessions; rank needs 200')
    // No reading at all: no ring, no tooltip, so no percentile and no range either.
    expect(cell.ring).toBeNull()
    expect(
      await page.locator('[data-testid="watchlist-row-NVDA"] [data-testid="ivr-cell"]').count()
    ).toBe(0)

    await selectCard(page, 'NVDA')
    const note = await readingNote(page)
    expect(note.kind).toBe('insufficient_history')
    expect(note.text).toContain('covers 150 of the last 252 sessions and rank needs 200')
  })

  it('A young history is withheld the same way', async () => {
    // 60 window sessions plus today's anchor.
    const young = seriesEnding(
      FAKE_NOW_DAY,
      Array.from({ length: 61 }, (_, i) => (i % 2 === 0 ? 0.2 : 0.6))
    )
    const page = await bench('ac9', { ivSeries: { NVDA: young }, watchlist: ['NVDA'] })

    const cell = await ivrCell(page, 'NVDA')
    expect(cell.text).toBe('n/a')
    expect(cell.state).toBe('empty')
    expect(cell.reason).toBe('insufficient_history')
    expect(cell.title).toContain('covers 60 of the last 252 sessions')
    // The readings are there — the rank is withheld, not missing.
    expect(rowsFor(await readIv30History(page), 'NVDA')).toHaveLength(61)
  })

  it('Adding a ticker does not wait on its backfill', async () => {
    const page = await bench('ac10', {
      ivSeries: { AAPL: AAPL_RANGE, MSFT: { ...seriesForRank(40), latencyMs: 3000 } },
      watchlist: ['AAPL']
    })
    await page.click('[data-testid="bench-add-toggle"]')
    await page.waitForSelector('[data-testid="watchlist-add-submit"]')
    await page.fill('#ticker', 'MSFT')

    const started = Date.now()
    await page.click('[data-testid="watchlist-add-submit"]')
    await waitForBenchCard(page, 'MSFT')
    // The backfill sleeps 3 s on each of its two bar requests.
    expect(Date.now() - started).toBeLessThan(1500)

    const computing = await ivrCell(page, 'MSFT')
    expect(computing.text).toBe('…')
    expect(computing.state).toBe('pending')
    expect(computing.title).toBe('Computing IV history')

    await expect
      .poll(async () => (await ivrCell(page, 'MSFT')).text, { timeout: 15_000 })
      .toBe('40')
    expect((await ivrCell(page, 'MSFT')).state).toBe('fresh')
  })

  it("One ticker's backfill failure leaves the others intact", async () => {
    // Complete through the previous session, so the run has today's session to collect.
    const aged = (rank: number): FakeIvSeries => seriesForRank(rank, { endingSessionsAgo: 1 })
    const page = await bench('ac11', {
      ivSeries: {
        AAPL: aged(25),
        MSFT: aged(40),
        SPY: aged(60),
        NVDA: { ...aged(50), failWith: 'network_error' }
      },
      watchlist: ['AAPL', 'MSFT', 'NVDA', 'SPY'],
      settle: false
    })
    await waitForIvHistory(page, ['AAPL', 'MSFT', 'SPY'])
    await setIvSeries(page, {
      AAPL: seriesForRank(25),
      MSFT: seriesForRank(40),
      SPY: seriesForRank(60),
      NVDA: { ...seriesForRank(50), failWith: 'network_error' }
    })

    const batch = await collectIvrNow(page)
    expect(batch.errorCount).toBe(1)
    expect(batch.successCount).toBeGreaterThanOrEqual(3)

    const history = await readIv30History(page)
    for (const ticker of ['AAPL', 'MSFT', 'SPY']) {
      expect(rowsFor(history, ticker).some((row) => row.session === FAKE_NOW_DAY)).toBe(true)
    }
    expect(rowsFor(history, 'NVDA')).toHaveLength(0)

    await expect.poll(async () => (await ivrCell(page, 'NVDA')).reason).toBe('failed')
    const nvda = await ivrCell(page, 'NVDA')
    expect(nvda.text).toBe('n/a')
    expect(nvda.title).toBe('Last IV history run failed')
    for (const ticker of ['AAPL', 'MSFT', 'SPY']) {
      await expect.poll(async () => (await ivrCell(page, ticker)).text).toMatch(/^\d+$/)
    }
  })

  it('Missed sessions are caught up by the next daily run', async () => {
    const threeAgo = sessionsBefore(BASE_DAY, 3)
    const values = Array.from({ length: 256 }, (_, i) => (i % 2 === 0 ? 0.2 : 0.6))
    const full = seriesEnding(BASE_DAY, values)
    const initial = seriesEnding(threeAgo, values.slice(0, 253))
    const page = await backfill('ac12', { AAPL: initial }, { fakeNow: afterCloseOn(threeAgo) })
    const backfillKinds = [...new Set((await readDailyBarRequests(page)).map((r) => r.kind))].sort()
    const before = rowsFor(await readIv30History(page), 'AAPL').map((row) => row.session)
    expect(before.at(-1)).toBe(threeAgo)

    await setIvrNow(page, afterCloseOn(BASE_DAY))
    await setIvSeries(page, { AAPL: full })
    await collectIvrScheduled(page)

    const after = rowsFor(await readIv30History(page), 'AAPL').map((row) => row.session)
    expect(after.filter((session) => !before.includes(session))).toEqual(
      sessionsBetween(BASE_DAY, 3)
    )
    const catchUpKinds = [...new Set((await readDailyBarRequests(page)).map((r) => r.kind))].sort()
    expect(catchUpKinds).toEqual(backfillKinds)
  })

  it('An untraded strike is skipped for its neighbour', async () => {
    const base = { ...flatSeries(0.26), price: 200.4 }
    const untradedDay = windowSessions(base)[140]
    const page = await backfill('ac13', {
      AAPL: withSession(base, untradedDay, {
        iv: 0.26,
        untraded: [{ strike: 200.5, type: 'call' }]
      })
    })

    const rows = rowsFor(await readIv30History(page), 'AAPL')
    const row = rows.find((r) => r.session === untradedDay)!
    expect(row.near_strike).toBe('200.0000')
    expect(row.near_call_trades).toBe(100)
    expect(row.near_put_trades).toBe(100)
    // Every other session takes the nearest strike.
    expect(rows.find((r) => r.session !== untradedDay)!.near_strike).toBe('200.5000')
  })

  it('Thin weeklies fall back to the monthly expirations', async () => {
    const page = await backfill('ac14', { CHWY: { ...flatSeries(0.3), weeklyTradeCount: 0 } })

    const rows = rowsFor(await readIv30History(page), 'CHWY')
    // A session exactly 30 days before a third Friday needs no bracket: the weekly tier's
    // lone 30-DTE Friday *is* the monthly, it traded, and no fallback happens.
    const exactly30 = (row: Iv30ReadingRow): boolean =>
      row.far_expiration === null && daysBetween(row.session, row.near_expiration) === 30
    const fallbacks = rows.filter((row) => !exactly30(row))
    expect(fallbacks.length).toBeGreaterThan(200)
    for (const row of fallbacks) {
      expect(row.expiration_tier).toBe('monthly')
      expect(isThirdFridayDay(row.near_expiration)).toBe(true)
      expect(row.far_expiration === null || isThirdFridayDay(row.far_expiration)).toBe(true)
    }
    for (const row of rows.filter(exactly30)) {
      expect(isThirdFridayDay(row.near_expiration)).toBe(true)
    }
  })

  it('A day with no tradeable ATM pair is left as a gap', async () => {
    // 201 window readings less the untradeable day is 200 — enough to rank. 200 less it is
    // 199 — not enough: the gap counts against coverage.
    const gapIn = (series: FakeIvSeries): { series: FakeIvSeries; day: string } => {
      const day = windowSessions(series)[100]
      return { series: withSession(series, day, { iv: 0.3, tradeCount: 0 }), day }
    }
    const enough = gapIn(sparseSeries(201))
    const short = gapIn(sparseSeries(200))
    const page = await bench('ac15', {
      ivSeries: { AAPL: enough.series, NVDA: short.series },
      watchlist: ['AAPL', 'NVDA']
    })

    const history = await readIv30History(page)
    expect(rowsFor(history, 'AAPL').some((row) => row.session === enough.day)).toBe(false)
    const untradeable = (await readIv30Gaps(page)).filter((g) => g.reason === 'no_tradeable_pair')
    expect(untradeable.map((g) => `${g.underlying}:${g.session}`)).toEqual([
      `AAPL:${enough.day}`,
      `NVDA:${short.day}`
    ])

    expect((await ivrCell(page, 'AAPL')).text).toMatch(/^\d+$/)
    const nvda = await ivrCell(page, 'NVDA')
    expect(nvda.reason).toBe('insufficient_history')
    expect(nvda.title).toBe('IV history covers 199 of the last 252 sessions; rank needs 200')
  })

  it("Today's reading is computed the same way as the history", async () => {
    const page = await backfill('ac16', { AAPL: AAPL_RANGE })

    const rows = rowsFor(await readIv30History(page), 'AAPL')
    const today = rows.find((row) => row.session === FAKE_NOW_DAY)!
    const oldest = rows[0]
    expect(today.iv30).toBe('0.2475')
    expect(today.method).toBe(oldest.method)
    expect(today.engine_version).toBe(oldest.engine_version)
    expect(today.rate).toBe(oldest.rate)
    expect(today.near_call_trades).toBeGreaterThan(0)
    // Only daily bars were read; no snapshot or vendor IV fed the reading.
    const kinds = new Set((await readDailyBarRequests(page)).map((r) => r.kind))
    expect([...kinds].sort()).toEqual(['option', 'stock'])
  })

  it('Bar requests never name the current calendar day as their end', async () => {
    const page = await backfill('ac17', { AAPL: AAPL_RANGE })
    const evening = await readDailyBarRequests(page)
    expect(evening.length).toBeGreaterThan(0)
    for (const request of evening) {
      expect(request.end === null || request.end < FAKE_NOW_DAY).toBe(true)
    }

    // A Saturday run: the last completed session is Friday, and every request ends there.
    const friday = mostRecent(5)
    await setIvrNow(page, afterCloseOn(format(addDays(parseISO(friday), 1), 'yyyy-MM-dd')))
    await setIvSeries(page, { MSFT: seriesEnding(friday, Array(253).fill(0.3)) })
    await seedWatchlist(page, ['MSFT'])
    await waitForIvHistory(page, ['MSFT'])
    const saturday = await readDailyBarRequests(page)
    expect(saturday.length).toBeGreaterThan(0)
    expect(saturday.map((request) => request.end)).toEqual(saturday.map(() => friday))
  })

  it("Today's reading is available the same evening", async () => {
    const page = await backfill('ac18', { AAPL: AAPL_RANGE }, { fakeNow: afterCloseOn(BASE_DAY) })

    const today = rowsFor(await readIv30History(page), 'AAPL').find(
      (row) => row.session === BASE_DAY
    )
    expect(today?.observed_at).toBe(sessionCloseOn(BASE_DAY))
    const requests = await readDailyBarRequests(page)
    expect(requests.map((r) => r.kind).sort()).toEqual(['option', 'stock'])
    expect(requests.every((request) => request.end === null)).toBe(true)
  })

  it('Barchart readings are removed on upgrade', async () => {
    dbPath = tmpDb('wb-e2e-us121-ac19')
    seedLegacyDb(dbPath)
    app = await launchElectron({
      ...buildIvrLaunchEnv(dbPath, {}),
      WHEELBASE_MOCK_EARNINGS: '{}'
    })
    const page = await getPage(app)
    await goToBench(page)
    await waitForBenchCard(page, 'AAPL')

    expect(await tableExists(page, 'ivr_snapshot')).toBe(false)
    expect(await tableExists(page, 'iv30_reading')).toBe(true)
    const cell = await ivrCell(page, 'AAPL')
    expect(cell.text).toBe('n/a')
    expect(cell.state).toBe('empty')
    expect(cell.reason).toBe('not_collected')
    expect(cell.title).toBe('No IV rank collected')
  })

  it('No market-data credentials leaves IV rank unavailable, not broken', async () => {
    const page = await bench('ac20', {
      ivSeries: { AAPL: AAPL_RANGE, MSFT: seriesForRank(40) },
      watchlist: ['AAPL'],
      settle: false,
      withoutBrokerCredentials: true,
      env: { FAKE_MARKET_DATA_ERROR: 'auth_failed' }
    })

    await page.click('[data-testid="bench-add-toggle"]')
    await page.waitForSelector('[data-testid="watchlist-add-submit"]')
    await page.fill('#ticker', 'MSFT')
    await page.click('[data-testid="watchlist-add-submit"]')
    await waitForBenchCard(page, 'MSFT')

    await expect.poll(async () => (await ivrCell(page, 'MSFT')).reason).toBe('no_market_data')
    const cell = await ivrCell(page, 'MSFT')
    expect(cell.text).toBe('n/a')
    expect(cell.title).toBe('IV rank needs Alpaca market-data credentials')
    await selectCard(page, 'MSFT')
    expect((await readingNote(page)).kind).toBe('no_market_data')

    const batch = await collectIvrNow(page)
    expect(batch.skippedReason).toBe('market_data_unavailable')
    for (const ticker of ['AAPL', 'MSFT']) {
      await expect.poll(async () => (await ivrCell(page, ticker)).reason).toBe('no_market_data')
    }
  })

  describe('The computed rank drives the screener floor', () => {
    const NVDA_PUT = putFor('NVDA')

    async function screen(prefix: string, ivSeries: FakeIvSeriesFixture): Promise<Page> {
      dbPath = tmpDb(`wb-e2e-us121-${prefix}`)
      const launched = await launchScreener(dbPath, { fixtures: [NVDA_PUT], ivSeries })
      app = launched.app
      await waitForIvHistory(launched.page, ['NVDA'])
      await reloadBench(launched.page)
      await waitForBenchCard(launched.page, 'NVDA', 'meets')
      return launched.page
    }

    it('The computed rank drives the screener floor — 29 is excluded', async () => {
      const page = await screen('ac21a', { NVDA: seriesForRank(29) })
      await setIvRankFloor(page, '30')

      await waitForMeetsCardCount(page, 0)
      const reason = await cardReason(page, 'NVDA')
      expect(reason).toMatch(/^IV rank 29 \(/)
      expect(reason).toContain('below 30')
    })

    it('The computed rank drives the screener floor — 30 is included', async () => {
      const page = await screen('ac21b', { NVDA: seriesForRank(30) })
      await setIvRankFloor(page, '30')

      expect(await meetsTickers(page)).toEqual(['NVDA'])
      expect((await ivrCell(page, 'NVDA')).text).toBe('30')
    })

    it('The computed rank drives the screener floor — n/a is treated as it is today when IVR is unavailable', async () => {
      const page = await screen('ac21c', { NVDA: sparseSeries(150) })
      await setIvRankFloor(page, '30')

      // An absent rank is unknown, and unknown never trips the floor.
      expect(await meetsTickers(page)).toEqual(['NVDA'])
      const cell = await ivrCell(page, 'NVDA')
      expect(cell.text).toBe('n/a')
      expect(cell.reason).toBe('insufficient_history')
    })
  })

  describe('Expirations too near expiry are excluded from IV30', () => {
    /**
     * Backfill a monthly-only AAPL series and return the row for the session `dte` calendar
     * days before a third Friday `expiry`, along with that expiry and the next monthly.
     *
     * Six days before a Friday is a Saturday, so the 6-DTE row makes that third Friday an
     * exchange holiday: the monthly then expires on the Thursday, and the session six days
     * before it is a Friday.
     */
    async function rowAtDte(
      dte: number
    ): Promise<{ near: string; far: string | null; expiry: string; nextMonthly: string }> {
      const thirdFriday = thirdFridayMonthsBack(4)
      const holiday = dte === 6
      const expiry = holiday ? daysBefore(thirdFriday, 1) : thirdFriday
      const session = daysBefore(expiry, dte)
      const page = await backfill(
        `ac22-${dte}`,
        { AAPL: { ...flatSeries(0.26), weeklyTradeCount: 0 } },
        holiday ? { marketCalendar: weekdayCalendar([thirdFriday]) } : {}
      )
      const row = rowsFor(await readIv30History(page), 'AAPL').find((r) => r.session === session)
      if (!row) throw new Error(`no reading for ${session}`)
      expect(row.expiration_tier).toBe('monthly')
      return {
        near: row.near_expiration,
        far: row.far_expiration,
        expiry,
        nextMonthly: thirdFridayMonthsBack(3)
      }
    }

    it('Expirations too near expiry are excluded from IV30 — 3 DTE excluded', async () => {
      const { near, far, nextMonthly } = await rowAtDte(3)
      expect(near).toBe(nextMonthly)
      expect(far).toBeNull()
    })

    it('Expirations too near expiry are excluded from IV30 — 6 DTE excluded', async () => {
      const { near, far, nextMonthly } = await rowAtDte(6)
      expect(near).toBe(nextMonthly)
      expect(far).toBeNull()
    })

    it('Expirations too near expiry are excluded from IV30 — 7 DTE used', async () => {
      const { near, far, expiry, nextMonthly } = await rowAtDte(7)
      expect(near).toBe(expiry)
      expect(far).toBe(nextMonthly)
    })

    it('Expirations too near expiry are excluded from IV30 — 9 DTE used', async () => {
      const { near, far, expiry, nextMonthly } = await rowAtDte(9)
      expect(near).toBe(expiry)
      expect(far).toBe(nextMonthly)
    })

    it('Expirations too near expiry are excluded from IV30 — 14 DTE used', async () => {
      const { near, far, expiry, nextMonthly } = await rowAtDte(14)
      expect(near).toBe(expiry)
      expect(far).toBe(nextMonthly)
    })
  })
})
