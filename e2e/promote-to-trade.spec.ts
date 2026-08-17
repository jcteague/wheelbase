// [US-68] Promote a screener result to the new-wheel form — E2E tests.
//
// Exactly one `it()` per acceptance-criteria scenario in
// docs/epics/08-stories/US-68-promote-result-to-new-wheel.md; the names mirror the
// Gherkin. Everything runs against the real app: the US-66 screener harness serves
// the AAPL fixture through the fake provider, the US-65 engine scores it, and the
// promoted form re-fetches over the production option-snapshots IPC. Nothing between
// the IPC and the DOM is stubbed.
import { format, parseISO } from 'date-fns'
import type { ElectronApplication, Page } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import { CLOSED_SESSION, POST_SESSION, cleanupDb, tmpDb } from './assignment-helpers'
import { localDate } from './dates'
import {
  AAPL_PUT,
  FRESH_QUOTE_TIMESTAMP,
  QUOTE_TIMESTAMP,
  launchScreener,
  listPositions,
  promoteBannerKind,
  promoteRow,
  setMarketDataError,
  setOptionSnapshotFixtures,
  type ScreenerLaunchOpts
} from './screener-helpers'

// The Background candidate: AAPL $180 put, mark $2.70, Δ0.28, 37 DTE, quoted at
// QUOTE_TIMESTAMP. Only AAPL is seeded so the promote click is unambiguous.
const FIXTURES = [AAPL_PUT]
const EXPIRATION = localDate(AAPL_PUT.dteOffset)
const NOTE = 'Would own below $170; waiting for IV to lift'

// Local-zone renderings of the two quote instants, derived the same way
// `fmtQuoteTime` derives them, so the expectations hold on any machine.
const quotedTime = (iso: string): string => format(parseISO(iso), 'HH:mm:ss')

const SUBMIT = 'button[type="submit"]'
const SUCCESS_CARD = '[role="status"]'

/** The AAPL fixture re-served at a different mark and a later quote time. */
function reQuotedAapl(mid: string): typeof FIXTURES {
  return [{ ...AAPL_PUT, mid, quotedAt: FRESH_QUOTE_TIMESTAMP }]
}

describe('US-68: promote a screener result to the new wheel form', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  async function launch(prefix: string, opts: ScreenerLaunchOpts = {}): Promise<Page> {
    dbPath = tmpDb(prefix)
    const launched = await launchScreener(dbPath, { fixtures: FIXTURES, ...opts })
    app = launched.app
    await launched.page.waitForSelector('[data-testid="screener-row-AAPL"]')
    return launched.page
  }

  it('promote pre-fills the new-wheel form', async () => {
    const page = await launch('wb-e2e-us68-prefill', { watchlistNotes: { AAPL: NOTE } })

    await promoteRow(page, 'AAPL')

    expect(await page.inputValue('#ticker')).toBe('AAPL')
    expect(await page.inputValue('#strike')).toBe('180')
    expect(await page.textContent('#expiration')).toContain(EXPIRATION)
    expect(await page.inputValue('#contracts')).toBe('1')
    expect(await page.inputValue('#premiumPerContract')).toBe('2.70')
    // 180 × 100 × 1 — the AC's capital figure.
    expect(await page.textContent('[data-testid="derived-capital"]')).toContain('$18,000')
    // The watchlist note seeds the thesis (US-69 dependency).
    expect(await page.inputValue('#thesis')).toBe(NOTE)
  })

  it('pre-filled premium is editable, not locked', async () => {
    const page = await launch('wb-e2e-us68-editable')

    await promoteRow(page, 'AAPL')
    await page.fill('#premiumPerContract', '2.65')
    await page.locator('#premiumPerContract').blur()

    expect(await page.inputValue('#premiumPerContract')).toBe('2.65')
    // Validation ran on blur and found nothing to complain about.
    expect(await page.locator('[role="alert"]').count()).toBe(0)
  })

  it('submitting records the edited premium', async () => {
    const page = await launch('wb-e2e-us68-records-edit')

    await promoteRow(page, 'AAPL')
    await page.fill('#premiumPerContract', '2.65')
    await page.click(SUBMIT)
    await page.waitForSelector(SUCCESS_CARD)

    const positions = await listPositions(page)
    expect(positions).toHaveLength(1)
    expect(positions[0].ticker).toBe('AAPL')
    // The trader's price, not the $2.70 screener snapshot.
    expect(Number(positions[0].entryPremiumPerContract)).toBe(2.65)
  })

  it('a fresh quote is shown when the form opens', async () => {
    const page = await launch('wb-e2e-us68-fresh-quote')

    // The screener was quoted at 2.70; the form's re-fetch sees 2.68, later.
    await setOptionSnapshotFixtures(app, reQuotedAapl('2.68'))
    await promoteRow(page, 'AAPL')

    await page.waitForSelector(
      `[data-testid="promote-provenance"]:has-text("Quoted ${quotedTime(FRESH_QUOTE_TIMESTAMP)}")`
    )
    const provenance = await page.textContent('[data-testid="promote-provenance"]')
    expect(provenance).not.toContain(quotedTime(QUOTE_TIMESTAMP))
    // The re-fetch never overwrites the editable default.
    expect(await page.inputValue('#premiumPerContract')).toBe('2.70')
  })

  it('warns when the price has moved materially', async () => {
    const page = await launch('wb-e2e-us68-moved')

    await setOptionSnapshotFixtures(app, reQuotedAapl('2.50'))
    await promoteRow(page, 'AAPL')

    expect(await promoteBannerKind(page)).toBe('moved')
    expect(await page.textContent('[data-testid="promote-banner"]')).toContain(
      'Price moved: quoted $2.70 → now $2.50 — review before submitting.'
    )
    expect(await page.getAttribute('[data-testid="promote-banner"]', 'data-tone')).toBe('warning')
    expect(await page.inputValue('#premiumPerContract')).toBe('2.70')

    // Non-blocking: the trader can still record the trade after reviewing.
    await page.click(SUBMIT)
    await page.waitForSelector(SUCCESS_CARD)
    expect(await listPositions(page)).toHaveLength(1)
  })

  it('warns when the market is not open — CLOSED', async () => {
    const page = await launch('wb-e2e-us68-closed', { marketStatus: CLOSED_SESSION })
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("CLOSED")')

    await promoteRow(page, 'AAPL')

    expect(await promoteBannerKind(page)).toBe('stale')
    expect(await page.textContent('[data-testid="promote-banner"]')).toContain(
      `Market closed — the pre-filled mark is a stale after-hours snapshot (quoted ${quotedTime(QUOTE_TIMESTAMP)}).`
    )
    expect(await page.getAttribute('[data-testid="promote-banner"]', 'data-tone')).toBe('warning')
    expect(await page.isDisabled(SUBMIT)).toBe(false)
  })

  it('warns when the market is not open — EXT', async () => {
    // Equity options don't trade extended hours, so a post-session mark is just the
    // 4:00 close while the underlying keeps moving — the same warning as CLOSED.
    const page = await launch('wb-e2e-us68-ext', { marketStatus: POST_SESSION })
    await page.waitForSelector('[data-testid="market-status-pill"]:has-text("EXT")')

    await promoteRow(page, 'AAPL')

    expect(await promoteBannerKind(page)).toBe('stale')
    const banner = await page.textContent('[data-testid="promote-banner"]')
    expect(banner).toContain(
      `Extended hours — options aren't trading, so the pre-filled mark is a stale snapshot (quoted ${quotedTime(QUOTE_TIMESTAMP)}). Verify before recording.`
    )
    // The pill beside it reads EXT, so the copy must not claim the market is closed.
    expect(banner).not.toContain('Market closed')
    expect(await page.isDisabled(SUBMIT)).toBe(false)
  })

  it('form still works when the fresh quote cannot be fetched', async () => {
    const page = await launch('wb-e2e-us68-offline')

    // The provider goes down between the screener run and the form's re-fetch.
    await setMarketDataError(app, 'unavailable')
    await promoteRow(page, 'AAPL')

    // Promoted values are all still pre-filled.
    expect(await page.inputValue('#ticker')).toBe('AAPL')
    expect(await page.inputValue('#strike')).toBe('180')
    expect(await page.inputValue('#premiumPerContract')).toBe('2.70')

    expect(await promoteBannerKind(page)).toBe('offline')
    expect(await page.textContent('[data-testid="promote-banner"]')).toContain(
      `Couldn't refresh quote — showing screener snapshot from ${quotedTime(QUOTE_TIMESTAMP)}`
    )

    await setMarketDataError(app, null)
    await page.click(SUBMIT)
    await page.waitForSelector(SUCCESS_CARD)
    expect(await listPositions(page)).toHaveLength(1)
  })

  // Regression: wouter's hash navigate writes the promote params into the real
  // `location.search` and never clears them, so an unconsumed payload would make the
  // next plain "Open Wheel" open pre-filled from a candidate nobody promoted.
  it('a promote does not leak into the next plain visit to the form', async () => {
    const page = await launch('wb-e2e-us68-no-leak')

    await promoteRow(page, 'AAPL')

    // Walk away without submitting, then open the form the ordinary way.
    await page.evaluate(() => {
      location.hash = '#/'
    })
    await page.waitForSelector('[data-testid="promote-provenance"]', { state: 'detached' })
    await page.evaluate(() => {
      location.hash = '#/new'
    })
    await page.waitForSelector('#ticker')

    expect(await page.locator('[data-testid="promote-provenance"]').count()).toBe(0)
    expect(await page.locator('[data-testid="promote-banner"]').count()).toBe(0)
    expect(await page.inputValue('#ticker')).toBe('')
    expect(await page.inputValue('#premiumPerContract')).toBe('')
  })

  it('promote never auto-submits', async () => {
    const page = await launch('wb-e2e-us68-no-auto-submit')

    await promoteRow(page, 'AAPL')

    // The form is open and filled, but nothing has been recorded.
    expect(await listPositions(page)).toHaveLength(0)

    await page.click(SUBMIT)
    await page.waitForSelector(SUCCESS_CARD)
    expect(await listPositions(page)).toHaveLength(1)
  })
})
