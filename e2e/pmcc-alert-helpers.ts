// [US-106][US-107] Shared harness for the PMCC alert specs: launch Electron on a temp DB with the
// fake market session closed (so no interval run races the explicit evaluations) and the main
// process's pino lines captured, dispose it after each test, and read back what the alert job
// logged and put on the dashboard queue.
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
import { cspAtDte, QUEUE_ROW } from './alert-helpers'
import { localDate, localToday } from './dates'

export interface Harness {
  app: ElectronApplication
  page: Page
  dbPath: string
  /** Main-process stdout collected since launch (pino JSON lines). */
  logs: () => string[]
}

let harness: Harness | undefined

export async function launch(label: string): Promise<Harness> {
  const dbPath = tmpDb(`wb-e2e-pmcc-alert-${label}`)
  const env = buildLaunchEnv(dbPath, { marketStatus: CLOSED_SESSION })
  // Vitest's own flag would silence pino in the child process; the skip checks read its DEBUG lines.
  delete env.VITEST
  const app = await launchElectron(env)
  const lines: string[] = []
  app.process().stdout?.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split('\n')))
  const page = await getPage(app)
  harness = { app, page, dbPath, logs: () => lines }
  return harness
}

/** Closes the app `launch` opened and deletes its temp DB — register with `afterEach`. */
export async function disposeHarness(): Promise<void> {
  if (!harness) return
  await harness.app.close()
  cleanupDb(harness.dbPath)
  harness = undefined
}

/** Every `alert_rule_skipped` DEBUG line logged so far. */
export function ruleSkips(h: Harness): Array<Record<string, unknown>> {
  return h
    .logs()
    .filter((line) => line.includes('"msg":"alert_rule_skipped"'))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

/** The dashboard queue row carrying `summary` — a position can have other alerts beside it. */
export async function queueRowWith(page: Page, summary: string): Promise<Locator> {
  await goToPositionsList(page)
  return page.locator(QUEUE_ROW).filter({ hasText: summary })
}

/** MSFT as a classic wheel in CC_OPEN: CSP, assignment, then a $420 covered call `ccDte` out. */
export async function seedMsftCoveredCall(page: Page, ccDte: number): Promise<string> {
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
    { id: positionId, today: localToday(), expiration: localDate(ccDte) }
  )
  return positionId
}
