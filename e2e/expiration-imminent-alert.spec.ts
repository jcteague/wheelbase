import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication } from 'playwright'
import {
  REGULAR_SESSION,
  cleanupDb,
  getPage,
  goToPositionsList,
  launchApp,
  seedCsp,
  tmpDb
} from './assignment-helpers'
import {
  cspAtDte,
  listManagementQueueItems,
  QUEUE_ROW,
  readAlertRows,
  runAlertEvaluation,
  setActiveLegExpiration
} from './alert-helpers'
import { localDate } from './dates'

describe('US-52: expiration imminent alert', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('AC: Alert fires at 5 DTE remaining', async () => {
    dbPath = tmpDb('wb-e2e-us52-fire')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const positionId = await seedCsp(page, cspAtDte('AAPL', 180, 5))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    const items = await listManagementQueueItems(page)
    expect(items).toEqual([
      expect.objectContaining({
        positionId,
        ticker: 'AAPL',
        phase: 'CSP_OPEN',
        urgency: 'high',
        summary: 'Expires in 5 days at $180.00 strike',
        quickAction: 'Review position'
      })
    ])

    const row = page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' })
    expect(await row.count()).toBe(1)
    const rowText = await row.textContent()
    expect(rowText).toContain('AAPL')
    expect(rowText).toContain('CSP Open')
    expect(rowText).toContain('Expires in 5 days at $180.00 strike')
    expect(await row.getByRole('button', { name: 'Review position' }).count()).toBe(1)
  })

  it('AC: Alert remains open inside the final 5-day window', async () => {
    dbPath = tmpDb('wb-e2e-us52-refresh')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const positionId = await seedCsp(page, cspAtDte('AAPL', 180, 5))
    await runAlertEvaluation(page)

    const firstItems = await listManagementQueueItems(page)
    const firstAlert = firstItems.find((item) => item.positionId === positionId)
    expect(firstAlert).toBeDefined()
    expect(firstAlert?.summary).toBe('Expires in 5 days at $180.00 strike')

    setActiveLegExpiration(dbPath, positionId, localDate(3))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    const secondItems = await listManagementQueueItems(page)
    const secondAlert = secondItems.find((item) => item.positionId === positionId)
    expect(secondAlert).toBeDefined()
    expect(secondAlert?.alertId).toBe(firstAlert?.alertId)
    expect(secondAlert?.summary).toBe('Expires in 3 days at $180.00 strike')

    const row = page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' })
    expect(await row.count()).toBe(1)
    expect(await row.textContent()).toContain('Expires in 3 days at $180.00 strike')
  })

  it('AC: Alert does not fire before the threshold', async () => {
    dbPath = tmpDb('wb-e2e-us52-threshold')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    await seedCsp(page, cspAtDte('AAPL', 180, 6))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    const items = await listManagementQueueItems(page)
    const aaplAlert = items.find((item) => item.ticker === 'AAPL')
    expect(aaplAlert).toBeDefined()
    expect(aaplAlert?.summary).toBe('6 DTE remaining — review for roll or close')
    expect(aaplAlert?.urgency).toBe('medium')
    expect(items.some((item) => item.summary === 'Expires in 6 days at $180.00 strike')).toBe(false)

    const row = page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' })
    expect(await row.count()).toBe(1)
    const rowText = await row.textContent()
    expect(rowText).toContain('6 DTE remaining')
    expect(rowText).not.toContain('Expires in 6 days at $180.00 strike')
  })

  it('AC: Alert resolves after the leg is closed or expires', async () => {
    dbPath = tmpDb('wb-e2e-us52-resolve')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const positionId = await seedCsp(page, cspAtDte('AAPL', 180, 5))
    await runAlertEvaluation(page)

    const [openRow] = readAlertRows(dbPath)
    expect(openRow.status).toBe('open')

    const closeResult = await page.evaluate(async (payload) => window.api.closePosition(payload), {
      positionId,
      closePricePerContract: 1.25
    })
    expect(closeResult.ok).toBe(true)

    await runAlertEvaluation(page)
    await goToPositionsList(page)
    await page.waitForSelector('text=No positions need attention right now')

    expect(await listManagementQueueItems(page)).toEqual([])

    const resolvedRows = readAlertRows(dbPath)
    expect(resolvedRows).toHaveLength(1)
    expect(resolvedRows[0].id).toBe(openRow.id)
    expect(resolvedRows[0].status).toBe('resolved')
    expect(resolvedRows[0].resolved_at).toBeTruthy()
  })
})
