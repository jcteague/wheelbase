import type { Page } from 'playwright'

export async function selectDate(page: Page, triggerSelector: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number)
  await page.click(triggerSelector)
  const targetHeading = new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  for (let i = 0; i < 24; i++) {
    const heading = await page.textContent('.rdp-month_caption')
    if (heading?.includes(targetHeading)) break
    const currentDate = heading ? new Date(`${heading} 1`) : new Date()
    const targetDate = new Date(year, month - 1, 1)
    const next = targetDate > currentDate
    await page.click(
      next ? 'button[aria-label*="next month" i]' : 'button[aria-label*="previous month" i]'
    )
  }

  await page.click(`.rdp-day:not(.rdp-outside) .rdp-day_button:has-text("${day}")`)
  await page.waitForSelector(`${triggerSelector}:has-text("${iso}")`)
}

export async function openPosition(
  page: Page,
  opts: {
    ticker: string
    strike: string
    contracts: string
    premium: string
    year: number
    month: number
    day: number
  }
): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForFunction(() => location.hash === '#/')
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')
  await page.fill('#ticker', opts.ticker)
  await page.fill('#strike', opts.strike)
  await page.fill('#contracts', opts.contracts)
  await page.fill('#premiumPerContract', opts.premium)
  await selectDate(
    page,
    '#expiration',
    `${opts.year}-${String(opts.month).padStart(2, '0')}-${String(opts.day).padStart(2, '0')}`
  )
  await page.click('button[type="submit"]')
  await page.waitForSelector('#ticker', { state: 'detached' })
}

export async function openDetailFor(page: Page, ticker: string): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForSelector(`text=${ticker}`)
  await page.click(`text=${ticker}`)
  await page.waitForSelector('[data-testid="position-detail"]')
}

/** Seed a position through to CC_OPEN state, return today's ISO date */
export async function reachCcOpenState(
  page: Page,
  ccStrike: string,
  ccPremium: string,
  ccExpiration: string
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)

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
  await page.click('[data-testid="record-assignment-btn"]')
  await page.waitForSelector('text=Assign CSP to Shares')
  await selectDate(page, '#assignment-date', today)
  await page.click('button:has-text("Confirm Assignment")')
  await page.waitForSelector('text=HOLDING 100 SHARES')
  await page.click('text=View full position history')
  await page.waitForSelector('[data-testid="position-detail"]')

  await page.click('[data-testid="open-covered-call-btn"]')
  await page.waitForSelector('text=Open Covered Call')
  await page.fill('[data-testid="cc-strike"]', ccStrike)
  await page.fill('[data-testid="cc-premium"]', ccPremium)
  await selectDate(page, '[data-testid="cc-expiration"]', ccExpiration)
  await selectDate(page, '[data-testid="cc-fill-date"]', today)
  await page.click('[data-testid="cc-submit"]')
  await page.waitForSelector('text=CC OPEN')
  await page.click('text=View full position history')
  await page.waitForSelector('[data-testid="position-detail"]')

  return today
}
