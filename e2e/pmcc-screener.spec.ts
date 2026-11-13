// [US-110] The PMCC lens on the Watchlist bench — E2E tests.
//
// Exactly one `it()` per acceptance-criteria scenario of US-110 (Linear OPT-18), each named
// verbatim. The suite boots the real Electron app over the offline seams: the fake
// market-data provider serves the US-96 put chains *and* the data-model's call chains, the
// US-121 fake IV series seeds IV ranks through the production collector, and the fake
// earnings calendar answers the earnings reads. Nothing between the IPC and the DOM is
// stubbed, so every string asserted below is one the real PMCC engine produced.
//
// The Background is the US-96 nine-stock bench plus BENCH_DIAGONALS. XLF, AAPL, PEP and DIS
// gain an earnings print past the short call's expiry and AMD's moves past it
// (PMCC_BENCH_EARNINGS), and XLF is quoted at the data-model's $51.20 (PMCC_BENCH_QUOTES) —
// see pmcc-screener-helpers.ts for why. A scenario that needs a different premise states
// only its delta from that bench.
//
// Dates: every DTE is fixed by day offset, so money, percent and score literals are asserted
// verbatim; calendar labels are derived from the same offsets (BASE_DAY is the most recent
// real weekday, so the AC's "Oct 23" or "Jan 21, 2028" cannot be).
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import {
  BENCH_CONDITIONS,
  BENCH_IVR,
  BENCH_PUTS,
  SAVE_CRITERIA_BUTTON,
  cardRank,
  cardReason,
  cardScore,
  criteriaChips,
  launchScreener,
  meetsTickers,
  relaunchScreener,
  saveCriteria,
  selectCard,
  setMarketDataError,
  waitForBenchCard,
  waitForMeetsCardCount,
  waitingTickers,
  type ScreenerLaunchOpts
} from './screener-helpers'
import {
  BENCH_DIAGONALS,
  LEAPS_FAR_OFFSET,
  PMCC_BENCH_EARNINGS,
  PMCC_BENCH_QUOTES,
  SHORT_OFFSET,
  criteriaStripLabel,
  detailDiagonalMetrics,
  fieldError,
  ivrAnchorLabel,
  legRow,
  longLabel,
  openPmccCriteriaSheet,
  pmccCriteriaChips,
  selectStrategy,
  setPmccCriteriaValues,
  shortLabel,
  strategyPressed,
  waitForPmccSheetClosed,
  type PmccCriteriaInput
} from './pmcc-screener-helpers'

/** The Background: the US-96 bench, quoting diagonals as well as puts. */
const PMCC_BENCH: ScreenerLaunchOpts = {
  fixtures: BENCH_PUTS,
  callFixtures: BENCH_DIAGONALS,
  conditions: BENCH_CONDITIONS,
  ivr: BENCH_IVR,
  earnings: PMCC_BENCH_EARNINGS,
  stockQuotes: PMCC_BENCH_QUOTES
}

/** The Background with one scenario's delta applied, merged per ticker — the same rule as
 *  `benchOpts` in watchlist-bench.spec.ts, so a restated ticker never empties the others. */
function benchOpts(overrides: ScreenerLaunchOpts = {}): ScreenerLaunchOpts {
  return {
    ...PMCC_BENCH,
    ...overrides,
    conditions: { ...PMCC_BENCH.conditions, ...overrides.conditions },
    earnings: { ...PMCC_BENCH.earnings, ...overrides.earnings },
    ivr: { ...PMCC_BENCH.ivr, ...overrides.ivr },
    stockQuotes: { ...PMCC_BENCH.stockQuotes, ...overrides.stockQuotes }
  }
}

/** The shipped PMCC defaults as the strip renders them, with the debit cap as a parameter. */
function pmccChips(maxDebitToWidth: string): string[] {
  return [
    'LEAPS Δ 0.70–0.85',
    'LEAPS 180–540 DTE',
    'Short Δ 0.25–0.35',
    'Short 20–45 DTE',
    `Debit ≤ ${maxDebitToWidth}% width`,
    'OI ≥ 200',
    'Spread ≤ 10%',
    'Earnings Exclude'
  ]
}

const DEFAULT_PMCC_CHIPS = pmccChips('90')

const WHEEL_CHIPS = ['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']

/** The Background's PMCC result — XLF's 2.38 score ahead of KO's 2.06. */
const PMCC_MEETS = ['XLF', 'KO']

/** The US-96 Background's wheel result — KO's 0.71 yield-per-delta ahead of XLF's 0.53. */
const WHEEL_MEETS = ['KO', 'XLF']

/** What an outage leaves on every card: nothing was judged. */
const OUTAGE_REASON = 'Data unavailable · not evaluated'

/** One value off a stock's card — the same seam as watchlist-bench.spec.ts. */
function cardValue(page: Page, ticker: string, testId: string): Promise<string> {
  return page
    .locator(`[data-testid="watchlist-row-${ticker}"] [data-testid="${testId}"]`)
    .innerText()
}

function detailText(page: Page, testId: string): Promise<string> {
  return page.locator(`[data-testid="${testId}"]`).innerText()
}

/** Resolves once the PMCC screen has landed: XLF's card describes a diagonal. Waiting on the
 *  bare Meets section would pass on the wheel screen, where XLF also meets criteria. */
async function waitForPmccScreen(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="watchlist-row-XLF"] [data-testid="watchlist-contract"]')
        ?.textContent?.includes(' LEAPS · ') ?? false
  )
}

/** Save the PMCC debit / width cap through the sheet and wait for the re-screen to drop XLF. */
async function saveDebitCap(page: Page, percent: string): Promise<void> {
  await openPmccCriteriaSheet(page)
  await setPmccCriteriaValues(page, [['Max debit / width', percent]])
  await saveCriteria(page)
  await waitForPmccSheetClosed(page)
  await waitForBenchCard(page, 'XLF', 'waiting')
}

describe('US-110: PMCC lens on the Watchlist bench', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  /** The Background on the wheel lens, screened — the page's default. */
  async function launchBench(
    prefix: string,
    opts: ScreenerLaunchOpts = benchOpts()
  ): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, opts)
    app = launched.app
    await waitForBenchCard(launched.page, 'KO', 'meets')
    return launched.page
  }

  /** The Background, switched to the PMCC lens and screened. */
  async function launchPmccBench(
    prefix: string,
    opts: ScreenerLaunchOpts = benchOpts()
  ): Promise<Page> {
    const page = await launchBench(prefix, opts)
    await selectStrategy(page, 'PMCC')
    await waitForPmccScreen(page)
    return page
  }

  it('Switch the bench to the PMCC lens', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac1')

    expect(await strategyPressed(page, 'PMCC')).toBe(true)
    expect(await strategyPressed(page, 'WHEEL')).toBe(false)
    expect(await criteriaStripLabel(page)).toBe('PMCC criteria')
    expect(await pmccCriteriaChips(page)).toEqual(DEFAULT_PMCC_CHIPS)
    expect(await meetsTickers(page)).toEqual(PMCC_MEETS)

    // Positive control: all nine cards rendered, and the two that meet criteria describe a
    // diagonal — so the sweep below reads real card text, not an empty page.
    const cards = await page.locator('[data-testid^="watchlist-row-"]').allInnerTexts()
    expect(cards).toHaveLength(9)
    for (const ticker of PMCC_MEETS) {
      expect(await cardValue(page, ticker, 'watchlist-contract')).toContain(' LEAPS · ')
    }
    // The wheel lens's card line is `$60.00 put · …`; none may survive the switch.
    expect(cards.filter((text) => text.includes(' put ·'))).toEqual([])
  })

  it('A diagonal is ranked by annualized cycle yield per unit of short delta', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac2')

    expect(await cardRank(page, 'XLF')).toBe('#1')
    expect(await cardScore(page, 'XLF')).toBe('2.38')
    expect(await cardRank(page, 'KO')).toBe('#2')
    expect(await cardScore(page, 'KO')).toBe('2.06')
    expect(await cardValue(page, 'XLF', 'watchlist-contract')).toBe(
      `$42.00 LEAPS · $53.00 short ${shortLabel(SHORT_OFFSET)} · 6.63% on debit`
    )
  })

  it('The detail panel shows both legs and the spread metrics', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac3')

    await selectCard(page, 'XLF')

    const long = await legRow(page, 'long')
    expect(long.contract).toBe('$42.00 CALL')
    expect(long.expiry).toBe(`${longLabel(LEAPS_FAR_OFFSET)} · 490 DTE`)
    expect(long.quote).toContain('mark $10.30 · Δ 0.81')

    const short = await legRow(page, 'short')
    expect(short.contract).toBe('$53.00 CALL')
    expect(short.expiry).toBe(`${longLabel(SHORT_OFFSET)} · 35 DTE`)
    expect(short.quote).toContain('mark $0.64 · Δ 0.29 · OI 2,140')

    expect(Object.fromEntries(await detailDiagonalMetrics(page))).toEqual({
      'Net debit / share': '$9.66',
      'Per spread': '$966.00',
      'Strike width': '$11.00',
      'Debit / width': '87.82%',
      'Cycle yield': '6.63%',
      Annualized: '69.09%/yr',
      'Extrinsic in LEAPS': '$1.10',
      'Recovered per cycle': '58.18%',
      'Short Δ': '0.29'
    })

    // No Review trade on the diagonal …
    const detail = page.locator('[data-testid="bench-detail-panel"]')
    const cardReview = page.locator('[data-testid="bench-review-XLF"]')
    expect(await cardReview.count()).toBe(0)
    expect(await detail.getByRole('button', { name: /Review trade/ }).count()).toBe(0)
    // … while the same stock through the wheel lens does offer one — the locator is live.
    await selectStrategy(page, 'WHEEL')
    await cardReview.waitFor()
    expect(await detail.getByRole('button', { name: /Review trade/ }).count()).toBe(1)
  })

  it('An excluded diagonal names the stage that refused it', async () => {
    // XYZ's IV trigger is dropped for this scenario: it has never had a reading, so with the
    // trigger in place its card reads "IV unavailable" — the trader's own gate outranks the
    // engine's wording (US-96) — and the chain exclusion the AC names would never surface.
    const page = await launchPmccBench('wb-e2e-us110-ac4', benchOpts({ conditions: { XYZ: {} } }))

    expect(await waitingTickers(page)).toEqual(expect.arrayContaining(['AMD', 'XYZ']))
    expect(await cardReason(page, 'AMD')).toBe('debit 93.84% of width exceeds 90%')
    expect(await cardReason(page, 'XYZ')).toBe('no calls quoted in the 180–540 DTE window')
  })

  it('Entry conditions gate a PMCC match exactly as they gate a put', async () => {
    // The scenario's Given names AAPL's price condition alone; US-96's AAPL also carries an
    // IV trigger its reading of 34 misses, which would append "· IV low" to the reason.
    const page = await launchPmccBench(
      'wb-e2e-us110-ac5',
      benchOpts({ conditions: { AAPL: { ownBelowPrice: 170 } } })
    )

    expect(await waitingTickers(page)).toContain('AAPL')
    expect(await cardReason(page, 'AAPL')).toBe('Price $178.40 above $170 target')

    await selectCard(page, 'AAPL')
    expect(await detailText(page, 'bench-detail-held-back')).toBe(
      `A qualifying diagonal exists ($140.00 LEAPS · $190.00 short · ${longLabel(SHORT_OFFSET)} · 5.64% on debit) but is held back by the entry conditions above.`
    )

    // "exactly as they gate a put": the wheel lens holds AAPL back with the same words.
    await selectStrategy(page, 'WHEEL')
    await waitForBenchCard(page, 'KO', 'meets')
    expect(await cardReason(page, 'AAPL')).toBe('Price $178.40 above $170 target')
  })

  it('Extrinsic is display-only', async () => {
    // XLF's quote cannot be fetched: the provider answers every other ticker but not XLF.
    // XLF carries no entry conditions, so a missing price cannot hold it back.
    // Replaces the quotes rather than merging them: a per-ticker merge cannot drop one.
    const quotesWithoutXlf = Object.fromEntries(
      Object.entries(PMCC_BENCH_QUOTES).filter(([ticker]) => ticker !== 'XLF')
    )
    const page = await launchPmccBench('wb-e2e-us110-ac6', {
      ...benchOpts(),
      stockQuotes: quotesWithoutXlf
    })

    expect(await cardValue(page, 'XLF', 'watchlist-price')).toBe('—')
    expect(await cardRank(page, 'XLF')).toBe('#1')
    expect(await cardScore(page, 'XLF')).toBe('2.38')

    await selectCard(page, 'XLF')
    const metrics = await detailDiagonalMetrics(page)
    expect(metrics.get('Extrinsic in LEAPS')).toBe('—')
    expect(metrics.get('Recovered per cycle')).toBe('—')
  })

  it('Edit PMCC criteria and re-screen', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac7')

    await openPmccCriteriaSheet(page)
    expect(await detailText(page, 'sheet-subtitle')).toBe(
      'Applies to all 9 watchlist tickers · PMCC · LEAPS + short call'
    )
    await setPmccCriteriaValues(page, [['Max debit / width', '85']])
    await saveCriteria(page)
    await waitForPmccSheetClosed(page)

    await page.waitForSelector('text=Screening criteria saved')
    await waitForBenchCard(page, 'XLF', 'waiting')
    await waitForMeetsCardCount(page, 1)
    expect(await pmccCriteriaChips(page)).toEqual(pmccChips('85'))
    expect(await meetsTickers(page)).toEqual(['KO'])
    expect(await cardReason(page, 'XLF')).toBe('debit 87.82% of width exceeds 85%')
    expect(await cardRank(page, 'KO')).toBe('#1')
  })

  it('The wheel criteria are untouched by a PMCC save', async () => {
    const page = await launchBench('wb-e2e-us110-ac8')
    expect(await meetsTickers(page)).toEqual(WHEEL_MEETS)

    await selectStrategy(page, 'PMCC')
    await waitForPmccScreen(page)
    await saveDebitCap(page, '85')

    await selectStrategy(page, 'WHEEL')
    await waitForBenchCard(page, 'XLF', 'meets')
    expect(await criteriaStripLabel(page)).toBe('Criteria')
    expect(await criteriaChips(page)).toEqual(WHEEL_CHIPS)
    expect(await meetsTickers(page)).toEqual(WHEEL_MEETS)
  })

  it('Saved PMCC criteria survive a restart, the lens does not', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac9')
    await saveDebitCap(page, '85')

    const relaunched = await relaunchScreener(app, dbPath, benchOpts())
    app = relaunched.app
    const after = relaunched.page
    await waitForBenchCard(after, 'KO', 'meets')

    expect(await strategyPressed(after, 'WHEEL')).toBe(true)
    expect(await strategyPressed(after, 'PMCC')).toBe(false)
    expect(await criteriaChips(after)).toEqual(WHEEL_CHIPS)

    await selectStrategy(after, 'PMCC')
    expect(await pmccCriteriaChips(after)).toEqual(pmccChips('85'))
  })

  it('An IV-rank ceiling excludes a rich underlying', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac10')

    await openPmccCriteriaSheet(page)
    await page.click('[data-testid="iv-rank-ceiling-on"]')
    await setPmccCriteriaValues(page, [['IV-rank ceiling', '55']])
    await saveCriteria(page)
    await waitForPmccSheetClosed(page)

    // KO's fresh reading of 58 is over the ceiling; XLF's 46 is under it.
    await waitForBenchCard(page, 'KO', 'waiting')
    expect(await cardReason(page, 'KO')).toBe(`IV rank 58 (${ivrAnchorLabel()}) above 55`)
    expect(await meetsTickers(page)).toEqual(['XLF'])
    expect(await cardRank(page, 'XLF')).toBe('#1')
  })

  it('Reject an overlapping or inverted PMCC window', async () => {
    const page = await launchPmccBench('wb-e2e-us110-ac11')

    // Each row of the outline: the toggles to switch on first, the edits, the field whose
    // message is checked, and the message. The form re-checks a cross-field rule when either
    // of its ends is edited, so the overlap is produced from both ends: once by lowering the
    // LEAPS minimum, once by raising the short-call maximum past it.
    const rows: Array<{
      toggles?: string[]
      edits: Array<[PmccCriteriaInput, string]>
      field: PmccCriteriaInput
      message: string
    }> = [
      {
        edits: [['LEAPS minimum DTE', '40']],
        field: 'LEAPS minimum DTE',
        message: 'LEAPS minimum DTE must exceed short-call maximum DTE'
      },
      {
        edits: [['Short-call maximum DTE', '200']],
        field: 'LEAPS minimum DTE',
        message: 'LEAPS minimum DTE must exceed short-call maximum DTE'
      },
      {
        edits: [['LEAPS maximum DTE', '800']],
        field: 'LEAPS maximum DTE',
        message: 'LEAPS DTE must be at most 730'
      },
      {
        edits: [['Max debit / width', '0']],
        field: 'Max debit / width',
        message: 'Max debit / width must be between 1% and 100%'
      },
      {
        toggles: ['iv-rank-floor-on', 'iv-rank-ceiling-on'],
        edits: [
          ['IV-rank floor', '60'],
          ['IV-rank ceiling', '40']
        ],
        field: 'IV-rank ceiling',
        message: 'IV-rank floor must be less than IV-rank ceiling'
      },
      {
        edits: [
          ['Short-call minimum delta', '0.35'],
          ['Short-call maximum delta', '0.25']
        ],
        field: 'Short-call maximum delta',
        message: 'Minimum delta must be less than maximum delta'
      }
    ]

    for (const row of rows) {
      await openPmccCriteriaSheet(page)
      for (const toggle of row.toggles ?? []) await page.click(`[data-testid="${toggle}"]`)
      await setPmccCriteriaValues(page, row.edits)

      expect(await fieldError(page, row.field)).toBe(row.message)
      expect(await page.locator(SAVE_CRITERIA_BUTTON).isDisabled()).toBe(true)
      expect(await page.getByText('Fix the highlighted fields.').isVisible()).toBe(true)

      await page.click('button:has-text("Cancel")')
      await waitForPmccSheetClosed(page)

      // Nothing was persisted and nothing re-screened.
      expect(await pmccCriteriaChips(page)).toEqual(DEFAULT_PMCC_CHIPS)
      expect(await meetsTickers(page)).toEqual(PMCC_MEETS)
    }
  })

  it('A provider outage degrades the PMCC lens like the wheel', async () => {
    // [US-116] The outage is injected after seeding, as in the wheel's outage scenario: the
    // IV readings and the exchange calendar are local caches an established install holds.
    // The PMCC screen has not run yet — its query mounts with the lens — so the first PMCC
    // request is the one that meets the outage.
    const page = await launchBench('wb-e2e-us110-ac12')
    await setMarketDataError(app, 'network_error')
    await selectStrategy(page, 'PMCC')

    // Positive control: all nine cards are on the bench, and each has settled on the outage
    // reason rather than the "Not screened yet" it shows while the request is in flight.
    await page.waitForFunction((reason) => {
      const reasons = Array.from(document.querySelectorAll('[data-testid="watchlist-reason"]'))
      return reasons.length === 9 && reasons.every((el) => el.textContent?.trim() === reason)
    }, OUTAGE_REASON)

    const meetsSection = page.locator('section[aria-label="Meets criteria"]')
    expect(await meetsSection.innerText()).toContain(
      'Waiting for market data — no screen has run, so nothing can meet criteria yet.'
    )
    for (const fixture of BENCH_PUTS) {
      expect(await cardReason(page, fixture.ticker)).toBe(OUTAGE_REASON)
    }
    expect(await meetsTickers(page)).toEqual([])
  })
})
