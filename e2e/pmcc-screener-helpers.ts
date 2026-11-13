// [US-110] Helpers for the PMCC lens on the Watchlist bench — the nine-stock US-96 bench
// screened for LEAPS + short-call diagonals instead of puts.
//
// The call chains are served through the same OCC-keyed WHEELBASE_MOCK_OPTION_SNAPSHOTS
// seam as the puts (`callFixtures` on `ScreenerLaunchOpts`). Every money, percent and score
// literal the spec asserts is the real PMCC engine's output over these quotes — see the
// fixture table in plans/us-110/data-model.md, which the numbers below reproduce.
//
// Dates: fixtures are anchored to BASE_DAY (the most recent real weekday), so every DTE is
// fixed by its day offset but every calendar label moves with the run date. The label
// helpers below derive each label from the same offset the fixture uses.
import type { Page } from 'playwright'
import { format, parseISO } from 'date-fns'
import { BASE_DAY } from './trading-day-fixtures'
import {
  BENCH_EARNINGS,
  BENCH_QUOTES,
  criteriaChips,
  screenerDate,
  type CallFixtureSpec
} from './screener-helpers'
import type { EarningsFixture } from './earnings-fixtures'

// ── Offsets ───────────────────────────────────────────────────────────────────

/** Every short call expires 35 days out — the story's "Oct 23". */
export const SHORT_OFFSET = 35
/** The two LEAPS expiries the story names: "Sep 17, 2027" (364) and "Jan 21, 2028" (490). */
export const LEAPS_NEAR_OFFSET = 364
export const LEAPS_FAR_OFFSET = 490

// ── Labels ────────────────────────────────────────────────────────────────────

/** `MMM d` — how a card names the short call's expiry. */
export function shortLabel(offset: number): string {
  return format(parseISO(screenerDate(offset)), 'MMM d')
}

/** `MMM d, yyyy` — how the detail panel names a leg's expiry. */
export function longLabel(offset: number): string {
  return format(parseISO(screenerDate(offset)), 'MMM d, yyyy')
}

/** The session the fresh IV readings were observed at — what an IV-rank reason names. */
export function ivrAnchorLabel(): string {
  return format(parseISO(BASE_DAY), 'MMM d')
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * The data-model diagonals, one LEAPS and one short call per ticker. Bid/ask are the
 * mockup's spreads around the stated mark; every leg clears the 200 open-interest floor and
 * the 10% spread ceiling, so each ticker's verdict is decided by the pair or by its gates.
 *
 * XLF  $42 / $53   debit 9.66 on 11.00 ⇒ 87.82%, cycle 6.63%, 69.09%/yr ÷ 0.29 ⇒ 2.38
 * KO   $57.50 / $72.50  debit 12.58 on 15.00 ⇒ 83.87%, 4.93%, 51.4%/yr ÷ 0.25 ⇒ 2.06
 * AAPL $140 / $190 debit 43.45 on 50.00 ⇒ 86.9%, 5.64%   (held back by its price condition)
 * PEP  $140 / $180 debit 34.55 on 40.00 ⇒ 86.38%         (held back by a stale reading)
 * DIS  $90 / $120  debit 26.25 on 30.00 ⇒ 87.5%          (held back by an expired reading)
 * AMD  $110 / $170 debit 56.30 on 60.00 ⇒ 93.84% — over the 90% cap: excluded at the pair
 * MSFT $400 / $530 a clean diagonal; only the earnings gate keeps it off the list
 * ORCL lists no calls at all; XYZ lists short-dated calls only, no LEAPS
 */
export const BENCH_DIAGONALS: CallFixtureSpec[] = [
  {
    ticker: 'XLF',
    strike: 42,
    expirationOffset: LEAPS_FAR_OFFSET,
    bid: '10.15',
    ask: '10.45',
    mid: '10.30',
    delta: '0.81',
    openInterest: 640
  },
  {
    ticker: 'XLF',
    strike: 53,
    expirationOffset: SHORT_OFFSET,
    bid: '0.62',
    ask: '0.66',
    mid: '0.64',
    delta: '0.29',
    openInterest: 2140
  },
  {
    ticker: 'KO',
    strike: 57.5,
    expirationOffset: LEAPS_FAR_OFFSET,
    bid: '13.08',
    ask: '13.33',
    mid: '13.20',
    delta: '0.82',
    openInterest: 410
  },
  {
    ticker: 'KO',
    strike: 72.5,
    expirationOffset: SHORT_OFFSET,
    bid: '0.61',
    ask: '0.64',
    mid: '0.62',
    delta: '0.25',
    openInterest: 3900
  },
  {
    ticker: 'AAPL',
    strike: 140,
    expirationOffset: LEAPS_NEAR_OFFSET,
    bid: '45.68',
    ask: '46.13',
    mid: '45.90',
    delta: '0.81',
    openInterest: 1120
  },
  {
    ticker: 'AAPL',
    strike: 190,
    expirationOffset: SHORT_OFFSET,
    bid: '2.43',
    ask: '2.48',
    mid: '2.45',
    delta: '0.27',
    openInterest: 6300
  },
  {
    ticker: 'PEP',
    strike: 140,
    expirationOffset: LEAPS_NEAR_OFFSET,
    bid: '36.20',
    ask: '36.60',
    mid: '36.40',
    delta: '0.80',
    openInterest: 380
  },
  {
    ticker: 'PEP',
    strike: 180,
    expirationOffset: SHORT_OFFSET,
    bid: '1.83',
    ask: '1.88',
    mid: '1.85',
    delta: '0.27',
    openInterest: 1760
  },
  {
    ticker: 'DIS',
    strike: 90,
    expirationOffset: LEAPS_NEAR_OFFSET,
    bid: '27.43',
    ask: '27.78',
    mid: '27.60',
    delta: '0.79',
    openInterest: 520
  },
  {
    ticker: 'DIS',
    strike: 120,
    expirationOffset: SHORT_OFFSET,
    bid: '1.33',
    ask: '1.37',
    mid: '1.35',
    delta: '0.26',
    openInterest: 2480
  },
  {
    ticker: 'AMD',
    strike: 110,
    expirationOffset: LEAPS_NEAR_OFFSET,
    bid: '59.90',
    ask: '60.50',
    mid: '60.20',
    delta: '0.80',
    openInterest: 930
  },
  {
    ticker: 'AMD',
    strike: 170,
    expirationOffset: SHORT_OFFSET,
    bid: '3.86',
    ask: '3.94',
    mid: '3.90',
    delta: '0.29',
    openInterest: 5410
  },
  {
    ticker: 'MSFT',
    strike: 400,
    expirationOffset: LEAPS_NEAR_OFFSET,
    bid: '114.70',
    ask: '115.30',
    mid: '115.00',
    delta: '0.80',
    openInterest: 600
  },
  {
    ticker: 'MSFT',
    strike: 530,
    expirationOffset: SHORT_OFFSET,
    bid: '6.46',
    ask: '6.54',
    mid: '6.50',
    delta: '0.28',
    openInterest: 1500
  },
  {
    ticker: 'XYZ',
    strike: 26,
    expirationOffset: SHORT_OFFSET,
    bid: '0.53',
    ask: '0.57',
    mid: '0.55',
    delta: '0.28',
    openInterest: 900
  }
]

/**
 * The US-96 calendar with the dates the PMCC Background needs past the short call's 35-day
 * expiry:
 *
 * - XLF, AAPL, PEP, DIS: with no print at all a stock's earnings read `unknown`, which
 *   demotes its candidate below every clear one. XLF would lose its rank number to `—`, so
 *   the AC's "XLF is #1" needs a print the short call expires before. AAPL, PEP and DIS
 *   would sink behind KO, leaving the engine order XLF, KO, … — and a KO `#2` that holds
 *   whether the pill numbers Meets criteria or the engine's ranking. Cleared, they rank in
 *   the story's order (XLF, AAPL, PEP, DIS, KO), so KO's `#2` is its place in Meets
 *   criteria, not the engine's #5. Day 40, the same as KO's.
 * - AMD: a print 5 days out lands inside the short call's cycle, so the earnings filter
 *   refuses every short leg before the pair stage is reached and the card would quote the
 *   earnings instead of the debit. The mockup's AMD reports after the cycle (day 46).
 */
export const PMCC_BENCH_EARNINGS: Record<string, EarningsFixture> = {
  ...BENCH_EARNINGS,
  XLF: { dayOffset: 40 },
  AAPL: { dayOffset: 40 },
  PEP: { dayOffset: 40 },
  DIS: { dayOffset: 40 },
  AMD: { dayOffset: 46 }
}

/** A quote at `price` that did not move on the day, in the bench's own fixture shape. */
function flatQuote(price: string): (typeof BENCH_QUOTES)[string] {
  return { ...BENCH_QUOTES.KO, price, bid: price, ask: price, prevClose: price }
}

/** The US-96 quotes with XLF at the data-model's $51.20: the LEAPS extrinsic the detail
 *  panel shows ($10.30 mark − $9.20 intrinsic = $1.10) is read off it. XLF carries no price
 *  condition, so its wheel verdict is unchanged. */
export const PMCC_BENCH_QUOTES: typeof BENCH_QUOTES = {
  ...BENCH_QUOTES,
  XLF: flatQuote('51.20')
}

// ── Lens ──────────────────────────────────────────────────────────────────────

export type BenchStrategy = 'WHEEL' | 'PMCC'

function strategyButton(strategy: BenchStrategy): string {
  return `[data-testid="bench-strategy-${strategy.toLowerCase()}"]`
}

/** Whether the header's lens control has `strategy` selected. */
export async function strategyPressed(page: Page, strategy: BenchStrategy): Promise<boolean> {
  return (await page.getAttribute(strategyButton(strategy), 'aria-pressed')) === 'true'
}

/** Switch the bench's lens, as a trader would, and wait for the control to show it. */
export async function selectStrategy(page: Page, strategy: BenchStrategy): Promise<void> {
  await page.click(strategyButton(strategy))
  await page.waitForSelector(`${strategyButton(strategy)}[aria-pressed="true"]`)
}

// ── Criteria strip and sheet ──────────────────────────────────────────────────

const CRITERIA_STRIP_LABEL = '[data-testid="screener-criteria-strip"] span'

/** The strip's label as authored — the stylesheet uppercases it, the DOM does not. */
export async function criteriaStripLabel(page: Page): Promise<string> {
  const label = page.locator(CRITERIA_STRIP_LABEL).first()
  return ((await label.textContent()) ?? '').trim()
}

/** The PMCC strip's chips, once the strip is the PMCC one. */
export async function pmccCriteriaChips(page: Page): Promise<string[]> {
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent?.trim() === 'PMCC criteria',
    CRITERIA_STRIP_LABEL
  )
  return criteriaChips(page)
}

/** The `aria-label` of every PMCC criteria input. */
export type PmccCriteriaInput =
  | 'LEAPS minimum delta'
  | 'LEAPS maximum delta'
  | 'LEAPS minimum DTE'
  | 'LEAPS maximum DTE'
  | 'Short-call minimum delta'
  | 'Short-call maximum delta'
  | 'Short-call minimum DTE'
  | 'Short-call maximum DTE'
  | 'Max debit / width'
  | 'Minimum open interest'
  | 'Max bid-ask spread'
  | 'IV-rank floor'
  | 'IV-rank ceiling'

function pmccInput(label: PmccCriteriaInput): string {
  return `input[aria-label="${label}"]`
}

/** Open the PMCC criteria sheet from the bench header and wait for its form to mount. */
export async function openPmccCriteriaSheet(page: Page): Promise<void> {
  await page.click('[data-testid="bench-criteria"]')
  await page.waitForSelector(pmccInput('LEAPS minimum delta'))
}

/** Resolves once the PMCC sheet has unmounted. */
export async function waitForPmccSheetClosed(page: Page): Promise<void> {
  await page.waitForSelector(pmccInput('LEAPS minimum delta'), { state: 'detached' })
}

/**
 * Type values into the sheet in the order given. The form validates on change and re-checks
 * a cross-field rule when either of its ends is edited, so the order does not decide which
 * messages show.
 */
export async function setPmccCriteriaValues(
  page: Page,
  values: Array<[PmccCriteriaInput, string]>
): Promise<void> {
  for (const [label, value] of values) await page.fill(pmccInput(label), value)
}

/**
 * The validation message shown beside `label`'s input, or null when its field shows none.
 * Walks up from the input to the nearest field that carries an error line (`! message`), so a
 * message rendered on some other field never answers for this one.
 */
export async function fieldError(page: Page, label: PmccCriteriaInput): Promise<string | null> {
  return page.evaluate((selector) => {
    const input = document.querySelector(selector)
    const form = input?.closest('form')
    let node = input?.parentElement ?? null
    while (node !== null && node !== form) {
      const error = Array.from(node.children).find(
        (child) => child.firstElementChild?.textContent === '!'
      )
      if (error) return (error.textContent ?? '').replace(/^!/, '').trim()
      node = node.parentElement
    }
    return null
  }, pmccInput(label))
}

// ── Detail panel ──────────────────────────────────────────────────────────────

/** The selected stock's diagonal metrics, label → value. */
export async function detailDiagonalMetrics(page: Page): Promise<Map<string, string>> {
  const metrics = page.locator('[data-testid="bench-diagonal-metrics"]')
  await metrics.waitFor()
  const pairs = await metrics.evaluate((node) =>
    Array.from(node.querySelectorAll('dt')).map((dt): [string, string] => [
      dt.textContent?.trim() ?? '',
      dt.nextElementSibling?.textContent?.trim() ?? ''
    ])
  )
  return new Map(pairs)
}

export type LegRowReading = {
  /** `$42.00 CALL` */
  contract: string
  /** `Jan 21, 2028 · 490 DTE` */
  expiry: string
  /** `mark $10.30 · Δ 0.81 · OI 640 · spread $0.30 (3%)` */
  quote: string
}

/** One leg of the selected stock's matching diagonal, line by line. */
export async function legRow(page: Page, role: 'long' | 'short'): Promise<LegRowReading> {
  const row = page.locator(`[data-testid="bench-leg-${role}"]`)
  await row.waitFor()
  return row.evaluate((node) => {
    const read = (el: Element | null | undefined): string =>
      el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const [head, quote] = Array.from(node.children)
    const [tagAndContract, expiry] = Array.from(head.children)
    return {
      contract: read(tagAndContract.children[1]),
      expiry: read(expiry),
      quote: read(quote)
    }
  })
}
