// [US-59] Dismiss an alert with a record of the dismissal — E2E tests
// (one per acceptance scenario in docs/epics/07-stories/US-59-dismiss-alert.md).
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
  dismissAlertViaQueue,
  QUEUE_ROW,
  readAlertRows,
  runAlertEvaluation,
  seedAndResolveAlert,
  setActiveLegExpiration
} from './alert-helpers'
import { localDate } from './dates'

describe('US-59: dismiss an alert', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('trader dismisses an alert from the queue', async () => {
    dbPath = tmpDb('wb-e2e-us59-dismiss')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    await seedCsp(page, cspAtDte('AAPL', 180, 12))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)
    await dismissAlertViaQueue(page, 'AAPL')

    expect(await page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' }).count()).toBe(0)

    const rows = readAlertRows(dbPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('dismissed')
    expect(rows[0].dismissed_at).toBeTruthy()
  })

  it('dismissed alert does not immediately reappear while the condition is unchanged', async () => {
    dbPath = tmpDb('wb-e2e-us59-unchanged')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const positionId = await seedCsp(page, cspAtDte('AAPL', 180, 12))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)
    await dismissAlertViaQueue(page, 'AAPL')

    // Leg expiration is left untouched — condition is still true — so re-running
    // evaluation must not re-open or duplicate the dismissed row.
    await runAlertEvaluation(page)
    await goToPositionsList(page)

    expect(await page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' }).count()).toBe(0)

    const rows = readAlertRows(dbPath).filter(
      (row) => row.position_id === positionId && row.rule_code === 'MANAGEMENT_WINDOW'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('dismissed')
  })

  it('dismissed alert can reappear after the condition clears and later returns', async () => {
    dbPath = tmpDb('wb-e2e-us59-reappear')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    const positionId = await seedCsp(page, cspAtDte('AAPL', 180, 12))
    await runAlertEvaluation(page)

    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)
    await dismissAlertViaQueue(page, 'AAPL')

    const [dismissedRow] = readAlertRows(dbPath).filter((row) => row.position_id === positionId)
    const originalTriggeredAt = dismissedRow.triggered_at

    // Move outside the 21-DTE management window — the condition clears, so the
    // dismissed row should retire to resolved rather than staying dismissed.
    setActiveLegExpiration(dbPath, positionId, localDate(30))
    await runAlertEvaluation(page)
    await goToPositionsList(page)

    expect(await page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' }).count()).toBe(0)
    const clearedRows = readAlertRows(dbPath).filter((row) => row.position_id === positionId)
    expect(clearedRows).toHaveLength(1)
    expect(clearedRows[0].status).toBe('resolved')

    // Move back inside the window — the condition returns, so a fresh open row
    // with a later triggered_at should appear.
    setActiveLegExpiration(dbPath, positionId, localDate(14))
    await runAlertEvaluation(page)
    await goToPositionsList(page)
    await page.waitForSelector(QUEUE_ROW)

    expect(await page.locator(QUEUE_ROW).filter({ hasText: 'AAPL' }).count()).toBe(1)

    const finalRows = readAlertRows(dbPath).filter(
      (row) => row.position_id === positionId && row.status === 'open'
    )
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0].triggered_at > originalTriggeredAt).toBe(true)
  })

  it('dismissing an already resolved alert is rejected', async () => {
    dbPath = tmpDb('wb-e2e-us59-reject')
    app = await launchApp(dbPath, { marketStatus: REGULAR_SESSION })
    const page = await getPage(app)

    await seedAndResolveAlert(page, dbPath, cspAtDte('AAPL', 180, 5))

    const [resolvedRow] = readAlertRows(dbPath)
    expect(resolvedRow.status).toBe('resolved')

    const dismissResult = await page.evaluate(
      async (alertId) => window.api.alerts.dismiss({ alertId }),
      resolvedRow.id
    )

    expect(dismissResult).toMatchObject({
      ok: false,
      errors: [{ code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }]
    })
  })
})
