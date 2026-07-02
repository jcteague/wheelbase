// [US-51] Management queue dashboard — E2E tests (one per acceptance scenario).
//
// The queue is a read/display surface over US-50's persisted alerts. Every test
// drives the real alert-evaluation job so the engine→IPC→render path is exercised
// end to end.
//
// Note on AC-1: the story's AC lists high/medium/low tiers, but the US-50 engine
// only ships two urgencies — `high` (EXPIRATION_IMMINENT) and `medium`
// (MANAGEMENT_WINDOW); no `low`-urgency rule exists yet (PROFIT_TARGET /
// STRIKE_PROXIMITY are future work). So the ordering contract — "urgency tier then
// triggered_at" — is proven with one `high` alert followed by two `medium` alerts
// created in separate evaluation runs, giving a deterministic time tie-break
// (earlier-triggered medium sorts first).
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import {
  REGULAR_SESSION,
  cleanupDb,
  getPage,
  goToPositionsList,
  launchApp,
  seedCsp,
  tmpDb
} from './assignment-helpers'
import { cspAtDte, QUEUE_ROW, runAlertEvaluation } from './alert-helpers'

async function queueTickers(page: Page): Promise<string[]> {
  return page
    .locator(QUEUE_ROW)
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-ticker') ?? ''))
}

describe('US-51: management queue dashboard', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('queue appears above the positions grid ordered by urgency then time', async () => {
    dbPath = tmpDb('wb-e2e-us51-order')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    // AAPL (3 DTE → high) and TSLA (9 DTE → medium) are alerted first, so TSLA's
    // medium alert is triggered earlier than NVDA's.
    await seedCsp(page, cspAtDte('AAPL', 180, 3))
    await seedCsp(page, cspAtDte('TSLA', 250, 9))
    await runAlertEvaluation(page)

    // NVDA (14 DTE → medium) is alerted in a later evaluation run, so its
    // triggered_at is strictly after TSLA's → TSLA sorts ahead of NVDA.
    await seedCsp(page, cspAtDte('NVDA', 500, 14))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    expect(await queueTickers(page)).toEqual(['AAPL', 'TSLA', 'NVDA'])

    const queueBox = await page.locator(QUEUE_ROW).first().boundingBox()
    const cardBox = await page.locator('[data-testid="position-card"]').first().boundingBox()
    expect(queueBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(queueBox!.y).toBeLessThan(cardBox!.y)
  })

  it('queue item shows ticker, phase badge, trigger summary, and a Review position action', async () => {
    dbPath = tmpDb('wb-e2e-us51-fields')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    await seedCsp(page, cspAtDte('AAPL', 180, 3))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    const row = page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' })
    const rowText = await row.textContent()
    expect(rowText).toContain('AAPL')
    expect(rowText).toContain('CSP Open')
    expect(rowText).toContain('Expires in 3 days at $180.00 strike')
    expect(await row.getByRole('button', { name: 'Review position' }).count()).toBe(1)
  })

  it('quick action opens the related position detail page', async () => {
    dbPath = tmpDb('wb-e2e-us51-nav')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const tslaId = await seedCsp(page, cspAtDte('TSLA', 250, 9))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    const row = page.locator(QUEUE_ROW).filter({ hasText: 'TSLA' })
    await row.getByRole('button', { name: 'Review position' }).click()

    await page.waitForFunction((id) => location.hash === `#/positions/${id}`, tslaId)
    expect(await page.evaluate(() => location.hash)).toBe(`#/positions/${tslaId}`)
  })

  it('empty state renders when there are no open alerts', async () => {
    dbPath = tmpDb('wb-e2e-us51-empty')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    await goToPositionsList(page)
    await page.waitForSelector('text=No positions need attention right now')

    expect(await page.locator(QUEUE_ROW).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Review position' }).count()).toBe(0)
  })
})
