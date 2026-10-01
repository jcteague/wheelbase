// [US-101] Open a PMCC position with two linked opening legs — one `it` per AC `Then`
// (Linear OPT-7), one `it.each` row per Scenario Outline example. The AC's fixed dates
// (2026-09-14 / 2027-09-17 / 2026-10-16) are generated relative to the run day so the
// 368 / 32 DTE labels hold; the money figures are date-independent.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Locator, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'
import { selectDate } from './helpers'
import {
  LEAPS_DTE,
  LEAPS_SYMBOL,
  SHORT_DTE,
  SHORT_SYMBOL,
  enterLegManually,
  fieldOf,
  fillPmccLegs,
  invokedIpcChannels,
  launchPmcc,
  legSection,
  listPositions,
  noMatchingLeapsFixtures,
  openNewPositionSheet,
  pickDate,
  pmccFixture,
  positionRows,
  recordButton,
  recordPmcc,
  selectContract,
  selectPmcc,
  selectStandard,
  sheet,
  spyOnIpcChannels,
  sqlite,
  switchLegToManual,
  tableCount,
  typeAndBlur,
  xyzChainFixtures,
  type PmccLegFixture
} from './pmcc-helpers'

const TODAY = localToday()
const FIXTURE = pmccFixture(TODAY)

let app: ElectronApplication | undefined
let dbPath: string

afterEach(async () => {
  await app?.close()
  app = undefined
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

async function launch(opts: Parameters<typeof launchPmcc>[1] = {}): Promise<Page> {
  dbPath = path.join(os.tmpdir(), `wheelbase-e2e-pmcc-${Date.now()}.db`)
  const launched = await launchPmcc(dbPath, opts)
  app = launched.app
  return launched.page
}

/** Launches straight onto `#/new` with the sheet switched to PMCC. */
async function launchInPmcc(opts: Parameters<typeof launchPmcc>[1] = {}): Promise<Page> {
  const page = await launch(opts)
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await sheet(page).waitFor()
  await selectPmcc(page)
  return page
}

/** Launches into PMCC mode with the whole valid fixture entered from the chain. */
async function launchFilledPmcc(): Promise<Page> {
  const page = await launchInPmcc()
  await fillPmccLegs(page, FIXTURE, { today: TODAY })
  return page
}

async function seedWheels(page: Page, count: number): Promise<void> {
  const expiration = localDate(30)
  await page.evaluate(
    async ({ count, expiration }) => {
      for (let i = 0; i < count; i++) {
        await window.api.createPosition({
          ticker: 'AAPL',
          strike: 150 + i,
          expiration,
          contracts: 1,
          premiumPerContract: 2.5
        })
      }
    },
    { count, expiration }
  )
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await positionRows(page)
    .nth(count - 1)
    .waitFor()
}

/** A control's current value: an input's value, or a DatePicker trigger's shown date. */
async function valueOf(page: Page, selector: string): Promise<string> {
  const control = page.locator(selector)
  const tag = await control.evaluate((el) => el.tagName)
  return tag === 'BUTTON' ? ((await control.textContent()) ?? '').trim() : control.inputValue()
}

async function expectEnabled(locator: Locator, enabled: boolean): Promise<void> {
  await expect.poll(() => locator.isEnabled(), { timeout: 5_000 }).toBe(enabled)
}

/** Nothing reached SQLite: no position through the API, and no orphaned row either. */
async function expectNothingRecorded(page: Page): Promise<void> {
  expect(await listPositions(page)).toEqual([])
  expect(tableCount(dbPath, 'positions')).toBe(0)
  expect(tableCount(dbPath, 'legs')).toBe(0)
}

const STANDARD_FIELD_IDS = ['ticker', 'strike', 'contracts', 'premiumPerContract', 'expiration']

const openWheelButton = (page: Page): Locator => page.locator('button[aria-label="Open wheel"]')

const netDebit = (page: Page): Locator => page.getByTestId('pmcc-initial-net-debit')

const cashFlows = (page: Page): Locator =>
  sheet(page).locator('div.rounded-lg').filter({ hasText: 'Opening cash flows' })

const cashRow = (page: Page, label: string): Locator =>
  cashFlows(page).locator('div.flex.justify-between').filter({ hasText: label })

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario: Open the shared new-position panel', () => {
  it('opens a right-hand "New position" panel over the positions list with "Standard" selected', async () => {
    const page = await launch()
    await seedWheels(page, 1)

    await openNewPositionSheet(page)

    const dialog = sheet(page)
    expect(await dialog.isVisible()).toBe(true)
    expect(await page.locator('#sheet-portal [role="dialog"]').count()).toBe(1)
    expect(await page.getByTestId('sheet-scrim').isVisible()).toBe(true)
    // The list stays mounted and visible behind the scrim.
    expect(await positionRows(page).count()).toBe(1)
    expect(await positionRows(page).first().isVisible()).toBe(true)
    // Right-hand: the panel's right edge is the window's.
    const box = await dialog.boundingBox()
    const width = await page.evaluate(() => window.innerWidth)
    expect(box).not.toBeNull()
    expect(Math.abs(box!.x + box!.width - width)).toBeLessThanOrEqual(1)
    expect(box!.x).toBeGreaterThan(width / 3)

    const toggle = page.getByRole('group', { name: 'Position strategy' })
    expect(await toggle.getByRole('button', { name: 'Standard', pressed: true }).count()).toBe(1)
    expect(
      await toggle.getByRole('button', { name: 'PMCC', exact: true, pressed: false }).count()
    ).toBe(1)
    expect(await dialog.textContent()).toContain('Start the wheel with a cash-secured put.')
  })

  it('the panel shows the existing standard wheel fields and "Open Wheel" submit action', async () => {
    const page = await launch()
    await openNewPositionSheet(page)

    for (const id of STANDARD_FIELD_IDS) {
      expect(await sheet(page).locator(`#${id}`).isVisible(), id).toBe(true)
    }
    const submit = sheet(page).locator('button[aria-label="Open wheel"]')
    expect(await submit.isVisible()).toBe(true)
    expect(await submit.getAttribute('type')).toBe('submit')
    expect(await recordButton(page).isVisible()).toBe(false)
  })

  it('a "Standard / PMCC" toggle is visible above the form', async () => {
    const page = await launch()
    await openNewPositionSheet(page)

    const toggle = page.getByRole('group', { name: 'Position strategy' })
    expect(await toggle.isVisible()).toBe(true)
    expect(await toggle.getByRole('button').allTextContents()).toEqual(['Standard', 'PMCC'])
    const toggleBox = await toggle.boundingBox()
    const tickerBox = await page.locator('#ticker').boundingBox()
    expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(tickerBox!.y)
    const precedes = await page.evaluate(() => {
      const group = document.querySelector('[role="group"][aria-label="Position strategy"]')!
      const ticker = document.querySelector('#ticker')!
      return Boolean(group.compareDocumentPosition(ticker) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(precedes).toBe(true)
  })
})

describe('Scenario Outline: Switch the entry form in the same panel', () => {
  it('Standard → PMCC: the same panel shows Buy LEAPS call and Sell short call sections and the Record PMCC action', async () => {
    const page = await launch()
    await openNewPositionSheet(page)
    await page.fill('#ticker', 'XYZ')
    await page.fill('#contracts', '2')
    await page.fill('#strike', '95')
    await page.fill('#premiumPerContract', '1.50')
    const dialog = await sheet(page).elementHandle()

    await selectPmcc(page)

    expect(await dialog!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await legSection(page, 'long').isVisible()).toBe(true)
    expect(await legSection(page, 'short').isVisible()).toBe(true)
    expect(await recordButton(page).isVisible()).toBe(true)
    expect(await recordButton(page).textContent()).toBe('Record PMCC')
    expect(await openWheelButton(page).isVisible()).toBe(false)
    // Shared ticker and quantity carry over; the put's strike does not become a call strike.
    expect(await page.inputValue('#pmcc-ticker')).toBe('XYZ')
    expect(await page.inputValue('#pmcc-contracts')).toBe('2')
    expect(await page.inputValue('#long-strike')).toBe('')
    expect(await page.inputValue('#short-strike')).toBe('')
    expect(await page.inputValue('#long-fill')).toBe('')

    await selectStandard(page)
    expect(await page.inputValue('#ticker')).toBe('XYZ')
    expect(await page.inputValue('#strike')).toBe('95')
    expect(await page.inputValue('#premiumPerContract')).toBe('1.50')
    expect(await listPositions(page)).toEqual([])
  })

  it('PMCC → Standard: the same panel shows the existing opening cash-secured put fields and the Open Wheel action', async () => {
    const page = await launchInPmcc()
    await page.fill('#pmcc-ticker', 'XYZ')
    await page.fill('#pmcc-contracts', '2')
    await selectContract(page, 'long', LEAPS_SYMBOL())
    await page.fill('#long-fill', '25.00')
    const dialog = await sheet(page).elementHandle()

    await selectStandard(page)

    expect(await dialog!.evaluate((el) => el.isConnected)).toBe(true)
    for (const id of STANDARD_FIELD_IDS) {
      expect(await page.locator(`#${id}`).isVisible(), id).toBe(true)
    }
    expect(await openWheelButton(page).isVisible()).toBe(true)
    expect(await recordButton(page).isVisible()).toBe(false)
    expect(await page.inputValue('#ticker')).toBe('XYZ')
    expect(await page.inputValue('#contracts')).toBe('2')
    // The PMCC form is not part of the visible, submittable form.
    expect(await page.locator('form:visible #long-fill').count()).toBe(0)
    expect(await listPositions(page)).toEqual([])

    // The PMCC draft is retained for switching back.
    await selectPmcc(page)
    expect(await page.inputValue('#long-fill')).toBe('25.00')
    expect(await page.inputValue('#long-contract')).toBe(LEAPS_SYMBOL())
    await selectStandard(page)

    // Submitting Standard records a plain wheel: no hidden PMCC leg rides along.
    await page.fill('#strike', '95')
    await page.fill('#premiumPerContract', '1.50')
    await selectDate(page, '#expiration', localDate(30))
    await openWheelButton(page).click()
    await expect.poll(async () => (await listPositions(page)).length).toBe(1)
    const [position] = await listPositions(page)
    expect(position.strategyType).toBe('WHEEL')
    const detail = (await page.evaluate(
      (id) => window.api.getPosition(id),
      position.id
    )) as unknown as { legs: Array<{ instrumentType: string; legRole: string }> }
    expect(detail.legs.map((l) => [l.legRole, l.instrumentType])).toEqual([['CSP_OPEN', 'PUT']])
  })
})

describe('Scenario: Select the two contracts independently', () => {
  it('selecting the XYZ $80 call expiring in 368 days for the long leg shows its strike, expiration, 368 DTE, quote timestamp, and bid, ask, mid and delta', async () => {
    const page = await launchInPmcc()
    await page.fill('#pmcc-ticker', 'XYZ')

    const option = page.locator(`#long-contract option[value="${LEAPS_SYMBOL()}"]`)
    await option.waitFor({ state: 'attached' })
    expect(await option.textContent()).toContain(`$80.00 · ${LEAPS_DTE} DTE · Δ 0.80 · mid $25.00`)
    await selectContract(page, 'long', LEAPS_SYMBOL())

    expect(await page.inputValue('#long-strike')).toBe('80.00')
    expect(await page.inputValue('#long-expiration')).toBe(FIXTURE.long.expiration)
    expect(await fieldOf(page, 'long-expiration').textContent()).toContain(`${LEAPS_DTE} DTE`)
    const long = (await legSection(page, 'long').textContent()) ?? ''
    expect(long).toContain('Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80')
    expect(long).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{2}:\d{2} ET/)
    // Nothing leaked into the short leg.
    expect(await page.inputValue('#short-strike')).toBe('')
    expect(await legSection(page, 'short').textContent()).toContain('No quote available')
  })

  it('the short-call selection remains independent and is limited to XYZ calls', async () => {
    const page = await launchInPmcc()
    await page.fill('#pmcc-ticker', 'XYZ')
    await selectContract(page, 'long', LEAPS_SYMBOL())
    await page.locator(`#short-contract option[value="${SHORT_SYMBOL()}"]`).waitFor({
      state: 'attached'
    })

    // The ABC call and the XYZ put sit in the short band too; neither is offered.
    const offered = await page
      .locator('#short-contract option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
    expect(offered).toEqual([SHORT_SYMBOL()])

    await selectContract(page, 'short', SHORT_SYMBOL())
    expect(await page.inputValue('#short-strike')).toBe('110.00')
    expect(await page.inputValue('#short-expiration')).toBe(FIXTURE.short.expiration)
    expect(await fieldOf(page, 'short-expiration').textContent()).toContain(`${SHORT_DTE} DTE`)
    expect(await legSection(page, 'short').textContent()).toContain(
      'Bid $1.90 · Ask $2.10 · Mid $2.00 · Δ 0.30'
    )
    // The long selection is untouched.
    expect(await page.inputValue('#long-contract')).toBe(LEAPS_SYMBOL())
    expect(await page.inputValue('#long-strike')).toBe('80.00')
    expect(await page.inputValue('#long-expiration')).toBe(FIXTURE.long.expiration)
  })

  it('the actual fill price remains a separate required input', async () => {
    const page = await launchInPmcc()
    await page.fill('#pmcc-ticker', 'XYZ')
    await typeAndBlur(page, '#pmcc-contracts', '1')
    await selectContract(page, 'long', LEAPS_SYMBOL())
    await selectContract(page, 'short', SHORT_SYMBOL())

    // The quote's mid is never copied into the fill.
    expect(await page.inputValue('#long-fill')).toBe('')
    expect(await page.inputValue('#short-fill')).toBe('')

    // Record PMCC stays available; selecting it names each missing fill and records nothing.
    await recordButton(page).click()
    const longAlert = fieldOf(page, 'long-fill').getByRole('alert')
    await longAlert.waitFor({ timeout: 5_000 })
    expect(await longAlert.textContent()).toBe('Enter the actual LEAPS fill price.')
    expect(await fieldOf(page, 'short-fill').getByRole('alert').textContent()).toBe(
      'Enter the actual short-call fill price.'
    )
    expect(await sheet(page).isVisible()).toBe(true)
    expect(await listPositions(page)).toEqual([])
  })
})

describe('Scenario: Review the initial cash flows', () => {
  it('shows LEAPS purchase cost $2,500.00 and Short-call credit $200.00', async () => {
    const page = await launchInPmcc()
    expect(await cashRow(page, 'LEAPS purchase cost').textContent()).toBe('LEAPS purchase cost—')
    await fillPmccLegs(page, FIXTURE, { today: TODAY })

    expect(await cashRow(page, 'LEAPS purchase cost').textContent()).toBe(
      'LEAPS purchase cost$2,500.00'
    )
    expect(await cashRow(page, 'Short-call credit').textContent()).toBe('Short-call credit$200.00')
  })

  it('shows Fees $0.00 and Initial net debit $2,300.00', async () => {
    const page = await launchFilledPmcc()

    expect(await cashRow(page, 'Fees').textContent()).toBe('Fees$0.00')
    expect(await netDebit(page).textContent()).toBe('$2,300.00')
  })

  it('shows Strike width / share $30.00 and Debit / strike width, before fees 76.67%', async () => {
    const page = await launchFilledPmcc()

    const text = (await cashFlows(page).textContent()) ?? ''
    expect(text).toContain('Strike width / share: $30.00')
    expect(text).toContain('Debit / strike width, before fees: 76.67%')
  })

  it('does not present short-call credit as earned profit or show a guaranteed maximum profit or breakeven', async () => {
    const page = await launchFilledPmcc()

    const text = (await sheet(page).textContent()) ?? ''
    expect(text).toContain('Opening credit is not yet realized profit.')
    expect(text).not.toMatch(/max(imum)? profit|breakeven|break-even/i)
    expect(text).not.toMatch(/(premium|credit) (earned|collected as profit)|realized income/i)
  })

  it('adding $1.00 of fees to each leg changes the debit to $2,302.00 while the ratio stays 76.67%', async () => {
    const page = await launchFilledPmcc()
    expect(await netDebit(page).textContent()).toBe('$2,300.00')

    await typeAndBlur(page, '#long-fees', '1.00')
    await typeAndBlur(page, '#short-fees', '1.00')

    expect(await cashRow(page, 'Fees').textContent()).toBe('Fees$2.00')
    expect(await netDebit(page).textContent()).toBe('$2,302.00')
    expect(await cashFlows(page).textContent()).toContain(
      'Debit / strike width, before fees: 76.67%'
    )
  })
})

describe('Scenario: Record the position and view both legs', () => {
  it('selecting Record PMCC closes the panel and one PMCC position appears with status "LEAPS + short call open" and initial net debit $2,300.00', async () => {
    const page = await launchFilledPmcc()

    await recordPmcc(page)

    expect(await sheet(page).count()).toBe(0)
    expect(await page.evaluate(() => location.hash)).toBe('#/')
    const banner = page.locator('[role="status"] [data-testid="positions-recorded-banner"]')
    expect(await banner.textContent()).toContain('PMCC recorded — XYZ · LEAPS + short call open')
    const positions = await listPositions(page)
    expect(positions).toHaveLength(1)
    expect(await banner.getByRole('link', { name: /View position/ }).getAttribute('href')).toBe(
      `#/positions/${positions[0].id}`
    )

    await expect.poll(() => positionRows(page).count()).toBe(1)
    const row = (await positionRows(page).first().textContent()) ?? ''
    expect(row).toContain('PMCC')
    expect(row).toContain('LEAPS + short call open')
    expect(row).toContain('$2,300.00 net debit')
  })

  it('its detail page shows both legs with their quantities, actual fills, fill dates, strikes, and expirations', async () => {
    const page = await launchFilledPmcc()
    await recordPmcc(page)

    await positionRows(page).first().click()
    const detail = page.locator('[data-testid="position-detail"]')
    await detail.waitFor()

    const expectLeg = async (title: string, leg: PmccLegFixture, dte: number): Promise<void> => {
      const card = detail.locator('section').filter({ hasText: title })
      expect(await card.count(), title).toBe(1)
      const text = (await card.textContent()) ?? ''
      expect(text).toMatch(new RegExp(`Strike\\s*\\$${leg.strike.replace('.', '\\.')}`))
      expect(text).toContain(`Expiration${leg.expiration}`)
      expect(text).toContain(`DTE${dte}d`)
      expect(text).toContain('Contracts1')
      expect(text).toContain(`Actual fill$${leg.fill}`)
      expect(text).toContain(`Fill date${leg.fillDate}`)
      expect(text).toContain('Fees$0.00')
    }
    await expectLeg('Buy LEAPS call', FIXTURE.long, LEAPS_DTE)
    await expectLeg('Sell short call', FIXTURE.short, SHORT_DTE)

    const text = (await detail.textContent()) ?? ''
    expect(text).toContain('Initial net debit$2,300.00')
    expect(text).toContain('Live P&L unavailable until PMCC valuation ships')
  })

  it("its row in the positions list identifies PMCC and labels each leg's expiration separately", async () => {
    const page = await launchFilledPmcc()
    await recordPmcc(page)

    const row = positionRows(page).first()
    await row.waitFor()
    expect(await row.getByTestId('position-ticker').textContent()).toBe('XYZ')
    expect(await row.locator('span', { hasText: /^PMCC$/ }).count()).toBeGreaterThan(0)
    expect(await row.textContent()).toContain('$80.00 / $110.00')
    expect(await row.locator('span', { hasText: /^LEAPS · / }).textContent()).toBe(
      `LEAPS · ${FIXTURE.long.expiration}`
    )
    expect(await row.locator('span', { hasText: /^Short · / }).textContent()).toBe(
      `Short · ${FIXTURE.short.expiration}`
    )
    expect(await row.locator('span', { hasText: /^\d+d$/ }).allTextContents()).toEqual([
      `${LEAPS_DTE}d`,
      `${SHORT_DTE}d`
    ])
  })

  it('no broker order is submitted', async () => {
    const page = await launchFilledPmcc()
    expect(await sheet(page).textContent()).toContain('No order is placed.')
    await spyOnIpcChannels(app!)

    await recordPmcc(page)

    const channels = await invokedIpcChannels(app!)
    // The spy is live: the save itself went through it.
    expect(channels).toContain('positions:create-pmcc')
    expect(channels.filter((c) => c.startsWith('broker:'))).toEqual([])
  })
})

// ── Reject an unsupported or incomplete entry ────────────────────────────────

type RejectStep = {
  /** Applies one invalid change to the valid, fully entered fixture. */
  apply: (page: Page) => Promise<void>
  /** Where the error is shown: a control id (its Field) or the pair-level slot. */
  at: string | 'pair'
  /** Controls whose entered value must survive, with that value. */
  kept: Record<string, string>
}

type UiRejectRow = { invalidCase: string; message: string; steps: RejectStep[] }

const BASE_KEPT = { '#pmcc-ticker': 'XYZ', '#long-strike': '80.00' }

const UI_REJECT_ROWS: UiRejectRow[] = [
  {
    invalidCase: 'the short expiration is the LEAPS expiration',
    message: 'Short call must expire before the LEAPS call.',
    steps: [
      {
        apply: async (page) => {
          await switchLegToManual(page, 'short')
          await pickDate(page, '#short-expiration', FIXTURE.long.expiration)
        },
        at: 'short-expiration',
        kept: { ...BASE_KEPT, '#short-expiration': FIXTURE.long.expiration, '#short-fill': '2.00' }
      }
    ]
  },
  {
    invalidCase: 'the short expiration is after the LEAPS expiration',
    message: 'Short call must expire before the LEAPS call.',
    steps: [
      {
        apply: async (page) => {
          await switchLegToManual(page, 'short')
          await pickDate(page, '#short-expiration', localDate(LEAPS_DTE + 28))
        },
        at: 'short-expiration',
        kept: { ...BASE_KEPT, '#short-expiration': localDate(LEAPS_DTE + 28) }
      }
    ]
  },
  ...['75.00', '80.00'].map((strike) => ({
    invalidCase: `the short strike is $${strike}`,
    message: 'Short-call strike must be above the LEAPS strike.',
    steps: [
      {
        apply: async (page: Page) => {
          await switchLegToManual(page, 'short')
          await typeAndBlur(page, '#short-strike', strike)
        },
        at: 'short-strike',
        kept: { ...BASE_KEPT, '#short-strike': strike, '#short-fill': '2.00' }
      }
    ]
  })),
  {
    invalidCase: 'the long actual fill price is empty',
    message: 'Enter the actual LEAPS fill price.',
    steps: [
      {
        apply: (page) => typeAndBlur(page, '#long-fill', ''),
        at: 'long-fill',
        kept: { ...BASE_KEPT, '#long-fill': '', '#short-fill': '2.00' }
      }
    ]
  },
  {
    invalidCase: 'either quantity is 0 or fractional',
    message: 'Contracts must be a positive whole number.',
    steps: ['0', '1.5'].map((contracts) => ({
      apply: (page: Page) => typeAndBlur(page, '#pmcc-contracts', contracts),
      at: 'pmcc-contracts',
      kept: { ...BASE_KEPT, '#pmcc-contracts': contracts, '#long-fill': '25.00' }
    }))
  },
  {
    invalidCase: 'either actual fill price is zero or negative',
    message: 'Actual fill price must be greater than zero.',
    steps: [
      {
        apply: (page) => typeAndBlur(page, '#long-fill', '0'),
        at: 'long-fill',
        kept: { ...BASE_KEPT, '#long-fill': '0' }
      },
      {
        apply: async (page) => {
          await typeAndBlur(page, '#long-fill', '25.00')
          await typeAndBlur(page, '#short-fill', '-1')
        },
        at: 'short-fill',
        kept: { ...BASE_KEPT, '#long-fill': '25.00', '#short-fill': '-1' }
      }
    ]
  },
  {
    invalidCase: 'either total leg fee is negative',
    message: 'Fees cannot be negative.',
    steps: [
      {
        apply: (page) => typeAndBlur(page, '#long-fees', '-1'),
        at: 'long-fees',
        kept: { ...BASE_KEPT, '#long-fees': '-1', '#long-fill': '25.00' }
      }
    ]
  },
  {
    invalidCase: 'the long fill date is tomorrow',
    message: 'Fill date cannot be in the future.',
    steps: [
      {
        apply: (page) => pickDate(page, '#long-fill-date', localDate(1)),
        at: 'long-fill-date',
        kept: { ...BASE_KEPT, '#long-fill-date': localDate(1), '#long-fill': '25.00' }
      }
    ]
  },
  {
    invalidCase: 'the long fill date follows the short fill',
    message: 'LEAPS must be acquired no later than the short-call fill.',
    steps: [
      {
        apply: (page) => pickDate(page, '#short-fill-date', localDate(-1)),
        at: 'short-fill-date',
        kept: { ...BASE_KEPT, '#short-fill-date': localDate(-1), '#long-fill-date': TODAY }
      }
    ]
  },
  {
    invalidCase: 'either expiration is on or before its fill date',
    message: 'Expiration must be after the fill date.',
    steps: [
      {
        apply: async (page) => {
          await switchLegToManual(page, 'short')
          await pickDate(page, '#short-expiration', TODAY)
        },
        at: 'short-expiration',
        kept: { ...BASE_KEPT, '#short-expiration': TODAY, '#short-fill-date': TODAY }
      }
    ]
  },
  {
    invalidCase: 'either expiration is before today',
    message: 'Use an unexpired contract for opening a current position.',
    steps: [
      {
        apply: async (page) => {
          await switchLegToManual(page, 'long')
          await pickDate(page, '#long-fill-date', localDate(-5))
          await pickDate(page, '#long-expiration', localDate(-1))
        },
        at: 'long-expiration',
        kept: { '#pmcc-ticker': 'XYZ', '#long-expiration': localDate(-1), '#long-fill': '25.00' }
      }
    ]
  },
  {
    invalidCase: 'total short credit exceeds total long cost',
    message: 'This PMCC entry requires a net debit before fees.',
    steps: [
      {
        apply: (page) => typeAndBlur(page, '#short-fill', '30.00'),
        at: 'pair',
        kept: { ...BASE_KEPT, '#long-fill': '25.00', '#short-fill': '30.00' }
      }
    ]
  }
]

type BoundaryRejectRow = {
  invalidCase: string
  message: string
  field: string
  short: Record<string, unknown>
}

const BOUNDARY_REJECT_ROWS: BoundaryRejectRow[] = [
  {
    invalidCase: 'the short underlying is ABC',
    message: 'Both calls must have the same underlying.',
    field: 'short.underlying',
    short: { underlying: 'ABC' }
  },
  {
    invalidCase: 'the short leg is a put',
    message: 'PMCC entry requires two call options.',
    field: 'short.instrumentType',
    short: { instrumentType: 'PUT' }
  },
  {
    invalidCase: 'long quantity is 1 and short quantity is 2',
    message: 'Opening quantities must match for this PMCC entry.',
    field: 'short.contracts',
    short: { contracts: 2 }
  },
  {
    invalidCase: 'a leg has an adjusted deliverable',
    message: 'This entry supports standard 100-share contracts only.',
    field: 'short.deliverableShares',
    short: { deliverableShares: 50 }
  }
]

// Titles are built here, not with `$field` interpolation, which quotes and truncates them.
const rejectTitle = ({ invalidCase, message }: { invalidCase: string; message: string }): string =>
  `rejects when ${invalidCase} with "${message}"`

function validPayload(): Record<string, unknown> & {
  long: Record<string, unknown>
  short: Record<string, unknown>
} {
  const leg = (l: PmccLegFixture): Record<string, unknown> => ({
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: Number(l.strike),
    expiration: l.expiration,
    contracts: 1,
    fillPrice: Number(l.fill),
    fillDate: l.fillDate,
    fees: 0
  })
  return { strategy: 'PMCC', ticker: 'XYZ', long: leg(FIXTURE.long), short: leg(FIXTURE.short) }
}

describe('Scenario Outline: Reject an unsupported or incomplete entry', () => {
  it.each(UI_REJECT_ROWS.map((row) => [rejectTitle(row), row] as const))(
    '%s',
    async (_title, { message, steps }) => {
      const page = await launchFilledPmcc()
      // The valid entry shows no error, so only the invalid change below can raise one.
      expect(await sheet(page).getByRole('alert').count()).toBe(0)

      for (const step of steps) {
        await step.apply(page)
        await recordButton(page).click()
        const slot =
          step.at === 'pair'
            ? sheet(page).getByRole('alert').filter({ hasText: message })
            : fieldOf(page, step.at).getByRole('alert')
        await slot.waitFor({ timeout: 5_000 })
        expect(await slot.textContent()).toBe(message)
        expect(await sheet(page).isVisible()).toBe(true)
        for (const [selector, value] of Object.entries(step.kept)) {
          expect(await valueOf(page, selector), selector).toBe(value)
        }
        expect(await listPositions(page)).toEqual([])
      }
    }
  )

  it.each(BOUNDARY_REJECT_ROWS.map((row) => [rejectTitle(row), row] as const))(
    '%s',
    async (_title, { message, field, short }) => {
      const page = await launchInPmcc()
      const payload = validPayload()
      const invalid = { ...payload, short: { ...payload.short, ...short } }

      const result = await page.evaluate((p) => window.api.createPmccPosition(p), invalid)

      expect(result).toMatchObject({ ok: false, errors: [{ field, message }] })
      await expectNothingRecorded(page)
    }
  )
})

// ── Continue when market data cannot supply a selection ─────────────────────

type MarketRow = {
  marketState: string
  notice: string
  /** Called per run, so fixture timestamps are relative to that run's launch. */
  launch: () => Parameters<typeof launchPmcc>[1]
  /** Brings about the state after the fill is typed (a chain pick, for the stale row). */
  reach?: (page: Page) => Promise<void>
  /** The long leg's contract picker value that must survive. */
  keptContract: string
}

const tenMinutesAgo = (): string => new Date(Date.now() - 10 * 60 * 1000).toISOString()

const MARKET_ROWS: MarketRow[] = [
  {
    marketState: 'the call chain request is still loading',
    notice: 'Loading call contracts…',
    // Long enough that manual entry below runs entirely while the chain is still loading.
    launch: () => ({ env: { FAKE_OPTION_CHAIN_DELAY_MS: '60000' } }),
    keptContract: ''
  },
  {
    marketState: 'the selected filters return no contracts',
    notice: 'No matching calls. Adjust filters or enter manually.',
    launch: () => ({ fixtures: noMatchingLeapsFixtures() }),
    keptContract: ''
  },
  {
    marketState: 'the market-data request failed',
    notice: 'Quotes unavailable. Enter your filled trade manually.',
    launch: () => ({ env: { FAKE_MARKET_DATA_ERROR: 'unknown' } }),
    keptContract: ''
  },
  {
    marketState: 'the options quote is stale',
    notice: 'Quote is stale. Verify against your actual fill.',
    launch: () => ({
      fixtures: xyzChainFixtures({
        long: { timestamp: tenMinutesAgo() },
        short: { timestamp: tenMinutesAgo() }
      })
    }),
    reach: (page) => selectContract(page, 'long', LEAPS_SYMBOL()),
    keptContract: LEAPS_SYMBOL()
  }
]

describe('Scenario Outline: Continue when market data cannot supply a selection', () => {
  it.each(MARKET_ROWS.map((row) => [`${row.marketState} → "${row.notice}"`, row] as const))(
    '%s',
    async (_title, { notice, launch: opts, reach, keptContract }) => {
      const page = await launchInPmcc(opts())
      await page.fill('#pmcc-ticker', 'XYZ')
      await typeAndBlur(page, '#pmcc-contracts', '1')
      await typeAndBlur(page, '#long-fill', '25.00')
      await reach?.(page)

      const box = legSection(page, 'long').getByRole('status').filter({ hasText: notice })
      await box.waitFor({ timeout: 20_000 })
      expect(await box.textContent()).toBe(notice)
      expect(await page.inputValue('#long-fill')).toBe('25.00')
      expect(await page.inputValue('#long-contract')).toBe(keptContract)
      if (keptContract) expect(await page.inputValue('#long-strike')).toBe('80.00')

      if (notice.startsWith('No matching')) {
        // Only the LEAPS band is empty; the short picker still lists its contract.
        expect(
          await page.locator(`#short-contract option[value="${SHORT_SYMBOL()}"]`).count()
        ).toBe(1)
      }

      // Manual contract and fill entry remain available, and the fill survives it.
      await enterLegManually(page, 'long', FIXTURE.long)
      await enterLegManually(page, 'short', FIXTURE.short)
      await typeAndBlur(page, '#short-fill', FIXTURE.short.fill)
      expect(await page.inputValue('#long-fill')).toBe('25.00')
      expect(await valueOf(page, '#long-expiration')).toBe(FIXTURE.long.expiration)
      if (notice.startsWith('Loading')) expect(await box.isVisible()).toBe(true)
      await expectEnabled(recordButton(page), true)

      await recordPmcc(page)
      expect(await listPositions(page)).toHaveLength(1)
    }
  )
})

describe('Scenario: Recover from a failed save without a partial position', () => {
  it('a storage failure shows "Could not record PMCC. Your entries are preserved. Try again." and neither an incomplete PMCC nor a standalone opening leg appears, and Record PMCC becomes available again', async () => {
    const page = await launchFilledPmcc()
    // Fail the transaction's LAST write (the debit snapshot), after the position and
    // both legs were inserted — only a real rollback leaves no rows behind.
    sqlite(
      dbPath,
      `CREATE TRIGGER e2e_storage_failure BEFORE INSERT ON cost_basis_snapshots
       BEGIN SELECT RAISE(ABORT, 'e2e storage failure'); END;`
    )

    await recordButton(page).click()

    const alert = page.getByTestId('pmcc-save-error')
    await alert.waitFor()
    expect(await alert.textContent()).toBe(
      'Could not record PMCC. Your entries are preserved. Try again.'
    )
    expect(await sheet(page).isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'PMCC', pressed: true }).count()).toBe(1)
    for (const [selector, value] of Object.entries({
      '#pmcc-ticker': 'XYZ',
      '#pmcc-contracts': '1',
      '#long-contract': LEAPS_SYMBOL(),
      '#long-fill': '25.00',
      '#short-contract': SHORT_SYMBOL(),
      '#short-fill': '2.00'
    })) {
      expect(await page.inputValue(selector), selector).toBe(value)
    }
    await expectNothingRecorded(page)
    await expectEnabled(recordButton(page), true)
    expect(await recordButton(page).textContent()).toBe('Record PMCC')

    // The retry, once storage recovers, records exactly one PMCC with both legs.
    sqlite(dbPath, 'DROP TRIGGER e2e_storage_failure;')
    await recordPmcc(page)
    expect(await listPositions(page)).toHaveLength(1)
    expect(tableCount(dbPath, 'legs')).toBe(2)
  })
})

describe('Scenario: Cancel without recording', () => {
  it('selecting Cancel closes the panel with no new position and the underlying list retains its scroll position', async () => {
    const page = await launch()
    await seedWheels(page, 30)
    const scroller = page.locator('.flex-1.overflow-auto').filter({ has: positionRows(page) })
    const before = await scroller.evaluate((el) => {
      el.scrollTop = 400
      return el.scrollTop
    })
    expect(before).toBeGreaterThan(0)

    await openNewPositionSheet(page)
    await selectPmcc(page)
    await page.fill('#pmcc-ticker', 'XYZ')
    await typeAndBlur(page, '#long-fill', '25.00')
    await sheet(page)
      .locator('button:visible', { hasText: /^Cancel$/ })
      .click()

    await sheet(page).waitFor({ state: 'detached' })
    expect(await listPositions(page)).toHaveLength(30)
    expect(await positionRows(page).count()).toBe(30)
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before)
  })
})
