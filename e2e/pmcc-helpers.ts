// [US-101] Helpers for the PMCC entry e2e spec: launch with an XYZ call chain, drive the
// New position sheet in PMCC mode, and read back what was recorded.
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { localDate } from './dates'
import { selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ── Fixture (data-model §11, dates relative to the run day) ──────────────────

export const LEAPS_DTE = 368
export const SHORT_DTE = 32

export type PmccLegFixture = {
  strike: string
  expiration: string
  fill: string
  fees: string
  fillDate: string
}

export type PmccFixture = {
  ticker: string
  contracts: string
  long: PmccLegFixture
  short: PmccLegFixture
}

export function pmccFixture(today: string): PmccFixture {
  return {
    ticker: 'XYZ',
    contracts: '1',
    long: {
      strike: '80.00',
      expiration: localDate(LEAPS_DTE),
      fill: '25.00',
      fees: '0.00',
      fillDate: today
    },
    short: {
      strike: '110.00',
      expiration: localDate(SHORT_DTE),
      fill: '2.00',
      fees: '0.00',
      fillDate: today
    }
  }
}

/** `XYZ270917C00080000` — OCC symbol, the key the fake provider parses identity from. */
function occSymbol(
  underlying: string,
  expiration: string,
  type: 'C' | 'P',
  strike: number
): string {
  const yymmdd = expiration.slice(2).replaceAll('-', '')
  return `${underlying}${yymmdd}${type}${String(Math.round(strike * 1000)).padStart(8, '0')}`
}

export const LEAPS_SYMBOL = (): string => occSymbol('XYZ', localDate(LEAPS_DTE), 'C', 80)
export const SHORT_SYMBOL = (): string => occSymbol('XYZ', localDate(SHORT_DTE), 'C', 110)

type SnapshotFixture = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks?: { delta: string; gamma: string; theta: string; vega: string }
  timestamp: string
}

function snapshot(
  bid: string,
  ask: string,
  mid: string,
  delta: string,
  timestamp: string
): SnapshotFixture {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: 100,
    volume: 10,
    greeks: { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.3000' },
    timestamp
  }
}

type ChainOverrides = {
  long?: Partial<SnapshotFixture>
  short?: Partial<SnapshotFixture>
}

/**
 * The XYZ chain: the $80 LEAPS and $110 short call, plus decoys the picker must never
 * offer — an ABC call and an XYZ put, both inside the short leg's DTE/delta band.
 */
export function xyzChainFixtures(overrides: ChainOverrides = {}): Record<string, SnapshotFixture> {
  const now = new Date().toISOString()
  const shortExp = localDate(SHORT_DTE)
  return {
    [LEAPS_SYMBOL()]: { ...snapshot('24.80', '25.20', '25.00', '0.8000', now), ...overrides.long },
    [SHORT_SYMBOL()]: { ...snapshot('1.90', '2.10', '2.00', '0.3000', now), ...overrides.short },
    [occSymbol('ABC', shortExp, 'C', 110)]: snapshot('1.40', '1.60', '1.50', '0.3000', now),
    [occSymbol('XYZ', shortExp, 'P', 90)]: snapshot('1.40', '1.60', '1.50', '-0.3000', now)
  }
}

/** A LEAPS-band chain holding only Δ 0.50 calls (outside 0.70–0.85), plus the short call. */
export function noMatchingLeapsFixtures(): Record<string, SnapshotFixture> {
  const now = new Date().toISOString()
  return {
    [occSymbol('XYZ', localDate(LEAPS_DTE), 'C', 100)]: snapshot(
      '12.00',
      '12.40',
      '12.20',
      '0.5000',
      now
    ),
    [SHORT_SYMBOL()]: snapshot('1.90', '2.10', '2.00', '0.3000', now)
  }
}

// ── Launch ───────────────────────────────────────────────────────────────────

type PmccApp = { app: ElectronApplication; page: Page }

export async function launchPmcc(
  dbPath: string,
  {
    fixtures = xyzChainFixtures(),
    env = {}
  }: { fixtures?: Record<string, SnapshotFixture>; env?: Record<string, string> } = {}
): Promise<PmccApp> {
  const app = await electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: {
      ...process.env,
      WHEELBASE_DB_PATH: dbPath,
      FAKE_MARKET_DATA: 'true',
      FAKE_BROKER: 'true',
      WHEELBASE_MOCK_OPTION_SNAPSHOTS: JSON.stringify(fixtures),
      ...env
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

// ── Sheet ────────────────────────────────────────────────────────────────────

export const sheet = (page: Page): Locator =>
  page.locator('[role="dialog"][aria-label="New position"]')

export const recordButton = (page: Page): Locator => page.getByTestId('record-pmcc')

/** A leg's SectionCard, by its `Buy LEAPS call` / `Sell short call` header. */
export const legSection = (page: Page, leg: 'long' | 'short'): Locator =>
  sheet(page)
    .locator('section')
    .filter({ hasText: leg === 'long' ? 'Buy LEAPS call' : 'Sell short call' })

/** The `Field` wrapping a control: its label, the control and its error line. */
export const fieldOf = (page: Page, controlId: string): Locator =>
  page.locator(`div.flex-col:has(> label[for="${controlId}"])`)

export async function openNewPositionSheet(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Open Wheel/ }).click()
  await sheet(page).waitFor({ state: 'visible' })
}

export async function selectPmcc(page: Page): Promise<void> {
  await page
    .getByRole('group', { name: 'Position strategy' })
    .getByRole('button', { name: 'PMCC' })
    .click()
  await page.getByRole('button', { name: 'PMCC', pressed: true }).waitFor()
}

export async function selectStandard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Standard', exact: true }).click()
  await page.getByRole('button', { name: 'Standard', pressed: true }).waitFor()
}

/** Types into an input and leaves it, so RHF's onBlur validation runs for that field. */
export async function typeAndBlur(page: Page, selector: string, value: string): Promise<void> {
  await page.fill(selector, value)
  await page.locator(selector).blur()
}

/** Opens a DatePicker, picks the day, and blurs its trigger so the field validates. */
export async function pickDate(page: Page, selector: string, iso: string): Promise<void> {
  await selectDate(page, selector, iso)
  await page.locator(selector).focus()
  await page.locator(selector).blur()
}

export async function selectContract(
  page: Page,
  leg: 'long' | 'short',
  contractId: string
): Promise<void> {
  const select = page.locator(`#${leg}-contract`)
  await select.locator(`option[value="${contractId}"]`).waitFor({ state: 'attached' })
  await select.selectOption(contractId)
}

/** Swaps a leg's contract picker for the manual strike and expiration inputs. */
export async function switchLegToManual(page: Page, leg: 'long' | 'short'): Promise<void> {
  await legSection(page, leg).getByRole('button', { name: 'Enter manually' }).click()
  await page.locator(`button#${leg}-expiration`).waitFor()
}

/** Switches a leg to manual entry and types its strike and expiration. */
export async function enterLegManually(
  page: Page,
  leg: 'long' | 'short',
  { strike, expiration }: { strike: string; expiration: string }
): Promise<void> {
  await switchLegToManual(page, leg)
  await typeAndBlur(page, `#${leg}-strike`, strike)
  await pickDate(page, `#${leg}-expiration`, expiration)
}

/**
 * Fills the whole PMCC entry. `chain` picks both contracts from the fixture chain;
 * `manual` types strikes and expirations. Fill dates default to today in the form, so
 * they are only touched when the fixture says otherwise.
 */
export async function fillPmccLegs(
  page: Page,
  fixture: PmccFixture,
  { via = 'chain', today }: { via?: 'chain' | 'manual'; today?: string } = {}
): Promise<void> {
  await page.fill('#pmcc-ticker', fixture.ticker)
  await typeAndBlur(page, '#pmcc-contracts', fixture.contracts)
  for (const leg of ['long', 'short'] as const) {
    const values = fixture[leg]
    if (via === 'chain') {
      await selectContract(page, leg, leg === 'long' ? LEAPS_SYMBOL() : SHORT_SYMBOL())
    } else {
      await enterLegManually(page, leg, values)
    }
    await typeAndBlur(page, `#${leg}-fill`, values.fill)
    await typeAndBlur(page, `#${leg}-fees`, values.fees)
    if (values.fillDate !== today) await pickDate(page, `#${leg}-fill-date`, values.fillDate)
  }
}

export async function recordPmcc(page: Page): Promise<void> {
  await recordButton(page).click()
  await sheet(page).waitFor({ state: 'detached' })
  await page.getByTestId('positions-recorded-banner').waitFor()
}

export const positionRows = (page: Page): Locator => page.locator('[data-testid="position-card"]')

export async function listPositions(
  page: Page
): Promise<Array<{ id: string; ticker: string; strategyType: string }>> {
  return page.evaluate(() => window.api.listPositions())
}

/** Row counts straight from SQLite — the only view that can see an orphaned leg. */
export function tableCount(dbPath: string, table: 'positions' | 'legs'): number {
  return Number(execFileSync('sqlite3', [dbPath, `SELECT count(*) FROM ${table};`]).toString())
}

export function sqlite(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath, sql])
}

/**
 * Records the channel of every `ipcMain.handle` invocation from here on. Wraps the
 * registered handlers in the main process (`ipcMain._invokeHandlers`), so it sees
 * every channel the renderer reaches, not only the ones the spec calls itself.
 */
export async function spyOnIpcChannels(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...args: unknown[]) => unknown
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })
      ._invokeHandlers
    const g = globalThis as unknown as { __ipcChannels: string[] }
    g.__ipcChannels = []
    for (const [channel, handler] of handlers) {
      handlers.set(channel, (...args: unknown[]) => {
        g.__ipcChannels.push(channel)
        return handler(...args)
      })
    }
  })
}

export async function invokedIpcChannels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __ipcChannels: string[] }).__ipcChannels)
}
