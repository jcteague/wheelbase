// Shared helpers for US-35 (assignment detection) and US-46 (polling scheduler) e2e specs.
//
// Both specs need the FakeBrokerProvider seeding pattern, a way to drive the
// detect-assignments job via runNow, and a way to inspect the scheduler registry
// for jobs registered at bootstrap. The dev-only `_test:scheduler-*` IPC channels
// are guarded by NODE_ENV === 'test' on the main side.
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate } from './dates'

export const APP_PATH = path.join(__dirname, '../out/main/index.js')
export const APP_CWD = path.join(__dirname, '..')

export type ActivityFixture = {
  activityId: string
  activityType: 'OPASN' | string
  symbol: string
  qty: number
  price: string
  transactionTime: string
}

export type MarketStatusFixture = {
  isOpen: boolean
  session: 'regular' | 'pre' | 'post' | 'closed'
  nextOpen: string
  nextClose: string
}

export type TestJobFixture = {
  name: string
  cadence:
    | {
        kind: 'interval'
        marketOpenMs: number
        extendedHoursMs?: number
        marketClosedMs?: number | null
      }
    | { kind: 'afterClose'; offsetMinutes: number }
  // when true, the registered handler throws on every invocation
  throws?: boolean
}

export type LaunchOpts = {
  activities?: ActivityFixture[]
  marketStatus?: MarketStatusFixture
  brokerError?: string
  testJobs?: TestJobFixture[]
}

export const REGULAR_SESSION: MarketStatusFixture = {
  isOpen: true,
  session: 'regular',
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z'
}

export const CLOSED_SESSION: MarketStatusFixture = {
  isOpen: false,
  session: 'closed',
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z'
}

export const POST_SESSION: MarketStatusFixture = {
  isOpen: false,
  session: 'post',
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z'
}

export type CspFixture = {
  ticker: string
  strike: number
  expiration: string
  contracts: number
  premiumPerContract: number
  occSymbol: string
}

// Dynamic future expiration so create-position validation passes.
// 30 days from today, formatted to the expiration's OCC encoding (YYMMDD).
const FUTURE_EXPIRATION = localDate(30)
const [Y, M, D] = FUTURE_EXPIRATION.split('-')
const OCC_DATE = `${Y.slice(2)}${M}${D}`

/** AAPL $180 PUT — used across the US-35 specs. */
export const AAPL_PUT_180: CspFixture = {
  ticker: 'AAPL',
  strike: 180,
  expiration: FUTURE_EXPIRATION,
  contracts: 1,
  premiumPerContract: 3.5,
  occSymbol: `AAPL${OCC_DATE}P00180000`
}

/** MSFT $400 PUT — used for multi-assignment scenarios. */
export const MSFT_PUT_400: CspFixture = {
  ticker: 'MSFT',
  strike: 400,
  expiration: FUTURE_EXPIRATION,
  contracts: 2,
  premiumPerContract: 5.0,
  occSymbol: `MSFT${OCC_DATE}P00400000`
}

export function tmpDb(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

export function cleanupDb(dbPath: string): void {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
}

export function buildLaunchEnv(dbPath: string, opts: LaunchOpts): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    WHEELBASE_DB_PATH: dbPath,
    FAKE_MARKET_DATA: 'true',
    FAKE_BROKER: 'true',
    NODE_ENV: 'test'
  }
  if (opts.activities) env.FAKE_BROKER_ACTIVITIES = JSON.stringify(opts.activities)
  if (opts.marketStatus) env.FAKE_MARKET_STATUS = JSON.stringify(opts.marketStatus)
  if (opts.brokerError) env.FAKE_BROKER_ERROR = opts.brokerError
  if (opts.testJobs) env.WHEELBASE_TEST_JOBS = JSON.stringify(opts.testJobs)
  return env
}

export async function launchApp(
  dbPath: string,
  opts: LaunchOpts = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: buildLaunchEnv(dbPath, opts)
  })
}

export async function getPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

/** Seed an open CSP via the createPosition IPC. */
export async function seedCsp(page: Page, fixture: CspFixture): Promise<string> {
  const { ticker, strike, expiration, contracts, premiumPerContract } = fixture
  const positionId = await page.evaluate(
    async (payload) => {
      const result = await window.api.createPosition(payload)
      if (!result.ok) throw new Error(`createPosition failed: ${JSON.stringify(result)}`)
      return result.position.id
    },
    { ticker, strike, expiration, contracts, premiumPerContract }
  )
  return positionId
}

/** Build an OPASN broker activity matched to a CSP fixture's OCC symbol. */
export function makeOpasn(
  fixture: CspFixture,
  opts: { activityId?: string; transactionTime: string; qty?: number } = {
    transactionTime: ''
  }
): ActivityFixture {
  return {
    activityId: opts.activityId ?? `act-${fixture.ticker.toLowerCase()}-1`,
    activityType: 'OPASN',
    symbol: fixture.occSymbol,
    qty: opts.qty ?? fixture.contracts * 100,
    price: fixture.strike.toFixed(2),
    transactionTime: opts.transactionTime
  }
}

/** Navigate to the positions list, forcing a remount so usePositions re-fetches. */
export async function goToPositionsList(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForFunction(() => location.hash === '#/')
}

export async function runDetectionNow(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    return await window.api.assignments.runDetectionNow()
  })
  if (!result.ok) throw new Error(`runDetectionNow failed: ${JSON.stringify(result)}`)
}

export async function getPendingAssignments(page: Page): Promise<PendingAssignmentNotification[]> {
  return await page.evaluate(async () => {
    const result = await window.api.assignments.listPending()
    if (!result.ok) throw new Error(`listPending failed: ${JSON.stringify(result)}`)
    return result.assignments
  })
}

/** Dev-only: inspect the scheduler registry. Requires the `_test:scheduler-registry`
 * IPC handler (registered only when NODE_ENV === 'test'). */
export type SchedulerRegistryEntry = {
  name: string
  cadence: TestJobFixture['cadence']
  invocations: number
}

type TestSchedulerApi = {
  testSchedulerRegistry: () => Promise<SchedulerRegistryEntry[]>
  testSchedulerRunNow: (name: string) => Promise<void>
  testSchedulerRegister: (job: TestJobFixture) => Promise<{ ok: boolean; errorCode?: string }>
  testSchedulerSimulateWake: (payload: { jumpMs: number }) => Promise<void>
}

export async function getSchedulerRegistry(page: Page): Promise<SchedulerRegistryEntry[]> {
  return await page.evaluate(async () => {
    const api = window.api as unknown as TestSchedulerApi
    return await api.testSchedulerRegistry()
  })
}

export async function runNowTestJob(page: Page, jobName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const api = window.api as unknown as TestSchedulerApi
    await api.testSchedulerRunNow(name)
  }, jobName)
}

/** Try to register a test job at runtime — used to assert duplicate-registration rejection. */
export async function tryRegisterTestJob(
  page: Page,
  job: TestJobFixture
): Promise<{ ok: boolean; errorCode?: string }> {
  return await page.evaluate(async (j) => {
    const api = window.api as unknown as TestSchedulerApi
    return await api.testSchedulerRegister(j)
  }, job)
}

export async function simulateSchedulerWake(page: Page, jumpMs: number): Promise<void> {
  await page.evaluate(async (ms) => {
    const api = window.api as unknown as TestSchedulerApi
    await api.testSchedulerSimulateWake({ jumpMs: ms })
  }, jumpMs)
}

/** Seed a CSP + drive detection so that exactly one pending row exists for AAPL. */
export async function seedAssignmentFixture(page: Page): Promise<{ positionId: string }> {
  const positionId = await seedCsp(page, AAPL_PUT_180)
  await runDetectionNow(page)
  return { positionId }
}
