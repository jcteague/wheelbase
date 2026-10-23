// [US-106] PMCC short-call assignment-risk alert — E2E tests, one per acceptance scenario
// (OPT-14), with every Scenario Outline example as its own named test.
//
// Every test drives the real alert-evaluation job against the fake market-data provider. The
// session is closed so no interval run races the explicit ones, and the stock quote is
// changed in the main process between runs. XYZ is opened through `createPmccPosition` with
// run-day-relative dates that keep the story's 18 DTE on the short call and a distant LEAPS.
// The expected summaries are the story's literals, not the production summary helper's output.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Locator, Page } from 'playwright'
import {
  CLOSED_SESSION,
  buildLaunchEnv,
  cleanupDb,
  getPage,
  goToPositionsList,
  launchElectron,
  seedCsp,
  tmpDb
} from './assignment-helpers'
import {
  cspAtDte,
  listManagementQueueItems,
  QUEUE_ROW,
  readAlertRows,
  runAlertEvaluation,
  type AlertRow
} from './alert-helpers'
import { localDate, localToday } from './dates'
import { sqlite } from './pmcc-helpers'
import { recordEvent } from './pmcc-ledger-helpers'
import { rollShortCall } from './pmcc-roll-helpers'

const RULE = 'PMCC_ASSIGNMENT_RISK'
const SHORT_DTE = 18
const LEAPS_DTE = 354
const SHORT_EXPIRATION = localDate(SHORT_DTE)
const LEAPS_EXPIRATION = localDate(LEAPS_DTE)

const ABOVE_112_53 =
  'Stock is 2.3% above the $110.00 short-call strike — in the money, LEAPS would have to cover'

// ── Launch, quotes and logs ──────────────────────────────────────────────────

interface Harness {
  app: ElectronApplication
  page: Page
  dbPath: string
  /** Main-process stdout collected since launch (pino JSON lines). */
  logs: () => string[]
}

let harness: Harness | undefined

async function launch(label: string): Promise<Harness> {
  const dbPath = tmpDb(`wb-e2e-us106-${label}`)
  const env = buildLaunchEnv(dbPath, { marketStatus: CLOSED_SESSION })
  // Vitest's own flag would silence pino in the child process; the S7 check reads its DEBUG lines.
  delete env.VITEST
  const app = await launchElectron(env)
  const lines: string[] = []
  app.process().stdout?.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split('\n')))
  const page = await getPage(app)
  harness = { app, page, dbPath, logs: () => lines }
  return harness
}

afterEach(async () => {
  await harness?.app.close()
  if (harness) cleanupDb(harness.dbPath)
  harness = undefined
})

function quote(price: string): Record<string, string | number> {
  return {
    price,
    bid: price,
    ask: price,
    change: '0',
    changePercent: '0',
    prevClose: price,
    volume: 0,
    timestamp: new Date().toISOString()
  }
}

/** Replaces the fake provider's stock quotes; it reads them on every request. */
async function setQuotes(app: ElectronApplication, prices: Record<string, string>): Promise<void> {
  const quotes = Object.fromEntries(
    Object.entries(prices).map(([ticker, price]) => [ticker, quote(price)])
  )
  await app.evaluate((_electron, json) => {
    process.env.WHEELBASE_MOCK_STOCK_QUOTES = json
  }, JSON.stringify(quotes))
}

async function evaluateAt({ app, page }: Harness, prices: Record<string, string>): Promise<void> {
  await setQuotes(app, prices)
  await runAlertEvaluation(page)
}

// ── Seeding ──────────────────────────────────────────────────────────────────

/** Opens the Background's XYZ PMCC: $80 LEAPS bought at $25, $110 short call sold at $2.00. */
async function createXyzPmcc(page: Page): Promise<string> {
  const leg = { underlying: 'XYZ', instrumentType: 'CALL' as const, deliverableShares: 100 }
  const today = localToday()
  const result = await page.evaluate((payload) => window.api.createPmccPosition(payload), {
    strategy: 'PMCC' as const,
    ticker: 'XYZ',
    long: {
      ...leg,
      strike: 80,
      expiration: LEAPS_EXPIRATION,
      contracts: 1,
      fillPrice: 25,
      fillDate: today,
      fees: 0
    },
    short: {
      ...leg,
      strike: 110,
      expiration: SHORT_EXPIRATION,
      contracts: 1,
      fillPrice: 2,
      fillDate: today,
      fees: 0
    }
  })
  if (!result.ok) throw new Error(`createPmccPosition failed: ${JSON.stringify(result)}`)
  return result.position.id
}

/** MSFT as a classic wheel in CC_OPEN at the $420 strike: CSP, assignment, covered call. */
async function seedMsftCoveredCall(page: Page): Promise<void> {
  const positionId = await seedCsp(page, cspAtDte('MSFT', 420, 30))
  await page.evaluate(
    async ({ id, today, expiration }) => {
      const assigned = await window.api.assignPosition({ positionId: id, assignmentDate: today })
      if (!assigned.ok) throw new Error(`assign failed: ${JSON.stringify(assigned)}`)
      const opened = await window.api.openCoveredCall({
        positionId: id,
        strike: 420,
        expiration,
        contracts: 1,
        premiumPerContract: 5,
        fillDate: today
      })
      if (!opened.ok) throw new Error(`openCoveredCall failed: ${JSON.stringify(opened)}`)
    },
    { id: positionId, today: localToday(), expiration: localDate(30) }
  )
}

// ── Reading alerts ───────────────────────────────────────────────────────────

function rulesFor(dbPath: string, positionId: string): AlertRow[] {
  return readAlertRows(dbPath).filter((r) => r.position_id === positionId && r.rule_code === RULE)
}

function openAssignmentAlert(dbPath: string, positionId: string): AlertRow {
  const open = rulesFor(dbPath, positionId).filter((r) => r.status === 'open')
  if (open.length !== 1) throw new Error(`expected one open ${RULE} alert, got ${open.length}`)
  return open[0]
}

/** No alert on the PMCC was built from the LEAPS: neither its $80 strike nor its expiration. */
function expectNoLeapsReference(dbPath: string, positionId: string): void {
  const summaries = readAlertRows(dbPath)
    .filter((r) => r.position_id === positionId)
    .map((r) => r.summary)
  expect(summaries.filter((s) => s.includes('$80.00') || s.includes(LEAPS_EXPIRATION))).toEqual([])
}

/** The dashboard queue row carrying `summary` — XYZ can have other alerts beside it. */
async function queueRowWith(page: Page, summary: string): Promise<Locator> {
  await goToPositionsList(page)
  return page.locator(QUEUE_ROW).filter({ hasText: summary })
}

async function openXyzWithAlert(h: Harness): Promise<[string, AlertRow]> {
  const positionId = await createXyzPmcc(h.page)
  await evaluateAt(h, { XYZ: '112.53' })
  return [positionId, openAssignmentAlert(h.dbPath, positionId)]
}

// ── Scenarios ────────────────────────────────────────────────────────────────

describe('US-106: PMCC short-call assignment-risk alert', () => {
  it.each([
    {
      price: '107.80',
      summary: 'Stock is 2.0% below the $110.00 short-call strike — approaching assignment'
    },
    {
      price: '108.35',
      summary: 'Stock is 1.5% below the $110.00 short-call strike — approaching assignment'
    },
    {
      price: '110.00',
      summary:
        'Stock is 0.0% above the $110.00 short-call strike — in the money, LEAPS would have to cover'
    },
    { price: '112.53', summary: ABOVE_112_53 },
    {
      price: '118.80',
      summary:
        'Stock is 8.0% above the $110.00 short-call strike — in the money, LEAPS would have to cover'
    }
  ])(
    'Alert fires as the stock approaches or passes the short-call strike — $price',
    async ({ price, summary }) => {
      const h = await launch(`fires-${price}`)
      const positionId = await createXyzPmcc(h.page)

      await evaluateAt(h, { XYZ: price })

      expect(openAssignmentAlert(h.dbPath, positionId)).toMatchObject({
        urgency: 'medium',
        summary,
        quick_action: 'Review position'
      })
    }
  )

  it.each([{ price: '107.70' }, { price: '105.00' }])(
    'Alert does not fire while the stock is more than 2% below the strike — $price',
    async ({ price }) => {
      const h = await launch(`quiet-${price}`)
      const positionId = await createXyzPmcc(h.page)

      await evaluateAt(h, { XYZ: price })

      expect(rulesFor(h.dbPath, positionId)).toEqual([])
    }
  )

  it('The queue row identifies the position as a PMCC', async () => {
    const h = await launch('queue-row')
    const [positionId] = await openXyzWithAlert(h)

    const row = await queueRowWith(h.page, ABOVE_112_53)
    await row.waitFor()
    expect(await row.getAttribute('data-ticker')).toBe('XYZ')
    expect(await row.getByText('MED', { exact: true }).count()).toBe(1)
    expect(await row.getByText('PMCC · short call').count()).toBe(1)
    expect(await row.textContent()).not.toContain('LEAPS + short call open')

    await row.getByRole('button', { name: 'Review position' }).click()
    await h.page.waitForFunction((id) => location.hash === `#/positions/${id}`, positionId)
    await h.page.waitForSelector('[data-testid="position-detail"]')
  })

  it('Alert resolves when the stock retreats below the band', async () => {
    const h = await launch('retreat')
    const [positionId, fired] = await openXyzWithAlert(h)

    await evaluateAt(h, { XYZ: '106.00' })

    expect(rulesFor(h.dbPath, positionId)).toEqual([
      expect.objectContaining({ id: fired.id, status: 'resolved', resolved_at: expect.any(String) })
    ])
    const items = await listManagementQueueItems(h.page)
    expect(items.some((item) => item.alertId === fired.id)).toBe(false)
    expect(await (await queueRowWith(h.page, ABOVE_112_53)).count()).toBe(0)
  })

  it('Alert resolves when the short call is rolled further from the money', async () => {
    const h = await launch('rolled')
    const [positionId, fired] = await openXyzWithAlert(h)

    const rolled = await rollShortCall(h.page, {
      positionId,
      costToClosePerContract: 4.0,
      newPremiumPerContract: 3.5,
      newStrike: 115,
      newExpiration: localDate(SHORT_DTE + 35),
      fillDate: localToday()
    })
    expect(rolled.ok).toBe(true)
    await evaluateAt(h, { XYZ: '112.53' })

    expect(rulesFor(h.dbPath, positionId)).toEqual([
      expect.objectContaining({ id: fired.id, status: 'resolved' })
    ])
    const items = await listManagementQueueItems(h.page)
    expect(items.some((item) => item.alertId === fired.id)).toBe(false)
  })

  it('A PMCC with no open short call is not evaluated', async () => {
    const h = await launch('no-short')
    const [positionId, fired] = await openXyzWithAlert(h)

    const expired = await recordEvent(h.page, positionId, {
      triggerEvent: 'PMCC_SHORT_EXPIRED',
      eventDate: localToday(),
      legs: [
        {
          legRole: 'SHORT_CALL_EXPIRED',
          action: 'EXPIRE',
          strike: '110.0000',
          expiration: SHORT_EXPIRATION,
          premiumPerContract: '0.0000',
          fillDate: localToday(),
          contracts: 1
        }
      ]
    })
    expect(expired.ok).toBe(true)
    await evaluateAt(h, { XYZ: '118.80' })

    expect(rulesFor(h.dbPath, positionId)).toEqual([
      expect.objectContaining({ id: fired.id, status: 'resolved' })
    ])
    const xyzAlerts = readAlertRows(h.dbPath).filter((r) => r.position_id === positionId)
    expect(xyzAlerts.every((r) => r.status === 'resolved')).toBe(true)
    expectNoLeapsReference(h.dbPath, positionId)
  })

  it('A missing quote keeps the alert open instead of resolving it', async () => {
    const h = await launch('missing-quote')
    const [positionId, fired] = await openXyzWithAlert(h)

    await evaluateAt(h, {})

    expect(openAssignmentAlert(h.dbPath, positionId)).toMatchObject({
      id: fired.id,
      summary: ABOVE_112_53
    })
    const skips = h
      .logs()
      .filter((line) => line.includes('"msg":"alert_rule_skipped"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(skips).toContainEqual(
      expect.objectContaining({
        positionId,
        ruleCode: RULE,
        reason: 'missing_underlying_price'
      })
    )
    await (await queueRowWith(h.page, ABOVE_112_53)).waitFor()
  })

  it.each([
    {
      ticker: 'MSFT',
      seed: seedMsftCoveredCall,
      price: '415.00',
      // No COVERED_CALL_BREACH: the stock is below the strike.
      wheelRule: 'COVERED_CALL_BREACH',
      wheelOutcome: []
    },
    {
      ticker: 'AAPL',
      seed: async (page: Page): Promise<void> => {
        await seedCsp(page, cspAtDte('AAPL', 180, 30))
      },
      price: '178.50',
      wheelRule: 'STRIKE_PROXIMITY',
      wheelOutcome: [
        expect.objectContaining({
          status: 'open',
          summary: 'Stock is 0.8% below the $180.00 put strike — now in the money'
        })
      ]
    }
  ])(
    'Classic wheel positions do not use the PMCC rule — $ticker',
    async ({ ticker, seed, price, wheelRule, wheelOutcome }) => {
      const h = await launch(`wheel-${ticker}`)
      await seed(h.page)

      await evaluateAt(h, { [ticker]: price })

      const rows = readAlertRows(h.dbPath)
      expect(rows.filter((r) => r.rule_code === RULE)).toEqual([])
      expect(rows.filter((r) => r.rule_code === wheelRule)).toEqual(wheelOutcome)
    }
  )

  it('The existing short-leg rules evaluate the PMCC short call, never the LEAPS', async () => {
    const h = await launch('short-leg-rules')
    const positionId = await createXyzPmcc(h.page)
    // Four days to the short's expiration; only the short call's row moves, the LEAPS stays put.
    sqlite(
      h.dbPath,
      `UPDATE legs SET expiration = '${localDate(4)}'
        WHERE position_id = '${positionId}' AND leg_role = 'SHORT_CALL_OPEN'`
    )

    await evaluateAt(h, { XYZ: '112.53' })

    const imminent = readAlertRows(h.dbPath).filter(
      (r) => r.position_id === positionId && r.rule_code === 'EXPIRATION_IMMINENT'
    )
    expect(imminent).toEqual([
      expect.objectContaining({
        status: 'open',
        urgency: 'high',
        summary: 'Expires in 4 days at $110.00 strike'
      })
    ])
    const assignment = openAssignmentAlert(h.dbPath, positionId)
    expectNoLeapsReference(h.dbPath, positionId)

    const queue = (await listManagementQueueItems(h.page)).filter(
      (i) => i.positionId === positionId
    )
    expect(queue.map((i) => i.alertId)).toEqual([imminent[0].id, assignment.id])
  })
})
