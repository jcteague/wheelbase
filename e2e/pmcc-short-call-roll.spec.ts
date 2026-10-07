// [US-104] Roll the PMCC short call — one `it` per Gherkin scenario and Scenario Outline row
// (Linear). Background: the XYZ PMCC is opened through `window.api.createPmccPosition`, its
// first short expires and a $108 short is sold at $1.80 through the test-only
// `_test:pmcc-record-leg-event` channel (so the app launches with NODE_ENV=test): basis $21.20,
// effective share cost $101.20. The AC's fixed dates (14 DTE short, 42 DTE replacement) become
// run-day-relative `localDate` offsets, so the DTE figures and the roll label's months are
// computed from those same dates rather than hard-coded.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { localDate } from './dates'
import { reachCcOpenState } from './helpers'
import { closePmcc, launchPmcc, tableCount, tempDbPath } from './pmcc-helpers'
import { cell, snapshots } from './pmcc-ledger-helpers'
import {
  CURRENT_SHORT_EXP,
  LEAPS_EXP,
  REPLACEMENT_EXP,
  ROLLS_IN_EXP,
  ROLL_FILL_DATE,
  type RollDraft,
  confirmButton,
  dteOf,
  expirationSpan,
  fieldError,
  fillRoll,
  longDate,
  openRollShortSheet,
  positionDetail,
  reachXyzLeapsOnly,
  reachXyzShortTwo,
  rollButton,
  rollSheet,
  rollShortCall,
  summaryValue,
  testIdText
} from './pmcc-roll-helpers'

let app: ElectronApplication | undefined
let dbPath: string

afterEach(async () => {
  await closePmcc(app, dbPath)
  app = undefined
})

async function launch(): Promise<Page> {
  dbPath = tempDbPath('pmcc-roll')
  const launched = await launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })
  app = launched.app
  return launched.page
}

/** Launches into the Background and opens the `Roll Short Call` sheet. */
async function backgroundSheet(): Promise<{ page: Page; id: string }> {
  const page = await launch()
  const id = await reachXyzShortTwo(page)
  await openRollShortSheet(page)
  return { page, id }
}

const UP_OUT: RollDraft = {
  costToClose: '3.00',
  strike: '112',
  expiration: REPLACEMENT_EXP,
  premium: '2.40'
}

async function confirmDisabled(page: Page): Promise<boolean> {
  return confirmButton(page).isDisabled()
}

describe('US-104 — Roll the PMCC short call', () => {
  it('The roll form shows the decision context for the open short call', async () => {
    const { page } = await backgroundSheet()

    expect(await summaryValue(page, 'Contract')).toBe('XYZ $108.00 CALL')
    expect(await summaryValue(page, 'Expiration')).toBe(
      `${CURRENT_SHORT_EXP} (${dteOf(CURRENT_SHORT_EXP)} DTE)`
    )
    expect(await summaryValue(page, 'Sold at')).toBe('$1.80 / share')
    expect(await summaryValue(page, 'LEAPS · read-only')).toBe(`$80.00 · ${LEAPS_EXP}`)
    expect(await summaryValue(page, 'Effective share cost')).toBe('$101.20')

    for (const id of [
      'pmcc-roll-cost-to-close',
      'pmcc-roll-strike',
      'pmcc-roll-expiration',
      'pmcc-roll-premium',
      'pmcc-roll-fill-date'
    ]) {
      expect(await rollSheet(page).locator(`#${id}`).isVisible()).toBe(true)
    }

    expect(await page.getByTestId('pmcc-roll-net').count()).toBe(0)
    expect(
      await rollSheet(page)
        .getByText('Enter a cost to close and a premium to preview the net.', { exact: true })
        .isVisible()
    ).toBe(true)
  })

  it('Net debit preview for a roll up and out', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, UP_OUT)

    expect(await testIdText(page, 'pmcc-roll-net')).toBe(
      'Net Debit: $0.60 per share ($60.00 total)'
    )
    expect(await testIdText(page, 'pmcc-roll-label')).toBe(
      `Roll Up & Out: $108 to $112 strike, ${expirationSpan(CURRENT_SHORT_EXP, REPLACEMENT_EXP)} expiration · ${dteOf(REPLACEMENT_EXP)} DTE`
    )
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Net credit preview for a roll out at the same strike', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, {
      costToClose: '1.10',
      strike: '108',
      expiration: REPLACEMENT_EXP,
      premium: '2.30'
    })

    expect(await testIdText(page, 'pmcc-roll-net')).toBe(
      'Net Credit: $1.20 per share ($120.00 total)'
    )
    expect(await testIdText(page, 'pmcc-roll-label')).toBe(
      `Roll Out: same $108 strike, ${expirationSpan(CURRENT_SHORT_EXP, REPLACEMENT_EXP)} expiration · ${dteOf(REPLACEMENT_EXP)} DTE`
    )
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Recording the roll creates a linked leg pair and one net cost-basis line', async () => {
    const { page, id } = await backgroundSheet()
    await fillRoll(page, UP_OUT)
    await expect.poll(() => confirmDisabled(page)).toBe(false)
    await confirmButton(page).click()
    await rollSheet(page).waitFor({ state: 'detached' })

    const banner = await testIdText(page, 'pmcc-roll-recorded-banner')
    expect(banner).toContain('Short-call roll #1 debit · $0.60 per share ($60.00 total).')

    const detail = await positionDetail(page, id)
    const rollFrom = detail.legs.find((leg) => leg.legRole === 'ROLL_FROM')
    const rollTo = detail.legs.find((leg) => leg.legRole === 'ROLL_TO')
    expect(rollFrom).toMatchObject({
      action: 'BUY',
      strike: '108.0000',
      expiration: CURRENT_SHORT_EXP,
      premiumPerContract: '3.0000'
    })
    expect(rollTo).toMatchObject({
      action: 'SELL',
      strike: '112.0000',
      expiration: REPLACEMENT_EXP,
      premiumPerContract: '2.4000'
    })
    expect(rollFrom?.rollChainId).toBeTruthy()
    expect(rollTo?.rollChainId).toBe(rollFrom?.rollChainId)

    expect(detail.pmccLedger?.basisPerShare).toBe('21.8000')
    expect(detail.allSnapshots).toHaveLength(4)
    expect(detail.allSnapshots.at(-1)).toMatchObject({
      triggerEvent: 'PMCC_SHORT_ROLL',
      basisPerShare: '21.8000'
    })
    expect(detail.pmccOpenLegs?.long.strike).toBe('80.0000')
    expect(detail.pmccOpenLegs?.short?.strike).toBe('112.0000')

    expect(await cell(page, 'Cost basis / share')).toBe('$21.80')
    const shortCard = page
      .locator('section')
      .filter({ has: page.getByText('Sell short call', { exact: true }) })
    const strike = shortCard.locator('div:has(> span:text-is("Strike")) > span:nth-child(2)')
    expect(((await strike.textContent()) ?? '').trim()).toBe('$112.00')
  })

  it('Warning when the replacement strike sits below the effective share cost', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, strike: '98', premium: '2.50' })

    expect(await testIdText(page, 'pmcc-roll-warning')).toBe(
      'Short strike $98.00 is below your effective share cost of $101.70 after this roll. If assigned, covering from the LEAPS realizes roughly $3.70 per share of loss. You can still record it.'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a replacement expiration that would outlast the LEAPS', async () => {
    const { page, id } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, expiration: LEAPS_EXP, premium: '6.80' })

    expect(await fieldError(page, 'pmcc-roll-expiration')).toBe(
      'Short call must expire before the LEAPS call.'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    const result = await rollShortCall(page, {
      positionId: id,
      costToClosePerContract: 3,
      newPremiumPerContract: 6.8,
      newStrike: 112,
      newExpiration: LEAPS_EXP,
      fillDate: ROLL_FILL_DATE
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toEqual({
      field: 'newExpiration',
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    })
    expect(tableCount(dbPath, 'legs')).toBe(4)
    expect((await positionDetail(page, id)).pmccOpenLegs?.short?.strike).toBe('108.0000')
  })

  it('Reject a roll that changes neither strike nor expiration', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, strike: '108', expiration: CURRENT_SHORT_EXP })

    expect(await testIdText(page, 'pmcc-roll-no-change')).toBe(
      'Roll must change the strike, the expiration, or both'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    // Changing the strike alone makes it a roll: the disable came from the no-change rule.
    await page.fill('#pmcc-roll-strike', '112')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a replacement expiration earlier than the current short call', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, expiration: ROLLS_IN_EXP, premium: '0.90' })

    expect(await fieldError(page, 'pmcc-roll-expiration')).toBe(
      `Replacement expiration must be on or after the current expiration (${longDate(CURRENT_SHORT_EXP)})`
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)
  })

  it('Reject a non-positive cost to close', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, costToClose: '0.00' })

    expect(await fieldError(page, 'pmcc-roll-cost-to-close')).toBe(
      'Cost to close must be greater than zero'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    await page.fill('#pmcc-roll-cost-to-close', '3.00')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a non-positive replacement premium', async () => {
    const { page } = await backgroundSheet()
    await fillRoll(page, { ...UP_OUT, premium: '0.00' })

    expect(await fieldError(page, 'pmcc-roll-premium')).toBe(
      'Replacement premium must be greater than zero'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    await page.fill('#pmcc-roll-premium', '2.40')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a roll when the PMCC has no open short call', async () => {
    const page = await launch()
    const id = await reachXyzLeapsOnly(page)

    // The LEAPS card renders, so the detail is loaded — the button is absent, not pending.
    await page.getByText('Buy LEAPS call', { exact: true }).waitFor()
    expect(await rollButton(page).count()).toBe(0)

    const result = await rollShortCall(page, {
      positionId: id,
      costToClosePerContract: 3,
      newPremiumPerContract: 2.4,
      newStrike: 112,
      newExpiration: REPLACEMENT_EXP
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].message).toBe('This PMCC has no open short call to roll.')
    expect(tableCount(dbPath, 'legs')).toBe(3)
    expect(await snapshots(page, id)).toHaveLength(2)
  })

  it('Leave a classic wheel covered-call roll unaffected', async () => {
    const page = await launch()
    await reachCcOpenState(page, '185', '2.50', localDate(30))

    const rollCcButton = page.getByTestId('roll-cc-btn')
    expect(await rollCcButton.isVisible()).toBe(true)
    expect(await rollButton(page).count()).toBe(0)

    await rollCcButton.click()
    await page.waitForSelector('text=Roll Covered Call')
    // The CC sheet has no dialog role: read the portalled overlay that holds the scrim.
    const overlay = page.getByTestId('sheet-scrim').locator('xpath=..')
    const text = (await overlay.textContent()) ?? ''
    expect(text).toContain('Roll Covered Call')
    expect(text).not.toContain('Effective share cost')
    expect(text).not.toContain('LEAPS')
    expect(text).not.toContain('Roll Short Call')
    expect(await rollSheet(page).count()).toBe(0)
  })
})
