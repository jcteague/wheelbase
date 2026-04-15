import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Locator, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'
import { openDetailFor, openPosition, reachCcOpenState, selectDate } from './helpers'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

function normalize(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

async function launchFreshApp(): Promise<{
  app: ElectronApplication
  page: Page
  dbPath: string
}> {
  const dbPath = path.join(os.tmpdir(), `wheelbase-e2e-leg-chain-${Date.now()}.db`)
  const app = await electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, dbPath }
}

async function openSingleLegPosition(page: Page): Promise<void> {
  await openPosition(page, {
    ticker: 'AAPL',
    strike: '180',
    contracts: '1',
    premium: '3.50',
    year: 2027,
    month: 1,
    day: 17
  })
  await openDetailFor(page, 'AAPL')
}

async function assignPosition(page: Page, assignmentDate: string): Promise<void> {
  await page.click('[data-testid="record-assignment-btn"]')
  await page.waitForSelector('text=Assign CSP to Shares')
  await selectDate(page, '#assignment-date', assignmentDate)
  await page.click('button:has-text("Confirm Assignment")')
  await page.waitForSelector('text=HOLDING 100 SHARES')
  await page.locator('text=View full position history').first().click()
  await page.waitForSelector('[data-testid="position-detail"]')
}

async function reachCcOpenStateWithExpiredCc(page: Page): Promise<string> {
  const today = localToday()

  await openSingleLegPosition(page)
  await assignPosition(page, today)
  await page.click('[data-testid="open-covered-call-btn"]')
  await page.waitForSelector('text=Open Covered Call')
  await page.fill('[data-testid="cc-strike"]', '182')
  await page.fill('[data-testid="cc-premium"]', '2.30')
  await selectDate(page, '[data-testid="cc-expiration"]', today)
  await selectDate(page, '[data-testid="cc-fill-date"]', today)
  await page.click('[data-testid="cc-submit"]')
  await page.waitForSelector('text=CC OPEN')
  await page.locator('text=View full position history').first().click()
  await page.waitForSelector('[data-testid="position-detail"]')

  return today
}

async function getLegHistoryTable(page: Page): Promise<Locator> {
  await page.waitForSelector('text=Running Basis / Share')
  return page
    .locator('table')
    .filter({ has: page.locator('text=Running Basis / Share') })
    .first()
}

async function getLegHistoryRowByRole(page: Page, roleLabel: string): Promise<Locator> {
  const table = await getLegHistoryTable(page)
  const rows = table.locator('tbody tr')
  const count = await rows.count()

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const roleText = normalize(await row.locator('td').nth(0).textContent())

    if (roleText.includes(roleLabel)) {
      return row
    }
  }

  throw new Error(`Could not find leg history row for role: ${roleLabel}`)
}

async function getCellText(row: Locator, columnIndex: number): Promise<string> {
  return normalize(await row.locator('td').nth(columnIndex).textContent())
}

describe('US-11: wheel leg chain display', () => {
  let app: ElectronApplication | undefined
  let dbPath: string | undefined

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('leg chain displays all legs in chronological order', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    const ccExpiration = localDate(60)
    await reachCcOpenState(launched.page, '182', '2.30', ccExpiration)

    const table = await getLegHistoryTable(launched.page)
    const rowTexts = (await table.locator('tbody tr').allTextContents()).map(normalize)

    expect(rowTexts).toHaveLength(3)
    expect(rowTexts[0]).toContain('CSP Open')
    expect(rowTexts[1]).toContain('Assign')
    expect(rowTexts[2]).toContain('CC Open')
  })

  it('running cost basis column shows basis after each leg including CC_CLOSE carry-forward', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    const ccExpiration = localDate(60)
    const today = await reachCcOpenState(launched.page, '182', '2.30', ccExpiration)

    await launched.page.click('[data-testid="close-cc-early-btn"]')
    await launched.page.waitForSelector('text=Close Covered Call Early')
    await launched.page.fill('[data-testid="cc-close-price"]', '1.80')
    await selectDate(launched.page, '[data-testid="cc-close-fill-date"]', today)
    await launched.page.click('[data-testid="cc-close-submit"]')
    await launched.page.waitForSelector('text=AAPL CC Closed')
    await launched.page.locator('text=View full position history').first().click()
    await launched.page.waitForSelector('[data-testid="position-detail"]')

    const table = await getLegHistoryTable(launched.page)
    const rows = table.locator('tbody tr')
    expect(await rows.count()).toBe(4)

    const cspOpenRow = await getLegHistoryRowByRole(launched.page, 'CSP Open')
    const ccOpenRow = await getLegHistoryRowByRole(launched.page, 'CC Open')
    const ccCloseRow = await getLegHistoryRowByRole(launched.page, 'CC Close')

    expect(normalize(await table.textContent())).toContain('Running Basis / Share')
    expect(await getCellText(cspOpenRow, 7)).toBe('$176.50')
    expect(await getCellText(ccOpenRow, 7)).toBe('$174.20')
    expect(await getCellText(ccCloseRow, 5)).toBe('−$1.80')
    expect(await getCellText(ccCloseRow, 7)).toBe('$174.20')
  })

  it('completed wheel shows final P&L in the chain footer', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    const today = localToday()
    await reachCcOpenState(launched.page, '182', '2.30', today)

    await launched.page.click('[data-testid="record-call-away-btn"]')
    await launched.page.waitForSelector('text=Record Call-Away')
    await launched.page.click('[data-testid="call-away-submit"]')
    await launched.page.waitForSelector('text=Cycle Summary')
    await launched.page.locator('text=View full position history').first().click()
    await launched.page.waitForSelector('[data-testid="position-detail"]')

    const table = await getLegHistoryTable(launched.page)
    const footerText = normalize(await table.locator('tfoot').textContent())
    const footerStyle = await table.locator('tfoot span').nth(1).getAttribute('style')

    expect(footerText).toContain('Final P&L')
    expect(footerText).toContain('$780.00')
    expect(footerStyle).toContain('var(--wb-green)')
  })

  it('ASSIGN leg displays shares received not premium', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    const today = localToday()
    await openSingleLegPosition(launched.page)
    await assignPosition(launched.page, today)

    const assignRow = await getLegHistoryRowByRole(launched.page, 'Assign')

    expect(await getCellText(assignRow, 2)).toBe('$180.00')
    expect(await getCellText(assignRow, 5)).toContain('— (assigned)')
    expect(await getCellText(assignRow, 5)).toContain('100 shares received')
  })

  it('CALLED_AWAY leg shows call-away strike and inherits running basis', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    const today = localToday()
    await reachCcOpenState(launched.page, '182', '2.30', today)

    await launched.page.click('[data-testid="record-call-away-btn"]')
    await launched.page.waitForSelector('text=Record Call-Away')
    await launched.page.click('[data-testid="call-away-submit"]')
    await launched.page.waitForSelector('text=Cycle Summary')
    await launched.page.locator('text=View full position history').first().click()
    await launched.page.waitForSelector('[data-testid="position-detail"]')

    const calledAwayRow = await getLegHistoryRowByRole(launched.page, 'Called Away')

    expect(await getCellText(calledAwayRow, 2)).toBe('$182.00')
    expect(await getCellText(calledAwayRow, 5)).toContain('— (assigned)')
    expect(await getCellText(calledAwayRow, 5)).toContain('100 shares called away')
    expect(await getCellText(calledAwayRow, 7)).toBe('$174.20')
  })

  it('CC_EXPIRED leg displays expired worthless in muted style', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    await reachCcOpenStateWithExpiredCc(launched.page)

    await launched.page.click('[data-testid="record-cc-expiration-btn"]')
    await launched.page.waitForSelector('text=Expire Covered Call Worthless')
    await launched.page.click('button:has-text("Confirm Expiration")')
    await launched.page.waitForSelector('text=AAPL CC Expired Worthless')
    await launched.page.locator('text=View full position history').first().click()
    await launched.page.waitForSelector('[data-testid="position-detail"]')

    const expiredRow = await getLegHistoryRowByRole(launched.page, 'CC Expired')

    expect(await getCellText(expiredRow, 5)).toBe('expired worthless')
    expect(await getCellText(expiredRow, 7)).toBe('$174.20')
  })

  it('single-leg position shows partial chain with initial basis', async () => {
    const launched = await launchFreshApp()
    app = launched.app
    dbPath = launched.dbPath

    await openSingleLegPosition(launched.page)

    const table = await getLegHistoryTable(launched.page)
    const rows = table.locator('tbody tr')
    const cspOpenRow = await getLegHistoryRowByRole(launched.page, 'CSP Open')

    expect(await rows.count()).toBe(1)
    expect(await getCellText(cspOpenRow, 7)).toBe('$176.50')
  })
})
