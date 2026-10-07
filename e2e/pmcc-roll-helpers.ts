// [US-104] Helpers for the PMCC short-call roll e2e spec: reach the AC Background (the $108
// short at $1.80 over the $80 LEAPS), drive the `Roll Short Call` sheet, and compute the dates,
// DTE and labels the sheet shows. Dates are relative to the run day, so every label the spec
// expects is derived here from the same `localDate` values with `date-fns`.
import { differenceInCalendarDays, format, isSameMonth, isSameYear, parseISO } from 'date-fns'
import type { Locator, Page } from 'playwright'
import { localDate, localToday } from './dates'
import { selectDate } from './helpers'
import { fieldOf } from './pmcc-helpers'
import {
  EXPIRE_1,
  SHORT_2,
  createXyzPmcc,
  openXyzDetail,
  recordEvents
} from './pmcc-ledger-helpers'

// ── Dates (SHORT_2's expiration is `localDate(67)`, the LEAPS's `localDate(368)`) ──

export const CURRENT_SHORT_EXP = localDate(67)
export const REPLACEMENT_EXP = localDate(95)
export const LEAPS_EXP = localDate(368)
export const ROLLS_IN_EXP = localDate(60)
/**
 * The Background's events are dated ahead of the run day (SHORT_2 fills at `localDate(35)`), so
 * a roll takes US-103's `SHORT_ROLL` fill date: on or after SHORT_2's fill (the engine and form
 * reject an earlier one) and after it in the date-ordered snapshot chain. The sheet's fill date
 * defaults to today, which is before SHORT_2, so `fillRoll` sets this unless told otherwise.
 */
export const ROLL_FILL_DATE = localDate(63)

/** Calendar days from today to `iso` — the sheet's DTE. */
export const dteOf = (iso: string): number =>
  differenceInCalendarDays(parseISO(iso), parseISO(localToday()))

/** `Nov 20, 2026` — the date in the rolls-in rejection message. */
export const longDate = (iso: string): string => format(parseISO(iso), 'MMM d, yyyy')

/**
 * The expiration half of the roll label: `Nov to Dec`, or `Nov 1 to Nov 29` when both dates
 * fall in one month (the run day decides which, since the dates are relative).
 */
export function expirationSpan(from: string, to: string): string {
  const [start, end] = [parseISO(from), parseISO(to)]
  const pattern = isSameMonth(start, end) ? 'MMM d' : isSameYear(start, end) ? 'MMM' : 'MMM yyyy'
  return `${format(start, pattern)} to ${format(end, pattern)}`
}

// ── Reaching the Background ─────────────────────────────────────────────────

/** XYZ PMCC → first short expires → $108 short sold at $1.80; opens the detail. */
export async function reachXyzShortTwo(page: Page): Promise<string> {
  const id = await createXyzPmcc(page)
  await recordEvents(page, id, [EXPIRE_1(), SHORT_2()])
  await openXyzDetail(page)
  return id
}

/** XYZ PMCC whose first short expired and was not replaced — only the LEAPS is open. */
export async function reachXyzLeapsOnly(page: Page): Promise<string> {
  const id = await createXyzPmcc(page)
  await recordEvents(page, id, [EXPIRE_1()])
  await openXyzDetail(page)
  return id
}

// ── The sheet ───────────────────────────────────────────────────────────────

export const rollButton = (page: Page): Locator => page.getByTestId('roll-pmcc-short-btn')

export const rollSheet = (page: Page): Locator =>
  page.getByRole('dialog', { name: 'Roll Short Call' })

export const confirmButton = (page: Page): Locator => page.getByTestId('pmcc-roll-confirm')

export async function openRollShortSheet(page: Page): Promise<void> {
  await rollButton(page).click()
  await rollSheet(page).waitFor()
}

export type RollDraft = {
  costToClose: string
  strike: string
  expiration: string
  premium: string
  /** Defaults to `ROLL_FILL_DATE` — today would precede the Background's short call. */
  fillDate?: string
}

export async function fillRoll(page: Page, draft: RollDraft): Promise<void> {
  await page.fill('#pmcc-roll-cost-to-close', draft.costToClose)
  await page.fill('#pmcc-roll-strike', draft.strike)
  await selectDate(page, '#pmcc-roll-expiration', draft.expiration)
  await page.fill('#pmcc-roll-premium', draft.premium)
  await selectDate(page, '#pmcc-roll-fill-date', draft.fillDate ?? ROLL_FILL_DATE)
}

/** The value beside a `SummaryRow` label inside the sheet, by its exact label. */
export async function summaryValue(page: Page, label: string): Promise<string> {
  const value = rollSheet(page).locator(`div:has(> span:text-is("${label}")) > span:nth-child(2)`)
  return ((await value.textContent()) ?? '').trim()
}

/** Whitespace-normalised text of a `data-testid` element inside the page. */
export async function testIdText(page: Page, testId: string): Promise<string> {
  return ((await page.getByTestId(testId).textContent()) ?? '').replace(/\s+/g, ' ').trim()
}

/** A field's inline error (`role="alert"` inside its `Field`). */
export async function fieldError(page: Page, controlId: string): Promise<string> {
  return ((await fieldOf(page, controlId).getByRole('alert').textContent()) ?? '').trim()
}

type RollPayload = Parameters<typeof window.api.rollPmccShortCall>[0]

/** Calls the roll IPC directly, past the form — the server-side rejection path. */
export async function rollShortCall(
  page: Page,
  payload: RollPayload
): Promise<Awaited<ReturnType<typeof window.api.rollPmccShortCall>>> {
  return page.evaluate((p) => window.api.rollPmccShortCall(p), payload)
}

/** `window.api.getPosition`, failing loudly on `{ ok: false }`. */
export async function positionDetail(
  page: Page,
  id: string
): Promise<Extract<Awaited<ReturnType<typeof window.api.getPosition>>, { ok: true }>> {
  const result = await page.evaluate((positionId) => window.api.getPosition(positionId), id)
  if (!result.ok) throw new Error(`getPosition failed: ${JSON.stringify(result)}`)
  return result
}
