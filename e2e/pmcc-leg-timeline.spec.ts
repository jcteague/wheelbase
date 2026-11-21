// [US-109] PMCC leg timeline — one `it` per acceptance scenario (Linear OPT-17). Each PMCC test
// seeds through `_test:pmcc-seed-position` with the clock pinned at 2027-08-13 (or the
// scenario's later date), opens the detail page and, where it reads the timeline, expands
// `Leg timeline` first. Literals are plans/us-109/plan.md § 11.
import { afterEach, describe, expect, it } from 'vitest'
import { listManagementQueueItems, runAlertEvaluation } from './alert-helpers'
import { localDate } from './dates'
import { openDetailFor, reachCcOpenState, selectDate } from './helpers'
import { cell } from './pmcc-ledger-helpers'
import {
  LEAPS_ONLY,
  OUTLASTING_SHORT,
  VARIANTS,
  cycleRegions,
  disposeTimeline,
  drawerButton,
  drawerContent,
  expandLegTimeline,
  gapRows,
  launchTimeline,
  launchXyzTimeline,
  openDetail,
  precedes,
  readCycle,
  readLeapsTrack,
  readXyzCycles,
  reconciliation,
  region,
  seedXyz,
  showTimeline,
  showXyzTimeline,
  summaryStat,
  textOf
} from './pmcc-timeline-helpers'

afterEach(async () => {
  await disposeTimeline()
})

/** The Background's nine cycle footers: `PMCC cost basis after cycle N` values. */
const BACKGROUND_FOOTERS = [
  '$23.00 / share',
  '$21.80 / share',
  '$20.10 / share',
  '$18.55 / share',
  '$16.90 / share',
  '$15.15 / share',
  '$13.40 / share',
  '$8.50 / share',
  '$6.55 / share'
]

describe('US-109 — PMCC leg timeline', () => {
  it('The section separates the LEAPS track from the short-call cycles', async () => {
    const page = await launchTimeline()
    await openDetail(page, await seedXyz(page))
    const costBasis = drawerButton(page, 'Cost basis')
    const summary = drawerButton(page, 'Timeline summary')
    const timeline = drawerButton(page, 'Leg timeline')

    // Below the Timeline summary, itself below Cost basis. (No `Leg reference` drawer renders
    // on a PMCC yet — it arrives with US-118; the leg reference is cards.)
    expect(await precedes(costBasis, summary)).toBe(true)
    expect(await precedes(summary, timeline)).toBe(true)

    // Collapsed on arrival, its header summarising the section.
    expect(await timeline.getAttribute('aria-expanded')).toBe('false')
    expect(await timeline.textContent()).toContain('9 cycles · 44d uncovered')
    expect(await region(page, 'LEAPS track').count()).toBe(0)

    await expandLegTimeline(page)
    expect(await timeline.getAttribute('aria-expanded')).toBe('true')

    const track = await readLeapsTrack(page)
    expect(track.header).toBe('open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share')
    expect(await textOf(region(page, 'Short-call cycles'))).toContain(
      '9 cycles · 8 closed · 1 open'
    )

    // Two tracks, not one flat leg table: no phase badge and no wheel leg-table columns.
    const content = drawerContent(page, 'Leg timeline')
    expect(await content.getByRole('columnheader', { name: 'Event', exact: true }).count()).toBe(1)
    for (const column of ['Role', 'Action', 'Strike']) {
      expect(await content.getByRole('columnheader', { name: column, exact: true }).count()).toBe(0)
    }
    const body = await textOf(content)
    expect(body).not.toContain('LEAPS + short call open')
    expect(body).not.toContain('PMCC_OPEN')

    await timeline.click()
    expect(await timeline.getAttribute('aria-expanded')).toBe('false')
    expect(await region(page, 'LEAPS track').count()).toBe(0)
  })

  it('The LEAPS roll reads as unbroken coverage, not two disconnected rows', async () => {
    const page = await launchXyzTimeline()

    const { rows } = await readLeapsTrack(page)
    expect(rows).toHaveLength(2)
    const [purchase, roll] = rows
    expect(purchase[2]).toBe('$80.00 call · 2027-09-17')
    expect(purchase[5]).toBe('opens coverage · 368 DTE at fill')
    expect(roll[2]).toBe('$80.00 2027-09-17 → $85.00 2028-01-21')
    expect(roll[4]).toBe('Net credit $2.50 ($250.00)')
    expect(roll[5]).toBe('unbroken · +126 days')

    // The replacement bought two days after the sale is not unbroken coverage.
    await disposeTimeline()
    const broken = await launchXyzTimeline(VARIANTS.brokenLeapsRoll)
    const brokenRoll = (await readLeapsTrack(broken)).rows[1]
    expect(brokenRoll[5]).toBe('2 day gap · +126 days')
    expect(await textOf(region(broken, 'LEAPS track'))).not.toContain('unbroken')
  })

  it("Rolls stay inside their cycle and reduce that cycle's net", async () => {
    const page = await launchXyzTimeline()

    const cycle2 = await readCycle(page, 2)
    expect(cycle2.outcome).toBe('Expired worthless')
    expect(cycle2.rolls).toBe('1 roll')
    expect(cycle2.net).toBe('+$1.20 / share (+$120.00)')
    expect(cycle2.net).not.toContain('+$1.80')
    expect(cycle2.rows.map((row) => row[0])).toEqual([
      'Sell to open',
      'Roll #1',
      'Expired worthless'
    ])
    expect(cycle2.rows[1][4]).toBe('Net debit $0.60 ($60.00)')
    // The roll did not open a cycle of its own.
    expect(await cycleRegions(page).count()).toBe(9)

    // Without the roll the same cycle nets its opening credit: the net is derived, not stored.
    await disposeTimeline()
    const unrolled = await launchXyzTimeline(VARIANTS.unrolledCycle2)
    const plain = await readCycle(unrolled, 2)
    expect(plain.net).toBe('+$1.80 / share (+$180.00)')
    expect(plain.rolls).toBeNull()
  })

  it('A cycle that simply expired reads its opening credit as its net', async () => {
    const page = await launchXyzTimeline()

    const cycle1 = await readCycle(page, 1)
    expect(cycle1.copy).toBe('$110.00 call · sold 2026-09-14 at 32 DTE · 32 days held')
    expect(cycle1.outcome).toBe('Expired worthless')
    expect(cycle1.netLabel).toBe('Net credit')
    expect(cycle1.net).toBe('+$2.00 / share (+$200.00)')
  })

  it('A cycle bought back early nets the buyback against the credit', async () => {
    const page = await launchXyzTimeline()

    const cycle5 = await readCycle(page, 5)
    expect(cycle5.copy).toBe('$114.00 call · sold 2027-03-15 at 32 DTE · 18 days held')
    expect(cycle5.outcome).toBe('Closed early')
    expect(cycle5.net).toBe('+$1.65 / share (+$165.00)')
    const buyback = cycle5.rows.at(-1)
    expect(buyback?.slice(0, 2)).toEqual(['Closed early', '2027-04-02'])
    expect(buyback?.slice(3)).toEqual(['−$0.55', '−$55.00'])
  })

  it('The open cycle is labelled open and never as realized profit', async () => {
    const page = await launchXyzTimeline()

    const cycle9 = await readCycle(page, 9)
    expect(cycle9.copy).toBe('$118.00 call · sold 2027-07-23 at 28 DTE · 21 days so far')
    expect(cycle9.outcome).toBe('Open')
    expect(cycle9.netLabel).toBe('Net credit, open')
    expect(cycle9.net).toBe('+$1.95 / share (+$195.00)')
    expect(cycle9.rows.at(-1)).toEqual([
      'Open',
      '—',
      '7 DTE remaining · credit collected, not realized'
    ])
    expect(await textOf(region(page, 'Cycle 9'))).not.toContain('days held')
  })

  it('Uncovered stretches between cycles are stated as a neutral fact', async () => {
    const page = await launchXyzTimeline()

    const first = gapRows(page).nth(0)
    const second = gapRows(page).nth(1)
    expect(await first.textContent()).toBe(
      'Uncovered · 7 days · 2026-10-16 to 2026-10-23 — no short call open against the LEAPS'
    )
    expect(await precedes(region(page, 'Cycle 1'), first)).toBe(true)
    expect(await precedes(first, region(page, 'Cycle 2'))).toBe(true)
    expect(await second.textContent()).toBe(
      'Uncovered · 17 days · 2026-12-18 to 2027-01-04 — no short call open against the LEAPS'
    )
    expect(await precedes(region(page, 'Cycle 2'), second)).toBe(true)
    expect(await precedes(second, region(page, 'Cycle 3'))).toBe(true)

    // A muted fact, not a warning: no role, no loss or attention colour on the row or its band.
    const tone = await first.evaluate((p) => ({
      role: p.getAttribute('role') ?? p.parentElement?.getAttribute('role') ?? null,
      classes: `${p.className} ${p.parentElement?.className ?? ''}`
    }))
    expect(tone.role).toBeNull()
    expect(tone.classes).toContain('text-wb-text-muted')
    expect(tone.classes).not.toMatch(/red|gold/)

    // Cycle 2 sold the day cycle 1 expired: no stretch between them.
    await disposeTimeline()
    const adjacent = await launchXyzTimeline(VARIANTS.backToBack)
    expect(await gapRows(adjacent).first().textContent()).toContain(
      'Uncovered · 17 days · 2026-12-18 to 2027-01-04'
    )
    expect(await gapRows(adjacent).filter({ hasText: '2026-10-16 to' }).count()).toBe(0)
  })

  it('Running cost basis appears at each group boundary, sourced from US-103', async () => {
    const page = await launchXyzTimeline()

    const [purchase, roll] = (await readLeapsTrack(page)).rows
    expect(purchase[6]).toBe('$25.00')
    expect(roll[6]).toBe('$8.50')

    const cycles = await readXyzCycles(page)
    expect(cycles.map((cycle) => cycle.footer[1])).toEqual(BACKGROUND_FOOTERS)
    for (const [i, { footer, rows }] of cycles.entries()) {
      expect(footer).toEqual([
        `PMCC cost basis after cycle ${i + 1}`,
        BACKGROUND_FOOTERS[i],
        'from the US-103 ledger'
      ])
      // No basis cell on the sell-to-open, roll or terminal rows: only the footer carries it.
      const basis = BACKGROUND_FOOTERS[i].replace(' / share', '')
      expect(rows.flat()).not.toContain(basis)
    }

    expect(await cell(page, 'Cost basis / share')).toBe('$6.55')
  })

  it('The timeline summary totals the cycles and reconciles to the Cost basis drawer', async () => {
    const page = await launchTimeline()
    await openDetail(page, await seedXyz(page))
    const summary = drawerButton(page, 'Timeline summary')

    expect(await precedes(drawerButton(page, 'Cost basis'), summary)).toBe(true)
    expect(await precedes(summary, drawerButton(page, 'Leg timeline'))).toBe(true)
    expect(await summary.getAttribute('aria-expanded')).toBe('true')

    expect(await summaryStat(page, 'Cycles')).toBe('9 · 8 closed · 1 open')
    expect(await summaryStat(page, 'Realized net credits')).toBe('+$14.00 / share (+$1,400.00)')
    expect(await summaryStat(page, 'Average per closed cycle')).toBe('+$1.75 / share (+$175.00)')
    expect(await summaryStat(page, 'Open cycle credit')).toBe('+$1.95 / share · open')
    expect(await summaryStat(page, 'LEAPS roll net')).toBe('+$2.50 / share · on the LEAPS track')
    expect(await summaryStat(page, 'Coverage')).toBe('289 of 333 days · 44 uncovered')
    expect(await reconciliation(page)).toBe(
      'Realized $14.00 + open $1.95 = $15.95 short-call credits to date. ' +
        'LEAPS cost to date $22.50 − $15.95 = $6.55 cost basis per share.'
    )

    // The same three figures the Cost basis drawer shows.
    expect(await cell(page, 'LEAPS cost to date')).toBe('$22.50')
    expect(await cell(page, 'Short-call credits to date')).toBe('-$15.95')
    expect(await cell(page, 'Cost basis / share')).toBe('$6.55')
  })

  it('No per-cycle percentage or annualized return is shown', async () => {
    const page = await launchXyzTimeline()

    // Positive controls: both drawers rendered their content, and a percentage does render on
    // this page — in the Cost basis drawer, which is US-103's.
    expect(await cycleRegions(page).count()).toBe(9)
    expect(await summaryStat(page, 'Cycles')).toBe('9 · 8 closed · 1 open')
    expect(await cell(page, 'Premium recovered')).toMatch(/^\d+\.\d%$/)

    for (const title of ['Timeline summary', 'Leg timeline'] as const) {
      const body = await textOf(drawerContent(page, title))
      expect(body).not.toContain('%')
      expect(body).not.toMatch(/annualized/i)
      expect(body).not.toContain('of max profit')
    }
  })

  it('A cycle ended by assignment shows the outcome without claiming the settlement', async () => {
    const page = await launchXyzTimeline(VARIANTS.assigned, '2027-08-24T16:00:00Z')

    const cycle9 = await readCycle(page, 9)
    expect(cycle9.outcome).toBe('Assigned')
    const badge = region(page, 'Cycle 9').getByText('Assigned', { exact: true }).first()
    expect(await badge.getAttribute('class')).toContain('text-wb-red')
    expect(cycle9.net).toBe('+$1.95 / share (+$195.00)')
    expect(cycle9.rows.at(-1)?.slice(3)).toEqual(['— (assigned)', 'settlement recorded by US-111'])

    expect(await summaryStat(page, 'Cycles')).toBe('9 · 9 closed')
    expect(await summaryStat(page, 'Realized net credits')).toContain('+$15.95 / share')
  })

  it('A LEAPS with no short call ever sold renders an empty cycles list', async () => {
    const page = await launchTimeline()
    await showTimeline(page, LEAPS_ONLY)

    const { rows } = await readLeapsTrack(page)
    expect(rows).toHaveLength(1)
    expect(rows[0][2]).toBe('$95.00 call · 2028-06-16')
    expect(await cycleRegions(page).count()).toBe(0)
    expect(await textOf(region(page, 'Short-call cycles'))).toContain(
      'No short call has been sold against this LEAPS yet. The LEAPS track above is the whole history.'
    )
    expect(await summaryStat(page, 'Coverage')).toBe('0 of 73 days · 73 uncovered')
    expect(await summaryStat(page, 'Average per closed cycle')).toBe('—')
  })

  it('A short call that outlasts the LEAPS is flagged on its cycle', async () => {
    const page = await launchTimeline()
    const flagged = await showTimeline(page, OUTLASTING_SHORT)

    const { flag } = await readCycle(page, 1)
    expect(flag).toContain(
      'This short expires 29 days after the open LEAPS (2027-09-17). It was uncovered for that stretch.'
    )
    expect(flag).toContain('US-102 rejects new legs in this shape; this one predates it.')

    // A display fact, not an alert. The job runs at the pinned 2027-08-13, where this LEAPS is
    // 35 days out: its roll-window reminder (US-107) proves the position was evaluated, and it
    // is the only entry — nothing is queued for the short outlasting the LEAPS.
    await runAlertEvaluation(page)
    const items = await listManagementQueueItems(page)
    expect(
      items.filter((item) => item.positionId === flagged).map((item) => item.ruleCode)
    ).toEqual(['PMCC_LEAPS_ROLL_WINDOW'])

    // The Background's shorts all expire before its LEAPS: no cycle is flagged.
    await showXyzTimeline(page)
    const background = await readXyzCycles(page)
    expect(background.map((cycle) => cycle.flag)).toEqual(Array(9).fill(null))
  })

  it('Per-share figures hold and totals scale with contracts', async () => {
    const page = await launchXyzTimeline(VARIANTS.threeContracts)

    expect((await readCycle(page, 1)).net).toBe('+$2.00 / share (+$600.00)')
    expect(await summaryStat(page, 'Realized net credits')).toBe('+$14.00 / share (+$4,200.00)')
    expect((await readXyzCycles(page)).map((cycle) => cycle.footer[1])).toEqual(BACKGROUND_FOOTERS)
  })

  it('A leg role this story does not know renders neutrally', async () => {
    const page = await launchXyzTimeline(VARIANTS.unknownRole)

    const cycle9 = await readCycle(page, 9)
    const unknown = cycle9.rows.find((row) => row[0] === 'CC_CLOSE')
    expect(unknown?.slice(0, 2)).toEqual(['CC_CLOSE', '2027-08-04'])
    expect(cycle9.net).toBe('+$1.95 / share (+$195.00)')
    expect(await cycleRegions(page).count()).toBe(9)
    expect(await summaryStat(page, 'Realized net credits')).toBe('+$14.00 / share (+$1,400.00)')
  })

  it('A closed PMCC shows a complete, muted timeline', async () => {
    const page = await launchXyzTimeline(VARIANTS.closedAssigned, '2027-09-02T16:00:00Z')

    const content = drawerContent(page, 'Leg timeline')
    expect(await content.getByText(/^Position closed /).textContent()).toBe(
      'Position closed 2027-08-20 · the timeline is complete'
    )
    // The body under the banner is muted.
    expect(await region(page, 'Coverage').locator('xpath=..').getAttribute('class')).toBe(
      'opacity-70'
    )

    const cycles = await readXyzCycles(page)
    expect(cycles.map((cycle) => cycle.outcome)).toEqual([
      'Expired worthless',
      'Expired worthless',
      'Expired worthless',
      'Expired worthless',
      'Closed early',
      'Expired worthless',
      'Expired worthless',
      'Expired worthless',
      'Assigned'
    ])
    expect(await content.getByText('Open', { exact: true }).count()).toBe(0)
    expect(await summaryStat(page, 'Cycles')).toBe('9 · 9 closed')
    expect(await summaryStat(page, 'Coverage')).toBe('296 of 340 days · 44 uncovered')
  })

  it("A classic wheel's leg history is unchanged", async () => {
    // The one test on the real clock: wheel entry validates fill dates against the real
    // `localToday()` and there is no wheel seed channel, so the clock cannot be pinned here
    // (research.md, "Wheel e2e test and the real clock"). The dates are inputs only — every
    // assertion below is structural (status text, a role count, absent PMCC sections) and reads
    // no date value.
    const page = await launchTimeline(null)
    const today = await reachCcOpenState(page, '182', '2.30', localDate(60))
    await page.click('[data-testid="close-cc-early-btn"]')
    await page.fill('[data-testid="cc-close-price"]', '1.10')
    await selectDate(page, '[data-testid="cc-close-fill-date"]', today)
    await page.click('[data-testid="cc-close-submit"]')
    await page.waitForSelector('text=AAPL CC Closed')
    await openDetailFor(page, 'AAPL')

    const detail = page.locator('[data-testid="position-detail"]')
    const runningBasis = detail.getByRole('columnheader', { name: 'Running Basis / Share' })
    await runningBasis.waitFor()
    expect(await detail.getByText('CC Close', { exact: true }).count()).toBe(1)

    const body = await textOf(detail)
    for (const absent of [
      'LEAPS track',
      'Short-call cycles',
      'Uncovered',
      'Leg timeline',
      'Timeline summary'
    ]) {
      expect(body).not.toContain(absent)
    }
    expect(await region(page, 'Coverage').count()).toBe(0)
  })

  it('A short call past its expiration with no recorded outcome stops counting as coverage', async () => {
    // The plain Background: cycle 9's $118 · 2027-08-20 has no expiration, assignment or buyback.
    const page = await launchXyzTimeline(VARIANTS.background, '2027-08-24T16:00:00Z')

    const cycle9 = await readCycle(page, 9)
    expect(cycle9.copy).toBe('$118.00 call · sold 2027-07-23 at 28 DTE · 28 days held')
    expect(cycle9.outcome).toBe('Outcome not recorded')
    const badge = region(page, 'Cycle 9').getByText('Outcome not recorded', { exact: true }).first()
    const badgeClass = (await badge.getAttribute('class')) ?? ''
    expect(badgeClass).toContain('text-wb-text-muted')
    expect(badgeClass).not.toMatch(/text-wb-(red|gold|green)/)
    expect(cycle9.netLabel).toBe('Net credit, open')
    expect(cycle9.net).toBe('+$1.95 / share (+$195.00)')
    expect(cycle9.rows.at(-1)).toEqual([
      'Outcome not recorded',
      '—',
      'Expired 2027-08-20 · outcome not recorded'
    ])
    const cycle9Text = await textOf(region(page, 'Cycle 9'))
    expect(cycle9Text).not.toContain('DTE remaining')
    for (const label of ['Open', 'Expired worthless', 'Assigned', 'Closed early']) {
      expect(await region(page, 'Cycle 9').getByText(label, { exact: true }).count()).toBe(0)
    }

    const trailing = gapRows(page).last()
    expect(await trailing.textContent()).toBe(
      'Uncovered · 4 days · 2027-08-20 to 2027-08-24 — no short call open against the LEAPS'
    )
    expect(await precedes(region(page, 'Cycle 9'), trailing)).toBe(true)

    expect(await summaryStat(page, 'Cycles')).toBe('9 · 8 closed · 1 open')
    expect(await summaryStat(page, 'Open cycle credit')).toBe('+$1.95 / share · open')
    expect(await summaryStat(page, 'Coverage')).toBe('296 of 344 days · 48 uncovered')

    // On the expiration day itself the short is still open, with no stretch after it yet.
    await disposeTimeline()
    const expiring = await launchXyzTimeline(VARIANTS.background, '2027-08-20T16:00:00Z')
    const open9 = await readCycle(expiring, 9)
    expect(open9.outcome).toBe('Open')
    expect(open9.rows.at(-1)).toEqual([
      'Open',
      '—',
      '0 DTE remaining · credit collected, not realized'
    ])
    expect(await gapRows(expiring).count()).toBe(7)
    expect(await gapRows(expiring).filter({ hasText: '2027-08-20 to' }).count()).toBe(0)
    expect(await summaryStat(expiring, 'Coverage')).toBe('296 of 340 days · 44 uncovered')
  })

  it('Fees reduce the cycle net and the timeline still reconciles', async () => {
    const page = await launchXyzTimeline(VARIANTS.fees)

    expect((await readLeapsTrack(page)).rows[0][6]).toBe('$25.01')
    const cycle1 = await readCycle(page, 1)
    expect(cycle1.rows[0][4]).toBe('+$200.00 · fees $1.00')
    expect(cycle1.net).toBe('+$1.99 / share (+$199.00)')
    expect(cycle1.footer[1]).toBe('$23.02 / share')
    expect(await summaryStat(page, 'Realized net credits')).toBe('+$13.99 / share (+$1,399.00)')
    expect(await reconciliation(page)).toBe(
      'Realized $13.99 + open $1.95 = $15.94 short-call credits to date. ' +
        'LEAPS cost to date $22.51 − $15.94 = $6.57 cost basis per share.'
    )
    expect(await cell(page, 'Cost basis / share')).toBe('$6.57')
  })
})
