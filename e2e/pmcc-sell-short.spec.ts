// [US-115] Sell a subsequent short call against an open LEAPS — one `it` per acceptance scenario
// and Scenario Outline row (Linear OPT-23). Every PMCC is seeded through
// `_test:pmcc-seed-position` as US-109's XYZ Background with cycle 9 removed (or a patch over it),
// every date shifted so that the story's 2027-07-23 is today in New York. Money and day counts
// are the story's literals; displayed dates go through `shift`. Literals: plans/us-115/plan.md § 15.
import { format, parseISO } from 'date-fns'
import type { Page } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import { reachHoldingSharesState } from './helpers'
import {
  invokedIpcChannels,
  spyOnIpcChannels,
  sqlite,
  tableCount,
  typeAndBlur,
  pickDate
} from './pmcc-helpers'
import { cell, snapshots } from './pmcc-ledger-helpers'
import { fieldError, positionDetail, testIdText } from './pmcc-roll-helpers'
import { cardFor } from './position-card-helpers'
import {
  BELOW_LINE_SYMBOL,
  NEAR_INSIDE_SYMBOL,
  SECOND_LEAPS_ROLL,
  TARGET_SYMBOL,
  type SellShortApp,
  directSell,
  disposeSellShort,
  enterManually,
  enterPrice,
  enterTargetSale,
  headerBadge,
  launchSellShort,
  leapsReference,
  openSellSheet,
  pickContract,
  recordButton,
  recordSale,
  salePayload,
  seedLeapsOnly,
  seedNearLeaps,
  seedXyzShifted,
  sellButton,
  sellSheet,
  shift,
  today
} from './pmcc-sell-short-helpers'
import {
  VARIANTS,
  expandLegTimeline,
  gapRows,
  openDetail,
  readCycle,
  textOf
} from './pmcc-timeline-helpers'

afterEach(async () => {
  await disposeSellShort()
})

type Harness = SellShortApp & { id: string }

/** Launches, seeds the LEAPS-only Background with `variant` and opens its detail page. */
async function leapsOnlyDetail(
  variant: Parameters<typeof seedLeapsOnly>[1] = {},
  launch: Parameters<typeof launchSellShort>[0] = {}
): Promise<Harness> {
  const harness = await launchSellShort(launch)
  const id = await seedLeapsOnly(harness.page, variant)
  await openDetail(harness.page, id)
  return { ...harness, id }
}

/** The LEAPS-only detail with the Sell Short Call sheet open. */
async function sellSheetOpen(launch: Parameters<typeof launchSellShort>[0] = {}): Promise<Harness> {
  const harness = await leapsOnlyDetail({}, launch)
  await openSellSheet(harness.page)
  return harness
}

const recordDisabled = (page: Page): Promise<boolean> => recordButton(page).isDisabled()

/** `legs` and `cost_basis_snapshots` row counts, straight from SQLite. */
const rowCounts = (dbPath: string): { legs: number; snapshots: number } => ({
  legs: tableCount(dbPath, 'legs'),
  snapshots: tableCount(dbPath, 'cost_basis_snapshots')
})

/** `Aug 20, 2027` — the date as the chain picker names it. */
const pickerDate = (iso: string): string => format(parseISO(iso), 'MMM d, yyyy')

/** The chain picker's offered contracts (its option values), placeholder excluded. */
async function offeredContracts(page: Page): Promise<string[]> {
  return sellSheet(page)
    .locator('#short-contract option:not([value=""])')
    .evaluateAll((options) => options.map((option) => option.getAttribute('value') ?? ''))
}

describe('US-115 — Sell a subsequent short call against an open LEAPS', () => {
  it('Sell the next short call', async () => {
    const { app, page, dbPath, id } = await sellSheetOpen()
    const before = rowCounts(dbPath)
    await spyOnIpcChannels(app)

    await enterTargetSale(page)
    await recordSale(page)
    expect(await sellSheet(page).getByText('PMCC updated', { exact: true }).count()).toBe(1)
    expect(await sellSheet(page).getByText('Cycle 9 opened', { exact: true }).count()).toBe(1)
    await sellSheet(page).getByRole('button', { name: 'Done' }).click()
    await sellSheet(page).waitFor({ state: 'detached' })

    await expect.poll(() => textOf(headerBadge(page))).toBe('LEAPS + short call open')
    await expect.poll(() => cell(page, 'Cost basis / share')).toBe('$6.55')
    expect(await cell(page, 'Effective share cost')).toBe('$91.55')
    expect(await cell(page, 'Premium recovered')).toBe('70.9%')

    await expandLegTimeline(page)
    expect((await readCycle(page, 9)).copy).toBe(
      `$118.00 call · sold ${today()} at 28 DTE · 0 days so far`
    )
    const gap = gapRows(page).filter({ hasText: `${shift('2027-07-16')} to` })
    expect(await textOf(gap)).toBe(
      `Uncovered · 7 days · ${shift('2027-07-16')} to ${today()} — no short call open against the LEAPS`
    )

    expect(rowCounts(dbPath)).toEqual({ legs: before.legs + 1, snapshots: before.snapshots + 1 })
    const detail = await positionDetail(page, id)
    expect(detail.legs.filter((leg) => leg.fillDate === today())).toEqual([
      expect.objectContaining({ legRole: 'SHORT_CALL_OPEN', strike: '118.0000', contracts: 1 })
    ])
    expect(await snapshots(page, id)).toEqual([
      expect.objectContaining({ triggerEvent: 'PMCC_SHORT_OPEN', basisPerShare: '6.5500' })
    ])

    const channels = await invokedIpcChannels(app)
    // The spy is live: the sale itself went through it.
    expect(channels).toContain('positions:sell-pmcc-short')
    expect(channels.filter((c) => c.startsWith('broker:'))).toEqual([])
  })

  it("The sheet shows the LEAPS as coverage context and the previous cycle's outcome", async () => {
    const { page } = await sellSheetOpen()

    expect(await sellSheet(page).getByText('SELL SHORT CALL', { exact: true }).count()).toBe(1)
    expect(
      await sellSheet(page).getByText('XYZ · against $85.00 LEAPS', { exact: true }).count()
    ).toBe(1)
    const coverage = page.getByTestId('pmcc-sell-short-coverage').locator(':scope > span')
    await expect
      .poll(() => coverage.allTextContents())
      .toEqual([
        `$85.00 · ${shift('2028-01-21')} · 182 DTE · Δ 0.81`,
        `Cycle 8 expired worthless ${shift('2027-07-16')} · 7 days uncovered`
      ])

    await pickContract(page, TARGET_SYMBOL())
    expect(await offeredContracts(page)).toEqual([TARGET_SYMBOL(), BELOW_LINE_SYMBOL()])
    expect(await sellSheet(page).locator(`option[value="${TARGET_SYMBOL()}"]`).textContent()).toBe(
      `${pickerDate(shift('2027-08-20'))} · $118.00 · 28 DTE · Δ 0.30 · mid $1.95`
    )
    expect(
      await sellSheet(page)
        .getByText(
          `XYZ calls before ${shift('2028-01-21')}, strikes above $85.00 · 20–45 DTE · Δ 0.25–0.35`,
          { exact: true }
        )
        .count()
    ).toBe(1)

    // A LEAPS 35 days out ends the window: its 42-DTE call is gone, the 28-DTE one stays.
    await sellSheet(page).getByRole('button', { name: 'Cancel' }).click()
    await sellSheet(page).waitFor({ state: 'detached' })
    await openDetail(page, await seedNearLeaps(page))
    await openSellSheet(page)
    await pickContract(page, NEAR_INSIDE_SYMBOL())
    expect(await offeredContracts(page)).toEqual([NEAR_INSIDE_SYMBOL()])
  })

  it('The preview shows the cash and the new guardrails before confirming', async () => {
    const { page } = await sellSheetOpen()
    await enterTargetSale(page)

    await expect
      .poll(() => testIdText(page, 'pmcc-sell-short-credit'))
      .toBe('Credit $195.00 · 28 DTE')
    expect(await testIdText(page, 'pmcc-sell-short-basis')).toBe(
      'Cost basis after: $6.55 / share (from $8.50)'
    )
    expect(await testIdText(page, 'pmcc-sell-short-effective')).toBe(
      'Effective share cost after: $91.55 (from $93.50)'
    )
    expect(await testIdText(page, 'pmcc-sell-short-recovered')).toBe(
      'Premium recovered after: 70.9% (from 62.2%)'
    )
    const strikeLine = page.getByTestId('pmcc-sell-short-strike-line')
    await expect
      .poll(() => textOf(strikeLine))
      .toBe('Strike $118.00 is +$26.45 above your effective share cost')
    expect(await strikeLine.getAttribute('class')).toContain('text-wb-green')
  })

  it('Warn when the strike is below the effective share cost', async () => {
    const { page } = await sellSheetOpen({ xyzPrice: '86.50' })
    await pickContract(page, BELOW_LINE_SYMBOL())
    await enterPrice(page, '1.50')

    await expect
      .poll(() => testIdText(page, 'pmcc-sell-short-credit'))
      .toBe('Credit $150.00 · 28 DTE')
    expect(await testIdText(page, 'pmcc-sell-short-effective')).toBe(
      'Effective share cost after: $92.00 (from $93.50)'
    )
    await expect
      .poll(() => testIdText(page, 'pmcc-sell-short-warning'))
      .toBe(
        'Short strike $90.00 is below your effective share cost of $92.00 after this sale. If assigned, covering from the LEAPS realizes roughly $2.00 per share of loss. You can still record it.'
      )
    expect(await page.getByTestId('pmcc-sell-short-warning').getAttribute('style')).toContain(
      'var(--wb-gold)'
    )
    expect(await page.getByTestId('pmcc-sell-short-strike-line').count()).toBe(0)
    expect(await recordDisabled(page)).toBe(false)
  })

  const SHAPE_ROWS = [
    {
      strike: '118.00',
      expiration: '2028-01-21',
      field: 'expiration',
      control: 'short-expiration',
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    },
    {
      strike: '118.00',
      expiration: '2028-02-18',
      field: 'expiration',
      control: 'short-expiration',
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    },
    {
      strike: '85.00',
      expiration: '2027-08-20',
      field: 'strike',
      control: 'short-strike',
      code: 'strike_not_above_long',
      message: 'Short-call strike must be above the LEAPS strike.'
    },
    {
      strike: '80.00',
      expiration: '2027-08-20',
      field: 'strike',
      control: 'short-strike',
      code: 'strike_not_above_long',
      message: 'Short-call strike must be above the LEAPS strike.'
    }
  ]

  it.each(SHAPE_ROWS)(
    'Reject a short call that breaks the PMCC shape: $strike · $expiration',
    async ({ strike, expiration, field, control, code, message }) => {
      const { page, dbPath, id } = await sellSheetOpen()
      const before = rowCounts(dbPath)
      await enterManually(page, { strike, expiration })
      await enterPrice(page, '1.95')

      await expect.poll(() => fieldError(page, control)).toBe(message)
      expect(await recordDisabled(page)).toBe(true)
      expect(await page.inputValue('#short-fill')).toBe('1.95')
      expect(await page.inputValue('#short-fees')).toBe('0.00')
      expect(await textOf(page.locator('#short-fill-date'))).toBe(today())

      const result = await directSell(
        page,
        salePayload(id, { strike: Number(strike), expiration: shift(expiration) })
      )
      expect(result).toEqual({ ok: false, errors: [{ field, code, message }] })
      expect(rowCounts(dbPath)).toEqual(before)
      expect(await textOf(headerBadge(page))).toBe('LEAPS open · no short call')
    }
  )

  it('Reject a bypassed short call that would outlast the LEAPS without a partial record', async () => {
    const { page, dbPath } = await launchSellShort()
    const id = await seedLeapsOnly(page, SECOND_LEAPS_ROLL)
    const before = rowCounts(dbPath)

    const result = await directSell(page, salePayload(id, { expiration: shift('2028-06-16') }))

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'expiration',
          code: 'short_not_before_long',
          message: 'Short call must expire before the LEAPS call.'
        }
      ]
    })
    expect(rowCounts(dbPath)).toEqual(before)
    await openDetail(page, id)
    expect(await textOf(headerBadge(page))).toBe('LEAPS open · no short call')
    expect(await leapsReference(page, 'Strike')).toBe('$85.00')
    expect(await leapsReference(page, 'Expiration')).toBe(shift('2028-06-16'))
  })

  const INVALID_ROWS = [
    {
      field: 'price',
      value: '0.00',
      control: 'short-fill',
      apply: (page: Page) => typeAndBlur(page, '#short-fill', '0.00'),
      message: () => 'Actual fill price must be greater than zero.'
    },
    {
      field: 'contracts',
      value: '0',
      control: 'sell-short-contracts',
      apply: (page: Page) => typeAndBlur(page, '#sell-short-contracts', '0'),
      message: () => 'Contracts must be a positive whole number.'
    },
    {
      field: 'contracts',
      value: '2',
      control: 'sell-short-contracts',
      apply: (page: Page) => typeAndBlur(page, '#sell-short-contracts', '2'),
      message: () => 'Cannot sell more short calls than LEAPS contracts held (1).'
    },
    {
      field: 'fill date',
      value: '2027-07-24',
      control: 'short-fill-date',
      apply: (page: Page) => pickDate(page, '#short-fill-date', shift('2027-07-24')),
      message: () => 'Fill date cannot be in the future.'
    },
    {
      field: 'fill date',
      value: '2027-07-15',
      control: 'short-fill-date',
      apply: (page: Page) => pickDate(page, '#short-fill-date', shift('2027-07-15')),
      message: () =>
        `Fill date cannot be before the previous short call was retired (${shift('2027-07-16')}).`
    },
    {
      field: 'expiration',
      value: '2027-07-23',
      control: 'short-expiration',
      apply: (page: Page) => enterManually(page, { strike: '118.00', expiration: '2027-07-23' }),
      message: () => 'Expiration must be after the fill date.'
    }
  ]

  it.each(INVALID_ROWS)(
    'Reject invalid entry: $field $value',
    async ({ control, apply, message }) => {
      const { page } = await sellSheetOpen()
      await enterTargetSale(page)
      // The valid sale shows no error, so only the invalid change below can raise one.
      await expect.poll(() => recordDisabled(page)).toBe(false)
      expect(await sellSheet(page).getByRole('alert').count()).toBe(0)

      await apply(page)

      await expect.poll(() => fieldError(page, control)).toBe(message())
      expect(await recordDisabled(page)).toBe(true)
    }
  )

  it('Partial coverage is allowed and stated', async () => {
    const { page, id } = await leapsOnlyDetail(VARIANTS.threeContracts)
    await openSellSheet(page)
    expect(await page.inputValue('#sell-short-contracts')).toBe('3')

    await typeAndBlur(page, '#sell-short-contracts', '1')
    await enterTargetSale(page)
    await expect
      .poll(() => testIdText(page, 'pmcc-sell-short-uncovered'))
      .toBe(
        '2 LEAPS contracts remain uncovered. Only one short call can be open at a time, so they stay uncovered until this one is retired.'
      )
    await recordSale(page)
    await sellSheet(page).getByRole('button', { name: 'Done' }).click()
    await sellSheet(page).waitFor({ state: 'detached' })

    const detail = await positionDetail(page, id)
    expect(detail.legs.filter((leg) => leg.fillDate === today())).toEqual([
      expect.objectContaining({ legRole: 'SHORT_CALL_OPEN', contracts: 1 })
    ])
    await expect
      .poll(() => textOf(headerBadge(page)))
      .toBe('LEAPS + short call open · 1 of 3 covered')
    expect(await sellButton(page).count()).toBe(0)

    await page.evaluate(() => {
      location.hash = '#/'
    })
    const card = cardFor(page, 'XYZ')
    await card.waitFor()
    expect(
      await card.getByText('LEAPS + short call open · 1 of 3 covered', { exact: true }).count()
    ).toBe(1)
  })

  it('Reject when a short call is already open', async () => {
    const { page, dbPath } = await launchSellShort()
    const id = await seedXyzShifted(page, VARIANTS.background)
    await openDetail(page, id)
    // Positive control: the open short's own action renders where Sell Short Call would.
    await page.getByTestId('roll-pmcc-short-btn').waitFor()
    expect(await sellButton(page).count()).toBe(0)
    const before = rowCounts(dbPath)

    const result = await directSell(page, salePayload(id))

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: '__root__',
          code: 'short_call_already_open',
          message: 'This PMCC already has an open short call — roll it instead.'
        }
      ]
    })
    expect(rowCounts(dbPath)).toEqual(before)
  })

  it('Continue when market data cannot supply the picker', async () => {
    const { page } = await sellSheetOpen({ env: { FAKE_MARKET_DATA_ERROR: 'unknown' } })
    const notice = 'Quotes unavailable. Enter your filled trade manually.'
    // The chain query retries before it reports the failure.
    const box = sellSheet(page).getByRole('status').filter({ hasText: notice })
    await box.waitFor({ timeout: 20_000 })
    expect(await textOf(box)).toBe(notice)

    await enterManually(page, { strike: '85.00', expiration: '2027-08-20' })
    await enterPrice(page, '1.95')
    await expect
      .poll(() => fieldError(page, 'short-strike'))
      .toBe('Short-call strike must be above the LEAPS strike.')

    await typeAndBlur(page, '#short-strike', '118.00')
    await recordSale(page)
    await sellSheet(page).getByRole('button', { name: 'Done' }).click()
    await sellSheet(page).waitFor({ state: 'detached' })
    await expect.poll(() => textOf(headerBadge(page))).toBe('LEAPS + short call open')
  })

  it('A failed save leaves the position LEAPS-only', async () => {
    const { page, dbPath } = await sellSheetOpen()
    const before = rowCounts(dbPath)
    sqlite(
      dbPath,
      `CREATE TRIGGER fail_snapshot BEFORE INSERT ON cost_basis_snapshots
       BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`
    )
    await enterTargetSale(page)

    await recordButton(page).click()

    const alert = page.getByTestId('pmcc-sell-short-save-error')
    await alert.waitFor()
    expect(await textOf(alert)).toBe(
      'Could not record the short call. Your entries are preserved. Try again.'
    )
    expect(await page.inputValue('#short-strike')).toBe('118.00')
    expect(await page.inputValue('#short-expiration')).toBe(shift('2027-08-20'))
    expect(await page.inputValue('#short-fill')).toBe('1.95')
    expect(await textOf(page.locator('#short-fill-date'))).toBe(today())
    expect(rowCounts(dbPath)).toEqual({ legs: before.legs, snapshots: 0 })

    await sellSheet(page).getByRole('button', { name: 'Cancel' }).click()
    await sellSheet(page).waitFor({ state: 'detached' })
    expect(await cell(page, 'Cost basis / share')).toBe('$8.50')
    expect(await textOf(headerBadge(page))).toBe('LEAPS open · no short call')
  })

  it('The wheel is unchanged', async () => {
    const { page } = await launchSellShort()
    await reachHoldingSharesState(page)

    await page.getByTestId('open-covered-call-btn').waitFor()
    expect(await textOf(page.getByTestId('open-covered-call-btn'))).toBe('Open Covered Call →')
    expect(await sellButton(page).count()).toBe(0)
    const detail = page.getByTestId('position-detail')
    expect(await detail.getByText('Coverage', { exact: true }).count()).toBe(0)
    expect(await page.getByText('Effective share cost').count()).toBe(0)
    expect(await page.getByText(/LEAPS/).count()).toBe(0)
  })
})
