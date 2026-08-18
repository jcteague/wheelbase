// [US-70] Warn when a candidate has earnings within the DTE window — E2E tests.
//
// Exactly one `it()` per acceptance-criteria bullet in
// docs/epics/08-stories/US-70-earnings-in-window-warning.md; the names mirror the
// Gherkin scenarios. The suite stays offline: the fake earnings calendar
// (`src/main/integrations/fake-earnings.ts`) replaces the Finnhub HTTP call, put chains
// come from the fake market-data provider, and everything between them — the
// `earnings_date` store, the US-65 engine's filter and tier sort, the IPC envelope, and
// the renderer — is the real thing.
//
// Earnings fixtures are day offsets from today, and the fake honours the requested
// lookahead window the way the live calendar does, so `finds earnings beyond the alert
// horizon` is a genuine regression test for the 30-day hard-coded lookahead.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { cleanupDb, tmpDb } from './assignment-helpers'
import { localDate } from './dates'
import { fmtBadgeDate } from './earnings-format'
import {
  AAPL_PUT,
  RANKED_IVR,
  RANKED_PUTS,
  earningsBadge,
  excludedReason,
  launchScreener,
  rankedTickers,
  rowRank,
  setEarningsHandling,
  type PutFixtureSpec,
  type ScreenerLaunchOpts
} from './screener-helpers'

// The AAPL fixture expires 37 days out. These offsets sit either side of it, matching
// the story's Jul 31 (in window) / Sep 5 (after expiry) against an Aug 21 expiry.
const EARNINGS_BEFORE_EXPIRY = 16
const EARNINGS_ON_EXPIRY = 37
const EARNINGS_AFTER_EXPIRY = 52

/** Days between an in-window earnings print and the AAPL fixture's expiry — the number
 *  the badge renders. Derived from the offsets so the two can never drift apart. */
const DAYS_BEFORE_EXPIRY = AAPL_PUT.dteOffset - EARNINGS_BEFORE_EXPIRY

/** A ticker with no fixture and no options chain conflict — the empty-calendar case. */
const XYZ_PUT: PutFixtureSpec = { ...AAPL_PUT, ticker: 'XYZ' }
const ABC_PUT: PutFixtureSpec = { ...AAPL_PUT, ticker: 'ABC' }

describe('US-70: warn when a candidate has earnings within the DTE window', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, opts: ScreenerLaunchOpts): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, opts)
    app = launched.app
    return launched.page
  }

  it('excludes a candidate with earnings before expiration by default', async () => {
    const page = await launch('wb-e2e-us70-exclude', {
      fixtures: [AAPL_PUT],
      ivr: RANKED_IVR,
      earnings: { AAPL: { dayOffset: EARNINGS_BEFORE_EXPIRY } }
    })

    await page.waitForSelector('[data-testid="screener-excluded-toggle"]')
    expect(await excludedReason(page, 'AAPL')).toBe(
      `earnings ${localDate(EARNINGS_BEFORE_EXPIRY)} falls on or before expiry`
    )
    expect(await page.locator('[data-testid="screener-row-AAPL"]').count()).toBe(0)
  })

  it('flags a candidate with earnings before expiration when flag mode is on', async () => {
    const page = await launch('wb-e2e-us70-flag', {
      fixtures: [AAPL_PUT],
      ivr: RANKED_IVR,
      earnings: { AAPL: { dayOffset: EARNINGS_BEFORE_EXPIRY } }
    })

    // Under the default exclude mode AAPL is absent, so flipping to flag is what brings
    // it back — the switch is exercised through the sheet, as a trader would.
    await setEarningsHandling(page, 'flag', 1)

    expect(await earningsBadge(page, 'AAPL')).toBe(
      `⚠ Earnings ${fmtBadgeDate(localDate(EARNINGS_BEFORE_EXPIRY))} · ${DAYS_BEFORE_EXPIRY}d before expiry`
    )
  })

  it('ranks by earnings certainty before score', async () => {
    // KO scores 0.71, AAPL 0.53, MSFT 0.50. Giving AAPL in-window earnings and MSFT no
    // calendar entry must sink both below KO *and* invert AAPL and MSFT relative to
    // their scores — MSFT's `unknown` tier outranks AAPL's `flagged` one.
    const page = await launch('wb-e2e-us70-tiers', {
      fixtures: RANKED_PUTS,
      ivr: RANKED_IVR,
      earnings: {
        KO: { dayOffset: EARNINGS_AFTER_EXPIRY },
        AAPL: { dayOffset: EARNINGS_BEFORE_EXPIRY }
      }
    })

    await setEarningsHandling(page, 'flag', 3)

    expect(await rankedTickers(page)).toEqual(['KO', 'MSFT', 'AAPL'])
    expect(await rowRank(page, 'KO')).toBe('1')
    expect(await rowRank(page, 'MSFT')).toBe('—')
    expect(await rowRank(page, 'AAPL')).toBe('—')
  })

  it('treats earnings on the expiration date as in the window', async () => {
    const page = await launch('wb-e2e-us70-boundary', {
      fixtures: [AAPL_PUT],
      ivr: RANKED_IVR,
      earnings: { AAPL: { dayOffset: EARNINGS_ON_EXPIRY } }
    })

    await page.waitForSelector('[data-testid="screener-excluded-toggle"]')
    expect(await excludedReason(page, 'AAPL')).toBe(
      `earnings ${localDate(EARNINGS_ON_EXPIRY)} falls on or before expiry`
    )
  })

  it('shows no earnings warning when earnings fall after expiration', async () => {
    const page = await launch('wb-e2e-us70-after', {
      fixtures: [AAPL_PUT],
      ivr: RANKED_IVR,
      earnings: { AAPL: { dayOffset: EARNINGS_AFTER_EXPIRY } }
    })

    await page.waitForSelector('[data-testid="screener-row-AAPL"]')
    expect(await earningsBadge(page, 'AAPL')).toBeNull()
    // A clear candidate keeps its numeric rank.
    expect(await rowRank(page, 'AAPL')).toBe('1')
  })

  it('finds earnings beyond the alert horizon', async () => {
    // 37 days out — past US-56's 30-day lookahead but inside the screener's 30–45 DTE
    // window. Before the lookahead was parameterised this came back as no event and
    // rendered "unknown": the exact silent pass this story exists to prevent.
    const beyondAlertHorizon = 37
    const page = await launch('wb-e2e-us70-horizon', {
      fixtures: [{ ...AAPL_PUT, dteOffset: 44 }],
      ivr: RANKED_IVR,
      earnings: { AAPL: { dayOffset: beyondAlertHorizon } }
    })

    await setEarningsHandling(page, 'flag', 1)

    const badge = await earningsBadge(page, 'AAPL')
    expect(badge).toContain(fmtBadgeDate(localDate(beyondAlertHorizon)))
    expect(badge).not.toContain('unknown')
  })

  it('shows a caution when the earnings date is unknown', async () => {
    // XYZ has no fixture, so the calendar answers and holds nothing for it.
    const page = await launch('wb-e2e-us70-unknown', {
      fixtures: [XYZ_PUT],
      earnings: {}
    })

    await page.waitForSelector('[data-testid="screener-row-XYZ"]')
    expect(await earningsBadge(page, 'XYZ')).toBe('? Earnings date unknown')
  })

  it('does not exclude an unknown earnings date in exclude mode', async () => {
    // KO's calendar is clear; XYZ's is empty. Exclude mode must keep XYZ, and the tier
    // sort must put it below KO even though nothing was found against it.
    const page = await launch('wb-e2e-us70-unknown-kept', {
      fixtures: [{ ...RANKED_PUTS[0] }, XYZ_PUT],
      ivr: RANKED_IVR,
      earnings: { KO: { dayOffset: EARNINGS_AFTER_EXPIRY } }
    })

    await page.waitForSelector('[data-testid="screener-row-XYZ"]')
    expect(await rankedTickers(page)).toEqual(['KO', 'XYZ'])
    expect(await excludedReason(page, 'XYZ')).toBeNull()
    expect(await rowRank(page, 'KO')).toBe('1')
    expect(await rowRank(page, 'XYZ')).toBe('—')
  })

  it('keeps scoring and ranking when the earnings calendar is unreachable', async () => {
    const page = await launch('wb-e2e-us70-outage', {
      fixtures: RANKED_PUTS,
      ivr: RANKED_IVR,
      earningsUnreachable: true
    })

    await page.waitForSelector('[data-testid="screener-row-KO"]')
    // Every candidate still scores and ranks; none is excluded for earnings.
    expect(await rankedTickers(page)).toEqual(['KO', 'AAPL', 'MSFT'])
    for (const ticker of ['KO', 'AAPL', 'MSFT']) {
      expect(await earningsBadge(page, ticker)).toBe('? Earnings date unavailable')
    }
    expect(await page.locator('[data-testid="screener-excluded-toggle"]').count()).toBe(0)
  })

  it('distinguishes an outage from a genuinely empty calendar', async () => {
    // One run, two states: XYZ has no fixture (the calendar answered, nothing there);
    // ABC's own request failed.
    const page = await launch('wb-e2e-us70-distinguish', {
      fixtures: [XYZ_PUT, ABC_PUT],
      earnings: { ABC: null }
    })

    await page.waitForSelector('[data-testid="screener-row-XYZ"]')
    await page.waitForSelector('[data-testid="screener-row-ABC"]')
    expect(await earningsBadge(page, 'XYZ')).toBe('? Earnings date unknown')
    expect(await earningsBadge(page, 'ABC')).toBe('? Earnings date unavailable')
  })
})
