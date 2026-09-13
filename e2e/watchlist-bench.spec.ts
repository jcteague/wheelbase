// [US-96] One live bench — the watchlist and screener on a single page — E2E tests.
//
// Exactly one `it()` per acceptance-criteria scenario in
// docs/epics/08-stories/US-96-watchlist-live-snapshot.md, each named verbatim. The suite
// boots the real Electron app over the offline seams: the fake market-data provider serves
// the put chains and the underlying quotes, the US-44 fake scraper seeds the IV ranks
// through the production collector, and the fake earnings calendar answers US-70's
// lookups. Nothing between the IPC and the DOM is stubbed, so every string asserted below
// is one the real engines produced.
//
// The Background is one nine-stock bench, `BENCH_*` in `e2e/screener-helpers.ts`: two
// stocks that meet criteria and seven held back, one per reason the bench can give. A
// scenario that needs a different premise states only its delta from that bench, so the
// launch options of each test read as its own Given.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { format, parseISO } from 'date-fns'
import { CLOSED_SESSION, cleanupDb, tmpDb } from './assignment-helpers'
import { fmtBadgeDate } from './earnings-format'
import {
  BENCH_CONDITIONS,
  BENCH_EARNINGS,
  BENCH_IVR,
  BENCH_PUTS,
  BENCH_QUOTES,
  PEP_OBSERVED_SESSION,
  PUT_CAPTION,
  PUT_CONTRACT,
  PUT_EXPIRATION,
  QUOTE_TIMESTAMP,
  TSLA_PUT,
  cardReason,
  criteriaChips,
  criteriaValues,
  detailDayChange,
  detailEarnings,
  detailPutMetrics,
  hoverIvrRing,
  ivrCell,
  launchScreener,
  listPositions,
  meetsTickers,
  openCriteriaSheet,
  promoteCard,
  saveCriteria,
  screenerDate,
  selectCard,
  setCriteriaValues,
  setOptionSnapshotFixtures,
  waitForBenchCard,
  waitForCriteriaSheetClosed,
  waitForMeetsCardCount,
  waitingTickers,
  type ScreenerLaunchOpts
} from './screener-helpers'
import { observedSessionsAgo } from './trading-day-fixtures'

/** Every bench put expires on the same day, 37 DTE out — the story's "Oct 16". */
const BENCH_EXPIRATION = screenerDate(37)
const BENCH_EXPIRY_LABEL = fmtBadgeDate(BENCH_EXPIRATION)

/**
 * The theses the detail panel and the promote handoff read back.
 *
 * Every bench stock carries one, not just the two the promote and condition scenarios
 * need: the outage AC asks that *every* card keep its thesis, and a ticker with no note
 * renders no thesis element at all — so a partial record would leave that sweep asserting
 * nothing for the stocks it skipped.
 */
const BENCH_NOTES: Record<string, string> = {
  KO: 'Core wheel',
  AAPL: 'Would own it below $170 after a pullback',
  XLF: 'Broad financial exposure, no personal conditions',
  MSFT: 'Wait until after the earnings report',
  PEP: 'Second staple, only when premium is rich',
  ORCL: 'Sell the post-earnings vol crush, not the run-up',
  DIS: 'Media exposure at a discount',
  AMD: 'Conditions pass, waiting for a more liquid put',
  XYZ: 'Research name, needs more IV history'
}

/** The Background: one bench, nine stocks, every verdict represented. */
const BENCH: ScreenerLaunchOpts = {
  fixtures: BENCH_PUTS,
  conditions: BENCH_CONDITIONS,
  ivr: BENCH_IVR,
  earnings: BENCH_EARNINGS,
  stockQuotes: BENCH_QUOTES,
  watchlistNotes: BENCH_NOTES
}

/**
 * The Background with one scenario's delta applied.
 *
 * The per-ticker fixtures merge *by ticker* rather than replacing wholesale: a scenario
 * that restates AAPL's conditions is changing AAPL's premise, not emptying the other
 * eight stocks'. Replacing them would leave those stocks with no conditions, no earnings
 * or no quote — and they would quietly change section for a reason the scenario never
 * mentioned, which is exactly the kind of wiped fixture that makes a suite lie.
 *
 * Everything else replaces: the outage flags, the market session and the clock are single
 * values with nothing to merge. `fixtures` replaces too, but a scenario that wants a
 * different watchlist should call `launch` with its own options rather than narrow the
 * bench here — the merged per-ticker records would still name the stocks it dropped, and
 * `seedIvr` rejects an IV rank for a ticker that is not on the watchlist.
 */
function benchOpts(overrides: ScreenerLaunchOpts = {}): ScreenerLaunchOpts {
  return {
    ...BENCH,
    ...overrides,
    conditions: { ...BENCH.conditions, ...overrides.conditions },
    earnings: { ...BENCH.earnings, ...overrides.earnings },
    ivr: { ...BENCH.ivr, ...overrides.ivr },
    stockQuotes: { ...BENCH.stockQuotes, ...overrides.stockQuotes },
    watchlistNotes: { ...BENCH.watchlistNotes, ...overrides.watchlistNotes }
  }
}

/** The Background's shipped defaults, as the sheet's inputs and the strip render them. */
const DEFAULT_CRITERIA_FIELDS = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: '30',
  dteMax: '45',
  minOpenInterest: '500',
  maxSpreadPercent: '10',
  maxUnderlyingPrice: '',
  minIvRank: ''
}

const DEFAULT_CRITERIA_CHIPS = [
  'Δ 0.20–0.30',
  'DTE 30–45',
  'OI ≥ 500',
  'Spread ≤ 10%',
  'Earnings Exclude'
]

/** One value off a stock's card. The card is the whole watchlist row now, so every
 *  per-stock seam — price, contract, reason — is scoped to it. */
function cardValue(page: Page, ticker: string, testId: string): Promise<string> {
  return page
    .locator(`[data-testid="watchlist-row-${ticker}"] [data-testid="${testId}"]`)
    .innerText()
}

function detailText(page: Page, testId: string): Promise<string> {
  return page.locator(`[data-testid="${testId}"]`).innerText()
}

/** The header's count of saved stocks — what "the header count increases by one" means. */
async function benchCount(page: Page): Promise<number> {
  return Number(await page.locator('[data-testid="bench-count"]').innerText())
}

describe('US-96: one live bench', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, opts: ScreenerLaunchOpts): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, opts)
    app = launched.app
    return launched.page
  }

  /** The Background bench, screened — every ranking assertion needs the screen to have
   *  landed, not just the watchlist snapshot the cards first render from. */
  async function launchBench(prefix: string, overrides: ScreenerLaunchOpts = {}): Promise<Page> {
    const page = await launch(prefix, benchOpts(overrides))
    await waitForBenchCard(page, 'KO', 'meets')
    return page
  }

  // ── One page ───────────────────────────────────────────────────────────────

  it('The screener lives on the Watchlist page', async () => {
    const page = await launchBench('wb-e2e-us96-ac1')

    expect(await page.locator('a[href="#/watchlist"]').isVisible()).toBe(true)
    expect(await page.locator('a[href="#/screener"]').count()).toBe(0)

    for (const action of ['bench-criteria', 'bench-refresh', 'bench-add-toggle']) {
      expect(await page.locator(`[data-testid="${action}"]`).isVisible()).toBe(true)
    }
    expect(await page.locator('[data-testid="market-status-pill"]').isVisible()).toBe(true)
  })

  it('A stock that passes its conditions and has a qualifying put meets criteria', async () => {
    const page = await launchBench('wb-e2e-us96-ac2')

    expect(await meetsTickers(page)).toContain('KO')
    expect(await cardValue(page, 'KO', 'watchlist-contract')).toBe(
      `$60.00 put · ${BENCH_EXPIRY_LABEL} · 1.58% yield`
    )
  })

  it("Meets-criteria cards follow the screener's rank order", async () => {
    const page = await launchBench('wb-e2e-us96-ac3')
    await waitForBenchCard(page, 'XLF', 'meets')

    // KO's 0.71 yield-per-delta outranks XLF's 0.53 — pinned through the engine in
    // `src/main/core/screener.test.ts`. Every other bench stock is held back.
    expect(await meetsTickers(page)).toEqual(['KO', 'XLF'])
  })

  it('A stock with no personal conditions meets criteria on the screening defaults alone', async () => {
    const page = await launchBench('wb-e2e-us96-ac4')
    await waitForBenchCard(page, 'XLF', 'meets')

    await selectCard(page, 'XLF')
    // Not "All conditions met": XLF's trader set none, and the verdict must not credit
    // them with a judgement they never made.
    expect(await detailText(page, 'bench-detail-verdict')).toBe('Screening criteria met')
  })

  it('The detail panel shows the matching put and a Review trade action', async () => {
    const page = await launchBench('wb-e2e-us96-ac5')

    await selectCard(page, 'KO')
    const metrics = await detailPutMetrics(page)

    expect(metrics.get(PUT_CONTRACT)).toBe('$60.00 PUT')
    expect(metrics.get(PUT_EXPIRATION)).toBe(`${BENCH_EXPIRY_LABEL} · 37 DTE`)
    expect(metrics.get('Mark / share')).toBe('$0.95')
    expect(metrics.get('Period yield')).toBe('1.58%')
    expect(metrics.get('Annualized')).toBe('15.62%/yr')
    expect(metrics.get('Delta')).toBe('0.22')
    expect(metrics.get('Open interest')).toBe('1,800')
    expect(metrics.get('Spread')).toBe('$0.06 (6%)')
    expect(metrics.get(PUT_CAPTION)).toContain('Cash to secure 1 contract: $6000.00')

    expect(await page.locator('[data-testid="bench-review-KO"]').isVisible()).toBe(true)
  })

  it('Review trade hands off to the pre-filled new-wheel form', async () => {
    const page = await launchBench('wb-e2e-us96-ac6')

    await promoteCard(page, 'KO')

    expect(await page.inputValue('#ticker')).toBe('KO')
    expect(await page.inputValue('#strike')).toBe('60')
    expect(await page.textContent('#expiration')).toContain(BENCH_EXPIRATION)
    expect(await page.inputValue('#premiumPerContract')).toBe('0.95')
    expect(await page.inputValue('#contracts')).toBe('1')
    expect(await page.inputValue('#thesis')).toBe(BENCH_NOTES.KO)
    // A handoff, not a trade: the form is filled in and nothing has been recorded.
    expect(await listPositions(page)).toEqual([])
  })

  it('The first meets-criteria stock is selected by default', async () => {
    const page = await launchBench('wb-e2e-us96-ac7')

    // Nothing has been clicked: the panel opens on the bench's own best candidate.
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="bench-detail-ticker"]')?.textContent?.trim() === 'KO'
    )
    expect(await detailText(page, 'bench-detail-ticker')).toBe('KO')
  })

  // ── Price ─────────────────────────────────────────────────────────────────

  it('Show last price with the day change', async () => {
    const page = await launchBench('wb-e2e-us96-ac8')

    expect(await cardValue(page, 'AAPL', 'watchlist-price')).toBe('$178.40')

    await selectCard(page, 'AAPL')
    // 178.40 against a 176.98 previous close.
    expect(await detailDayChange(page)).toEqual({ percent: '+0.8%', direction: 'up' })
  })

  it('A down day is shown in red', async () => {
    const page = await launchBench('wb-e2e-us96-ac9')

    await selectCard(page, 'MSFT')
    // 505.10 against a 511.24 previous close, with a U+2212 minus so the column aligns.
    expect(await detailDayChange(page)).toEqual({ percent: '−1.2%', direction: 'down' })
  })

  // ── Condition verdicts ────────────────────────────────────────────────────

  it('An unmet price condition and an unmet IV condition are both reported', async () => {
    const page = await launchBench('wb-e2e-us96-ac10')
    await waitForBenchCard(page, 'AAPL', 'waiting')

    expect(await waitingTickers(page)).toContain('AAPL')
    expect(await cardReason(page, 'AAPL')).toBe('Price $178.40 above $170 target · IV low')
  })

  it('Only the IV condition is reported when the price condition is met', async () => {
    const page = await launchBench('wb-e2e-us96-ac11', {
      conditions: { AAPL: { ownBelowPrice: 185, ivrTrigger: 50 } }
    })
    await waitForBenchCard(page, 'AAPL', 'waiting')

    // $178.40 is below the $185 target, so only the IV reading holds AAPL back.
    expect(await cardReason(page, 'AAPL')).toBe('IV low')
  })

  it('The detail panel shows each entry condition with its verdict', async () => {
    const page = await launchBench('wb-e2e-us96-ac12')

    await selectCard(page, 'AAPL')

    expect(await detailText(page, 'bench-gate-price')).toBe('≤ $170 · not met')
    expect(await detailText(page, 'bench-gate-iv')).toBe('IVR ≥ 50 · not met')
    expect(await detailText(page, 'bench-detail-thesis')).toBe(BENCH_NOTES.AAPL)
  })

  it('The post-earnings gate holds a stock while earnings is near', async () => {
    const page = await launchBench('wb-e2e-us96-ac13')
    await waitForBenchCard(page, 'MSFT', 'waiting')

    expect(await waitingTickers(page)).toContain('MSFT')
    // The gate outranks every other reason MSFT could give.
    expect(await cardReason(page, 'MSFT')).toBe('Earnings in 3 days')
  })

  it('Earnings within the window is shown for any stock, regardless of conditions', async () => {
    const page = await launchBench('wb-e2e-us96-ac14')

    await selectCard(page, 'AMD')
    // AMD set no post-earnings condition; the caution is the row's, not the gate's.
    expect(await detailEarnings(page)).toEqual({
      text: `${fmtBadgeDate(screenerDate(5))} · in 5 days`,
      tone: 'caution'
    })
  })

  it('No earnings caution when the report is outside the window', async () => {
    const page = await launchBench('wb-e2e-us96-ac15')

    await selectCard(page, 'KO')
    expect(await detailEarnings(page)).toEqual({
      text: fmtBadgeDate(screenerDate(40)),
      tone: null
    })
  })

  it('An unknown earnings date is a caution, not a silent pass', async () => {
    const page = await launchBench('wb-e2e-us96-ac16')

    await selectCard(page, 'XYZ')
    // XYZ is absent from the calendar fixture: read, and holding nothing.
    expect(await detailEarnings(page)).toEqual({
      text: 'Unknown · needs verification',
      tone: 'caution'
    })
  })

  it("A stock whose conditions pass but has no qualifying put shows the screener's reason", async () => {
    // AMD's own conditions all pass — IVR 52 clears its trigger of 50 — so the only thing
    // left to report is the engine's. Its earnings are moved past expiry for this scenario
    // alone: with a print inside the holding window the earnings filter would exclude the
    // strike first and the card would quote that instead of the spread.
    const page = await launchBench('wb-e2e-us96-ac17', {
      earnings: { AMD: { dayOffset: 60 } }
    })
    await waitForBenchCard(page, 'AMD', 'waiting')

    expect(await waitingTickers(page)).toContain('AMD')
    expect(await cardReason(page, 'AMD')).toBe('spread 14% exceeds 10%')
  })

  // ── IV-rank freshness (US-98 treatment) ───────────────────────────────────

  it('A fresh reading shows a full green ring', async () => {
    const page = await launchBench('wb-e2e-us96-ac18')

    const cell = await ivrCell(page, 'KO')
    expect(cell.text).toBe('58')
    expect(cell.state).toBe('fresh')
    expect(cell.ring).toBe('fresh')
  })

  it('An aging reading still satisfies an IV condition', async () => {
    const page = await launchBench('wb-e2e-us96-ac19', {
      ivr: { KO: { ivr: 58, observedAt: observedSessionsAgo(2) } }
    })

    // Two sessions old is still decision-usable, so KO's `IVR ≥ 40` is genuinely met.
    expect(await meetsTickers(page)).toContain('KO')
    const cell = await ivrCell(page, 'KO')
    expect(cell.text).toBe('58 · 2d')
    expect(cell.state).toBe('aging')
    expect(cell.ring).toBe('aging')
  })

  it('A stale reading is muted and cannot satisfy an IV condition', async () => {
    const page = await launchBench('wb-e2e-us96-ac20')
    await waitForBenchCard(page, 'PEP', 'waiting')

    // 58 clears PEP's trigger of 45 on its face — but a stale reading decides nothing.
    expect(await waitingTickers(page)).toContain('PEP')
    expect(await cardReason(page, 'PEP')).toBe('IV too old to judge')

    const cell = await ivrCell(page, 'PEP')
    expect(cell.text).toBe('58 · 6d')
    expect(cell.state).toBe('stale')
    expect(cell.ring).toBe('stale')

    // The put the reading is holding back is still shown, so the trader can see the cost.
    await selectCard(page, 'PEP')
    expect(await detailText(page, 'bench-detail-held-back')).toContain(
      `$150.00 · ${BENCH_EXPIRY_LABEL} · 1.19% yield`
    )
  })

  it('A reading that predates earnings cannot satisfy an IV condition', async () => {
    const page = await launchBench('wb-e2e-us96-ac21')
    await waitForBenchCard(page, 'ORCL', 'waiting')

    expect(await cardReason(page, 'ORCL')).toBe('IV predates earnings')

    const cell = await ivrCell(page, 'ORCL')
    // The number still shows — muted, and with no age, because the print, not the clock,
    // is what disqualified it.
    expect(cell.text).toBe('62')
    expect(cell.state).toBe('predates_earnings')
    expect(cell.ring).toBe('predates_earnings')
  })

  it('An expired reading shows exp and a never-collected ticker shows n/a', async () => {
    const page = await launchBench('wb-e2e-us96-ac22')
    await waitForBenchCard(page, 'DIS', 'waiting')
    await waitForBenchCard(page, 'XYZ', 'waiting')

    const expired = await ivrCell(page, 'DIS')
    expect(expired.text).toBe('exp')
    expect(expired.state).toBe('expired')
    expect(expired.ring).toBe('expired')

    const neverCollected = await ivrCell(page, 'XYZ')
    expect(neverCollected.text).toBe('n/a')
    expect(neverCollected.ring).toBeNull()

    // Different readings, same consequence: neither can answer the IV condition.
    expect(await cardReason(page, 'DIS')).toBe('IV unavailable')
    expect(await cardReason(page, 'XYZ')).toBe('IV unavailable')
  })

  it('Hovering the ring explains the reading', async () => {
    const page = await launchBench('wb-e2e-us96-ac23')
    await waitForBenchCard(page, 'PEP', 'waiting')

    await hoverIvrRing(page, 'PEP')

    // `textContent`, not `innerText`: the tier title is authored as `Stale` and drawn in
    // small caps by the stylesheet, and the AC names the word, not the letter-casing.
    const tooltip = (await page.textContent('[data-testid="ivr-tooltip"]')) ?? ''
    expect(tooltip).toContain('Stale')
    expect(tooltip).toContain('6 trading days old')
    // The session it was taken in, named as a trader names it — derived, because the
    // fixture day moves with the calendar.
    expect(tooltip).toContain(format(parseISO(PEP_OBSERVED_SESSION), 'EEE, MMM d'))
    expect(tooltip).toContain('cannot satisfy an IV condition')
  })

  // ── Screening criteria, refresh, add ──────────────────────────────────────

  it('Screening criteria are edited from the Watchlist page', async () => {
    const page = await launchBench('wb-e2e-us96-ac24')

    await openCriteriaSheet(page, 'header')

    expect(await criteriaValues(page)).toEqual(DEFAULT_CRITERIA_FIELDS)
    expect(await criteriaChips(page)).toEqual(DEFAULT_CRITERIA_CHIPS)
    // The sheet opens *over* the bench: the cards are still mounted and the route is
    // still the Watchlist's.
    expect(await page.locator('[data-testid="watchlist-row-KO"]').count()).toBe(1)
    expect(await page.evaluate(() => location.hash)).toBe('#/watchlist')
  })

  it('Saving criteria re-screens the bench in place', async () => {
    const page = await launchBench('wb-e2e-us96-ac25')
    await waitForBenchCard(page, 'XLF', 'meets')
    expect(await meetsTickers(page)).toEqual(['KO', 'XLF'])

    await openCriteriaSheet(page, 'header')
    await setCriteriaValues(page, { deltaMin: '0.15', deltaMax: '0.20' })
    await saveCriteria(page)
    await waitForCriteriaSheetClosed(page)

    await page.waitForSelector('text=Screening criteria saved')
    // Every bench delta sits above 0.20, so the narrower band empties Meets criteria —
    // the sections re-screened rather than kept the pre-save answer.
    await waitForMeetsCardCount(page, 0)
    expect(await meetsTickers(page)).toEqual([])
    expect(await page.evaluate(() => location.hash)).toBe('#/watchlist')
  })

  it('Refresh re-screens the bench', async () => {
    const page = await launchBench('wb-e2e-us96-ac26')
    await waitForBenchCard(page, 'XLF', 'meets')

    // The provider stops serving XLF's strike between the first screen and the refresh.
    await setOptionSnapshotFixtures(
      app,
      BENCH_PUTS.filter((fixture) => fixture.ticker !== 'XLF')
    )
    await page.click('[data-testid="bench-refresh"]')

    await waitForBenchCard(page, 'XLF', 'waiting')
    expect(await meetsTickers(page)).toEqual(['KO'])
  })

  it('Add stock reveals the add form and the new stock joins the bench', async () => {
    const page = await launchBench('wb-e2e-us96-ac27')
    const before = await benchCount(page)

    await page.click('[data-testid="bench-add-toggle"]')
    await page.waitForSelector('[data-testid="watchlist-add-submit"]')
    await page.fill('#ticker', 'NVDA')
    await page.click('[data-testid="watchlist-add-submit"]')

    // NVDA has no chain, so it joins the bench as a stock of interest after the re-screen.
    await waitForBenchCard(page, 'NVDA', 'waiting')
    expect(await benchCount(page)).toBe(before + 1)
  })

  it('Removing a stock still works from its card', async () => {
    const page = await launchBench('wb-e2e-us96-ac28')
    await waitForBenchCard(page, 'AAPL', 'waiting')
    const before = await benchCount(page)

    await page.click('[data-testid="watchlist-remove-AAPL"]')

    await page.waitForSelector('[data-testid="watchlist-row-AAPL"]', { state: 'detached' })
    expect(await waitingTickers(page)).not.toContain('AAPL')
    expect(await benchCount(page)).toBe(before - 1)
  })

  // ── States ────────────────────────────────────────────────────────────────

  it('No stock meets criteria', async () => {
    // TSLA's only strike is 22% wide, so the screen runs and rejects everything it saw.
    const page = await launch('wb-e2e-us96-ac29', { fixtures: [TSLA_PUT] })
    await waitForBenchCard(page, 'TSLA', 'waiting')

    const empty = page.locator(
      'section[aria-label="Meets criteria"] [data-testid="screener-empty"]'
    )
    await empty.waitFor()
    expect(await empty.textContent()).toContain('No candidates match your criteria')
    expect(await empty.locator('button:has-text("Adjust criteria")').count()).toBe(1)

    expect(await meetsTickers(page)).toEqual([])
    expect(await waitingTickers(page)).toEqual(['TSLA'])
  })

  it('Market data unavailable degrades verdicts, not rows', async () => {
    const page = await launch('wb-e2e-us96-ac30', benchOpts({ marketDataError: 'network_error' }))
    await waitForBenchCard(page, 'KO', 'waiting')

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    expect(await card.textContent()).toContain('Market data unavailable')
    expect(await card.locator('button:has-text("Retry refresh")').count()).toBe(1)

    expect(await meetsTickers(page)).toEqual([])
    // Nothing was judged, so no card may claim its criteria were checked and missed.
    for (const fixture of BENCH_PUTS) {
      expect(await cardReason(page, fixture.ticker)).toBe('Data unavailable · not evaluated')
      expect(await cardValue(page, fixture.ticker, 'watchlist-price')).toBe('—')
    }

    // "every card still shows its ticker and thesis": the trader's own work is the one
    // thing on the card no provider can take away, so it has to outlast the outage — on
    // every card, not on a sample of one.
    for (const fixture of BENCH_PUTS) {
      expect(await cardValue(page, fixture.ticker, 'watchlist-ticker')).toContain(fixture.ticker)
      expect(await cardValue(page, fixture.ticker, 'watchlist-card-thesis')).toBe(
        BENCH_NOTES[fixture.ticker]
      )
    }

    // The IVR store is local: an outage at the quote provider cannot empty it, and it
    // cannot flatten the tiers either — the aged readings keep their own ages and rings.
    expect(await ivrCell(page, 'KO')).toMatchObject({ text: '58', ring: 'fresh' })
    expect(await ivrCell(page, 'PEP')).toMatchObject({ text: '58 · 6d', ring: 'stale' })
    expect(await ivrCell(page, 'DIS')).toMatchObject({ text: 'exp', ring: 'expired' })
    expect(await ivrCell(page, 'XYZ')).toMatchObject({ text: 'n/a', ring: null })
  })

  it('Market data not connected points at Settings', async () => {
    // Two seams for one production state. With no credentials saved the real provider is
    // still constructed and raises `auth_failed` on every call — so removing the
    // credentials produces the card's *copy*, and the injected error produces the failing
    // call the copy describes. Offline the fake provider replaces the Alpaca one outright,
    // so it cannot raise that failure on its own. Same pairing as US-99's outage specs.
    const page = await launch(
      'wb-e2e-us96-ac31',
      benchOpts({ withoutBrokerCredentials: true, marketDataError: 'auth_failed' })
    )
    await waitForBenchCard(page, 'KO', 'waiting')

    const card = page.locator('[data-testid="screener-unavailable"]')
    await card.waitFor()
    const text = await card.textContent()
    // Alpaca was never contacted, so nothing may be reported as an outage.
    expect(text).toContain('Market data not connected')
    expect(text).not.toContain("couldn't be reached")
    expect(await card.locator('button:has-text("Open Settings")').count()).toBe(1)
  })

  it('Stale marks are flagged when the market is closed', async () => {
    const page = await launchBench('wb-e2e-us96-ac32', { marketStatus: CLOSED_SESSION })

    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("CLOSED")')

    // Both nouns the AC names, by their text rather than by their presence: `quoted` alone
    // is a hardcoded literal in the caption, so asserting it would pass with the time
    // missing entirely — which is the whole point of showing the caption.
    // Lower-cased before comparing: the badge is authored "Stale snapshot" and the
    // stylesheet uppercases it, so `innerText` reports the rendered casing. The AC names
    // the words, not the type treatment.
    expect((await detailText(page, 'screener-stale-badge')).toLowerCase()).toBe('stale snapshot')
    const quotedAt = format(parseISO(QUOTE_TIMESTAMP), 'HH:mm:ss')
    expect(await detailText(page, 'screener-stale-caption')).toContain(`quoted ${quotedAt}`)
  })

  it('An empty watchlist explains itself', async () => {
    const page = await launch('wb-e2e-us96-ac33', { fixtures: [] })

    await page.waitForSelector('text=No tickers yet')
    // The add form is unconditional while the bench is empty — there is nothing to toggle
    // it away from — and no section is drawn, because there is nothing to sort.
    expect(await page.locator('[data-testid="watchlist-add-submit"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="bench-grid"]').count()).toBe(0)
  })
})
