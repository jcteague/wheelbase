// [US-18] Position cards on the dashboard — E2E tests, one per acceptance scenario (OPT-30),
// with each Scenario Outline example as its own named test.
//
// Every test launches with the Background's quotes and snapshots, seeds its four wheels, runs
// the real alert-evaluation job and views the dashboard. Expirations are run-day relative, so
// a scenario's DTE is exact and its calendar date is whatever that DTE lands on.
import { afterEach, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { AAPL_PUT_180, cleanupDb, makeOpasn, runDetectionNow, seedCsp } from './assignment-helpers'
import { cspAtDte, dismissAlertViaQueue } from './alert-helpers'
import { localDate, localToday } from './dates'
import { reloadPositionsList } from './helpers'
import { createXyzPmcc } from './pmcc-ledger-helpers'
import {
  ACTIVE_CARD,
  cardBoxes,
  cardFor,
  classOf,
  dteOf,
  footerText,
  launchBackground,
  legCells,
  legOf,
  markerCounts,
  pnlLines,
  pnlLinesIn,
  priceLines,
  ruleCodesFor,
  stripChip,
  stripLine,
  viewDashboard,
  type BackgroundOptions,
  type CardsHarness,
  type OptionQuote
} from './position-card-helpers'

const POLL = { timeout: 15_000 }

const MANAGEMENT_WINDOW_10 = '◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close'
const EXPIRING_4 = '◷ EXPIRING · Expires in 4 days at $430.00 strike'
const CALL_BREACHED =
  '▲ CALL BREACHED · Stock is 1.2% above the $430.00 call strike — shares may be called away'

/** MSFT at $1.25 × $1.35: ($2.80 − $1.30) / $2.80 = 53.6% reaches the 50% target. */
const MSFT_AT_TARGET: OptionQuote = ['1.25', '1.35', '1.30']

let harness: CardsHarness | undefined

async function start(label: string, options: BackgroundOptions = {}): Promise<CardsHarness> {
  harness = await launchBackground(label, options)
  return harness
}

afterEach(async () => {
  await harness?.app.close()
  if (harness) cleanupDb(harness.dbPath)
  harness = undefined
})

/** Positive control for S19/S21: MSFT at 4 DTE and at its target carries all three markers. */
async function expectMsftMarkersRender(page: Page): Promise<void> {
  await expect
    .poll(() => markerCounts(cardFor(page, 'MSFT')), POLL)
    .toEqual({ strip: 1, badge: 1, flag: 1 })
}

describe('US-18: position cards', () => {
  it('S1: the dashboard is one card grid, not a table', async () => {
    const { app, page } = await start('s1')
    await viewDashboard(page)

    expect(await page.locator(ACTIVE_CARD).count()).toBe(3)
    expect(await page.$('thead')).toBeNull()
    expect(await page.$('table')).toBeNull()

    // Wide window: the first two cards share a row.
    const [first, second] = await cardBoxes(page)
    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThan(first.x)

    // Narrow window: one column — every card at the same x, each below the last.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(480, 960)
    })
    await expect
      .poll(async () => new Set((await cardBoxes(page)).map((b) => b.x)).size, POLL)
      .toBe(1)
    const narrow = await cardBoxes(page)
    expect(narrow[1].y).toBeGreaterThan(narrow[0].y)
    expect(narrow[2].y).toBeGreaterThan(narrow[1].y)
    // …and each card shrinks to fit the grid rather than overflowing its right edge.
    const grid = await page.locator(ACTIVE_CARD).first().locator('..').boundingBox()
    const widestRight = Math.max(...narrow.map((b) => b.x + b.width))
    expect(widestRight).toBeLessThanOrEqual(grid!.x + grid!.width + 1)

    // The Closed section holds the muted TSLA card beneath the active cards.
    const closed = page.getByTestId('position-card-closed')
    expect(await closed.count()).toBe(1)
    expect(await closed.getByTestId('position-ticker').textContent()).toBe('TSLA')
    expect(await classOf(closed)).toContain('opacity-50')
    const header = await page.getByText('Closed', { exact: true }).boundingBox()
    const closedBox = await closed.boundingBox()
    const lastActive = narrow[2]
    expect(header!.y).toBeGreaterThanOrEqual(lastActive.y + lastActive.height)
    expect(closedBox!.y).toBeGreaterThan(header!.y)
  })

  it('S2: the card header names the position, its phase and its live price', async () => {
    const { page, ids } = await start('s2')
    await viewDashboard(page)
    const card = cardFor(page, 'AAPL')

    await expect.poll(async () => (await priceLines(card, 'AAPL'))[0], POLL).toBe('$182.45')
    expect((await priceLines(card, 'AAPL')).at(-1)).toBe('30d to expiration')
    expect(await card.getByTestId('position-ticker').textContent()).toBe('AAPL')
    expect(await card.getByText('CSP Open', { exact: true }).count()).toBe(1)

    const open = card.getByRole('link', { name: 'Open ↗' })
    expect(await open.getAttribute('href')).toBe(`#/positions/${ids.AAPL}`)
    const openBox = await open.boundingBox()
    const priceBox = await card.getByTestId('position-card-AAPL-price').boundingBox()
    expect(openBox!.x).toBeGreaterThan(priceBox!.x + priceBox!.width)

    expect(await card.getAttribute('data-edge')).toBe('CSP_OPEN')
    expect(await classOf(card)).toContain('border-l-wb-gold')
  })

  it("S3: unrealized P&L is the card's big figure with its share of max profit", async () => {
    const { page } = await start('s3')
    await viewDashboard(page)

    await expect
      .poll(() => pnlLinesIn(cardFor(page, 'AAPL'), 'AAPL', 'text-wb-green'), POLL)
      .toEqual(['+$90.00', '+25.7% of max profit'])
    await expect
      .poll(() => pnlLinesIn(cardFor(page, 'MSFT'), 'MSFT', 'text-wb-green'), POLL)
      .toEqual(['+$100.00', '+35.7% of max profit'])
  })

  it('S4: unrealized P&L is red when the option has gained value', async () => {
    const { page } = await start('s4', { aaplPut: ['5.10', '5.30', '5.20'] })
    await viewDashboard(page)
    const card = cardFor(page, 'AAPL')

    await expect
      .poll(() => pnlLinesIn(card, 'AAPL', 'text-wb-red'), POLL)
      .toEqual(['-$170.00', '-48.6% of max profit'])
    expect(await pnlLinesIn(card, 'AAPL', 'text-wb-green')).toEqual([])
  })

  it('S5: the leg block shows the open option', async () => {
    const { page, aaplExpiration, msftExpiration } = await start('s5')
    await viewDashboard(page)
    const aapl = legOf(cardFor(page, 'AAPL'))
    const msft = legOf(cardFor(page, 'MSFT'))

    await expect
      .poll(() => legCells(aapl), POLL)
      .toEqual(['P', `$180.00 put · ${aaplExpiration}`, '30d', '$2.60 · $3.50 credit'])
    expect(await aapl.locator('span').first().getAttribute('title')).toBe('Cash-secured put')

    // The ◷ before the title is S11's management-window mark: MSFT is 10 DTE.
    await expect
      .poll(() => legCells(msft), POLL)
      .toEqual(['C', `◷$430.00 call · ${msftExpiration}`, '10d', '$1.80 · $2.80 credit'])
    expect(await msft.locator('span').first().getAttribute('title')).toBe('Covered call')
  })

  it('S6: a position holding shares shows a placeholder leg and no P&L', async () => {
    const { page } = await start('s6')
    await viewDashboard(page)
    const card = cardFor(page, 'NVDA')

    await expect.poll(async () => (await priceLines(card, 'NVDA'))[0], POLL).toBe('$128.30')
    expect((await priceLines(card, 'NVDA')).at(-1)).toBe('shares held · no option leg')
    expect(await legCells(legOf(card))).toEqual([
      '·',
      'no option leg open — sell a covered call',
      '—',
      '—'
    ])
    expect(await pnlLines(card, 'NVDA')).toEqual(['—', 'no option leg open'])
  })

  it('S7: the TARGET badge fires when the leg reaches the profit target', async () => {
    // AMD: a 40-DTE put at the target, outside the management window, so its only queue row
    // is PROFIT_TARGET.
    const amd = { ...cspAtDte('AMD', 100, 40), premiumPerContract: 3.5 }
    const { page } = await start('s7', {
      msftCall: MSFT_AT_TARGET,
      prices: { AMD: '105.00' },
      extraSnapshots: { [amd.occSymbol]: ['1.25', '1.35', '1.30'] }
    })
    await seedCsp(page, amd)
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')
    const amdCard = cardFor(page, 'AMD')

    const badge = msft.getByTestId('target-badge')
    await expect.poll(() => badge.count(), POLL).toBe(1)
    const tooltip = await badge.getAttribute('title')
    expect(tooltip).toContain('53.6%')
    expect(tooltip).toContain('target is 50%')
    expect(await cardFor(page, 'AAPL').getByTestId('target-badge').count()).toBe(0)

    // The profit target is a queue row on both, yet neither strip carries it.
    expect(await ruleCodesFor(page, 'MSFT')).toEqual(['MANAGEMENT_WINDOW', 'PROFIT_TARGET'])
    expect(await ruleCodesFor(page, 'AMD')).toEqual(['PROFIT_TARGET'])
    await expect.poll(() => amdCard.getByTestId('target-badge').count(), POLL).toBe(1)
    expect(await amdCard.getByTestId('action-strip').count()).toBe(0)
    expect(await amdCard.getAttribute('data-edge')).toBe('CSP_OPEN')
    expect(await stripLine(msft)).toBe(MANAGEMENT_WINDOW_10)
    expect(await stripChip(msft).count()).toBe(0)
  })

  it('S8: DTE inside 7 days is gold with the Expiring-soon flag', async () => {
    const { page } = await start('s8', { msftDte: 4 })
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')
    const aapl = cardFor(page, 'AAPL')

    expect(await dteOf(msft).textContent()).toBe('4d')
    expect(await classOf(dteOf(msft))).toContain('text-wb-gold')
    expect(await msft.getByTestId('expiring-soon-flag').textContent()).toBe('Expiring soon')

    expect(await dteOf(aapl).textContent()).toBe('30d')
    expect(await classOf(dteOf(aapl))).not.toContain('text-wb-gold')
    expect(await aapl.getByTestId('expiring-soon-flag').count()).toBe(0)
  })

  it('S9: a wide spread marks the mid and an unavailable snapshot blanks it', async () => {
    const { page } = await start('s9', { aaplPut: ['0.50', '1.50', '1.00'], msftCall: null })
    await viewDashboard(page)
    const aapl = cardFor(page, 'AAPL')
    const msft = cardFor(page, 'MSFT')

    const warning = aapl.getByTestId('opt-mid-spread-warning')
    await expect.poll(() => warning.count(), POLL).toBe(1)
    expect(await aapl.getByTestId('position-card-AAPL-opt-mid').textContent()).toBe('$1.00⚠')
    expect(await warning.getAttribute('title')).toBe(
      'Wide spread: $0.50 × $1.50 — P&L may be unreliable'
    )

    expect(await msft.getByTestId('position-card-MSFT-opt-mid').textContent()).toBe('— unavailable')
    expect(await pnlLines(msft, 'MSFT')).toEqual(['—', 'unavailable'])
    expect(await footerText(msft)).toBe('Cost basis$402.40/ sharePremium collected$760.00to date')
  })

  it('S10: the footer shows the two ledger figures', async () => {
    const { page } = await start('s10')
    await viewDashboard(page)

    expect(await footerText(cardFor(page, 'AAPL'))).toBe(
      'Cost basis$176.50/ sharePremium collected$350.00to date'
    )
    expect(await footerText(cardFor(page, 'NVDA'))).toBe(
      'Cost basis$118.60/ sharePremium collected$640.00to date'
    )
  })

  it('S11: the management-window row rides on the card as a gold action strip', async () => {
    const { page } = await start('s11')
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')
    const aapl = cardFor(page, 'AAPL')

    await expect.poll(() => stripLine(msft), POLL).toBe(MANAGEMENT_WINDOW_10)
    expect(await msft.getByTestId('action-strip').getAttribute('data-tone')).toBe('gold')

    const leg = legOf(msft)
    expect(await leg.getAttribute('data-action')).toBe('gold')
    expect(await classOf(leg)).toContain('bg-wb-gold-dim')
    expect(await classOf(leg)).toContain('border-l-wb-gold')
    expect(await leg.getByTitle(MANAGEMENT_WINDOW_10, { exact: true }).textContent()).toBe('◷')

    expect(await msft.getAttribute('data-edge')).toBe('gold')
    expect(await classOf(msft)).toContain('border-l-wb-gold')
    expect(await classOf(msft)).not.toContain('border-l-wb-violet')

    expect(await aapl.getByTestId('action-strip').count()).toBe(0)
    expect(await legOf(aapl).getAttribute('data-action')).toBeNull()
    expect(await aapl.getAttribute('data-edge')).toBe('CSP_OPEN')
  })

  it('S12: the expiration-imminent row leads as EXPIRING', async () => {
    const { page } = await start('s12', { msftDte: 4 })
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')

    await expect.poll(() => stripLine(msft), POLL).toBe(EXPIRING_4)
    expect(await msft.getByTestId('action-strip').getAttribute('data-tone')).toBe('gold')
    expect(await stripChip(msft).count()).toBe(0)
    expect(await ruleCodesFor(page, 'MSFT')).toEqual(['EXPIRATION_IMMINENT'])
  })

  it('S13a: strike proximity on a put leads as ▲ STRIKE PROXIMITY — gold at $181.40', async () => {
    const { page } = await start('s13a', { prices: { AAPL: '181.40' } })
    await viewDashboard(page)
    const aapl = cardFor(page, 'AAPL')
    const line = '▲ STRIKE PROXIMITY · Stock is 0.8% above the $180.00 put strike'

    await expect.poll(() => stripLine(aapl), POLL).toBe(line)
    await expect
      .poll(() => aapl.getByTestId('action-strip').getAttribute('data-tone'), POLL)
      .toBe('gold')
    expect(await legOf(aapl).getAttribute('data-action')).toBe('gold')
    expect(await legOf(aapl).getByTitle(line, { exact: true }).textContent()).toBe('▲')
    expect(await aapl.getAttribute('data-edge')).toBe('gold')
  })

  it('S13b: strike proximity on a put leads as ▲ STRIKE PROXIMITY — red at $178.90', async () => {
    const { page } = await start('s13b', { prices: { AAPL: '178.90' } })
    await viewDashboard(page)
    const aapl = cardFor(page, 'AAPL')
    const line =
      '▲ STRIKE PROXIMITY · Stock is 0.6% below the $180.00 put strike — now in the money'

    await expect.poll(() => stripLine(aapl), POLL).toBe(line)
    await expect
      .poll(() => aapl.getByTestId('action-strip').getAttribute('data-tone'), POLL)
      .toBe('red')
    expect(await legOf(aapl).getAttribute('data-action')).toBe('red')
    expect(await classOf(legOf(aapl))).toContain('bg-wb-red-dim')
    expect(await legOf(aapl).getByTitle(line, { exact: true }).textContent()).toBe('▲')
    expect(await aapl.getAttribute('data-edge')).toBe('red')
  })

  it('S14: a covered-call breach leads as ▲ CALL BREACHED in red', async () => {
    const { page } = await start('s14', { prices: { MSFT: '435.20' } })
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')

    await expect.poll(() => stripLine(msft), POLL).toBe(CALL_BREACHED)
    expect(await msft.getByTestId('action-strip').getAttribute('data-tone')).toBe('red')
    expect(await stripChip(msft).textContent()).toBe('+1')
    expect(await stripChip(msft).getAttribute('title')).toBe(`Also open:\n${MANAGEMENT_WINDOW_10}`)

    const leg = legOf(msft)
    expect(await leg.getAttribute('data-action')).toBe('red')
    const marks = leg.getByTitle(`${CALL_BREACHED}\n${MANAGEMENT_WINDOW_10}`, { exact: true })
    expect(await marks.textContent()).toBe('▲ ◷')
    expect(await msft.getAttribute('data-edge')).toBe('red')
  })

  it('S15: several open rows show the worst first with the rest on a +N chip', async () => {
    const { page } = await start('s15', { msftDte: 4, prices: { MSFT: '435.20' } })
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')

    await expect.poll(() => stripLine(msft), POLL).toBe(CALL_BREACHED)
    expect(await stripChip(msft).textContent()).toBe('+1')
    expect(await stripChip(msft).getAttribute('title')).toBe(`Also open:\n${EXPIRING_4}`)
  })

  it('S16: a dismissed row does not ride on the card', async () => {
    const { page } = await start('s16')
    await viewDashboard(page)
    const msft = cardFor(page, 'MSFT')

    // Positive control: the row rides on the card before it is dismissed.
    await expect.poll(() => msft.getByTestId('action-strip').count(), POLL).toBe(1)
    expect(await stripLine(msft)).toBe(MANAGEMENT_WINDOW_10)

    // No reload: the card reads the queue query the dismiss invalidates, so its strip must
    // leave in place.
    await dismissAlertViaQueue(page, 'MSFT')

    await expect.poll(() => msft.getByTestId('action-strip').count(), POLL).toBe(0)
    expect(await msft.getAttribute('data-edge')).toBe('CC_OPEN')
    expect(await classOf(msft)).toContain('border-l-wb-violet')
    expect(await legOf(msft).getAttribute('data-action')).toBeNull()
    expect(await dteOf(msft).textContent()).toBe('10d')
  })

  it('S17: the whole card navigates to the detail page', async () => {
    const { page, ids } = await start('s17')
    await viewDashboard(page)
    const card = cardFor(page, 'AAPL')

    async function expectAaplDetail(): Promise<void> {
      await page.waitForFunction((id) => location.hash === `#/positions/${id}`, ids.AAPL)
      await page.getByTestId('position-detail').waitFor()
    }

    await card.getByText('Unrealized P&L', { exact: true }).click()
    await expectAaplDetail()

    await reloadPositionsList(page)
    await card.getByTestId('position-ticker').click()
    await expectAaplDetail()

    await reloadPositionsList(page)
    await card.getByRole('link', { name: 'Open ↗' }).click()
    await expectAaplDetail()
  })

  it('S18: a pending assignment keeps its indicator on the card', async () => {
    const opasn = makeOpasn(AAPL_PUT_180, { transactionTime: `${localToday()}T08:00:00Z` })
    const { page, ids } = await start('s18', { activities: [opasn] })
    await runDetectionNow(page)
    await viewDashboard(page)

    const indicator = cardFor(page, 'AAPL').getByTestId(`pending-assignment-indicator-${ids.AAPL}`)
    await expect.poll(() => indicator.isVisible(), POLL).toBe(true)
    expect(await indicator.getAttribute('aria-label')).toBe('Assignment pending')
    expect(await classOf(indicator)).toContain('animate-wb-pulse')
    expect(await classOf(indicator)).toContain('bg-wb-gold')
    expect(await page.locator('[data-testid^="pending-assignment-indicator-"]').count()).toBe(1)
  })

  it('S19: a closed position sits in the Closed section without live figures', async () => {
    const { page } = await start('s19', { msftDte: 4, msftCall: MSFT_AT_TARGET })
    await viewDashboard(page)
    await expectMsftMarkersRender(page)

    const tsla = page.getByTestId('position-card-closed')
    expect(await tsla.getByTestId('position-ticker').textContent()).toBe('TSLA')
    expect(await classOf(tsla)).toContain('opacity-50')
    expect(await tsla.getByText('Complete', { exact: true }).count()).toBe(1)
    expect(await priceLines(tsla, 'TSLA')).toEqual(['—', 'closed'])
    expect(await pnlLines(tsla, 'TSLA')).toEqual(['—', 'closed — no live marks'])
    expect(await legCells(legOf(tsla))).toEqual(['·', 'wheel complete', '—', '—'])
    expect(await markerCounts(tsla)).toEqual({ strip: 0, badge: 0, flag: 0 })
    expect(await footerText(tsla)).toBe('Cost basis$236.40/ sharePremium collected$1,240.00to date')
  })

  it("S20: cards keep the list's sort order", async () => {
    const { page } = await start('s20')
    await viewDashboard(page)

    expect(
      await page.locator(`${ACTIVE_CARD} [data-testid="position-ticker"]`).allTextContents()
    ).toEqual(['MSFT', 'AAPL', 'NVDA'])
  })

  it('S21: a PMCC renders the full US-108 card in the same shell', async () => {
    // XYZ at $117.00 is 0.8% below the $118 short call, so US-108's ▲ ASSIGNMENT RISK leads the
    // PMCC card's own strip, with the 7-DTE short's MANAGEMENT WINDOW behind it on the +1 chip.
    const { page } = await start('s21', {
      msftDte: 4,
      msftCall: MSFT_AT_TARGET,
      prices: { XYZ: '117.00' }
    })
    const leapsExpiration = localDate(161)
    const shortExpiration = localDate(7)
    await createXyzPmcc(page, {
      long: { expiration: leapsExpiration },
      short: { strike: '118.00', expiration: shortExpiration }
    })
    await viewDashboard(page)
    await expectMsftMarkersRender(page)

    const xyz = cardFor(page, 'XYZ')
    expect(await xyz.getByText('PMCC', { exact: true }).count()).toBe(1)
    expect(await xyz.getByText('LEAPS + short call open', { exact: true }).count()).toBe(1)
    await expect.poll(async () => (await priceLines(xyz, 'XYZ'))[0], POLL).toBe('$117.00')

    const legs = legOf(xyz)
    expect(await legs.count()).toBe(2)
    expect((await legCells(legs.nth(0))).slice(0, 3)).toEqual([
      'L',
      `$80.00 LEAPS · ${leapsExpiration}`,
      '161d'
    ])
    expect((await legCells(legs.nth(1))).slice(0, 3)).toEqual([
      'S',
      `▲ ◷$118.00 call · ${shortExpiration}`,
      '7d'
    ])

    const strip = xyz.getByTestId('action-strip')
    expect(await strip.getAttribute('data-tone')).toBe('gold')
    expect(await stripLine(xyz)).toBe(
      '▲ ASSIGNMENT RISK · stock 0.8% below the $118.00 strike · plan the roll'
    )
    expect(await stripChip(xyz).getAttribute('title')).toBe(
      'Also open:\n◷ MANAGEMENT WINDOW · 7 DTE remaining — review for roll or close'
    )
    expect(await legs.nth(0).getAttribute('data-action')).toBeNull()
    expect(await legs.nth(1).getAttribute('data-action')).toBe('gold')
    expect(await xyz.getAttribute('data-edge')).toBe('gold')

    expect(await ruleCodesFor(page, 'XYZ')).toContain('PMCC_ASSIGNMENT_RISK')
    expect(await markerCounts(xyz)).toEqual({ strip: 1, badge: 0, flag: 0 })
    for (const wheelBadge of ['CSP Open', 'CC Open', 'Shares', 'Complete']) {
      expect(await xyz.getByText(wheelBadge, { exact: true }).count()).toBe(0)
    }
  })
})
