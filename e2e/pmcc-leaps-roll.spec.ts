// [US-105] Roll the PMCC LEAPS — one `it` per Gherkin scenario and Scenario Outline row
// (Linear). Background: the XYZ PMCC is opened through `window.api.createPmccPosition`, its
// first short expires, a $108 short is sold and then rolled to the $112 short at $2.40 through
// the test-only `_test:pmcc-record-leg-event` channel (so the app launches with NODE_ENV=test):
// LEAPS bought at $25.00, basis $21.80, effective share cost $101.80. The AC's fixed dates become
// run-day-relative `localDate` offsets, so the DTE figures and the roll label's months are
// computed from those same dates rather than hard-coded.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { localDate } from './dates'
import { reachCcOpenState, selectDate } from './helpers'
import { closePmcc, launchPmcc, positionRows, tableCount, tempDbPath } from './pmcc-helpers'
import { cell, snapshots } from './pmcc-ledger-helpers'
import {
  BEFORE_SHORT_EXP,
  LEAPS_EXP,
  LEAPS_ROLL_FILL_DATE,
  type LeapsRollDraft,
  NO_SHORT_ROLL_FILL_DATE,
  SHORTENS_EXP,
  SHORT_EXP,
  TOO_MUCH_EXP,
  UP_OUT_EXP,
  confirmButton,
  dteOf,
  fieldError,
  fillLeapsRoll,
  legCardStrike,
  monthYearLabel,
  openRollLeapsSheet,
  positionDetail,
  reachXyzLeapsRollBackground,
  reachXyzNoShort,
  rollButton,
  rollLeaps,
  rollLeapsButton,
  rollSheet,
  sectionValue,
  testIdText
} from './pmcc-roll-helpers'

let app: ElectronApplication | undefined
let dbPath: string

afterEach(async () => {
  await closePmcc(app, dbPath)
  app = undefined
})

async function launch(): Promise<Page> {
  dbPath = tempDbPath('pmcc-leaps-roll')
  const launched = await launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })
  app = launched.app
  return launched.page
}

/** Launches into the Background and opens the `Roll LEAPS` sheet. */
async function backgroundSheet(): Promise<{ page: Page; id: string }> {
  const page = await launch()
  const id = await reachXyzLeapsRollBackground(page)
  await openRollLeapsSheet(page)
  return { page, id }
}

const UP_OUT: LeapsRollDraft = {
  proceeds: '26.00',
  strike: '85',
  expiration: UP_OUT_EXP,
  debit: '23.50'
}

const sheet = (page: Page): Locator => rollSheet(page, 'leaps')

async function sheetText(page: Page): Promise<string> {
  return ((await sheet(page).textContent()) ?? '').replace(/\s+/g, ' ')
}

async function confirmDisabled(page: Page): Promise<boolean> {
  return confirmButton(page, 'leaps').isDisabled()
}

async function rulerBlocked(page: Page): Promise<string | null> {
  return sheet(page).getByTestId('pmcc-coverage-ruler').getAttribute('data-blocked')
}

const STRIKE_ERROR = 'LEAPS strike must be below the short-call strike ($112.00).'
const EXPIRATION_ERROR = 'LEAPS call must expire after the short call.'

describe('US-105 — Roll the PMCC LEAPS', () => {
  it('The roll form shows the decision context for the open LEAPS', async () => {
    const { page } = await backgroundSheet()

    const current = (label: string): Promise<string> =>
      sectionValue(page, 'leaps', 'Current LEAPS', label)
    expect(await current('Contract')).toBe('XYZ $80.00 CALL')
    expect(await current('Expiration')).toBe(`${LEAPS_EXP} (${dteOf(LEAPS_EXP)} DTE)`)
    expect(await current('Bought at')).toBe('$25.00 / share')
    expect(await current('Cost basis')).toBe('$21.80 / share')
    expect(await current('Effective share cost')).toBe('$101.80')

    const short = (label: string): Promise<string> =>
      sectionValue(page, 'leaps', 'Open short call', label)
    expect(await short('Contract')).toBe('XYZ $112.00 CALL')
    expect(await short('Expiration')).toBe(`${SHORT_EXP} (${dteOf(SHORT_EXP)} DTE)`)

    for (const id of [
      'pmcc-leaps-roll-proceeds',
      'pmcc-leaps-roll-strike',
      'pmcc-leaps-roll-expiration',
      'pmcc-leaps-roll-debit',
      'pmcc-leaps-roll-fill-date'
    ]) {
      expect(await sheet(page).locator(`#${id}`).isVisible()).toBe(true)
    }

    const placeholder = sheet(page).getByText(
      'Enter the proceeds from close and the replacement debit to preview the net.',
      { exact: true }
    )
    expect(await page.getByTestId('pmcc-leaps-roll-net').count()).toBe(0)
    expect(await placeholder.isVisible()).toBe(true)

    // Both cash fields parse: the net replaces the placeholder, so its absence above was real.
    await page.fill('#pmcc-leaps-roll-proceeds', '26.00')
    await page.fill('#pmcc-leaps-roll-debit', '23.50')
    await page.getByTestId('pmcc-leaps-roll-net').waitFor()
    expect(await placeholder.count()).toBe(0)
  })

  it('Net credit preview for a roll up and out', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, UP_OUT)

    expect(await testIdText(page, 'pmcc-leaps-roll-net')).toBe(
      'Net Credit: $2.50 per share ($250.00 total)'
    )
    expect(await testIdText(page, 'pmcc-leaps-roll-label')).toBe(
      `Roll Up & Out: $80 to $85 strike, ${monthYearLabel(LEAPS_EXP)} to ${monthYearLabel(UP_OUT_EXP)} expiration · ${dteOf(UP_OUT_EXP)} DTE`
    )
    const text = await sheetText(page)
    expect(text).toContain('Cost basis after roll$19.30 / share')
    expect(text).toContain('Effective share cost after roll$104.30 (from $101.80)')
    expect(text).toContain('$85.00 strike + $19.30 basis · up $2.50')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Net debit preview for a roll out at the same strike', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '80', debit: '29.20' })

    expect(await testIdText(page, 'pmcc-leaps-roll-net')).toBe(
      'Net Debit: $3.20 per share ($320.00 total)'
    )
    expect(await testIdText(page, 'pmcc-leaps-roll-label')).toBe(
      `Roll Out: same $80 strike, ${monthYearLabel(LEAPS_EXP)} to ${monthYearLabel(UP_OUT_EXP)} expiration · ${dteOf(UP_OUT_EXP)} DTE`
    )
    const text = await sheetText(page)
    expect(text).toContain('Cost basis after roll$25.00 / share')
    expect(text).toContain('Effective share cost after roll$105.00 (from $101.80)')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Recording the roll creates a linked leg pair and one net cost-basis line', async () => {
    const { page, id } = await backgroundSheet()
    const before = await positionDetail(page, id)
    const shortRollChain = before.legs.find((leg) => leg.legRole === 'ROLL_FROM')?.rollChainId
    const openShortId = before.pmccOpenLegs?.short?.id
    expect(shortRollChain).toBeTruthy()
    expect(openShortId).toBeTruthy()

    await fillLeapsRoll(page, UP_OUT)
    await expect.poll(() => confirmDisabled(page)).toBe(false)
    await confirmButton(page, 'leaps').click()
    await sheet(page).waitFor({ state: 'detached' })

    const banner = await testIdText(page, 'pmcc-leaps-roll-recorded-banner')
    expect(banner).toContain('sold to close XYZ $80.00 CALL')
    expect(banner).toContain('bought to open XYZ $85.00 CALL')
    expect(banner).toContain('LEAPS roll #1 credit · $2.50 per share ($250.00 total).')
    expect(banner).toContain(
      'Effective share cost if exercised: $104.30 — the $85.00 strike plus $19.30 basis.'
    )

    const detail = await positionDetail(page, id)
    const rollFrom = detail.legs.find((leg) => leg.legRole === 'ROLL_FROM' && leg.action === 'SELL')
    const rollTo = detail.legs.find((leg) => leg.legRole === 'ROLL_TO' && leg.action === 'BUY')
    expect(rollFrom).toMatchObject({
      strike: '80.0000',
      expiration: LEAPS_EXP,
      premiumPerContract: '26.0000'
    })
    expect(rollTo).toMatchObject({
      strike: '85.0000',
      expiration: UP_OUT_EXP,
      premiumPerContract: '23.5000'
    })
    expect(rollFrom?.rollChainId).toBeTruthy()
    expect(rollTo?.rollChainId).toBe(rollFrom?.rollChainId)
    expect(rollFrom?.rollChainId).not.toBe(shortRollChain)

    expect(detail.pmccLedger?.basisPerShare).toBe('19.3000')
    expect(detail.pmccLedger?.leapsCostPerShare).toBe('22.5000')
    expect(detail.pmccLedger?.effectiveShareCost).toBe('104.3000')
    expect(detail.allSnapshots).toHaveLength(5)
    expect(detail.allSnapshots.at(-1)).toMatchObject({
      triggerEvent: 'PMCC_LEAPS_ROLL',
      basisPerShare: '19.3000'
    })
    expect(detail.pmccOpenLegs?.long.strike).toBe('85.0000')
    expect(detail.pmccOpenLegs?.short).toMatchObject({
      id: openShortId,
      strike: '112.0000',
      expiration: SHORT_EXP
    })

    expect(await cell(page, 'Cost basis / share')).toBe('$19.30')
    expect(await cell(page, 'LEAPS cost to date')).toBe('$22.50')
    expect(await cell(page, 'Effective share cost')).toBe('$104.30')
    expect(await legCardStrike(page, 'Buy LEAPS call')).toBe('$85.00')
    expect(await legCardStrike(page, 'Sell short call')).toBe('$112.00')

    // The positions list row shows the same open legs as the detail page: the replacement
    // LEAPS and the rolled-to short, not the opening $80.00 LEAPS or the rolled-away $108 short.
    await page.evaluate(() => {
      location.hash = '#/'
    })
    const row = positionRows(page).filter({ hasText: 'XYZ' })
    await row.filter({ hasText: '$85.00 / $112.00' }).waitFor()
    const rowText = (await row.textContent()) ?? ''
    expect(rowText).toContain(`LEAPS · ${UP_OUT_EXP}`)
    expect(rowText).toContain(`Short · ${SHORT_EXP}`)
    expect(rowText).not.toContain('$80.00')
    expect(rowText).not.toContain(`LEAPS · ${LEAPS_EXP}`)
  })

  it('Warning when the effective share cost after the roll rises above the open short strike', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '80', expiration: TOO_MUCH_EXP, debit: '37.00' })

    expect(await testIdText(page, 'pmcc-leaps-roll-net')).toBe(
      'Net Debit: $11.00 per share ($1,100.00 total)'
    )
    expect(await testIdText(page, 'pmcc-leaps-roll-warning')).toContain(
      'Open short strike $112.00 is below your effective share cost of $112.80 after this roll. If assigned, covering from the LEAPS realizes roughly $0.80 per share of loss.'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a replacement strike that is not below the open short strike — $112.00', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '112' })

    expect(await fieldError(page, 'pmcc-leaps-roll-strike')).toBe(STRIKE_ERROR)
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    // A strike below the short makes it a valid roll: the disable came from the strike rule.
    await page.fill('#pmcc-leaps-roll-strike', '85')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject a replacement strike that is not below the open short strike — $115.00', async () => {
    const { page, id } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '115' })

    expect(await fieldError(page, 'pmcc-leaps-roll-strike')).toBe(STRIKE_ERROR)
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    const result = await rollLeaps(page, {
      positionId: id,
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newStrike: 115,
      newExpiration: UP_OUT_EXP,
      fillDate: LEAPS_ROLL_FILL_DATE
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ field: 'newStrike', code: 'strike_not_below_short' })
    expect(tableCount(dbPath, 'legs')).toBe(6)
  })

  it("Reject a replacement expiration that would leave the short call uncovered — on the short's expiration", async () => {
    const { page, id } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, expiration: SHORT_EXP, debit: '20.20' })

    expect(await fieldError(page, 'pmcc-leaps-roll-expiration')).toBe(EXPIRATION_ERROR)
    expect(await rulerBlocked(page)).toBe('true')
    expect(
      await sheet(page)
        .getByText(
          `The XYZ $80.00 LEAPS stays open at ${LEAPS_EXP}. No close or replacement leg is recorded.`,
          { exact: true }
        )
        .isVisible()
    ).toBe(true)
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    const result = await rollLeaps(page, {
      positionId: id,
      proceedsPerContract: 26,
      replacementDebitPerContract: 20.2,
      newStrike: 85,
      newExpiration: SHORT_EXP,
      fillDate: LEAPS_ROLL_FILL_DATE
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toEqual({
      field: 'newExpiration',
      code: 'long_not_after_short',
      message: EXPIRATION_ERROR
    })
    expect(tableCount(dbPath, 'legs')).toBe(6)
    const detail = await positionDetail(page, id)
    expect(detail.pmccOpenLegs?.long.strike).toBe('80.0000')
    expect(detail.pmccOpenLegs?.long.expiration).toBe(LEAPS_EXP)
    expect(await snapshots(page, id)).toHaveLength(4)
  })

  it("Reject a replacement expiration that would leave the short call uncovered — before the short's expiration", async () => {
    const { page, id } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, expiration: BEFORE_SHORT_EXP, debit: '20.20' })

    expect(await fieldError(page, 'pmcc-leaps-roll-expiration')).toBe(EXPIRATION_ERROR)
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    const result = await rollLeaps(page, {
      positionId: id,
      proceedsPerContract: 26,
      replacementDebitPerContract: 20.2,
      newStrike: 85,
      newExpiration: BEFORE_SHORT_EXP,
      fillDate: LEAPS_ROLL_FILL_DATE
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toEqual({
      field: 'newExpiration',
      code: 'long_not_after_short',
      message: EXPIRATION_ERROR
    })
    expect(tableCount(dbPath, 'legs')).toBe(6)
  })

  it('Allow a replacement that shortens coverage but still outlasts the short call', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '80', expiration: SHORTENS_EXP, debit: '26.60' })

    expect(await testIdText(page, 'pmcc-leaps-roll-net')).toBe(
      'Net Debit: $0.60 per share ($60.00 total)'
    )
    expect(await testIdText(page, 'pmcc-leaps-roll-coverage-note')).toBe(
      `Replacement LEAPS is ${dteOf(SHORTENS_EXP)} DTE, 28 days shorter than the current LEAPS. It still covers the open short call.`
    )
    expect(await rulerBlocked(page)).toBe('false')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
    expect(await page.getByTestId('pmcc-leaps-roll-warning').count()).toBe(0)

    // The same sheet does warn once the effective cost passes the short strike, so the absence
    // above is the rule's verdict, not a warning that never renders.
    await selectDate(page, '#pmcc-leaps-roll-expiration', TOO_MUCH_EXP)
    await page.fill('#pmcc-leaps-roll-debit', '37.00')
    await page.getByTestId('pmcc-leaps-roll-warning').waitFor()
  })

  it('Reject a roll that changes neither strike nor expiration', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, strike: '80', expiration: LEAPS_EXP, debit: '26.00' })

    expect(await testIdText(page, 'pmcc-leaps-roll-no-change')).toBe(
      'Roll must change the strike, the expiration, or both'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    // Changing the strike alone makes it a roll: the disable came from the no-change rule.
    await page.fill('#pmcc-leaps-roll-strike', '85')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject non-positive proceeds from close', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, proceeds: '0.00' })

    expect(await fieldError(page, 'pmcc-leaps-roll-proceeds')).toBe(
      'Proceeds from close must be greater than zero'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    await page.fill('#pmcc-leaps-roll-proceeds', '26.00')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Reject non-positive replacement debit', async () => {
    const { page } = await backgroundSheet()
    await fillLeapsRoll(page, { ...UP_OUT, debit: '0.00' })

    expect(await fieldError(page, 'pmcc-leaps-roll-debit')).toBe(
      'Replacement debit must be greater than zero'
    )
    await expect.poll(() => confirmDisabled(page)).toBe(true)

    await page.fill('#pmcc-leaps-roll-debit', '23.50')
    await expect.poll(() => confirmDisabled(page)).toBe(false)
  })

  it('Roll the LEAPS while no short call is open', async () => {
    const page = await launch()
    const id = await reachXyzNoShort(page)

    // The LEAPS button renders, so the detail is loaded — the short button is absent, not pending.
    expect(await rollLeapsButton(page).isVisible()).toBe(true)
    expect(await rollButton(page).count()).toBe(0)

    await openRollLeapsSheet(page)
    const text = await sheetText(page)
    expect(text).toContain('No short call open')
    const shortLegend = sheet(page)
      .getByTestId('pmcc-coverage-ruler')
      .locator('div:has(> span:text-is("Open short call")) > span:nth-child(3)')
    expect(((await shortLegend.textContent()) ?? '').trim()).toBe('none')

    // A strike the strike-ordering check would reject with a short open, expiring the day after
    // the fill — the soonest replacement the expires-after-fill rule allows.
    await fillLeapsRoll(page, {
      proceeds: '26.00',
      strike: '112',
      expiration: localDate(97),
      debit: '23.50',
      fillDate: NO_SHORT_ROLL_FILL_DATE
    })
    await expect.poll(() => confirmDisabled(page)).toBe(false)
    expect(await sheet(page).getByRole('alert').count()).toBe(0)

    await page.fill('#pmcc-leaps-roll-strike', '85')
    await selectDate(page, '#pmcc-leaps-roll-expiration', UP_OUT_EXP)
    await expect.poll(() => confirmDisabled(page)).toBe(false)
    await confirmButton(page, 'leaps').click()
    await sheet(page).waitFor({ state: 'detached' })

    const detail = await positionDetail(page, id)
    expect(detail.pmccLedger?.basisPerShare).toBe('19.3000')
    expect(detail.pmccOpenLegs?.short).toBeNull()
    expect(detail.pmccOpenLegs?.long.strike).toBe('85.0000')
    expect(detail.allSnapshots).toHaveLength(6)
    expect(detail.allSnapshots.at(-1)?.triggerEvent).toBe('PMCC_LEAPS_ROLL')
  })

  it('Leave a classic wheel unaffected', async () => {
    const page = await launch()
    await reachCcOpenState(page, '185', '2.50', localDate(30))

    const rollCcButton = page.getByTestId('roll-cc-btn')
    expect(await rollCcButton.isVisible()).toBe(true)
    expect(await rollLeapsButton(page).count()).toBe(0)
    expect(await rollButton(page).count()).toBe(0)

    await rollCcButton.click()
    await page.waitForSelector('text=Roll Covered Call')
    // The CC sheet has no dialog role: read the portalled overlay that holds the scrim.
    const overlay = page.getByTestId('sheet-scrim').locator('xpath=..')
    const text = (await overlay.textContent()) ?? ''
    expect(text).toContain('Roll Covered Call')
    expect(text).not.toContain('Effective share cost')
    expect(text).not.toContain('LEAPS')
    expect(text).not.toContain('Roll LEAPS')
    expect(await sheet(page).count()).toBe(0)
  })
})
