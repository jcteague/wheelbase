// [US-35] Assignment detection & auto-transition — E2E tests.
//
// Each scenario seeds a fake OPASN activity via FAKE_BROKER_ACTIVITIES, opens
// a CSP through the real createPosition IPC, drives the detection job via
// `assignments:run-detection-now`, then exercises the renderer banner
// (confirm/dismiss) via the existing AssignmentNotificationBanner mounted on
// the positions list.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication } from 'playwright'
import {
  AAPL_PUT_180,
  MSFT_PUT_400,
  REGULAR_SESSION,
  cleanupDb,
  getPage,
  getPendingAssignments,
  goToPositionsList,
  launchApp,
  makeOpasn,
  runDetectionNow,
  seedAssignmentFixture,
  seedCsp,
  tmpDb
} from './assignment-helpers'
import { localToday } from './dates'

// Transaction time must be >= the CSP fill date (today) for confirmPending → assignCspPosition.
const TRANSACTION_TIME = `${localToday()}T08:00:00Z`

const aaplOpasn = (activityId = 'act-aapl-1'): ReturnType<typeof makeOpasn> =>
  makeOpasn(AAPL_PUT_180, { activityId, transactionTime: TRANSACTION_TIME })

const msftOpasn = (activityId = 'act-msft-1'): ReturnType<typeof makeOpasn> =>
  makeOpasn(MSFT_PUT_400, { activityId, transactionTime: TRANSACTION_TIME })

describe('US-35: detect-assignments service', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('detects assignment from OPASN activity and creates pending record', async () => {
    dbPath = tmpDb('wb-e2e-us35-detect')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedCsp(page, AAPL_PUT_180)
    await runDetectionNow(page)

    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(1)
    expect(pending[0].ticker).toBe('AAPL')
    expect(pending[0].strike).toBe('180.00')
    expect(pending[0].contractType).toBe('put')
  })

  it('ignores assignment activity for unknown positions', async () => {
    dbPath = tmpDb('wb-e2e-us35-unknown')
    app = await launchApp(dbPath, {
      activities: [msftOpasn()], // MSFT — no open position seeded
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedCsp(page, AAPL_PUT_180) // unrelated open CSP
    await runDetectionNow(page)

    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(0)
  })

  it('does not process the same activity twice', async () => {
    dbPath = tmpDb('wb-e2e-us35-dup')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn('act-dup-1')],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedCsp(page, AAPL_PUT_180)
    await runDetectionNow(page)
    await runDetectionNow(page)

    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(1)
  })

  it('handles multiple assignments in a single poll', async () => {
    dbPath = tmpDb('wb-e2e-us35-multi')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn(), msftOpasn()],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedCsp(page, AAPL_PUT_180)
    await seedCsp(page, MSFT_PUT_400)
    await runDetectionNow(page)

    const pending = await getPendingAssignments(page)
    const tickers = pending.map((p) => p.ticker).sort()
    expect(tickers).toEqual(['AAPL', 'MSFT'])
  })

  it('API error during polling does not crash the app', async () => {
    dbPath = tmpDb('wb-e2e-us35-broker-err')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION,
      brokerError: 'network_error'
    })
    const page = await getPage(app)

    await seedCsp(page, AAPL_PUT_180)

    // runDetectionNow should still return ok — detect-assignments catches BrokerError.
    const result = await page.evaluate(async () => window.api.assignments.runDetectionNow())
    expect(result.ok).toBe(true)

    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(0)

    // App is still responsive after the broker error.
    const positions = await page.evaluate(async () => window.api.listPositions())
    expect(Array.isArray(positions)).toBe(true)
  })
})

describe('US-35: assignment notification banner', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('assignment notification banner appears on the position list', async () => {
    dbPath = tmpDb('wb-e2e-us35-banner')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedAssignmentFixture(page)
    await goToPositionsList(page)

    await page.waitForSelector('text=AAPL')
    await page.waitForSelector('text=Confirm')
    await page.waitForSelector('text=Dismiss')
    const bannerText = await page.textContent('body')
    expect(bannerText).toContain('180')
    expect(bannerText).toContain('put')
  })

  it('confirming the assignment transitions the position', async () => {
    dbPath = tmpDb('wb-e2e-us35-confirm')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    const { positionId } = await seedAssignmentFixture(page)
    await goToPositionsList(page)
    await page.waitForSelector('button:has-text("Confirm")')
    await page.click('button:has-text("Confirm")')

    await page.waitForSelector('text=Open covered call →')

    const phase = await page.evaluate(async (id) => {
      const result = await window.api.getPosition(id)
      return result.ok ? result.position.phase : null
    }, positionId)
    expect(phase).toBe('HOLDING_SHARES')
  })

  it('dismissing the assignment removes the notification', async () => {
    dbPath = tmpDb('wb-e2e-us35-dismiss')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    const page = await getPage(app)

    await seedAssignmentFixture(page)
    await goToPositionsList(page)
    await page.waitForSelector('button:has-text("Dismiss")')
    await page.click('button:has-text("Dismiss")')

    await page.waitForSelector('button:has-text("Dismiss")', { state: 'detached' })

    // Re-running detection must NOT resurface the dismissed assignment.
    await runDetectionNow(page)
    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(0)
  })

  it('assignment notification persists across app restarts', async () => {
    dbPath = tmpDb('wb-e2e-us35-restart')
    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    let page = await getPage(app)

    await seedAssignmentFixture(page)
    await app.close()

    app = await launchApp(dbPath, {
      activities: [aaplOpasn()],
      marketStatus: REGULAR_SESSION
    })
    page = await getPage(app)
    await goToPositionsList(page)

    await page.waitForSelector('button:has-text("Confirm")')
    const pending = await getPendingAssignments(page)
    expect(pending.length).toBe(1)
    expect(pending[0].ticker).toBe('AAPL')
  })
})
