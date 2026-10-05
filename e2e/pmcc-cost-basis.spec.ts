// [US-103] PMCC cost basis as a running cash ledger — one `it` per Gherkin scenario (Linear
// OPT-9). The XYZ PMCC is opened through `window.api.createPmccPosition`; later leg events land
// through the test-only `_test:pmcc-record-leg-event` channel, so the app launches with
// NODE_ENV=test. Event dates are relative to the run day (data-model.md § 5); the money is not.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { reachHoldingSharesState } from './helpers'
import { closePmcc, launchPmcc, positionRows, sqlite, tableCount, tempDbPath } from './pmcc-helpers'
import {
  CYCLES,
  EXPIRE_1,
  LEAPS_ROLL,
  SHORT_2,
  SHORT_ROLL,
  cell,
  createXyzPmcc,
  drawer,
  openXyzDetail,
  recordEvent,
  recordEvents,
  snapshots
} from './pmcc-ledger-helpers'

let app: ElectronApplication | undefined
let dbPath: string

afterEach(async () => {
  await closePmcc(app, dbPath)
  app = undefined
})

async function launch(): Promise<Page> {
  dbPath = tempDbPath('pmcc-basis')
  const launched = await launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })
  app = launched.app
  return launched.page
}

/** Launches, opens the XYZ PMCC, lands `events` in order, and opens its detail. */
async function xyzDetail(
  events: Parameters<typeof recordEvents>[2] = [],
  opts: Parameters<typeof createXyzPmcc>[1] = {}
): Promise<{ page: Page; id: string }> {
  const page = await launch()
  const id = await createXyzPmcc(page, opts)
  await recordEvents(page, id, events)
  await openXyzDetail(page)
  return { page, id }
}

async function drawerText(page: Page): Promise<string> {
  return (await drawer(page).content.textContent()) ?? ''
}

describe('US-103 — PMCC cost basis as a running cash ledger', () => {
  it('Cost basis after the two opening legs', async () => {
    const { page } = await xyzDetail()
    const { button, content } = drawer(page)

    // Open on arrival — nothing clicked it.
    expect(await button.getAttribute('aria-expanded')).toBe('true')
    expect(await content.isVisible()).toBe(true)

    // Below the leg panels: `Buy LEAPS call` precedes the drawer in document order.
    const legPanel = page.getByText('Buy LEAPS call', { exact: true }).first()
    const drawerHandle = await button.elementHandle()
    if (!drawerHandle) throw new Error('Cost basis drawer button not found')
    const precedes = await legPanel.evaluate(
      (panel, drawerButton) =>
        Boolean(panel.compareDocumentPosition(drawerButton) & Node.DOCUMENT_POSITION_FOLLOWING),
      drawerHandle
    )
    expect(precedes).toBe(true)

    expect(await cell(page, 'Cost basis / share')).toBe('$23.00')
    expect(await cell(page, 'Total')).toBe('$2,300.00')
    expect(await cell(page, 'LEAPS cost to date')).toBe('$25.00')
    expect(await cell(page, 'Short-call credits to date')).toBe('-$2.00')
    expect(await cell(page, 'Effective share cost')).toBe('$103.00')
    expect(await cell(page, 'Premium recovered')).toBe('8.0%')

    const text = await drawerText(page)
    for (const absent of ['Max profit', 'Breakeven', 'Annualized']) {
      expect(text).not.toContain(absent)
    }
  })

  it('The open short-call credit is cash in the ledger, not profit', async () => {
    const { page } = await xyzDetail()

    expect(await cell(page, 'Short-call credits to date')).toBe('-$2.00')

    const text = await drawerText(page)
    // Guard: the drawer has rendered its stats, so the absences below are not vacuous.
    expect(text).toContain('Short-call credits to date')
    expect(text).not.toMatch(/profit/i)
    expect(text).not.toMatch(/realized/i)
    expect(text).not.toContain('Effective Basis / Share')
    expect(text).not.toContain('Shares')
  })

  it('A short call that expires worthless does not move cost basis', async () => {
    const { page, id } = await xyzDetail([EXPIRE_1()])

    expect(await cell(page, 'Cost basis / share')).toBe('$23.00')
    expect(await cell(page, 'Total')).toBe('$2,300.00')

    const chain = await snapshots(page, id)
    expect(chain).toHaveLength(2)
    expect(chain.at(-1)).toMatchObject({
      triggerEvent: 'PMCC_SHORT_EXPIRED',
      basisPerShare: '23.0000'
    })
  })

  it('A subsequent short call lowers cost basis', async () => {
    const { page } = await xyzDetail([EXPIRE_1(), SHORT_2()])

    expect(await cell(page, 'Cost basis / share')).toBe('$21.20')
    expect(await cell(page, 'Total')).toBe('$2,120.00')
    expect(await cell(page, 'Short-call credits to date')).toBe('-$3.80')
    expect(await cell(page, 'Effective share cost')).toBe('$101.20')
  })

  it('A short-call roll contributes one net amount, not two gross amounts', async () => {
    const page = await launch()
    const id = await createXyzPmcc(page)
    await recordEvents(page, id, [EXPIRE_1(), SHORT_2()])
    const before = await snapshots(page, id)

    await recordEvents(page, id, [SHORT_ROLL()])
    await openXyzDetail(page)

    expect(await cell(page, 'Cost basis / share')).toBe('$21.80')
    expect(await cell(page, 'Total')).toBe('$2,180.00')

    const after = await snapshots(page, id)
    expect(after).toHaveLength(before.length + 1)
    const last = after.at(-1)
    const previous = before.at(-1)
    expect(last).toMatchObject({ triggerEvent: 'PMCC_SHORT_ROLL', basisPerShare: '21.8000' })
    expect(previous).toBeDefined()
    if (!last || !previous) throw new Error('expected snapshots before and after the short roll')
    const delta = Number(last.basisPerShare) - Number(previous.basisPerShare)
    expect(delta.toFixed(4)).toBe('0.6000')
  })

  it('A LEAPS roll applies its net cash and re-anchors the effective share cost', async () => {
    const { page } = await xyzDetail([EXPIRE_1(), SHORT_2(), SHORT_ROLL(), LEAPS_ROLL()])

    expect(await cell(page, 'Cost basis / share')).toBe('$19.30')
    expect(await cell(page, 'Total')).toBe('$1,930.00')
    expect(await cell(page, 'LEAPS cost to date')).toBe('$22.50')
    expect(await cell(page, 'Effective share cost')).toBe('$104.30')
  })

  it('Credits that exceed the LEAPS cost give a negative basis', async () => {
    const { page } = await xyzDetail([EXPIRE_1(), SHORT_2(), SHORT_ROLL(), LEAPS_ROLL(), CYCLES()])

    expect(await cell(page, 'Cost basis / share')).toBe('-$0.40')
    expect(await cell(page, 'Total')).toBe('-$40.00')
    expect(await cell(page, 'Premium recovered')).toBe('101.8%')
    // Not floored at zero anywhere in the drawer.
    expect(await drawerText(page)).not.toContain('$0.00')
  })

  it('Cost basis is per share of contract regardless of quantity', async () => {
    const { page } = await xyzDetail([], { contracts: 3 })

    expect(await cell(page, 'Cost basis / share')).toBe('$23.00')
    expect(await cell(page, 'Total')).toBe('$6,900.00')
  })

  it('Fees are counted once, in the leg that incurred them', async () => {
    const { page } = await xyzDetail([], { fees: 1 })

    expect(await cell(page, 'Cost basis / share')).toBe('$23.02')
    expect(await cell(page, 'Total')).toBe('$2,302.00')
  })

  it('The audit chain records one snapshot per leg event', async () => {
    const { page, id } = await xyzDetail([EXPIRE_1(), SHORT_2(), SHORT_ROLL(), LEAPS_ROLL()])

    const chain = await snapshots(page, id)
    expect(chain.map((s) => s.triggerEvent)).toEqual([
      'PMCC_OPEN',
      'PMCC_SHORT_EXPIRED',
      'PMCC_SHORT_OPEN',
      'PMCC_SHORT_ROLL',
      'PMCC_LEAPS_ROLL'
    ])
    expect(chain.map((s) => s.basisPerShare)).toEqual([
      '23.0000',
      '23.0000',
      '21.2000',
      '21.8000',
      '19.3000'
    ])
    const times = chain.map((s) => s.snapshotAt)
    expect(times).toEqual([...times].sort())
    expect(new Set(times).size).toBe(times.length)
  })

  it('A failed leg event leaves no cost-basis change', async () => {
    const page = await launch()
    const id = await createXyzPmcc(page)

    // A storage failure mid-transaction: the leg row inserts, then the snapshot write aborts.
    // (chmod cannot do this — the app already holds the DB open read-write.)
    sqlite(
      dbPath,
      `CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
       BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`
    )
    const result = await recordEvent(page, id, SHORT_2())
    expect(result).toMatchObject({ ok: false })

    await openXyzDetail(page)
    expect(await cell(page, 'Cost basis / share')).toBe('$23.00')
    expect(tableCount(dbPath, 'legs')).toBe(2)
    expect(await snapshots(page, id)).toHaveLength(1)
  })

  it('The positions list shows the running cost basis', async () => {
    const page = await launch()
    const id = await createXyzPmcc(page)
    await recordEvents(page, id, [EXPIRE_1(), SHORT_2(), SHORT_ROLL()])
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const row = positionRows(page).filter({ hasText: 'XYZ' })
    await row.waitFor()
    const text = (await row.textContent()) ?? ''
    expect(text).toContain('$2,180.00')
    expect(text).not.toContain('$2,300.00')
    expect(text).not.toContain('net debit')
  })

  it('Leave a classic wheel unaffected', async () => {
    const page = await launch()
    await reachHoldingSharesState(page, { ticker: 'AAPL', strike: '48.50', premium: '2.00' })

    const detail = page.locator('[data-testid="position-detail"]')
    const wheelDrawer = page.locator('button').filter({ hasText: /Cost basis & history/ })
    await wheelDrawer.waitFor()
    // The PMCC drawer selector must not pick up the wheel's drawer.
    expect(await drawer(page).button.count()).toBe(0)

    if ((await wheelDrawer.getAttribute('aria-expanded')) !== 'true') await wheelDrawer.click()
    const wheelContent = wheelDrawer.locator('xpath=following-sibling::div[1]')
    expect(await wheelContent.textContent()).toContain('$46.50')

    const text = (await detail.textContent()) ?? ''
    expect(text).not.toContain('Cost basis / share')
    expect(text).not.toContain('Effective share cost')
  })
})
