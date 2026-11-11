// [US-108] PMCC position card on the dashboard — E2E tests, one per acceptance scenario (OPT-16),
// with each Scenario Outline example as its own named test.
//
// Every test launches the US-18 Background (MSFT 10 DTE, AAPL 30 DTE, NVDA shares, TSLA closed)
// with XYZ's quotes and snapshots, seeds the XYZ PMCC's ledger, checks that ledger through the API,
// runs the real alert-evaluation job and views the dashboard. Dates are run-day relative: a
// scenario's DTE is exact and its calendar date is whatever that DTE lands on.
//
// The seeded ledger is the corrected Background: entry short $1.80 (entry debit $23.20), two expired
// $0.10 cycles, then the open $108 call sold at $1.80 → credits $3.80, basis $21.20, 4 cycles. (Three
// expired shorts at 1.00 / 0.50 / 0.50 would put the entry debit at $24.00, not the AC's $23.20.)
//
// Not producible end to end: "Two short calls against one LEAPS render as three leg blocks" and
// "With two short calls, only the at-risk short is highlighted". No entry path opens a second short
// until US-115, so those two scenarios are covered by the core and renderer tests (Areas 5 and 8).
import { afterEach, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { cleanupDb } from './assignment-helpers'
import { localDate, localToday } from './dates'
import { reloadPositionsList } from './helpers'
import {
  BACKGROUND_LEDGER,
  BACKGROUND_LEGS,
  launchPmccCards,
  openedDate,
  readLedger,
  seedBackgroundPmcc,
  seedLeapsOnlyPmcc,
  seedPartialCoveragePmcc,
  setPmccPhase,
  setPmccStatus,
  type PmccCardsHarness,
  type PmccCardsOptions
} from './pmcc-card-helpers'
import {
  awarenessTags,
  detailBar,
  footerCell,
  footerCellOf,
  headerLead,
  highlightedLegs,
  leapsBlock,
  legDte,
  legMarks,
  legParts,
  pnlFigure,
  recoveryMeter,
  shortBlock,
  stripFacts,
  tagFacts,
  tier2Cells,
  tier2Rows,
  xyzCard
} from './pmcc-card-readers'
import { rollLeaps } from './pmcc-roll-helpers'
import {
  ACTIVE_CARD,
  cardFor,
  classOf,
  footerText,
  legOf,
  pnlLines,
  pnlLinesIn,
  priceLines,
  stripChip,
  stripLine,
  viewDashboard,
  type OptionQuote
} from './position-card-helpers'

const POLL = { timeout: 15_000 }

const MANAGEMENT_WINDOW_14 = '◷ MANAGEMENT WINDOW · 14 DTE remaining — review for roll or close'
const EXPIRING_4 = '◷ EXPIRING · Expires in 4 days at $108.00 strike'
const WIDE_LEAPS: OptionQuote = ['24.60', '27.60', '26.10']
const WHEEL_BADGES = ['CSP Open', 'CC Open', 'Shares', 'Complete']

let harness: PmccCardsHarness | undefined

async function dispose(): Promise<void> {
  await harness?.app.close()
  if (harness) cleanupDb(harness.dbPath)
  harness = undefined
}

/** Launches the Background (closing any earlier launch in the same test). */
async function start(label: string, options: PmccCardsOptions = {}): Promise<PmccCardsHarness> {
  await dispose()
  harness = await launchPmccCards(label, options)
  return harness
}

afterEach(dispose)

/** Seeds the Background PMCC, checks its ledger through the API, then views the dashboard. */
async function viewBackgroundPmcc(page: Page): Promise<{ id: string; card: Locator }> {
  const id = await seedBackgroundPmcc(page)
  expect(await readLedger(page, id)).toEqual(BACKGROUND_LEDGER)
  await viewDashboard(page)
  return { id, card: xyzCard(page) }
}

/** Waits until a leg's mark reads `mark`, i.e. its snapshot has polled in. */
async function waitForMark(leg: Locator, mark: string): Promise<void> {
  await expect.poll(async () => (await legParts(leg)).mark, POLL).toBe(mark)
}

/** Positive control for every "no strip" case: MSFT's 10-DTE covered call shows its strip. */
async function expectMsftStrip(page: Page): Promise<void> {
  await expect.poll(() => cardFor(page, 'MSFT').getByTestId('action-strip').count(), POLL).toBe(1)
}

describe('US-108: PMCC position card', () => {
  it('the PMCC card face shows the position line and one block per leg', async () => {
    const { page } = await start('card-face')
    const { card } = await viewBackgroundPmcc(page)

    await expect
      .poll(() => legParts(leapsBlock(card)), POLL)
      .toEqual({
        tag: 'L',
        marks: '',
        title: `$80.00 LEAPS · ${localDate(315)}`,
        dte: '315d',
        mark: '$26.10',
        trailing: 'Δ 0.82 · $25.00 debit'
      })
    expect(await legOf(card).count()).toBe(2)
    expect(await legParts(shortBlock(card))).toEqual({
      tag: 'S',
      marks: '◷',
      title: `$108.00 call · ${localDate(14)}`,
      dte: '14d',
      mark: '$0.90',
      trailing: '50.0% of maxTARGET'
    })

    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
    expect(await card.getByText('LEAPS + short call open', { exact: true }).count()).toBe(1)
    for (const badge of WHEEL_BADGES) {
      expect(await card.getByText(badge, { exact: true }).count()).toBe(0)
    }
    const price = await priceLines(card, 'XYZ')
    expect([price[0], price.at(-1)]).toEqual(['$104.20', '14d to next decision'])
    expect(await card.getByText('1 × 100 sh', { exact: true }).count()).toBe(1)
    expect(await card.getByText('Cost basis', { exact: true }).count()).toBe(1)
    expect(await card.getByText('Credits collected', { exact: true }).count()).toBe(1)

    const strip = card.getByTestId('action-strip')
    expect(await strip.getAttribute('data-tone')).toBe('gold')
    expect(await stripLine(card)).toBe(MANAGEMENT_WINDOW_14)
    const stripBox = await strip.boundingBox()
    const tickerBox = await card.getByTestId('position-ticker').boundingBox()
    if (stripBox === null || tickerBox === null) throw new Error('strip or ticker is not rendered')
    expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(tickerBox.y)
  })

  it('net P&L marks the diagonal against the cost basis', async () => {
    const { page } = await start('net-pnl')
    const { card } = await viewBackgroundPmcc(page)

    await expect.poll(() => pnlLines(card, 'XYZ'), POLL).toEqual(['+$400.00', '+18.9% of basis'])
    expect(await pnlLinesIn(card, 'XYZ', 'text-wb-green')).toEqual(['+$400.00', '+18.9% of basis'])
    expect(await pnlLinesIn(card, 'XYZ', 'text-wb-red')).toEqual([])
    expect((await legParts(leapsBlock(card))).mark).toBe('$26.10')
    expect((await legParts(shortBlock(card))).mark).toBe('$0.90')
  })

  it('the short call keeps its own profit-target cue', async () => {
    const atTarget = await start('target-hit')
    const { card } = await viewBackgroundPmcc(atTarget.page)
    await waitForMark(shortBlock(card), '$0.90')
    expect((await legParts(shortBlock(card))).trailing).toBe('50.0% of maxTARGET')
    expect(await shortBlock(card).getByTestId('target-badge').count()).toBe(1)
    expect(await leapsBlock(card).getByTestId('target-badge').count()).toBe(0)

    const belowTarget = await start('target-below', { shortQuote: ['1.15', '1.25', '1.20'] })
    const below = (await viewBackgroundPmcc(belowTarget.page)).card
    await waitForMark(shortBlock(below), '$1.20')
    expect((await legParts(shortBlock(below))).trailing).toBe('33.3% of max')
    expect(await below.getByTestId('target-badge').count()).toBe(0)
    const cue = shortBlock(below).getByText('33.3% of max', { exact: true })
    expect(await classOf(cue)).toContain('text-wb-green')
  })

  it('a falling stock shows a losing position with a profitable short call', async () => {
    const { page } = await start('falling-stock', {
      price: '92.00',
      leapsQuote: ['16.10', '16.70', '16.40'],
      shortQuote: ['0.15', '0.25', '0.20']
    })
    const { card } = await viewBackgroundPmcc(page)

    await expect.poll(() => pnlLines(card, 'XYZ'), POLL).toEqual(['−$500.00', '−23.6% of basis'])
    expect(await pnlLinesIn(card, 'XYZ', 'text-wb-red')).toEqual(['−$500.00', '−23.6% of basis'])
    expect(await pnlLinesIn(card, 'XYZ', 'text-wb-green')).toEqual([])
    expect((await legParts(shortBlock(card))).trailing).toBe('88.9% of maxTARGET')
    const cue = shortBlock(card).getByText('88.9% of max', { exact: true })
    expect(await classOf(cue)).toContain('text-wb-green')
    expect(await shortBlock(card).getByTestId('target-badge').count()).toBe(1)
    // Positive control: the MSFT wheel card on the same page does carry the wheel-style figure.
    expect(await pnlLines(cardFor(page, 'MSFT'), 'MSFT')).toEqual([
      '+$100.00',
      '+35.7% of max profit'
    ])
    expect(await card.getByText(/of max profit/).count()).toBe(0)
  })

  it('credits collected, premium recovered and the recovery meter', async () => {
    const { page } = await start('credits')
    const { card } = await viewBackgroundPmcc(page)

    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$380.00',
      '15.2% of LEAPS cost recovered'
    ])
    const meter = recoveryMeter(card)
    expect(await meter.getAttribute('data-fill')).toBe('15.2')
    expect(await classOf(meter)).toContain('bg-wb-green')
    expect(await classOf(meter)).not.toContain('bg-wb-gold')
    expect(await footerCell(card, 'Cost basis')).toEqual(['$2,120.00', '$21.20 / share'])
  })

  it('a wide LEAPS spread flags the P&L as unreliable', async () => {
    const { page } = await start('wide-spread', { leapsQuote: WIDE_LEAPS })
    const { card } = await viewBackgroundPmcc(page)

    await waitForMark(leapsBlock(card), '$26.10⚠')
    expect(await leapsBlock(card).getByTestId('opt-mid-spread-warning').count()).toBe(1)
    // The short's own 11% spread marks nothing: the ⚠ rides on the LEAPS only.
    expect((await legParts(shortBlock(card))).mark).toBe('$0.90')
    expect(await pnlFigure(card).textContent()).toBe('+$400.00⚠')
    expect(await pnlFigure(card).locator('span').getAttribute('title')).toBe(
      'Wide spread — the LEAPS spread makes this P&L unreliable'
    )
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', '⚠'])
    expect((await tagFacts(card)).map((tag) => tag.label)).toEqual(['Wide spread'])
    expect(await card.getByTestId('action-strip').getAttribute('data-tone')).toBe('gold')
    expect(await stripLine(card)).toBe(MANAGEMENT_WINDOW_14)
  })

  it('a missing LEAPS snapshot leaves the P&L unavailable', async () => {
    const { page } = await start('missing-leaps', { leapsQuote: null })
    const { card } = await viewBackgroundPmcc(page)

    // The short's snapshot has polled in, so the LEAPS gap is a missing snapshot, not loading.
    await waitForMark(shortBlock(card), '$0.90')
    expect((await legParts(leapsBlock(card))).mark).toBe('— unavail.')
    expect(await pnlLines(card, 'XYZ')).toEqual(['—', 'unavailable — a leg has no mark'])
    expect(await shortBlock(card).getByTestId('target-badge').count()).toBe(1)
    expect(await footerCell(card, 'Cost basis')).toEqual(['$2,120.00', '$21.20 / share'])
    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$380.00',
      '15.2% of LEAPS cost recovered'
    ])
  })

  it('missing greeks blank the delta without breaking the card', async () => {
    // Earnings 7 days out raise the ⚑ tag, so the tag row renders and δ's absence is real.
    const { page } = await start('missing-greeks', { leapsDelta: null, earningsInDays: 7 })
    const { card } = await viewBackgroundPmcc(page)

    await waitForMark(leapsBlock(card), '$26.10')
    expect((await legParts(leapsBlock(card))).trailing).toBe('Δ — · $25.00 debit')
    await expect
      .poll(async () => (await tagFacts(card)).map((tag) => tag.label), POLL)
      .toEqual(['Earnings'])
    expect(await pnlLines(card, 'XYZ')).toEqual(['+$400.00', '+18.9% of basis'])
    expect((await legParts(shortBlock(card))).trailing).toBe('50.0% of maxTARGET')
  })

  it('a PMCC with only the LEAPS open', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 333 }
    const { page } = await start('leaps-only', {
      legs,
      leapsQuote: ['25.10', '25.70', '25.40'],
      shortQuote: null
    })
    const id = await seedLeapsOnlyPmcc(page, legs)
    expect(await readLedger(page, id)).toEqual({
      basisPerShare: '23.0000',
      shortCreditsPerShare: '2.0000',
      leapsCostPerShare: '25.0000',
      initialNetDebit: '2400.0000',
      cycles: 2
    })
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect.poll(() => pnlLines(card, 'XYZ'), POLL).toEqual(['+$240.00', '+10.4% of basis'])
    expect(await card.getByText('LEAPS open · no short call', { exact: true }).count()).toBe(1)
    expect(await legOf(card).count()).toBe(1)
    expect((await legParts(leapsBlock(card))).tag).toBe('L')
    expect((await priceLines(card, 'XYZ')).at(-1)).toBe('333d to next decision')
    expect(await card.getByTestId('target-badge').count()).toBe(0)
    expect(await card.getByText(/% of max/).count()).toBe(0)
    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$200.00',
      '8.0% of LEAPS cost recovered'
    ])
  })

  it('inside the roll window the ◆ strip marks the LEAPS row', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 59, shortDte: 31, shortStrike: 112 }
    const { page } = await start('roll-window', { legs })
    const id = await seedBackgroundPmcc(page, { legs })
    expect(await readLedger(page, id)).toEqual(BACKGROUND_LEDGER)
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect
      .poll(() => stripFacts(card), POLL)
      .toEqual({
        tone: 'gold',
        line: '◆ ROLL WINDOW · LEAPS 59d left, inside the 60-day window · roll while it has time value',
        chip: null,
        leapsAction: 'gold',
        shortAction: null,
        edge: 'gold'
      })
    const leaps = leapsBlock(card)
    expect(await legMarks(leaps).textContent()).toBe('◆')
    expect(await legMarks(leaps).getAttribute('title')).toBe('LEAPS inside the 60-day roll window')
    expect(await legDte(leaps).textContent()).toBe('59d')
    expect(await classOf(legDte(leaps))).toContain('text-wb-gold')
    expect(await legDte(leaps).getAttribute('title')).toBe(
      'Roll window — LEAPS inside the 60-day window'
    )

    const short = shortBlock(card)
    expect(await legMarks(short).count()).toBe(0)
    expect(await legDte(short).textContent()).toBe('31d')
    expect(await classOf(legDte(short))).not.toContain('text-wb-gold')
    expect(await legDte(short).getAttribute('title')).toBeNull()
    expect(await card.getByText(/MANAGEMENT WINDOW/).count()).toBe(0)
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
  })

  it('the short-call DTE turns gold inside 7 days', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 305, shortDte: 4 }
    const { page } = await start('expiring', { legs })
    const id = await seedBackgroundPmcc(page, { legs })
    expect(await readLedger(page, id)).toEqual(BACKGROUND_LEDGER)
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect
      .poll(() => stripFacts(card), POLL)
      .toEqual({
        tone: 'gold',
        line: EXPIRING_4,
        chip: null,
        leapsAction: null,
        shortAction: 'gold',
        edge: 'gold'
      })
    const short = shortBlock(card)
    expect(await legMarks(short).textContent()).toBe('◷')
    expect(await legDte(short).textContent()).toBe('4d')
    expect(await classOf(legDte(short))).toContain('text-wb-gold')
    expect(await legDte(short).getAttribute('title')).toBe(
      'Expiring soon — short call inside 7 days'
    )
    const leaps = leapsBlock(card)
    expect(await legDte(leaps).textContent()).toBe('305d')
    expect(await classOf(legDte(leaps))).not.toContain('text-wb-gold')
    expect(await legDte(leaps).getAttribute('title')).toBeNull()
  })

  async function expectAssignmentRisk(
    label: string,
    {
      price,
      tone,
      reason,
      tooltip
    }: { price: string; tone: string; reason: string; tooltip: string }
  ): Promise<void> {
    const { page } = await start(label, { price })
    const { card } = await viewBackgroundPmcc(page)

    await expect
      .poll(() => stripFacts(card), POLL)
      .toEqual({
        tone,
        line: `▲ ASSIGNMENT RISK · ${reason}`,
        chip: `Also open:\n${MANAGEMENT_WINDOW_14}`,
        leapsAction: null,
        shortAction: tone,
        edge: tone
      })
    expect(await stripChip(card).textContent()).toBe('+1')
    const marks = legMarks(shortBlock(card))
    expect(await marks.textContent()).toBe('▲ ◷')
    expect((await marks.getAttribute('title'))?.split('\n')[0]).toBe(tooltip)
    expect(await legMarks(leapsBlock(card)).count()).toBe(0)
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
  }

  it('▲ assignment risk leads the strip (gold, $106.10)', async () => {
    await expectAssignmentRisk('risk-gold', {
      price: '106.10',
      tone: 'gold',
      reason: 'stock 1.8% below the $108.00 strike · plan the roll',
      tooltip: 'Stock is 1.8% below the short-call strike — approaching assignment'
    })
  })

  it('▲ assignment risk leads the strip (red, $111.40)', async () => {
    await expectAssignmentRisk('risk-red', {
      price: '111.40',
      tone: 'red',
      reason: 'stock 3.1% above the $108.00 strike · roll or close',
      tooltip: 'Stock is 3.1% above the short-call strike — in the money, LEAPS would have to cover'
    })
  })

  it('more than 2% below the short strike reads MANAGEMENT WINDOW, not ASSIGNMENT RISK', async () => {
    const { page } = await start('below-band')
    const { card } = await viewBackgroundPmcc(page)

    await expect
      .poll(() => stripFacts(card), POLL)
      .toEqual({
        tone: 'gold',
        line: MANAGEMENT_WINDOW_14,
        chip: null,
        leapsAction: null,
        shortAction: 'gold',
        edge: 'gold'
      })
    expect((await priceLines(card, 'XYZ'))[0]).toBe('$104.20')
    expect(await card.textContent()).not.toContain('▲')
    const short = shortBlock(card)
    expect(await legMarks(short).textContent()).toBe('◷')
    expect(await legDte(short).textContent()).toBe('14d')
    expect(await classOf(legDte(short))).not.toContain('text-wb-gold')
  })

  it('the ⚑ glyph follows the earnings-proximity predicate', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 305, shortDte: 4 }

    async function viewWithEarnings(
      label: string,
      earningsInDays: number | null
    ): Promise<Locator> {
      const { page } = await start(label, { legs, earningsInDays })
      await seedBackgroundPmcc(page, { legs })
      await viewDashboard(page)
      const card = xyzCard(page)
      // Positive control: the card has rendered its signals — the EXPIRING strip.
      await expect.poll(() => stripLine(card), POLL).toBe(EXPIRING_4)
      return card
    }

    const inWindow = await viewWithEarnings('earnings-in-window', 2)
    await expect
      .poll(() => tagFacts(inWindow), POLL)
      .toEqual([
        {
          label: 'Earnings',
          text: '⚑',
          title: `Earnings in 2 days before your ${localDate(4)} expiration`
        }
      ])
    expect(await classOf(awarenessTags(inWindow))).toContain('text-wb-gold')

    const dayAfter = await viewWithEarnings('earnings-day-after', 5)
    expect(await dayAfter.getByTestId('pmcc-awareness-tags').count()).toBe(0)

    const none = await viewWithEarnings('earnings-none', null)
    expect(await none.getByTestId('pmcc-awareness-tags').count()).toBe(0)
  })

  it('✕ below breakeven leads the strip with ▲ behind it on a +1 chip', async () => {
    const legs = { ...BACKGROUND_LEGS, shortDte: 42, shortStrike: 99 }
    const { page } = await start('below-breakeven', {
      legs,
      price: '99.40',
      shortQuote: ['2.40', '2.60', '2.50']
    })
    // $1.80 + $0.35 + $0.10 + $1.55 keeps the credits at $3.80 and the basis at $21.20.
    const id = await seedBackgroundPmcc(page, {
      legs,
      shortFill: '1.55',
      priorCredits: ['0.35', '0.10']
    })
    expect(await readLedger(page, id)).toEqual(BACKGROUND_LEDGER)
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect
      .poll(() => stripFacts(card), POLL)
      .toEqual({
        tone: 'red',
        line: '✕ BELOW BREAKEVEN · $99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called',
        chip: 'Also open:\n▲ ASSIGNMENT RISK · stock 0.4% above the $99.00 strike · roll or close',
        leapsAction: null,
        shortAction: 'red',
        edge: 'red'
      })
    const marks = legMarks(shortBlock(card))
    expect(await marks.textContent()).toBe('✕ ▲')
    expect((await marks.getAttribute('title'))?.split('\n')).toContain(
      'Short strike below breakeven $101.20 — being called away locks in a loss'
    )
    expect(await card.getByText(/MANAGEMENT WINDOW/).count()).toBe(0)
  })

  it('the δ tag fires when the LEAPS delta drops below the floor and never produces a strip', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 221 }
    const { page } = await start('delta-floor', {
      legs,
      price: '86.50',
      leapsQuote: ['10.20', '10.80', '10.50'],
      leapsDelta: '0.54',
      shortQuote: null
    })
    await seedLeapsOnlyPmcc(page, legs)
    await viewDashboard(page)
    const card = xyzCard(page)

    await waitForMark(leapsBlock(card), '$10.50')
    expect((await legParts(leapsBlock(card))).trailing).toBe('Δ 0.54 · $25.00 debit')
    expect(await tagFacts(card)).toEqual([
      {
        label: 'Delta floor',
        text: 'δ',
        title: 'LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock'
      }
    ])
    expect(await classOf(awarenessTags(card))).toContain('text-wb-gold')
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', 'δ'])
    await expectMsftStrip(page)
    expect(await card.getByTestId('action-strip').count()).toBe(0)
    expect(await highlightedLegs(card)).toBe(0)
    expect(await card.getAttribute('data-edge')).toBe('PMCC')
  })

  it('a healthy card shows no strip and no tags', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 326, shortDte: 25 }
    const { page } = await start('healthy', { legs, shortQuote: ['1.15', '1.25', '1.20'] })
    const id = await seedBackgroundPmcc(page, { legs })
    expect(await readLedger(page, id)).toEqual(BACKGROUND_LEDGER)
    await viewDashboard(page)
    const card = xyzCard(page)

    // Both snapshots have polled in, so nothing below is still loading.
    await waitForMark(leapsBlock(card), '$26.10')
    await waitForMark(shortBlock(card), '$1.20')
    await expectMsftStrip(page)
    expect(await card.getByTestId('action-strip').count()).toBe(0)
    expect(await card.getByTestId('pmcc-awareness-tags').count()).toBe(0)
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
    expect(await highlightedLegs(card)).toBe(0)
    expect(await card.getAttribute('data-edge')).toBe('PMCC')
  })

  it('awareness tags render as small header tags in a fixed order and never produce a strip', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 326, shortDte: 25 }
    const { page } = await start('tag-order', {
      legs,
      leapsQuote: WIDE_LEAPS,
      shortQuote: ['1.15', '1.25', '1.20'],
      earningsInDays: 7
    })
    await seedBackgroundPmcc(page, { legs })
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect
      .poll(() => tagFacts(card), POLL)
      .toEqual([
        {
          label: 'Earnings',
          text: '⚑',
          title: `Earnings in 7 days before your ${localDate(25)} expiration`
        },
        {
          label: 'Wide spread',
          text: '⚠',
          title: 'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable'
        }
      ])
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', '⚑⚠'])
    await expectMsftStrip(page)
    expect(await card.getByTestId('action-strip').count()).toBe(0)
    expect(await highlightedLegs(card)).toBe(0)
    expect(await card.getAttribute('data-edge')).toBe('PMCC')
  })

  it('the Detail bar opens tier 2; the card, the ticker and the Open link open the detail page', async () => {
    const { page } = await start('tier-2')
    const { id, card } = await viewBackgroundPmcc(page)
    await waitForMark(leapsBlock(card), '$26.10')
    const bar = detailBar(card)

    const closedName = 'Detail · breakeven · max if called · Δ · extrinsic'
    expect(await card.getByRole('button', { name: closedName }).count()).toBe(1)
    expect(await bar.getAttribute('aria-expanded')).toBe('false')
    expect(await tier2Cells(card).count()).toBe(0)

    await bar.click()
    expect(await bar.getAttribute('aria-expanded')).toBe('true')
    expect(await card.getByRole('button', { name: 'Hide detail' }).count()).toBe(1)
    expect(await classOf(bar)).toContain('text-wb-gold')
    expect(await classOf(bar.locator('span[aria-hidden="true"]'))).toContain('rotate-180')
    expect(await tier2Rows(card)).toEqual([
      ['Credits collected', '$380.00', '4 short-call cycles · 15.2% of LEAPS cost'],
      ['Breakeven', '$101.20', 'LEAPS $80.00 + basis $21.20 / share'],
      ['Max if called', '+$680.00', 'called away at $108.00'],
      ['LEAPS delta', '0.82', 'tracking as synthetic stock'],
      ['Short extrinsic', '$0.90', 'OTM — all extrinsic'],
      ['LEAPS mark', '$26.10', '$25.70 × $26.50 · 3.1% wide'],
      ['Entry net debit', '$2,320.00', `$23.20 / share · opened ${openedDate()} · 203d ago`]
    ])

    await bar.click()
    expect(await bar.getAttribute('aria-expanded')).toBe('false')
    expect(await tier2Cells(card).count()).toBe(0)

    // Escape collapses it.
    await bar.click()
    expect(await tier2Cells(card).count()).toBe(7)
    await page.keyboard.press('Escape')
    expect(await tier2Cells(card).count()).toBe(0)
    await bar.click()
    expect(await bar.getAttribute('aria-expanded')).toBe('true')

    // With navigation held back, a click on either link leaves tier 2 exactly as it was.
    const ticker = card.getByRole('link', { name: 'XYZ', exact: true })
    const open = card.getByRole('link', { name: 'Open ↗' })
    for (const link of [ticker, open]) {
      expect(await link.getAttribute('href')).toBe(`#/positions/${id}`)
      await page.evaluate(() =>
        document.addEventListener('click', (event) => event.preventDefault(), {
          capture: true,
          once: true
        })
      )
      await link.click()
      expect(await bar.getAttribute('aria-expanded')).toBe('true')
      expect(await page.evaluate(() => location.hash)).toBe('#/')
    }

    // The card body navigates like a wheel card; the bar was the only tier-2 toggle above.
    for (const target of [ticker, open, pnlFigure(card)]) {
      await target.click()
      await page.waitForFunction((positionId) => location.hash === `#/positions/${positionId}`, id)
      await page.waitForSelector('[data-testid="position-detail"]')
      await page.goBack()
      await page.waitForFunction(() => location.hash === '#/')
      await card.waitFor()
    }
  })

  it('hovering the Detail bar highlights it, and hovering the card body does not', async () => {
    const { page } = await start('detail-hover')
    const { card } = await viewBackgroundPmcc(page)
    await waitForMark(leapsBlock(card), '$26.10')
    const bar = detailBar(card)
    const backgroundOf = (locator: Locator): Promise<string> =>
      locator.evaluate((el) => getComputedStyle(el).backgroundColor)
    // The footer cells sit on the elevated surface the bar takes on while the card is hovered.
    const elevated = await backgroundOf(footerCellOf(card, 'Cost basis'))

    await page.mouse.move(0, 0)
    const resting = await backgroundOf(bar)
    expect(resting).not.toBe(elevated)

    await bar.hover()
    await expect.poll(() => backgroundOf(bar), POLL).toBe(elevated)

    // The P&L figure is on the card body, well clear of the bar: the highlight leaves with the pointer.
    await pnlFigure(card).hover()
    await expect.poll(() => backgroundOf(bar), POLL).toBe(resting)
  })

  it('tier 2 in the in-the-money state shows the live assignment math', async () => {
    const { page } = await start('tier-2-itm', {
      price: '111.40',
      shortQuote: ['3.40', '3.60', '3.50']
    })
    const { card } = await viewBackgroundPmcc(page)
    await waitForMark(shortBlock(card), '$3.50')

    await detailBar(card).click()
    const rows = await tier2Rows(card)
    expect(rows.find(([label]) => label === 'Short extrinsic')).toEqual([
      'Short extrinsic',
      '$0.10',
      'ITM — assignment math is live'
    ])
    expect(rows.find(([label]) => label === 'Max if called')).toEqual([
      'Max if called',
      '+$680.00',
      'called away at $108.00'
    ])
  })

  it('a LEAPS fully paid for by credits', async () => {
    // Opened as the Background with an open $120 short; the expired cycles add up so that the
    // credits reach $22.90, then the $80 LEAPS rolls to $85 (sold $26.00, bought $23.50).
    const opening = { ...BACKGROUND_LEGS, shortDte: 25, shortStrike: 120 }
    const rolled = { ...opening, leapsDte: 440, leapsStrike: 85 }
    const { page } = await start('paid-for', {
      legs: rolled,
      leapsQuote: ['33.10', '33.70', '33.40'],
      shortQuote: ['0.90', '1.00', '0.95']
    })
    const id = await seedBackgroundPmcc(page, { legs: opening, priorCredits: ['19.20', '0.10'] })
    const roll = await rollLeaps(page, {
      positionId: id,
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newStrike: 85,
      newExpiration: localDate(440),
      fillDate: localToday()
    })
    expect(roll.ok).toBe(true)
    expect(await readLedger(page, id)).toEqual({
      basisPerShare: '-0.4000',
      shortCreditsPerShare: '22.9000',
      leapsCostPerShare: '22.5000',
      initialNetDebit: '2320.0000',
      cycles: 4
    })
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect
      .poll(() => pnlLines(card, 'XYZ'), POLL)
      .toEqual(['+$3,285.00', 'basis not positive'])
    expect(await footerCell(card, 'Cost basis')).toEqual(['−$40.00', 'LEAPS paid for'])
    const basisCell = footerCellOf(card, 'Cost basis')
    expect(await classOf(basisCell.locator(':scope > :nth-child(2)'))).toContain('text-wb-gold')
    expect(await classOf(basisCell.getByText('LEAPS paid for', { exact: true }))).toContain(
      'text-wb-gold'
    )
    expect(await basisCell.locator('.text-wb-red, .text-wb-green').count()).toBe(0)
    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$2,290.00',
      '101.8% of LEAPS cost recovered'
    ])
    const meter = recoveryMeter(card)
    expect(await meter.getAttribute('data-fill')).toBe('100')
    expect(await classOf(meter)).toContain('bg-wb-gold')
  })

  it('totals scale with contracts, per-share figures do not', async () => {
    const { page } = await start('three-contracts')
    const id = await seedBackgroundPmcc(page, { contracts: 3 })
    expect(await readLedger(page, id)).toEqual({
      ...BACKGROUND_LEDGER,
      initialNetDebit: '6960.0000'
    })
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect.poll(() => pnlLines(card, 'XYZ'), POLL).toEqual(['+$1,200.00', '+18.9% of basis'])
    expect((await legParts(leapsBlock(card))).title).toBe(`$80.00 LEAPS ×3 · ${localDate(315)}`)
    expect((await legParts(shortBlock(card))).title).toBe(`$108.00 call ×3 · ${localDate(14)}`)
    expect(await card.getByText('3 × 100 sh', { exact: true }).count()).toBe(1)
    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$1,140.00',
      '15.2% of LEAPS cost recovered'
    ])
    expect(await footerCell(card, 'Cost basis')).toEqual(['$6,360.00', '$21.20 / share'])
    expect((await legParts(shortBlock(card))).trailing).toBe('50.0% of maxTARGET')
  })

  it('partial coverage is stated on the card', async () => {
    const { page } = await start('partial-coverage')
    const id = await seedPartialCoveragePmcc(page)
    expect(await readLedger(page, id)).toEqual({
      ...BACKGROUND_LEDGER,
      initialNetDebit: '6960.0000'
    })
    await viewDashboard(page)
    const card = xyzCard(page)

    await expect.poll(() => pnlLines(card, 'XYZ'), POLL).toEqual(['+$1,380.00', '+21.7% of basis'])
    expect(await card.getByText('1 of 3 covered', { exact: true }).count()).toBe(1)
    expect((await legParts(leapsBlock(card))).title).toBe(`$80.00 LEAPS ×3 · ${localDate(315)}`)
    expect((await legParts(shortBlock(card))).title).toBe(`$108.00 call · ${localDate(14)}`)
  })

  async function activeOrder(page: Page): Promise<string[]> {
    await xyzCard(page).waitFor()
    return page.locator(ACTIVE_CARD).getByTestId('position-ticker').allTextContents()
  }

  it('the PMCC sorts by its nearest decision point (short call 14 DTE)', async () => {
    const { page } = await start('sort-short')
    await viewBackgroundPmcc(page)

    expect(await activeOrder(page)).toEqual(['MSFT', 'XYZ', 'AAPL', 'NVDA'])
  })

  it('the PMCC sorts by its nearest decision point (LEAPS-only 333 DTE)', async () => {
    const legs = { ...BACKGROUND_LEGS, leapsDte: 333 }
    const { page } = await start('sort-leaps-only', { legs, shortQuote: null })
    await seedLeapsOnlyPmcc(page, legs)
    await viewDashboard(page)

    expect(await activeOrder(page)).toEqual(['MSFT', 'AAPL', 'XYZ', 'NVDA'])
  })

  /** Positive control for the closed and neutral cards: the same PMCC, open, shows its signals. */
  async function viewSignallingPmcc(
    label: string
  ): Promise<{ page: Page; id: string; dbPath: string }> {
    const { page, dbPath } = await start(label, { leapsQuote: WIDE_LEAPS, earningsInDays: 7 })
    const { id, card } = await viewBackgroundPmcc(page)
    await expect
      .poll(async () => (await tagFacts(card)).map((tag) => tag.label), POLL)
      .toEqual(['Earnings', 'Wide spread'])
    expect(await stripLine(card)).toBe(MANAGEMENT_WINDOW_14)
    expect(await highlightedLegs(card)).toBe(1)
    return { page, id, dbPath }
  }

  it('a closed PMCC sits in the Closed section without live figures', async () => {
    const { page, id, dbPath } = await viewSignallingPmcc('closed')
    setPmccStatus(dbPath, id, 'CLOSED')
    await reloadPositionsList(page)

    const card = page
      .getByTestId('position-card-closed')
      .filter({ has: page.locator('[data-testid="position-ticker"]:text-is("XYZ")') })
    await card.waitFor()
    expect(await xyzCard(page).count()).toBe(0)
    expect(await classOf(card)).toContain('opacity-50')
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
    expect(await card.getByText('Closed', { exact: true }).count()).toBe(1)
    expect(await priceLines(card, 'XYZ')).toEqual(['—', 'closed'])
    expect(await pnlLines(card, 'XYZ')).toEqual(['—', 'closed — no live marks'])
    expect(await legParts(leapsBlock(card))).toEqual({
      tag: 'L',
      marks: '',
      title: `$80.00 LEAPS · ${localDate(315)}`,
      dte: '—',
      mark: '—',
      trailing: ''
    })
    expect(await legParts(shortBlock(card))).toEqual({
      tag: 'S',
      marks: '',
      title: `$108.00 call · ${localDate(14)}`,
      dte: '—',
      mark: '—',
      trailing: ''
    })
    expect(await card.getByTestId('action-strip').count()).toBe(0)
    expect(await card.getByTestId('pmcc-awareness-tags').count()).toBe(0)
    expect(await highlightedLegs(card)).toBe(0)
    expect(await card.getAttribute('data-edge')).toBe('PMCC')
    expect(await footerCell(card, 'Cost basis')).toEqual(['$2,120.00', '$21.20 / share'])
    expect(await footerCell(card, 'Credits collected')).toEqual([
      '$380.00',
      '15.2% of LEAPS cost recovered'
    ])
  })

  it('a PMCC phase this story does not know renders a neutral card', async () => {
    const { page, id, dbPath } = await viewSignallingPmcc('neutral')
    setPmccPhase(dbPath, id, 'PMCC_ASSIGNED')
    await reloadPositionsList(page)

    const card = xyzCard(page)
    await expect.poll(() => card.getByText('PMCC_ASSIGNED', { exact: true }).count(), POLL).toBe(1)
    expect(await headerLead(card)).toEqual(['XYZ', 'PMCC', ''])
    expect(await priceLines(card, 'XYZ')).toEqual(['—', '—'])
    expect(await pnlLines(card, 'XYZ')).toEqual(['—', '—'])
    expect((await legParts(leapsBlock(card))).mark).toBe('—')
    expect((await legParts(shortBlock(card))).mark).toBe('—')
    expect(await card.getByTestId('action-strip').count()).toBe(0)
    expect(await card.getByTestId('pmcc-awareness-tags').count()).toBe(0)
    for (const badge of WHEEL_BADGES) {
      expect(await card.getByText(badge, { exact: true }).count()).toBe(0)
    }
    expect(await card.getByText(/of max profit/).count()).toBe(0)
  })

  it('classic wheel cards are unchanged', async () => {
    // XYZ's wide LEAPS raises its ⚠ tag: the positive control for every PMCC-only region below.
    const { page } = await start('wheel-unchanged', { leapsQuote: WIDE_LEAPS })
    const { card: xyz } = await viewBackgroundPmcc(page)
    await expect.poll(() => awarenessTags(xyz).count(), POLL).toBe(1)
    expect(await xyz.getByText('1 × 100 sh', { exact: true }).count()).toBe(1)
    expect(await recoveryMeter(xyz).count()).toBe(1)
    expect(await xyz.getByText(/of basis$/).count()).toBe(1)

    const msft = cardFor(page, 'MSFT')
    await expect
      .poll(() => pnlLines(msft, 'MSFT'), POLL)
      .toEqual(['+$100.00', '+35.7% of max profit'])
    expect(await legOf(msft).count()).toBe(1)
    expect(await msft.getByText('CC Open', { exact: true }).count()).toBe(1)
    expect(await footerText(msft)).toBe('Cost basis$402.40/ sharePremium collected$760.00to date')
    expect(await msft.getByTestId('pmcc-awareness-tags').count()).toBe(0)
    expect(await msft.getByText(/× 100 sh|covered/).count()).toBe(0)
    expect(await recoveryMeter(msft).count()).toBe(0)
    expect(await msft.getByText(/of basis/).count()).toBe(0)
  })
})
