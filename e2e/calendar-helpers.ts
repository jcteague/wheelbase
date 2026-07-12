import type { Page } from 'playwright'
import { addDays, differenceInCalendarMonths, format, parseISO, startOfMonth } from 'date-fns'
import { localToday } from './dates'

export function futureDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}

/** Convert a hex color (e.g. '#e6a817') to the `rgb(r, g, b)` string a browser reports via getComputedStyle. */
export function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

type CreatePositionResult = { ok: true; position: { id: string } } | { ok: false }
type AssignResult = { ok: boolean }
type OpenCcResult = { ok: boolean }

interface SeedCspOptions {
  ticker: string
  strike: number
  premium: number
  expiration: string
  contracts?: number
}

/** Seed a CSP_OPEN position directly through the IPC bridge — no UI form navigation needed. */
export async function seedCspPosition(page: Page, opts: SeedCspOptions): Promise<string> {
  const result = (await page.evaluate(
    async (i: Required<SeedCspOptions>) =>
      window.api.createPosition({
        ticker: i.ticker,
        strike: i.strike,
        contracts: i.contracts,
        premiumPerContract: i.premium,
        expiration: i.expiration
      }),
    { contracts: 1, ...opts }
  )) as CreatePositionResult

  if (!result.ok) throw new Error(`createPosition failed for ${opts.ticker}`)
  return result.position.id
}

async function assignCsp(page: Page, positionId: string, assignmentDate: string): Promise<void> {
  const result = (await page.evaluate(
    async ({ posId, date }: { posId: string; date: string }) =>
      window.api.assignPosition({ positionId: posId, assignmentDate: date }),
    { posId: positionId, date: assignmentDate }
  )) as AssignResult
  if (!result.ok) throw new Error(`assignPosition failed for position ${positionId}`)
}

interface SeedCcOptions {
  ticker: string
  cspStrike: number
  cspPremium: number
  ccStrike: number
  ccPremium: number
  ccExpiration: string
}

/** Seed a position through CSP_OPEN → HOLDING_SHARES → CC_OPEN, expiring on `ccExpiration`. */
export async function seedCcOpenPosition(page: Page, opts: SeedCcOptions): Promise<string> {
  const positionId = await seedCspPosition(page, {
    ticker: opts.ticker,
    strike: opts.cspStrike,
    premium: opts.cspPremium,
    // Assignment must be well before the CC's expiration for the CC leg to be valid.
    expiration: futureDate(1)
  })

  const today = localToday()
  await assignCsp(page, positionId, today)

  const ccResult = (await page.evaluate(
    async (i: {
      posId: string
      strike: number
      premium: number
      expiration: string
      fillDate: string
    }) =>
      window.api.openCoveredCall({
        positionId: i.posId,
        strike: i.strike,
        contracts: 1,
        premiumPerContract: i.premium,
        expiration: i.expiration,
        fillDate: i.fillDate
      }),
    {
      posId: positionId,
      strike: opts.ccStrike,
      premium: opts.ccPremium,
      expiration: opts.ccExpiration,
      fillDate: today
    }
  )) as OpenCcResult
  if (!ccResult.ok) throw new Error(`openCoveredCall failed for ${opts.ticker}`)

  return positionId
}

interface SeedHoldingSharesOptions {
  ticker: string
  strike: number
  premium: number
}

/** Seed a position through CSP_OPEN → HOLDING_SHARES (no active option leg / expiration afterward). */
export async function seedHoldingSharesPosition(
  page: Page,
  opts: SeedHoldingSharesOptions
): Promise<string> {
  const positionId = await seedCspPosition(page, {
    ticker: opts.ticker,
    strike: opts.strike,
    premium: opts.premium,
    expiration: futureDate(1)
  })

  await assignCsp(page, positionId, localToday())

  return positionId
}

export async function goToCalendar(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/calendar'
  })
  await page.waitForSelector('text=Expiration Calendar')
}

/** Click the month nav's ‹/› controls enough times to bring `targetIso`'s month into view. */
export async function navigateToMonthOf(page: Page, targetIso: string): Promise<void> {
  const diff = differenceInCalendarMonths(
    startOfMonth(parseISO(targetIso)),
    startOfMonth(new Date())
  )
  const button = diff > 0 ? '›' : '‹'
  for (let i = 0; i < Math.abs(diff); i++) {
    await page.click(`button:has-text("${button}")`)
  }
}
