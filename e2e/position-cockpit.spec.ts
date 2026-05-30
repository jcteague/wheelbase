// [US-34] Position Cockpit (Triage Cockpit) — E2E tests
//
// Uses FakeMarketDataProvider (WHEELBASE_MARKET_MOCK=true).
// Option snapshot fixtures are passed via WHEELBASE_MOCK_OPTION_SNAPSHOTS env var
// keyed by OCC symbol. Stock quote fixtures are passed via WHEELBASE_MOCK_STOCK_QUOTES
// keyed by ticker.
//
// NOTE: These tests require a compiled app (pnpm build) and must be run from a
// GUI terminal (iTerm/Terminal.app): pnpm test:e2e — NOT from Claude Code's shell.
import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate, localToday } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ── Position parameters ─────────────────────────────────────────────────────

const STRIKE = 180

// Dynamic expirations — tests never rot
const EXPIRATION_30D = localDate(30) // normal DTE — most tests
const EXPIRATION_60D = localDate(60) // HOLD — ample DTE, no management window
const EXPIRATION_5D = localDate(5) //  TIGHT badge — dte ≤ 7
const EXPIRATION_2D = localDate(2) //  ACT NOW — dte ≤ 3

// ── OCC symbol builder ──────────────────────────────────────────────────────

function occSym(
  ticker: string,
  expiration: string,
  instrumentType: 'PUT' | 'CALL',
  strike: number
): string {
  const [yyyy, mm, dd] = expiration.split('-')
  const yy = yyyy.slice(2)
  const letter = instrumentType === 'PUT' ? 'P' : 'C'
  const strikeInt = String(Math.round(strike * 1000)).padStart(8, '0')
  return `${ticker.toUpperCase()}${yy}${mm}${dd}${letter}${strikeInt}`
}

// ── Snapshot factory ────────────────────────────────────────────────────────

function makeSnapshot(bid: string, ask: string, mid: string, delta: string): object {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: null,
    volume: null,
    greeks: { delta, gamma: '0.02', theta: '-0.05', vega: '0.10', iv: '0.25' },
    timestamp: new Date().toISOString()
  }
}

// ── Named snapshots ─────────────────────────────────────────────────────────

// TARGET HIT: mid=1.30 on premium=3.50 → pnl=(3.50-1.30)*100/350=62.86% ≥ 50%
const SNAP_TARGET_HIT = makeSnapshot('1.20', '1.40', '1.30', '-0.25')
// HOLD: pnl=28.57%, |delta|=0.15 < 0.30 (normal), dte=60 > 21 → HOLD 'Position tracking to plan'
const SNAP_HOLD = makeSnapshot('2.40', '2.60', '2.50', '-0.15')
// ACT NOW: |delta|=0.55 > 0.50 with dte=2 ≤ 3
const SNAP_ACT_NOW = makeSnapshot('2.40', '2.60', '2.50', '-0.55')
// WATCH: |delta|=0.35 in [0.30, 0.45) → sev=warning → 'Delta in management band'
const SNAP_WATCH = makeSnapshot('2.40', '2.60', '2.50', '-0.35')
// CONSIDER ROLL: |delta|=0.52 > 0.45 → sev=danger
const SNAP_CONSIDER_ROLL = makeSnapshot('2.40', '2.60', '2.50', '-0.52')
// TIGHT badge: dte=5 ≤ 7 triggers tight=true → "DELTA · TIGHT" in gauge
const SNAP_TIGHT = makeSnapshot('2.40', '2.60', '2.50', '-0.20')

// ── Stock quote (AAPL OTM from put strike 180 → dist > 0) ───────────────────

const AAPL_QUOTE = {
  price: '182.45',
  bid: '182.40',
  ask: '182.50',
  prevClose: '181.00',
  change: '1.45',
  changePercent: '0.0080',
  volume: 50_000_000,
  timestamp: new Date().toISOString()
}

const REGULAR_SESSION = { isOpen: true, session: 'regular', nextOpen: '', nextClose: '' }

// ── Precomputed OCC symbols ─────────────────────────────────────────────────

const OCC_30D = occSym('AAPL', EXPIRATION_30D, 'PUT', STRIKE)
const OCC_60D = occSym('AAPL', EXPIRATION_60D, 'PUT', STRIKE)
const OCC_5D = occSym('AAPL', EXPIRATION_5D, 'PUT', STRIKE)
const OCC_2D = occSym('AAPL', EXPIRATION_2D, 'PUT', STRIKE)

// ── Launch helper ───────────────────────────────────────────────────────────
//
// Defaults: quotes = { AAPL: AAPL_QUOTE }, optionSnapshots = {}
// Tests only need to pass options that differ from these defaults.

function launchWithMocks(
  dbPath: string,
  opts: {
    quotes?: Record<string, object>
    optionSnapshots?: Record<string, object>
    marketStatus?: object
  } = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: {
      ...process.env,
      WHEELBASE_DB_PATH: dbPath,
      FAKE_MARKET_DATA: 'true',
      FAKE_BROKER: 'true',
      WHEELBASE_MOCK_STOCK_QUOTES: JSON.stringify(opts.quotes ?? { AAPL: AAPL_QUOTE }),
      WHEELBASE_MOCK_OPTION_SNAPSHOTS: JSON.stringify(opts.optionSnapshots ?? {}),
      FAKE_MARKET_STATUS: JSON.stringify(opts.marketStatus ?? REGULAR_SESSION)
    }
  })
}

// ── Page helpers ────────────────────────────────────────────────────────────

async function goToPositionDetail(page: Page, positionId: string): Promise<void> {
  await page.evaluate((id: string) => {
    location.hash = `#/positions/${id}`
  }, positionId)
  await page.waitForSelector('[data-testid="position-detail"]')
}

// ── Position seeding ────────────────────────────────────────────────────────

type CreateResult = { ok: true; position: { id: string } } | { ok: false }
type AssignResult = { ok: boolean }

interface SeedOpts {
  expiration?: string
  thesis?: string
}

async function seedPosition(page: Page, opts: SeedOpts = {}): Promise<string> {
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')

  const result = (await page.evaluate(
    async (i: { expiration: string; thesis: string | null }) =>
      window.api.createPosition({
        ticker: 'AAPL',
        strike: 180,
        expiration: i.expiration,
        contracts: 1,
        premiumPerContract: 3.5,
        ...(i.thesis != null ? { thesis: i.thesis } : {})
      }),
    {
      expiration: opts.expiration ?? EXPIRATION_30D,
      thesis: opts.thesis ?? null
    }
  )) as CreateResult

  if (!result.ok) throw new Error(`createPosition failed: ${JSON.stringify(result)}`)
  return result.position.id
}

async function assignCsp(page: Page, positionId: string): Promise<void> {
  const result = (await page.evaluate(
    async ({ posId, date }: { posId: string; date: string }) =>
      window.api.assignPosition({ positionId: posId, assignmentDate: date }),
    { posId: positionId, date: localToday() }
  )) as AssignResult
  if (!result.ok) throw new Error('assignPosition failed')
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('US-34: Position Cockpit (Triage Cockpit)', () => {
  let app: ElectronApplication
  let dbPath: string

  afterEach(async () => {
    await app?.close()
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  // ── AC-1: Verdict variants ─────────────────────────────────────────────────

  it('AC-1 — verdict TARGET HIT: position with 50%+ P&L captured shows TARGET HIT pill', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-target-hit-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // pnl=(3.50-1.30)*100/350=62.86% ≥ 50% → TARGET HIT verdict pill
    await page.waitForSelector('text=TARGET HIT')
  })

  it('AC-1 — verdict HOLD: position with low delta and ample DTE shows HOLD', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-hold-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_60D]: SNAP_HOLD }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page, { expiration: EXPIRATION_60D })
    await goToPositionDetail(page, positionId)

    // pnl=28.57%, |delta|=0.15 normal, dte=60>21 → HOLD 'Position tracking to plan'
    await page.waitForSelector('text=Position tracking to plan')
  })

  it('AC-1 — verdict ACT NOW: position with DTE ≤ 3 and |delta| > 0.50 shows ACT NOW', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-act-now-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_2D]: SNAP_ACT_NOW }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page, { expiration: EXPIRATION_2D })
    await goToPositionDetail(page, positionId)

    // dte=2≤3 AND |delta|=0.55>0.50 → ACT NOW
    await page.waitForSelector('text=ACT NOW')
  })

  it('AC-1 — verdict WATCH (delta warning): position in warning band shows WATCH', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-watch-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_WATCH }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // |delta|=0.35 in [0.30, 0.45) → sev=warning → WATCH + sub reason
    await page.waitForSelector('text=WATCH')
    await page.waitForSelector('text=Delta in management band')
  })

  it('AC-1 — verdict CONSIDER ROLL: danger delta shows CONSIDER ROLL', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-consider-roll-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_CONSIDER_ROLL }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // |delta|=0.52>0.45 → sev=danger → CONSIDER ROLL
    await page.waitForSelector('text=CONSIDER ROLL')
  })

  it('AC-1 — no data verdict: no snapshot shows HOLD with Awaiting market data', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac1-no-data-${Date.now()}.db`)
    // Empty snapshots (default): greeks=null, currentMid=null → HOLD 'Awaiting market data'
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Awaiting market data')
  })

  // ── AC-2: DTE-aware delta — TIGHT badge ───────────────────────────────────

  it('AC-2 — DTE-aware delta: TIGHT badge appears in gauge when DTE ≤ 7', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac2-tight-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_5D]: SNAP_TIGHT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page, { expiration: EXPIRATION_5D })
    await goToPositionDetail(page, positionId)

    // DeltaGauge renders "DELTA · TIGHT" label when dte ≤ 7
    await page.waitForSelector('text=TIGHT')
  })

  // ── AC-3: Verdict block renders ───────────────────────────────────────────

  it('AC-3 — verdict block: tinted background renders, ticker and phase pill visible', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac3-verdict-block-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // Ticker and phase pill visible in VerdictBlock
    await page.waitForSelector('text=AAPL')
    // PHASE_LABEL['CSP_OPEN'] = 'Sell Put'
    await page.waitForSelector('text=Sell Put')
  })

  // ── AC-4: Delta gauge SVG ─────────────────────────────────────────────────

  it('AC-4 — delta gauge: SVG circle gauge visible in Risk snapshot section', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac4-delta-gauge-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Risk snapshot')

    // DeltaGauge renders track + fill circle inside the Risk snapshot section
    const riskSection = page.locator('section').filter({ hasText: 'Risk snapshot' })
    const circles = riskSection.locator('svg circle')
    expect(await circles.count()).toBeGreaterThanOrEqual(2)
  })

  // ── AC-5: Distance thermometer ────────────────────────────────────────────

  it('AC-5 — distance thermometer: track and underlying marker visible in Risk snapshot', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac5-distance-thermo-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // "Distance to strike" label in RiskSnapshot right pane confirms thermo rendered
    await page.waitForSelector('text=Distance to strike')
  })

  // ── AC-6: Context strip labels ────────────────────────────────────────────

  it('AC-6 — context strip: Theta, IV, Vega, Gamma labels visible in Context section', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac6-context-strip-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // ContextStrip renders 4 KV cells when greeks are available
    await page.waitForSelector('text=Theta')
    await page.waitForSelector('text=IV')
    await page.waitForSelector('text=Vega')
    await page.waitForSelector('text=Gamma')
  })

  // ── AC-7: Drawers behavior ────────────────────────────────────────────────

  it('AC-7 — drawers collapsed by default: Leg reference and Cost basis content not visible on load', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac7-collapsed-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // Wait for cockpit to render (verdict visible confirms page is settled)
    await page.waitForSelector('text=TARGET HIT')

    // Drawer trigger buttons exist (collapsed by default — aria-expanded=false)
    expect(await page.locator('button:has-text("Leg reference")').count()).toBeGreaterThan(0)
    expect(await page.locator('button:has-text("Cost basis")').count()).toBeGreaterThan(0)

    // "Strike" label inside Leg reference drawer — not rendered when collapsed
    expect(await page.locator(':text-is("Strike")').count()).toBe(0)

    // LegHistoryTable column header inside Cost basis drawer — not rendered when collapsed
    expect(await page.locator('text=Running Basis / Share').count()).toBe(0)
  })

  it('AC-7 — drawers expand on click: clicking Leg reference reveals Strike and Expiration', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac7-expand-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_TARGET_HIT }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=TARGET HIT')

    // Before click: Strike label absent from DOM
    expect(await page.locator(':text-is("Strike")').count()).toBe(0)

    // Click the Leg reference drawer trigger to expand
    await page.click('button:has-text("Leg reference")')

    // After expand: Strike label visible and expiration date value visible
    await page.waitForSelector(':text-is("Strike")')
    await page.waitForSelector(`:has-text("${EXPIRATION_30D}")`)
  })

  // ── AC-8: No-active-leg state ─────────────────────────────────────────────

  it('AC-8 — no-active-leg: HOLDING_SHARES shows NO ACTIVE LEG verdict, no Risk snapshot', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac8-no-leg-${Date.now()}.db`)
    // Empty snapshots (default): no active option leg after assignment
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await assignCsp(page, positionId)
    await goToPositionDetail(page, positionId)

    // HOLDING_SHARES with no active leg → SHARES_VERDICT label
    await page.waitForSelector('text=NO ACTIVE LEG')

    // No-active-leg branch never renders RiskSnapshot
    expect(await page.locator('text=Risk snapshot').count()).toBe(0)
  })

  // ── AC-9: Live poll ───────────────────────────────────────────────────────

  it('AC-9 — live poll: navigating to position detail with snapshot triggers ContextStrip render', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac9-live-poll-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_HOLD }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // ContextStrip renders when greeks arrive from the option snapshot poll
    await page.waitForSelector('text=Theta')
  })

  // ── AC-10: Preserved surfaces ─────────────────────────────────────────────

  it('AC-10 — CloseCspForm preserved: CSP_OPEN position shows close form below cockpit', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac10-close-csp-${Date.now()}.db`)
    // Empty snapshots (default): cockpit renders without market data
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // CSP_OPEN with active leg → CloseCspForm renders below PositionCockpit
    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // CloseCspForm wraps in SectionCard with header "Buy to Close"
    await page.waitForSelector('text=Buy to Close')
  })

  it('AC-10 — Notes preserved: position with thesis text shows Notes section below cockpit', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-ac10-notes-${Date.now()}.db`)
    // Empty snapshots (default): notes section renders regardless of market data
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page, { thesis: 'Bullish on support level' })
    await goToPositionDetail(page, positionId)

    // Notes SectionCard and thesis text rendered below the cockpit
    await page.waitForSelector('text=Notes')
    await page.waitForSelector('text=Bullish on support level')
  })

  // ── US-34 AC: Delta color coding ─────────────────────────────────────────

  it('US-34 AC: delta green for CSP with |delta| < 0.30', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-delta-green-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_HOLD } // |delta|=0.15 → normal → var(--wb-green)
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Risk snapshot')

    // DeltaGauge: track circle at index 0, fill circle at index 1
    // SEVERITY_COLOR.normal = 'var(--wb-green)'
    const riskSection = page.locator('section').filter({ hasText: 'Risk snapshot' })
    const fillCircle = riskSection.locator('svg circle').nth(1)
    expect(await fillCircle.getAttribute('stroke')).toBe('var(--wb-green)')
  })

  it('US-34 AC: delta gold for CSP with |delta| between 0.30 and 0.45', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-delta-gold-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_WATCH } // |delta|=0.35 → warning → var(--wb-gold)
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Risk snapshot')

    // SEVERITY_COLOR.warning = 'var(--wb-gold)'
    const riskSection = page.locator('section').filter({ hasText: 'Risk snapshot' })
    const fillCircle = riskSection.locator('svg circle').nth(1)
    expect(await fillCircle.getAttribute('stroke')).toBe('var(--wb-gold)')
  })

  it('US-34 AC: delta red for CSP with |delta| > 0.45', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-delta-red-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_CONSIDER_ROLL } // |delta|=0.52 → danger → var(--wb-red)
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=Risk snapshot')

    // SEVERITY_COLOR.danger = 'var(--wb-red)'
    const riskSection = page.locator('section').filter({ hasText: 'Risk snapshot' })
    const fillCircle = riskSection.locator('svg circle').nth(1)
    expect(await fillCircle.getAttribute('stroke')).toBe('var(--wb-red)')
  })

  // ── US-34 AC: Greeks formatting ───────────────────────────────────────────

  it('US-34 AC: theta displayed as $X.XX/d not raw per-share', async () => {
    // theta='-0.05', contracts=1 → thetaDollar = |(-0.05)| * 100 * 1 = 5.0 → '$5.00/d'
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-theta-format-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_HOLD }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // ContextStrip renders theta as fmtMoney(thetaDollar) + '/d'
    await page.waitForSelector(':has-text("$5.00/d")')
  })

  it('US-34 AC: IV displayed as XX.X% not decimal', async () => {
    // iv='0.25' → (0.25 * 100).toFixed(1) + '%' = '25.0%'
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-iv-format-${Date.now()}.db`)
    app = await launchWithMocks(dbPath, {
      optionSnapshots: { [OCC_30D]: SNAP_HOLD }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector(':has-text("25.0%")')
  })

  // ── US-34 AC: Absence scenarios ───────────────────────────────────────────

  it('US-34 AC: Greeks unavailable — ContextStrip absent, no error alert', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-greeks-unavailable-${Date.now()}.db`)
    // Empty snapshots (default): greeks=null → ContextStrip returns null
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await goToPositionDetail(page, positionId)

    // Confirm cockpit rendered (verdict visible)
    await page.waitForSelector('text=Awaiting market data')

    // ContextStrip absent — Theta label not in DOM
    expect(await page.locator(':text-is("Theta")').count()).toBe(0)

    // No error alert rendered
    expect(await page.locator('[role="alert"]').count()).toBe(0)
  })

  it('US-34 AC: HOLDING_SHARES — ContextStrip and RiskSnapshot not rendered', async () => {
    dbPath = path.join(os.tmpdir(), `wb-e2e-us34-holding-shares-${Date.now()}.db`)
    // Empty snapshots (default): no option data after assignment
    app = await launchWithMocks(dbPath)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const positionId = await seedPosition(page)
    await assignCsp(page, positionId)
    await goToPositionDetail(page, positionId)

    await page.waitForSelector('text=NO ACTIVE LEG')

    // No-active-leg branch: neither RiskSnapshot nor ContextStrip are rendered
    expect(await page.locator('text=Risk snapshot').count()).toBe(0)
    expect(await page.locator(':text-is("Theta")').count()).toBe(0)
  })
})
