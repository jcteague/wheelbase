import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// A date far enough in the future to pass lifecycle validation
const EXPIRATION = '2027-01-16'

describe('create → list flow', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('shows empty state then a position card after opening a wheel', async () => {
    dbPath = path.join(os.tmpdir(), `wheelbase-e2e-${Date.now()}.db`)

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox'],
      cwd: APP_CWD,
      env: { ...process.env, WHEELBASE_DB_PATH: dbPath }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Navigate to positions list — verify empty state
    await page.evaluate(() => {
      location.hash = '#/positions'
    })
    await page.waitForSelector('text=No positions yet')
    expect(await page.isVisible('text=No positions yet')).toBe(true)

    // Navigate to new wheel form
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('label:has-text("Ticker")')

    // Fill in required fields
    await page.fill('#ticker', 'AAPL')
    await page.fill('#strike', '150')
    await page.fill('#expiration', EXPIRATION)
    await page.fill('#contracts', '1')
    await page.fill('#premiumPerContract', '3.50')

    // Submit
    await page.click('button[type="submit"]')

    // Wait for success message
    await page.waitForSelector('[aria-label="Success"]')
    const successText = await page.textContent('[aria-label="Success"]')
    expect(successText).toContain('AAPL')

    // Navigate to positions list
    await page.evaluate(() => {
      location.hash = '#/positions'
    })
    await page.waitForSelector('text=AAPL')

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('AAPL')
    expect(bodyText).toContain('CSP Open')
  })
})
