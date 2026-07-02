import { execFileSync } from 'node:child_process'
import type { Page } from 'playwright'
import type { CspFixture } from './assignment-helpers'
import { localDate } from './dates'

export const QUEUE_ROW = '[data-testid="management-queue-row"]'

export interface QueueItem {
  alertId: string
  positionId: string
  ticker: string
  phase: string
  urgency: 'high' | 'medium' | 'low'
  summary: string
  quickAction: string
  triggeredAt: string
}

export interface AlertRow {
  id: string
  position_id: string
  rule_code: string
  urgency: string
  summary: string
  quick_action: string
  status: string
  triggered_at: string
  last_evaluated_at: string
  resolved_at: string | null
}

export function cspAtDte(ticker: string, strike: number, dte: number): CspFixture {
  const expiration = localDate(dte)
  const [year, month, day] = expiration.split('-')
  const occStrike = String(strike * 1000).padStart(8, '0')
  return {
    ticker,
    strike,
    expiration,
    contracts: 1,
    premiumPerContract: 2.5,
    occSymbol: `${ticker}${year.slice(2)}${month}${day}P${occStrike}`
  }
}

export async function runAlertEvaluation(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.api.testSchedulerRunNow('alert-evaluation')
  })
}

export async function listManagementQueueItems(page: Page): Promise<QueueItem[]> {
  return page.evaluate(async () => {
    const result = await window.api.alerts.list()
    if (!result.ok) throw new Error(`alerts.list failed: ${JSON.stringify(result.errors)}`)
    return result.items
  })
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''")
}

export function setActiveLegExpiration(
  dbPath: string,
  positionId: string,
  expiration: string
): void {
  execFileSync('sqlite3', [
    dbPath,
    `UPDATE legs
       SET expiration = '${escapeSqlString(expiration)}'
     WHERE position_id = '${escapeSqlString(positionId)}';`
  ])
}

export function readAlertRows(dbPath: string): AlertRow[] {
  const output = execFileSync(
    'sqlite3',
    ['-json', dbPath, 'SELECT * FROM alerts ORDER BY rowid;'],
    {
      encoding: 'utf8'
    }
  )
  return JSON.parse(output) as AlertRow[]
}
