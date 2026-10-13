// [US-103] Helpers for the PMCC cost-basis e2e spec: open the AC's XYZ PMCC through the API,
// land later leg events through the test-only `_test:pmcc-record-leg-event` channel, and read
// the `Cost basis` drawer and the snapshot chain back. Fixture events mirror
// `src/main/services/test-fixtures/pmcc-legs.ts` (data-model.md § 5) with run-day-relative dates.
import type { Locator, Page } from 'playwright'
import { localDate, localToday } from './dates'
import { openDetailFor } from './helpers'
import { pmccFixture } from './pmcc-helpers'

// ── Opening legs ─────────────────────────────────────────────────────────────

type CreatePmccPayload = Parameters<typeof window.api.createPmccPosition>[0]

/** Opens the XYZ PMCC ($80 LEAPS @ 25.00, $110 short @ 2.00) and returns its position id. */
export async function createXyzPmcc(
  page: Page,
  { contracts = 1, fees = 0 }: { contracts?: number; fees?: number } = {}
): Promise<string> {
  const fixture = pmccFixture(localToday())
  const leg = (l: typeof fixture.long): CreatePmccPayload['long'] => ({
    underlying: fixture.ticker,
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: Number(l.strike),
    expiration: l.expiration,
    contracts,
    fillPrice: Number(l.fill),
    fillDate: l.fillDate,
    fees
  })
  const payload: CreatePmccPayload = {
    strategy: 'PMCC',
    ticker: fixture.ticker,
    long: leg(fixture.long),
    short: leg(fixture.short)
  }
  const result = await page.evaluate((p) => window.api.createPmccPosition(p), payload)
  if (!result.ok) throw new Error(`createPmccPosition failed: ${JSON.stringify(result)}`)
  return result.position.id
}

// ── Later leg events (data-model.md § 5) ─────────────────────────────────────

/** A later leg event as the test seam accepts it; `recordEvent` supplies the position id. */
export type PmccLegEvent = Omit<
  Parameters<typeof window.api.testPmccRecordLegEvent>[0],
  'positionId'
>
type LegRow = PmccLegEvent['legs'][number]

const row = (fields: Omit<LegRow, 'contracts'>): LegRow => ({ contracts: 1, ...fields })

export const EXPIRE_1 = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_SHORT_EXPIRED',
  eventDate: localDate(32),
  legs: [
    row({
      legRole: 'SHORT_CALL_EXPIRED',
      action: 'EXPIRE',
      strike: '110.0000',
      expiration: localDate(32),
      premiumPerContract: '0.0000',
      fillDate: localDate(32)
    })
  ]
})

export const SHORT_2 = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_SHORT_OPEN',
  eventDate: localDate(35),
  legs: [
    row({
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      strike: '108.0000',
      expiration: localDate(67),
      premiumPerContract: '1.8000',
      fillDate: localDate(35)
    })
  ]
})

export const SHORT_ROLL = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_SHORT_ROLL',
  eventDate: localDate(63),
  legs: [
    row({
      legRole: 'ROLL_FROM',
      action: 'BUY',
      strike: '108.0000',
      expiration: localDate(67),
      premiumPerContract: '3.0000',
      fillDate: localDate(63),
      rollChainId: 'rc-1'
    }),
    row({
      legRole: 'ROLL_TO',
      action: 'SELL',
      strike: '112.0000',
      expiration: localDate(95),
      premiumPerContract: '2.4000',
      fillDate: localDate(63),
      rollChainId: 'rc-1'
    })
  ]
})

/** The $112 short from `SHORT_ROLL` expires worthless, leaving only the LEAPS open. */
export const EXPIRE_2 = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_SHORT_EXPIRED',
  eventDate: localDate(95),
  legs: [
    row({
      legRole: 'SHORT_CALL_EXPIRED',
      action: 'EXPIRE',
      strike: '112.0000',
      expiration: localDate(95),
      premiumPerContract: '0.0000',
      fillDate: localDate(95)
    })
  ]
})

export const LEAPS_ROLL = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_LEAPS_ROLL',
  eventDate: localDate(84),
  legs: [
    row({
      legRole: 'ROLL_FROM',
      action: 'SELL',
      strike: '80.0000',
      expiration: localDate(368),
      premiumPerContract: '26.0000',
      fillDate: localDate(84),
      rollChainId: 'rc-2'
    }),
    row({
      legRole: 'ROLL_TO',
      action: 'BUY',
      strike: '85.0000',
      expiration: localDate(494),
      premiumPerContract: '23.5000',
      fillDate: localDate(84),
      rollChainId: 'rc-2'
    })
  ]
})

/** Stands in for six further short-call cycles: one $19.70 credit takes the basis to −$0.40. */
export const CYCLES = (): PmccLegEvent => ({
  triggerEvent: 'PMCC_SHORT_OPEN',
  eventDate: localDate(100),
  legs: [
    row({
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      strike: '118.0000',
      expiration: localDate(120),
      premiumPerContract: '19.7000',
      fillDate: localDate(100)
    })
  ]
})

type RecordEventResult = Awaited<ReturnType<typeof window.api.testPmccRecordLegEvent>>

/** Lands one leg event and its snapshot; returns the IPC envelope (`{ ok: false }` on failure). */
export async function recordEvent(
  page: Page,
  positionId: string,
  event: PmccLegEvent
): Promise<RecordEventResult> {
  return page.evaluate((payload) => window.api.testPmccRecordLegEvent(payload), {
    positionId,
    ...event
  })
}

/** Records each event in order, failing loudly if any is rejected. */
export async function recordEvents(
  page: Page,
  positionId: string,
  events: PmccLegEvent[]
): Promise<void> {
  for (const event of events) {
    const result = await recordEvent(page, positionId, event)
    if (!result.ok) throw new Error(`${event.triggerEvent} rejected: ${JSON.stringify(result)}`)
  }
}

// ── Reading the detail page ──────────────────────────────────────────────────

/**
 * The PMCC `Cost basis` CollapsedDrawer: its trigger button and the content sibling. The
 * `6 fields` suffix keeps the classic wheel's `Cost basis & history` (3 fields) out of the match.
 */
export function drawer(page: Page): { button: Locator; content: Locator } {
  const button = page.locator('button').filter({ hasText: /Cost basis\s*6 fields$/ })
  return { button, content: button.locator('xpath=following-sibling::div[1]') }
}

/** A stat's value text inside the `Cost basis` drawer, by its exact label. */
export async function cell(page: Page, label: string): Promise<string> {
  const stat = drawer(page)
    .content.locator('div.flex-col')
    .filter({ has: page.getByText(label, { exact: true }) })
  return ((await stat.locator(':scope > span').nth(1).textContent()) ?? '').trim()
}

/** The position's `allSnapshots`, oldest first. */
export async function snapshots(
  page: Page,
  positionId: string
): Promise<
  Array<{ triggerEvent: string; basisPerShare: string; snapshotAt: string; createdAt: string }>
> {
  const result = await page.evaluate((id) => window.api.getPosition(id), positionId)
  if (!result.ok) throw new Error(`getPosition failed: ${JSON.stringify(result)}`)
  return result.allSnapshots
}

/** Reloads the renderer so every query refetches, then opens the XYZ detail. */
export async function openXyzDetail(page: Page): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openDetailFor(page, 'XYZ')
  await drawer(page).button.waitFor()
}
