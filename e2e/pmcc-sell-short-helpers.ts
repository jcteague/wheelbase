// [US-115] Helpers for the Sell Short Call e2e spec (Linear OPT-23). The sheet counts DTE, the
// default fill date and the chain window from the renderer's real clock, which
// `WHEELBASE_FAKE_NOW` does not reach, so the app launches on the real clock and US-109's XYZ
// Background is seeded with every date moved by `T − 2027-07-23`, where `T` is today in New York
// (research.md ADR "E2e runs on the real clock"). `shift` is the one place that offset is applied:
// the seeded legs, the chain fixture and every displayed date a spec expects all go through it,
// so day counts (28 DTE, 182 DTE, 7 days uncovered) and money stay the story's literals.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { CLOSED_SESSION, buildLaunchEnv, getPage, launchElectron } from './assignment-helpers'
import { nyToday } from './dates'
import { flatStockQuote, optionSnapshot } from './market-data-fixtures'
import { closePmcc, occSymbol, pickDate, tempDbPath, typeAndBlur } from './pmcc-helpers'
import { type Variant, VARIANTS, backgroundLegs } from './pmcc-timeline-helpers'

// ── Dates ────────────────────────────────────────────────────────────────────

/** The story's valuation date: the Background's `today`. */
const STORY_TODAY = '2027-07-23'

/** `iso` moved by as many days as today (New York) is from the story's 2027-07-23. */
export function shift(iso: string): string {
  const offset = differenceInCalendarDays(parseISO(nyToday()), parseISO(STORY_TODAY))
  return format(addDays(parseISO(iso), offset), 'yyyy-MM-dd')
}

/** `T`: the run day, the story's 2027-07-23. */
export const today = (): string => shift(STORY_TODAY)

// ── Chain fixture (plan.md Area 15) ──────────────────────────────────────────

/** A call's OCC symbol at a story date, shifted to the run. */
const call = (underlying: string, expiration: string, strike: number): string =>
  occSymbol(underlying, shift(expiration), 'C', strike)

/** The target short call: XYZ $118 · 2027-08-20, mid $1.95, Δ 0.30. */
export const TARGET_SYMBOL = (): string => call('XYZ', '2027-08-20', 118)
/** The below-the-line short call: XYZ $90 · 2027-08-20, mid $1.50, Δ 0.30. */
export const BELOW_LINE_SYMBOL = (): string => call('XYZ', '2027-08-20', 90)
/** NEAR's calls on either side of its 2027-08-27 LEAPS. */
export const NEAR_INSIDE_SYMBOL = (): string => call('NEAR', '2027-08-20', 118)
export const NEAR_PAST_LEAPS_SYMBOL = (): string => call('NEAR', '2027-09-03', 118)

/** A call quote in the short preset's band unless `delta` says otherwise. */
const quote = (bid: string, ask: string, mid: string, delta = '0.3000'): object =>
  optionSnapshot(bid, ask, mid, {
    greeks: { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.3000', iv: '0.2500' }
  })

/**
 * The XYZ chain: the target and below-the-line calls, the $85 and $80 strike decoys (in band,
 * excluded only by the LEAPS strike), an ABC call (another underlying), the LEAPS itself for the
 * Coverage card's Δ 0.81, and NEAR's two calls around its 2027-08-27 LEAPS.
 */
export function sellShortChain(): Record<string, object> {
  return {
    [TARGET_SYMBOL()]: quote('1.90', '2.00', '1.95'),
    [BELOW_LINE_SYMBOL()]: quote('1.45', '1.55', '1.50'),
    [call('XYZ', '2027-08-20', 85)]: quote('2.40', '2.60', '2.50'),
    [call('XYZ', '2027-08-20', 80)]: quote('3.40', '3.60', '3.50'),
    [call('ABC', '2027-08-20', 118)]: quote('1.90', '2.00', '1.95'),
    [call('XYZ', '2028-01-21', 85)]: quote('23.40', '23.60', '23.50', '0.8100'),
    [NEAR_INSIDE_SYMBOL()]: quote('1.90', '2.00', '1.95'),
    [NEAR_PAST_LEAPS_SYMBOL()]: quote('2.40', '2.60', '2.50')
  }
}

// ── Launch ───────────────────────────────────────────────────────────────────

export type SellShortApp = { app: ElectronApplication; page: Page; dbPath: string }

let launched: SellShortApp | undefined

/**
 * Launches on a fresh DB with the real clock and the shifted chain. `xyzPrice` quotes XYZ (only
 * the below-the-line scenario needs one); `env` adds variables, such as a market-data fault.
 */
export async function launchSellShort({
  xyzPrice,
  env = {}
}: { xyzPrice?: string; env?: Record<string, string> } = {}): Promise<SellShortApp> {
  const dbPath = tempDbPath('pmcc-sell-short')
  // A closed session keeps the interval jobs (alert evaluation among them) from racing a test.
  // No broker is configured: the sale is journal-only and must not need one.
  const launchEnv = {
    ...buildLaunchEnv(dbPath, { marketStatus: CLOSED_SESSION, withoutBrokerCredentials: true }),
    WHEELBASE_MOCK_OPTION_SNAPSHOTS: JSON.stringify(sellShortChain()),
    ...(xyzPrice
      ? { WHEELBASE_MOCK_STOCK_QUOTES: JSON.stringify({ XYZ: flatStockQuote(xyzPrice) }) }
      : {}),
    ...env
  }
  const app = await launchElectron(launchEnv)
  launched = { app, page: await getPage(app), dbPath }
  return launched
}

/** Closes the app `launchSellShort` opened and deletes its DB — register with `afterEach`. */
export async function disposeSellShort(): Promise<void> {
  if (!launched) return
  await closePmcc(launched.app, launched.dbPath)
  launched = undefined
}

// ── Seeding ──────────────────────────────────────────────────────────────────

type SeedPayload = Parameters<typeof window.api.testPmccSeedPosition>[0]
type SeedLeg = SeedPayload['legs'][number]

const shiftLeg = (leg: SeedLeg): SeedLeg => ({
  ...leg,
  expiration: shift(leg.expiration),
  fillDate: shift(leg.fillDate)
})

/** Seeds one PMCC with every story date shifted to the run and returns its position id. */
async function seedShifted(page: Page, payload: SeedPayload): Promise<string> {
  const shifted: SeedPayload = {
    ...payload,
    closedDate: payload.closedDate ? shift(payload.closedDate) : payload.closedDate,
    legs: payload.legs.map(shiftLeg)
  }
  const result = await page.evaluate((p) => window.api.testPmccSeedPosition(p), shifted)
  if (!result.ok) throw new Error(`testPmccSeedPosition failed: ${JSON.stringify(result)}`)
  return result.positionId
}

/** Seeds US-109's XYZ Background with `variant` applied, shifted to the run. */
export async function seedXyzShifted(page: Page, variant: Variant): Promise<string> {
  return seedShifted(page, { ticker: 'XYZ', closedDate: null, legs: backgroundLegs(variant) })
}

/** The LEAPS-only Background (cycle 9 never sold) with `variant`'s patch on top. */
export async function seedLeapsOnly(page: Page, variant: Variant = {}): Promise<string> {
  return seedXyzShifted(page, {
    ...variant,
    patch: { ...VARIANTS.withoutCycle9.patch, ...variant.patch }
  })
}

/** A second LEAPS roll on 2027-07-21: the $85 · 2028-01-21 LEAPS into $85 · 2028-06-16. */
export const SECOND_LEAPS_ROLL: Variant = {
  append: [
    {
      legRole: 'ROLL_FROM',
      action: 'SELL',
      strike: '85.0000',
      expiration: '2028-01-21',
      premiumPerContract: '23.5000',
      fillDate: '2027-07-21',
      rollChainId: 'rc-l2',
      contracts: 1
    },
    {
      legRole: 'ROLL_TO',
      action: 'BUY',
      strike: '85.0000',
      expiration: '2028-06-16',
      premiumPerContract: '25.0000',
      fillDate: '2027-07-21',
      rollChainId: 'rc-l2',
      contracts: 1
    }
  ]
}

/** NEAR: an $85 LEAPS expiring 2027-08-27 (35 days out) and no short call ever sold. */
export async function seedNearLeaps(page: Page): Promise<string> {
  return seedShifted(page, {
    ticker: 'NEAR',
    closedDate: null,
    legs: [
      {
        legRole: 'LEAPS_OPEN',
        action: 'BUY',
        strike: '85.0000',
        expiration: '2027-08-27',
        premiumPerContract: '20.0000',
        fillDate: '2027-07-09',
        rollChainId: null,
        contracts: 1
      }
    ]
  })
}

// ── Detail page ──────────────────────────────────────────────────────────────

export const sellButton = (page: Page): Locator => page.getByTestId('sell-pmcc-short-btn')

/** The header's coverage badge: the first item of the PMCC's action row. */
export const headerBadge = (page: Page): Locator =>
  page.locator('div:has(> [data-testid="roll-pmcc-leaps-btn"]) > :first-child')

/** A `Buy LEAPS call` reference stat (`Strike`, `Expiration`, …) on the detail page. */
export async function leapsReference(page: Page, label: string): Promise<string> {
  const card = page.locator('section').filter({
    has: page.getByText('Buy LEAPS call', { exact: true })
  })
  const value = card.locator(`div:has(> span:text-is("${label}")) > span:nth-child(2)`)
  return ((await value.textContent()) ?? '').trim()
}

// ── The sheet ────────────────────────────────────────────────────────────────

export const sellSheet = (page: Page): Locator =>
  page.getByRole('dialog', { name: 'Sell Short Call' })

export const recordButton = (page: Page): Locator => page.getByTestId('pmcc-sell-short-confirm')

export async function openSellSheet(page: Page): Promise<void> {
  await sellButton(page).click()
  await sellSheet(page).waitFor()
}

/** Picks a contract from the sheet's chain, which fills the strike and expiration. */
export async function pickContract(page: Page, symbol: string): Promise<void> {
  const select = sellSheet(page).locator('#short-contract')
  await select.locator(`option[value="${symbol}"]`).waitFor({ state: 'attached' })
  await select.selectOption(symbol)
}

/** Switches to manual entry and types the strike and the (story-dated) expiration. */
export async function enterManually(
  page: Page,
  { strike, expiration }: { strike: string; expiration: string }
): Promise<void> {
  await sellSheet(page).getByRole('button', { name: 'Enter manually' }).click()
  await typeAndBlur(page, '#short-strike', strike)
  await pickDate(page, '#short-expiration', shift(expiration))
}

/** Types the sale price; fees and fill date keep their defaults (`0.00`, today). */
export async function enterPrice(page: Page, price: string): Promise<void> {
  await typeAndBlur(page, '#short-fill', price)
}

/** The target sale through the picker: $118 · 2027-08-20 at $1.95. */
export async function enterTargetSale(page: Page): Promise<void> {
  await pickContract(page, TARGET_SYMBOL())
  await enterPrice(page, '1.95')
}

/** Records the entry and waits for the success view. */
export async function recordSale(page: Page): Promise<void> {
  await recordButton(page).click()
  await page.getByTestId('pmcc-sell-short-success').waitFor()
}

// ── Direct IPC ───────────────────────────────────────────────────────────────

type SellPayload = Parameters<typeof window.api.sellPmccShort>[0]

/** Calls `positions:sell-pmcc-short` past the form — the server-side rejection path. */
export async function directSell(
  page: Page,
  payload: SellPayload
): Promise<Awaited<ReturnType<typeof window.api.sellPmccShort>>> {
  return page.evaluate((p) => window.api.sellPmccShort(p), payload)
}

/** The target sale as a payload, every story date shifted; `overrides` replace fields. */
export function salePayload(positionId: string, overrides: Partial<SellPayload> = {}): SellPayload {
  return {
    positionId,
    strike: 118,
    expiration: shift('2027-08-20'),
    contracts: 1,
    fillPrice: 1.95,
    fillDate: today(),
    fees: 0,
    ...overrides
  }
}
