// [US-104][US-105] Helpers for the PMCC roll e2e specs: reach each AC Background, drive the
// `Roll Short Call` and `Roll LEAPS` sheets, and compute the dates, DTE and labels they show.
// Dates are relative to the run day, so every label a spec expects is derived here from the same
// `localDate` values with `date-fns`.
import { differenceInCalendarDays, format, isSameMonth, isSameYear, parseISO } from 'date-fns'
import type { Locator, Page } from 'playwright'
import { localDate, localToday } from './dates'
import { selectDate } from './helpers'
import { fieldOf } from './pmcc-helpers'
import {
  EXPIRE_1,
  EXPIRE_2,
  SHORT_2,
  SHORT_ROLL,
  type PmccLegEvent,
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

// ── US-105 dates (SHORT_ROLL leaves the $112 short at `localDate(95)` over the `LEAPS_EXP` LEAPS) ──

export const SHORT_EXP = localDate(95)
export const UP_OUT_EXP = localDate(494)
export const TOO_MUCH_EXP = localDate(860)
export const SHORTENS_EXP = localDate(340)
export const BEFORE_SHORT_EXP = localDate(81)
/**
 * A LEAPS roll's fill date: after the Background's `SHORT_ROLL` (`localDate(63)`) so its snapshot
 * ends the date-ordered chain — US-103's `LEAPS_ROLL` date. The sheet defaults to today.
 */
export const LEAPS_ROLL_FILL_DATE = localDate(84)
/** After `EXPIRE_2` (`localDate(95)`), for the no-short Background. */
export const NO_SHORT_ROLL_FILL_DATE = localDate(96)

/** Calendar days from today to `iso` — the sheet's DTE. */
export const dteOf = (iso: string): number =>
  differenceInCalendarDays(parseISO(iso), parseISO(localToday()))

/** `Oct 2027` — a month in the LEAPS roll label. */
export const monthYearLabel = (iso: string): string => format(parseISO(iso), 'MMM yyyy')

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

/** Opens the XYZ PMCC, records `events` against it, and opens its detail page. */
async function reachXyzAfter(page: Page, events: PmccLegEvent[]): Promise<string> {
  const id = await createXyzPmcc(page)
  await recordEvents(page, id, events)
  await openXyzDetail(page)
  return id
}

/** XYZ PMCC → first short expires → $108 short sold at $1.80; opens the detail. */
export async function reachXyzShortTwo(page: Page): Promise<string> {
  return reachXyzAfter(page, [EXPIRE_1(), SHORT_2()])
}

/** XYZ PMCC whose first short expired and was not replaced — only the LEAPS is open. */
export async function reachXyzLeapsOnly(page: Page): Promise<string> {
  return reachXyzAfter(page, [EXPIRE_1()])
}

/** XYZ PMCC → first short expires → $108 short → rolled to the $112 short at $2.40. */
export async function reachXyzLeapsRollBackground(page: Page): Promise<string> {
  return reachXyzAfter(page, [EXPIRE_1(), SHORT_2(), SHORT_ROLL()])
}

/** The LEAPS-roll Background whose $112 short then expires — no short call is open. */
export async function reachXyzNoShort(page: Page): Promise<string> {
  return reachXyzAfter(page, [EXPIRE_1(), SHORT_2(), SHORT_ROLL(), EXPIRE_2()])
}

// ── The sheets ──────────────────────────────────────────────────────────────

/** Which PMCC roll sheet: the short call's (US-104) or the LEAPS' (US-105). */
export type RollSheetKind = 'short' | 'leaps'

const SHEET: Record<RollSheetKind, { name: string; testIdPrefix: string }> = {
  short: { name: 'Roll Short Call', testIdPrefix: 'pmcc-roll' },
  leaps: { name: 'Roll LEAPS', testIdPrefix: 'pmcc-leaps-roll' }
}

export const rollButton = (page: Page): Locator => page.getByTestId('roll-pmcc-short-btn')

export const rollLeapsButton = (page: Page): Locator => page.getByTestId('roll-pmcc-leaps-btn')

export const rollSheet = (page: Page, kind: RollSheetKind = 'short'): Locator =>
  page.getByRole('dialog', { name: SHEET[kind].name })

export const confirmButton = (page: Page, kind: RollSheetKind = 'short'): Locator =>
  page.getByTestId(`${SHEET[kind].testIdPrefix}-confirm`)

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

export async function openRollLeapsSheet(page: Page): Promise<void> {
  await rollLeapsButton(page).click()
  await rollSheet(page, 'leaps').waitFor()
}

export type LeapsRollDraft = {
  proceeds: string
  strike: string
  expiration: string
  debit: string
  /** Defaults to `LEAPS_ROLL_FILL_DATE` — today would precede the Background's short roll. */
  fillDate?: string
}

export async function fillLeapsRoll(page: Page, draft: LeapsRollDraft): Promise<void> {
  await page.fill('#pmcc-leaps-roll-proceeds', draft.proceeds)
  await page.fill('#pmcc-leaps-roll-strike', draft.strike)
  await selectDate(page, '#pmcc-leaps-roll-expiration', draft.expiration)
  await page.fill('#pmcc-leaps-roll-debit', draft.debit)
  await selectDate(page, '#pmcc-leaps-roll-fill-date', draft.fillDate ?? LEAPS_ROLL_FILL_DATE)
}

/** The value beside a `SummaryRow` label inside a sheet's `SectionCard`, by its exact header. */
export async function sectionValue(
  page: Page,
  kind: RollSheetKind,
  header: string,
  label: string
): Promise<string> {
  return rowValue(rollSheet(page, kind).locator(`section:has(> div:text-is("${header}"))`), label)
}

/** The value beside a `SummaryRow` label inside the sheet, by its exact label. */
export async function summaryValue(page: Page, label: string): Promise<string> {
  return rowValue(rollSheet(page), label)
}

/** The `Strike` row of a leg card on the detail page (`Buy LEAPS call` / `Sell short call`). */
export async function legCardStrike(page: Page, title: string): Promise<string> {
  return rowValue(
    page.locator('section').filter({ has: page.getByText(title, { exact: true }) }),
    'Strike'
  )
}

/** The trimmed value span beside an exact `label` span, inside `scope`. */
async function rowValue(scope: Locator, label: string): Promise<string> {
  const value = scope.locator(`div:has(> span:text-is("${label}")) > span:nth-child(2)`)
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

type LeapsRollPayload = Parameters<typeof window.api.rollPmccLeaps>[0]

/** Calls the LEAPS roll IPC directly, past the form — the server-side rejection path. */
export async function rollLeaps(
  page: Page,
  payload: LeapsRollPayload
): Promise<Awaited<ReturnType<typeof window.api.rollPmccLeaps>>> {
  return page.evaluate((p) => window.api.rollPmccLeaps(p), payload)
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
