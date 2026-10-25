// [US-107] PMCC LEAPS roll-window alert — E2E tests, one per acceptance scenario (OPT-15), with
// every Scenario Outline example as its own named test.
//
// Every test drives the real alert-evaluation job against the fake market-data provider with
// the session closed, so no interval run races the explicit ones. XYZ is opened through
// `createPmccPosition` with run-day-relative dates: the LEAPS at the scenario's DTE and the
// short call 28 days earlier (at least 1 day out), which keeps the story's calendar gap. The
// alert job reads the real clock; the story's exact calendar dates are covered by the service
// tests. Expected summaries are the story's literals, not the production summary helper's output.
import { afterEach, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { goToPositionsList, seedCsp } from './assignment-helpers'
import {
  cspAtDte,
  listManagementQueueItems,
  QUEUE_ROW,
  readAlertRows,
  runAlertEvaluation,
  setLegExpiration,
  type AlertRow
} from './alert-helpers'
import { localDate, localToday } from './dates'
import {
  disposeHarness,
  launch,
  queueRowWith,
  ruleSkips,
  seedMsftCoveredCall
} from './pmcc-alert-helpers'
import { recordEvent } from './pmcc-ledger-helpers'
import { rollLeaps } from './pmcc-roll-helpers'

const RULE = 'PMCC_LEAPS_ROLL_WINDOW'
/** Days between the short call's expiration and the LEAPS's (2027-08-20 → 2027-09-17). */
const SHORT_BEFORE_LEAPS = 28

function leapsSummary(days: number): string {
  return `LEAPS expires in ${days} days at $80.00 strike — review for roll or close`
}

afterEach(disposeHarness)

// ── Seeding ──────────────────────────────────────────────────────────────────

interface XyzPmcc {
  positionId: string
  leapsLegId: string
}

/**
 * Opens the Background's XYZ PMCC: $80 LEAPS bought at $25.00 expiring in `leapsDte` days, and a
 * $112 short call sold at $2.10 expiring 28 days earlier (at least 1 day out), 1 contract each.
 */
async function createXyzPmcc(page: Page, leapsDte: number): Promise<XyzPmcc> {
  const leg = { underlying: 'XYZ', instrumentType: 'CALL' as const, deliverableShares: 100 }
  const today = localToday()
  const result = await page.evaluate((payload) => window.api.createPmccPosition(payload), {
    strategy: 'PMCC' as const,
    ticker: 'XYZ',
    long: {
      ...leg,
      strike: 80,
      expiration: localDate(leapsDte),
      contracts: 1,
      fillPrice: 25,
      fillDate: today,
      fees: 0
    },
    short: {
      ...leg,
      strike: 112,
      expiration: localDate(Math.max(leapsDte - SHORT_BEFORE_LEAPS, 1)),
      contracts: 1,
      fillPrice: 2.1,
      fillDate: today,
      fees: 0
    }
  })
  if (!result.ok) throw new Error(`createPmccPosition failed: ${JSON.stringify(result)}`)
  return { positionId: result.position.id, leapsLegId: result.longLeg.id }
}

// ── Reading alerts ───────────────────────────────────────────────────────────

function rowsFor(dbPath: string, positionId: string, ruleCode: string): AlertRow[] {
  return readAlertRows(dbPath).filter(
    (r) => r.position_id === positionId && r.rule_code === ruleCode
  )
}

function openLeapsAlert(dbPath: string, positionId: string): AlertRow {
  const open = rowsFor(dbPath, positionId, RULE).filter((r) => r.status === 'open')
  if (open.length !== 1) throw new Error(`expected one open ${RULE} alert, got ${open.length}`)
  return open[0]
}

// ── Scenarios ────────────────────────────────────────────────────────────────

describe('US-107: PMCC LEAPS roll-window alert', () => {
  it.each([60, 59, 30])(
    'Alert fires once the LEAPS has 60 days or fewer to expiration — %i days',
    async (days) => {
      const h = await launch(`us107-fires-${days}`)
      const { positionId } = await createXyzPmcc(h.page, days)

      await runAlertEvaluation(h.page)

      expect(rowsFor(h.dbPath, positionId, RULE)).toEqual([
        expect.objectContaining({
          status: 'open',
          urgency: 'medium',
          summary: leapsSummary(days)
        })
      ])
    }
  )

  it.each([61, 70])(
    'Alert does not fire while the LEAPS has more than 60 days left — %i days',
    async (days) => {
      const h = await launch(`us107-quiet-${days}`)
      const { positionId } = await createXyzPmcc(h.page, days)
      // Positive control: a sibling CSP inside the management window proves evaluation ran.
      const cspId = await seedCsp(h.page, cspAtDte('AAPL', 180, 20))

      await runAlertEvaluation(h.page)

      expect(rowsFor(h.dbPath, cspId, 'MANAGEMENT_WINDOW')).toEqual([
        expect.objectContaining({ status: 'open' })
      ])
      expect(rowsFor(h.dbPath, positionId, RULE)).toEqual([])
    }
  )

  it('The queue row identifies the position as a PMCC and the LEAPS as the leg', async () => {
    const h = await launch('us107-queue-row')
    const { positionId } = await createXyzPmcc(h.page, 59)
    await runAlertEvaluation(h.page)

    const row = await queueRowWith(h.page, leapsSummary(59))
    await row.waitFor()
    expect(await row.getAttribute('data-ticker')).toBe('XYZ')
    expect(await row.getByText('MED', { exact: true }).count()).toBe(1)
    expect(await row.getByText('PMCC · LEAPS', { exact: true }).count()).toBe(1)
    expect(await row.getByText('PMCC · short call').count()).toBe(0)

    await row.getByRole('button', { name: 'Review position' }).click()
    await h.page.waitForFunction((id) => location.hash === `#/positions/${id}`, positionId)
    await h.page.waitForSelector('[data-testid="position-detail"]')
  })

  it('A PMCC with only the LEAPS open is still evaluated for this rule', async () => {
    const h = await launch('us107-leaps-only')
    // LEAPS 2 days out, short call 1 day out.
    const { positionId } = await createXyzPmcc(h.page, 2)
    await runAlertEvaluation(h.page)
    const [imminent] = rowsFor(h.dbPath, positionId, 'EXPIRATION_IMMINENT')
    expect(imminent).toMatchObject({ status: 'open', urgency: 'high' })

    const expired = await recordEvent(h.page, positionId, {
      triggerEvent: 'PMCC_SHORT_EXPIRED',
      eventDate: localToday(),
      legs: [
        {
          legRole: 'SHORT_CALL_EXPIRED',
          action: 'EXPIRE',
          strike: '112.0000',
          expiration: localDate(1),
          premiumPerContract: '0.0000',
          fillDate: localToday(),
          contracts: 1
        }
      ]
    })
    expect(expired.ok).toBe(true)
    await runAlertEvaluation(h.page)

    expect(rowsFor(h.dbPath, positionId, 'EXPIRATION_IMMINENT')).toEqual([
      expect.objectContaining({ id: imminent.id, status: 'resolved' })
    ])
    const openXyz = readAlertRows(h.dbPath).filter(
      (r) => r.position_id === positionId && r.status === 'open'
    )
    expect(openXyz).toEqual([
      expect.objectContaining({
        rule_code: RULE,
        urgency: 'medium',
        summary: leapsSummary(2)
      })
    ])
  })

  it('Alert resolves when the LEAPS is rolled out past the window', async () => {
    const h = await launch('us107-rolled')
    const { positionId } = await createXyzPmcc(h.page, 59)
    await runAlertEvaluation(h.page)
    const fired = openLeapsAlert(h.dbPath, positionId)
    const leapsItems = async (): Promise<string[]> =>
      (await listManagementQueueItems(h.page))
        .filter((i) => i.positionId === positionId && i.summary.includes('LEAPS expires'))
        .map((i) => i.alertId)
    expect(await leapsItems()).toEqual([fired.id])

    const rolled = await rollLeaps(h.page, {
      positionId,
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newStrike: 85,
      newExpiration: localDate(185),
      fillDate: localToday()
    })
    expect(rolled.ok).toBe(true)
    await runAlertEvaluation(h.page)

    expect(rowsFor(h.dbPath, positionId, RULE)).toEqual([
      expect.objectContaining({ id: fired.id, status: 'resolved', resolved_at: expect.any(String) })
    ])
    expect(await leapsItems()).toEqual([])
  })

  it("The short-call rules and the LEAPS rule co-fire without reading each other's leg", async () => {
    const h = await launch('us107-co-fire')
    // LEAPS 30 days out, short call 2 days out.
    const { positionId } = await createXyzPmcc(h.page, 30)

    await runAlertEvaluation(h.page)

    const imminent = rowsFor(h.dbPath, positionId, 'EXPIRATION_IMMINENT')
    expect(imminent).toEqual([
      expect.objectContaining({
        status: 'open',
        urgency: 'high',
        summary: 'Expires in 2 days at $112.00 strike'
      })
    ])
    const leaps = rowsFor(h.dbPath, positionId, RULE)
    expect(leaps).toEqual([
      expect.objectContaining({
        status: 'open',
        urgency: 'medium',
        summary: leapsSummary(30)
      })
    ])
    const shortLegSummaries = readAlertRows(h.dbPath)
      .filter(
        (r) =>
          r.position_id === positionId &&
          (r.rule_code === 'EXPIRATION_IMMINENT' || r.rule_code === 'MANAGEMENT_WINDOW')
      )
      .map((r) => r.summary)
    expect(shortLegSummaries).toHaveLength(imminent.length)
    expect(
      shortLegSummaries.filter(
        (s) => s.includes('$80.00') || s.includes(localDate(30)) || s.includes('30 days')
      )
    ).toEqual([])

    await goToPositionsList(h.page)
    const xyzRows = h.page.locator(QUEUE_ROW).filter({ hasText: 'XYZ' })
    await xyzRows.nth(1).waitFor()
    const texts = await xyzRows.allTextContents()
    expect(texts).toHaveLength(2)
    expect(texts[0]).toContain('Expires in 2 days at $112.00 strike')
    expect(texts[0]).toContain('HIGH')
    expect(texts[1]).toContain(leapsSummary(30))
    expect(texts[1]).toContain('MED')
  })

  it('A LEAPS with no readable expiration keeps the alert open instead of resolving it', async () => {
    const h = await launch('us107-unreadable')
    const { positionId, leapsLegId } = await createXyzPmcc(h.page, 59)
    await runAlertEvaluation(h.page)
    const fired = openLeapsAlert(h.dbPath, positionId)
    expect(fired.summary).toBe(leapsSummary(59))

    setLegExpiration(h.dbPath, leapsLegId, 'unreadable')
    await runAlertEvaluation(h.page)

    expect(rowsFor(h.dbPath, positionId, RULE)).toEqual([
      expect.objectContaining({ id: fired.id, status: 'open', summary: fired.summary })
    ])
    expect(ruleSkips(h)).toContainEqual(
      expect.objectContaining({ positionId, ruleCode: RULE, reason: 'missing_leaps_dte' })
    )
  })

  it.each([
    {
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      seed: (page: Page): Promise<string> => seedMsftCoveredCall(page, 59),
      alerts: []
    },
    {
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      seed: (page: Page): Promise<string> => seedCsp(page, cspAtDte('AAPL', 180, 20)),
      alerts: [
        expect.objectContaining({
          rule_code: 'MANAGEMENT_WINDOW',
          status: 'open',
          summary: '20 DTE remaining — review for roll or close'
        })
      ]
    }
  ])(
    'Classic wheel positions do not use the PMCC rule — $ticker $phase',
    async ({ ticker, phase, seed, alerts }) => {
      const h = await launch(`us107-wheel-${ticker}`)
      const positionId = await seed(h.page)

      await runAlertEvaluation(h.page)

      expect(readAlertRows(h.dbPath)).toEqual(alerts)
      const position = await h.page.evaluate((id) => window.api.getPosition(id), positionId)
      expect(position).toMatchObject({ ok: true, position: { phase } })
      const skips = ruleSkips(h)
      // Positive control: the position was evaluated and its skips reached the captured log.
      expect(skips.some((s) => s.positionId === positionId)).toBe(true)
      expect(skips.filter((s) => s.ruleCode === RULE)).toEqual([])
    }
  )
})
