// [US-109] Helpers for the PMCC leg timeline e2e spec (Linear OPT-17). The app launches with
// `WHEELBASE_FAKE_NOW` pinned so `positions:get` values the timeline at the story's date, and
// positions are seeded leg-for-leg through the test-only `_test:pmcc-seed-position` channel
// (plans/us-109/contracts/test-pmcc-seed-position.md). The XYZ Background is one literal
// (data-model.md § 5); every scenario is a small patch over it.
import type { ElectronApplication, Locator, Page } from 'playwright'
import { CLOSED_SESSION, buildLaunchEnv, getPage, launchElectron } from './assignment-helpers'
import { closePmcc, tempDbPath } from './pmcc-helpers'

// ── Launch ───────────────────────────────────────────────────────────────────

/** Noon Eastern on the Background's valuation date, 2027-08-13. */
const FAKE_NOW = '2027-08-13T16:00:00Z'

let app: ElectronApplication | undefined
let dbPath = ''

/** Launches on a fresh DB with the clock pinned at `fakeNow` (`null` leaves the real clock). */
export async function launchTimeline(fakeNow: string | null = FAKE_NOW): Promise<Page> {
  dbPath = tempDbPath('pmcc-timeline')
  // A closed session keeps the interval jobs (alert evaluation among them) from racing a test.
  const env = buildLaunchEnv(dbPath, { marketStatus: CLOSED_SESSION })
  if (fakeNow !== null) env.WHEELBASE_FAKE_NOW = fakeNow
  app = await launchElectron(env)
  return getPage(app)
}

/** Launches at `fakeNow` and shows the XYZ Background's timeline with `variant` applied. */
export async function launchXyzTimeline(
  variant: Variant = VARIANTS.background,
  fakeNow: string = FAKE_NOW
): Promise<Page> {
  const page = await launchTimeline(fakeNow)
  await showXyzTimeline(page, variant)
  return page
}

/** Closes the app `launchTimeline` opened and deletes its DB — register with `afterEach`. */
export async function disposeTimeline(): Promise<void> {
  await closePmcc(app, dbPath)
  app = undefined
}

// ── Seeding ──────────────────────────────────────────────────────────────────

type SeedPayload = Parameters<typeof window.api.testPmccSeedPosition>[0]
type SeedLeg = SeedPayload['legs'][number]

function leg(
  legRole: SeedLeg['legRole'],
  action: SeedLeg['action'],
  strike: string,
  expiration: string,
  premiumPerContract: string,
  fillDate: string,
  rollChainId: string | null = null
): SeedLeg {
  return {
    legRole,
    action,
    strike,
    expiration,
    premiumPerContract,
    fillDate,
    rollChainId,
    contracts: 1
  }
}

function sell(strike: string, expiration: string, price: string, fillDate: string): SeedLeg {
  return leg('SHORT_CALL_OPEN', 'SELL', strike, expiration, price, fillDate)
}

function expire(strike: string, expiration: string): SeedLeg {
  return leg('SHORT_CALL_EXPIRED', 'EXPIRE', strike, expiration, '0.0000', expiration)
}

/**
 * The story's XYZ Background, in recorded order: the $80 · 2027-09-17 LEAPS bought 2026-09-14
 * at $25.00, nine short-call cycles, a short roll inside cycle 2 and a LEAPS roll on 2027-07-09.
 * 1 contract, no fees; valued 2027-08-13 with cycle 9 open.
 */
const BACKGROUND = {
  leapsOpen: leg('LEAPS_OPEN', 'BUY', '80.0000', '2027-09-17', '25.0000', '2026-09-14'),
  c1Sell: sell('110.0000', '2026-10-16', '2.0000', '2026-09-14'),
  c1Expire: expire('110.0000', '2026-10-16'),
  c2Sell: sell('108.0000', '2026-11-20', '1.8000', '2026-10-23'),
  c2RollFrom: leg('ROLL_FROM', 'BUY', '108.0000', '2026-11-20', '3.0000', '2026-11-06', 'rc-c2'),
  c2RollTo: leg('ROLL_TO', 'SELL', '112.0000', '2026-12-18', '2.4000', '2026-11-06', 'rc-c2'),
  c2Expire: expire('112.0000', '2026-12-18'),
  c3Sell: sell('112.0000', '2027-02-05', '1.7000', '2027-01-04'),
  c3Expire: expire('112.0000', '2027-02-05'),
  c4Sell: sell('114.0000', '2027-03-12', '1.5500', '2027-02-08'),
  c4Expire: expire('114.0000', '2027-03-12'),
  c5Sell: sell('114.0000', '2027-04-16', '2.2000', '2027-03-15'),
  c5Close: leg('SHORT_CALL_CLOSE', 'BUY', '114.0000', '2027-04-16', '0.5500', '2027-04-02'),
  c6Sell: sell('116.0000', '2027-05-07', '1.7500', '2027-04-05'),
  c6Expire: expire('116.0000', '2027-05-07'),
  c7Sell: sell('116.0000', '2027-06-18', '1.7500', '2027-05-07'),
  c7Expire: expire('116.0000', '2027-06-18'),
  c8Sell: sell('112.0000', '2027-07-16', '2.4000', '2027-06-22'),
  leapsRollFrom: leg(
    'ROLL_FROM',
    'SELL',
    '80.0000',
    '2027-09-17',
    '26.0000',
    '2027-07-09',
    'rc-l1'
  ),
  leapsRollTo: leg('ROLL_TO', 'BUY', '85.0000', '2028-01-21', '23.5000', '2027-07-09', 'rc-l1'),
  c8Expire: expire('112.0000', '2027-07-16'),
  c9Sell: sell('118.0000', '2027-08-20', '1.9500', '2027-07-23')
} satisfies Record<string, SeedLeg>

type BackgroundLeg = keyof typeof BACKGROUND

/** A scenario as a patch over the Background: field overrides per leg (`null` drops the leg),
 *  legs appended after it, contracts on every leg, and the position's close date. */
export type Variant = {
  patch?: Partial<Record<BackgroundLeg, Partial<SeedLeg> | null>>
  append?: SeedLeg[]
  contracts?: number
  closedDate?: string
}

/** Cycle 9 assigned at its 2027-08-20 expiration. */
const C9_ASSIGNED = leg(
  'SHORT_CALL_ASSIGNED',
  'ASSIGN',
  '118.0000',
  '2027-08-20',
  '0.0000',
  '2027-08-20'
)

export const VARIANTS = {
  background: {},
  /** The replacement LEAPS bought two days after the old one was sold. */
  brokenLeapsRoll: { patch: { leapsRollTo: { fillDate: '2027-07-11' } } },
  /** Cycle 2 never rolled: the $108 · 2026-11-20 simply expired. */
  unrolledCycle2: {
    patch: {
      c2RollFrom: null,
      c2RollTo: null,
      c2Expire: { strike: '108.0000', expiration: '2026-11-20', fillDate: '2026-11-20' }
    }
  },
  /** Cycle 2 sold the day cycle 1 expired. */
  backToBack: { patch: { c2Sell: { fillDate: '2026-10-16' } } },
  assigned: { append: [C9_ASSIGNED] },
  closedAssigned: { append: [C9_ASSIGNED], closedDate: '2027-08-20' },
  threeContracts: { contracts: 3 },
  /** A wheel-role leg recorded inside cycle 9. */
  unknownRole: {
    append: [leg('CC_CLOSE', 'BUY', '118.0000', '2027-08-20', '0.5000', '2027-08-04')]
  },
  /** $1.00 on the LEAPS purchase and on cycle 1's sell to open. */
  fees: { patch: { leapsOpen: { fees: '1.0000' }, c1Sell: { fees: '1.0000' } } },
  /** [US-115] LEAPS-only: cycle 8 expired 2027-07-16 and no ninth short call was sold. */
  withoutCycle9: { patch: { c9Sell: null } }
} satisfies Record<string, Variant>

export function backgroundLegs({ patch = {}, append = [], contracts }: Variant): SeedLeg[] {
  const legs = (Object.keys(BACKGROUND) as BackgroundLeg[]).flatMap((key) => {
    const override = patch[key]
    return override === null ? [] : [{ ...BACKGROUND[key], ...override }]
  })
  return [...legs, ...append].map((seedLeg) => (contracts ? { ...seedLeg, contracts } : seedLeg))
}

/** Seeds one PMCC exactly as given and returns its position id. */
async function seedPmcc(page: Page, payload: SeedPayload): Promise<string> {
  const result = await page.evaluate((p) => window.api.testPmccSeedPosition(p), payload)
  if (!result.ok) throw new Error(`testPmccSeedPosition failed: ${JSON.stringify(result)}`)
  return result.positionId
}

/** Seeds the XYZ Background with `variant` applied. */
export async function seedXyz(page: Page, variant: Variant = VARIANTS.background): Promise<string> {
  return seedPmcc(page, {
    ticker: 'XYZ',
    closedDate: variant.closedDate ?? null,
    legs: backgroundLegs(variant)
  })
}

/** A $95 · 2028-06-16 LEAPS bought 2027-06-01 at $19.80 and no short call ever sold. */
export const LEAPS_ONLY: SeedPayload = {
  ticker: 'LNLY',
  legs: [leg('LEAPS_OPEN', 'BUY', '95.0000', '2028-06-16', '19.8000', '2027-06-01')]
}

/** An imported PMCC whose $120 short (2027-10-16) outlasts its $90 · 2027-09-17 LEAPS. */
export const OUTLASTING_SHORT: SeedPayload = {
  ticker: 'IMPT',
  legs: [
    leg('LEAPS_OPEN', 'BUY', '90.0000', '2027-09-17', '20.0000', '2026-09-14'),
    sell('120.0000', '2027-10-16', '1.5000', '2027-07-06')
  ]
}

// ── Navigation ───────────────────────────────────────────────────────────────

type DrawerTitle = 'Cost basis' | 'Timeline summary' | 'Leg timeline'

/** A PMCC cockpit drawer's toggle button, by its exact title. */
export function drawerButton(page: Page, title: DrawerTitle): Locator {
  return page.locator('button[aria-expanded]').filter({ hasText: new RegExp(`^[▶▼]\\s*${title}`) })
}

/** The body a drawer reveals when open. */
export function drawerContent(page: Page, title: DrawerTitle): Locator {
  return drawerButton(page, title).locator('xpath=following-sibling::div[1]')
}

/** Opens a position's detail page and waits for the PMCC drawers. */
export async function openDetail(page: Page, positionId: string): Promise<void> {
  await page.evaluate((id) => {
    location.hash = `#/positions/${id}`
  }, positionId)
  await drawerButton(page, 'Leg timeline').waitFor()
}

/** Expands the collapsed `Leg timeline` drawer. */
export async function expandLegTimeline(page: Page): Promise<void> {
  await drawerButton(page, 'Leg timeline').click()
  await region(page, 'LEAPS track').waitFor()
}

/** Seeds, opens the detail and expands the `Leg timeline` drawer. */
export async function showTimeline(page: Page, payload: SeedPayload): Promise<string> {
  const id = await seedPmcc(page, payload)
  await openDetail(page, id)
  await expandLegTimeline(page)
  return id
}

/** Seeds the XYZ Background with `variant` and shows its timeline. */
export async function showXyzTimeline(
  page: Page,
  variant: Variant = VARIANTS.background
): Promise<void> {
  await openDetail(page, await seedXyz(page, variant))
  await expandLegTimeline(page)
}

// ── Readers ──────────────────────────────────────────────────────────────────

/** A locator's text content, trimmed (`''` when it has none). */
export async function textOf(locator: Locator): Promise<string> {
  return ((await locator.textContent()) ?? '').trim()
}

/** A labelled section of the timeline: `Coverage`, `LEAPS track`, `Short-call cycles`, `Cycle N`. */
export function region(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true })
}

/** Every short-call cycle group on the page. */
export function cycleRegions(page: Page): Locator {
  return page.getByRole('region', { name: /^Cycle \d+$/ })
}

/** Text of every cell of every body row, in order. */
async function tableRows(scope: Locator): Promise<string[][]> {
  return scope
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => Array.from(row.children, (cell) => (cell.textContent ?? '').trim()))
    )
}

/** The LEAPS track's header copy and rows. Columns: Event, Date, Contract, Price / share, Net,
 *  Coverage, Basis after. */
export async function readLeapsTrack(page: Page): Promise<{ header: string; rows: string[][] }> {
  const track = region(page, 'LEAPS track')
  return {
    header: await textOf(track.locator(':scope > div > span').last()),
    rows: await tableRows(track)
  }
}

type CycleView = {
  /** The header copy: `$110.00 call · sold 2026-09-14 at 32 DTE · 32 days held`. */
  copy: string
  outcome: string
  /** `1 roll`, or null for an unrolled cycle. */
  rolls: string | null
  netLabel: string
  net: string
  flag: string | null
  /** Each row's cells: event, date, contract, price, total. */
  rows: string[][]
  /** `PMCC cost basis after cycle N`, `$X / share`, `from the US-103 ledger`. */
  footer: string[]
}

/** Cycle `n`'s header, flag, rows and footer. */
export async function readCycle(page: Page, n: number): Promise<CycleView> {
  const cycle = region(page, `Cycle ${n}`)
  const parts = await cycle.evaluate((section) => {
    const text = (el: Element): string => (el.textContent ?? '').trim()
    const [left, right] = Array.from(section.children[0].children)
    const flag = section.querySelector(':scope > p')
    return {
      // S badge, `Cycle N`, copy, outcome badge, roll marker
      heading: Array.from(left.children, text),
      net: Array.from(right.children, text),
      flag: flag ? text(flag) : null,
      footer: Array.from(section.lastElementChild?.children ?? [], text)
    }
  })
  const [, , copy, outcome, rolls = null] = parts.heading
  const [netLabel, net] = parts.net
  return {
    copy,
    outcome,
    rolls,
    netLabel,
    net,
    flag: parts.flag,
    rows: await tableRows(cycle),
    footer: parts.footer
  }
}

/** Cycles 1–9 in order: every cycle the XYZ Background and each of its variants shows. */
export async function readXyzCycles(page: Page): Promise<CycleView[]> {
  return Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => readCycle(page, n)))
}

/** The `Uncovered · …` gap rows, in document order. */
export function gapRows(page: Page): Locator {
  return region(page, 'Short-call cycles')
    .locator('p')
    .filter({ hasText: /^Uncovered · / })
}

/** A Timeline summary stat's value, by its exact label. */
export async function summaryStat(page: Page, label: string): Promise<string> {
  const stat = drawerContent(page, 'Timeline summary')
    .locator('div.flex-col')
    .filter({ has: page.getByText(label, { exact: true }) })
  return textOf(stat.locator(':scope > span').nth(1))
}

/** The Timeline summary's reconciliation sentence. */
export async function reconciliation(page: Page): Promise<string> {
  return textOf(drawerContent(page, 'Timeline summary').locator(':scope > div').last())
}

/** Whether `a` comes before `b` in document order. */
export async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const other = await b.elementHandle()
  if (!other) throw new Error('precedes: second element not found')
  return a.evaluate(
    (el, next) => Boolean(el.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING),
    other
  )
}
