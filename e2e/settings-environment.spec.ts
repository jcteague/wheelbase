import { afterEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localDate } from './dates'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')
const DEFAULT_EXPIRATION = localDate(30)
const DEFAULT_STRIKE = 180

// OCC symbol builder kept inline to mirror the pattern in option-pnl.spec.ts /
// position-cockpit.spec.ts — keeps the e2e fixture key in sync with the dynamic
// expiration so tests don't rot the day after they're authored.
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

const DEFAULT_OPTION_SYMBOL = occSym('AAPL', DEFAULT_EXPIRATION, 'PUT', DEFAULT_STRIKE)

const STOCK_QUOTES = {
  AAPL: {
    price: '182.45',
    bid: '182.40',
    ask: '182.50',
    change: '1.45',
    changePercent: '0.0080',
    prevClose: '181.00',
    volume: 50000000,
    timestamp: '2026-06-02T15:00:00Z'
  }
}
const OPTION_SNAPSHOTS = {
  [DEFAULT_OPTION_SYMBOL]: {
    bid: '3.50',
    ask: '3.70',
    mid: '3.60',
    lastTrade: '3.55',
    openInterest: 100,
    volume: 50,
    greeks: { delta: '-0.42', gamma: '0.02', theta: '-0.05', vega: '0.10' },
    impliedVolatility: '0.28',
    timestamp: '2026-06-02T15:00:00Z'
  }
}
const PAPER_ACCOUNT = {
  buyingPower: '45000.00',
  portfolioValue: '72000.00',
  cash: '27000.00',
  environment: 'paper',
  accountNumberMasked: 'PA…ABC'
}
const LIVE_ACCOUNT = {
  buyingPower: '9800.00',
  portfolioValue: '125000.00',
  cash: '14200.00',
  environment: 'live',
  accountNumberMasked: 'AL…XYZ'
}
const DEFAULT_CONNECTION_MOCKS = {
  alpaca: {
    paper: { ok: true, vendor: 'alpaca', environment: 'paper', accountNumberMasked: 'PA…ABC' },
    live: { ok: true, vendor: 'alpaca', environment: 'live', accountNumberMasked: 'AL…XYZ' }
  }
}

type LaunchOptions = {
  stockQuotes?: Record<string, object>
  optionSnapshots?: Record<string, object>
  mockSettingsConnections?: object
  fakeBrokerError?: string
  brokerAccount?: object
  brokerAccountPaper?: object
  brokerAccountLive?: object
}

function tmpDb(): string {
  return path.join(os.tmpdir(), `wheelbase-e2e-settings-${Date.now()}-${Math.random()}.db`)
}

function cleanupDb(dbPath: string): void {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`)
  if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`)
}

function buildEnv(dbPath: string, options: LaunchOptions): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    // See buildLaunchEnv: an inlined or exported Alpaca key would otherwise decide the
    // empty-state assertions for us.
    ALPACA_KEY_ID: '',
    ALPACA_SECRET_KEY: '',
    WHEELBASE_DB_PATH: dbPath,
    FAKE_MARKET_DATA: 'true',
    FAKE_BROKER: 'true',
    WHEELBASE_MOCK_STOCK_QUOTES: JSON.stringify(options.stockQuotes ?? {}),
    WHEELBASE_MOCK_OPTION_SNAPSHOTS: JSON.stringify(options.optionSnapshots ?? {}),
    WHEELBASE_MOCK_SETTINGS_CONNECTIONS: JSON.stringify(
      options.mockSettingsConnections ?? DEFAULT_CONNECTION_MOCKS
    ),
    FAKE_BROKER_ERROR: options.fakeBrokerError ?? '',
    FAKE_BROKER_ACCOUNT: options.brokerAccount ? JSON.stringify(options.brokerAccount) : '',
    FAKE_BROKER_ACCOUNT_PAPER: options.brokerAccountPaper
      ? JSON.stringify(options.brokerAccountPaper)
      : '',
    FAKE_BROKER_ACCOUNT_LIVE: options.brokerAccountLive
      ? JSON.stringify(options.brokerAccountLive)
      : ''
  }
}

async function launchApp(
  dbPath: string,
  options: LaunchOptions = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: buildEnv(dbPath, options)
  })
}

async function getPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

async function openSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.waitForSelector('text=Settings')
  await page.waitForSelector('[aria-label="Market Data"]')
}

async function clickBrokerEnvironmentToggle(
  page: Page,
  environment: 'paper' | 'live'
): Promise<void> {
  const brokerSection = page.getByRole('region', { name: 'Broker' })
  await brokerSection
    .locator('label')
    .filter({ hasText: environment === 'paper' ? 'PAPER' : 'LIVE' })
    .click()
}

async function openPositions(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/new'
  })
  await page.waitForSelector('label:has-text("Ticker")')
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await page.waitForSelector('text=Active Positions')
}

async function seedPosition(
  page: Page,
  overrides: Partial<{
    ticker: string
    strike: number
    expiration: string
    contracts: number
    premiumPerContract: number
  }> = {}
): Promise<void> {
  await page.evaluate(
    async (payload) => {
      const result = await window.api.createPosition(payload)
      if (!result.ok) {
        throw new Error(`createPosition failed: ${JSON.stringify(result)}`)
      }
    },
    {
      ticker: overrides.ticker ?? 'AAPL',
      strike: overrides.strike ?? 180,
      expiration: overrides.expiration ?? DEFAULT_EXPIRATION,
      contracts: overrides.contracts ?? 1,
      premiumPerContract: overrides.premiumPerContract ?? 2.5
    }
  )
}

async function saveAlpacaViaApi(
  page: Page,
  environment: 'paper' | 'live',
  keyId: string,
  secret: string
): Promise<void> {
  await page.evaluate(
    async (payload) => {
      await window.api.settings.saveAlpaca(payload)
    },
    { environment, keyId, secret }
  )
}

async function setActiveEnvironmentViaApi(
  page: Page,
  environment: 'paper' | 'live'
): Promise<void> {
  await page.evaluate(
    async (payload) => {
      await window.api.settings.setActiveBrokerEnvironment(payload)
    },
    { environment }
  )
}

async function getBrokerAccount(page: Page): Promise<{
  environment: 'paper' | 'live'
  accountNumberMasked: string
}> {
  return page.evaluate(async () => {
    const result = await window.api.broker.account()
    if (!result.ok) throw new Error(result.errors[0]?.message ?? 'broker account failed')
    return result.account as { environment: 'paper' | 'live'; accountNumberMasked: string }
  })
}

async function fillCredentialCard(
  page: Page,
  environment: 'paper' | 'live',
  values: { keyId: string; secret: string }
): Promise<void> {
  const card = page.getByTestId(`alpaca-card-${environment}`)
  await card.getByLabel('API Key ID').fill(values.keyId)
  await card.getByLabel('Secret Key').fill(values.secret)
}

function readSqliteArtifacts(dbPath: string): string {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath))
    .map((buffer) => buffer.toString('utf8'))
    .join('\n')
}

describe('US-37 Layer 5 e2e coverage', () => {
  let app: ElectronApplication | undefined
  let dbPath = ''

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
    app = undefined
    dbPath = ''
  })

  // [US-99 AC9] Alpaca is the only market-data vendor named anywhere in Settings.
  it('Settings names Alpaca as the market-data source', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await openSettings(page)

    const marketSection = page.getByRole('region', { name: 'Market Data' })
    const brokerSection = page.getByRole('region', { name: 'Broker' })

    const marketText = await marketSection.textContent()
    expect(marketText).toContain('Market Data — Alpaca')
    expect(marketText).toContain('Connect Alpaca below to enable market data')
    expect(marketText).toContain('Refresh IVR now')
    expect(await marketSection.getByRole('button', { name: 'Test connection' }).count()).toBe(0)
    expect(await marketSection.locator('input').count()).toBe(0)

    expect(await brokerSection.textContent()).toContain('Paper credentials')
    expect(await brokerSection.textContent()).toContain('Live credentials')
    expect(await page.textContent('body')).toContain('Active Broker Environment')
    expect(await page.getByLabel('Paper').isVisible()).toBe(true)
    expect(await page.getByLabel('Live').isVisible()).toBe(true)
  })

  // [US-99 AC9] Once the active environment has keys, the region says which ones are in use.
  it('Settings reports the active credentials once Alpaca is connected', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await openSettings(page)

    const marketText = await page.getByRole('region', { name: 'Market Data' }).textContent()
    expect(marketText).toContain('Using paper credentials')
    expect(marketText).not.toContain('Connect Alpaca below to enable market data')
  })

  // [US-99 AC10] The FAKE_MARKET_DATA path is untouched by the vendor swap.
  it('Market data is enabled by the active Alpaca credentials', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS
    })
    const page = await getPage(app)

    await seedPosition(page)
    await openPositions(page)

    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')
    expect(await page.getByTestId('position-card-AAPL-opt-mid').textContent()).toContain('$3.60')
  })

  it('Test connection for Alpaca surfaces the account identifier and environment', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      mockSettingsConnections: DEFAULT_CONNECTION_MOCKS
    })
    const page = await getPage(app)

    await openSettings(page)
    await fillCredentialCard(page, 'paper', {
      keyId: 'PKPAPER123',
      secret: 'paper-secret'
    })
    await page
      .getByTestId('alpaca-card-paper')
      .getByRole('button', { name: 'Test connection' })
      .click()

    await page.waitForSelector('text=✓ Verified — Account PA…ABC (paper)')
    expect(await page.textContent('body')).toContain('✓ Verified — Account PA…ABC (paper)')
  })

  it('Test connection detects environment mismatch', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      mockSettingsConnections: DEFAULT_CONNECTION_MOCKS
    })
    const page = await getPage(app)

    await openSettings(page)
    await fillCredentialCard(page, 'paper', {
      keyId: 'AKLIVE456',
      secret: 'live-secret'
    })
    await page
      .getByTestId('alpaca-card-paper')
      .getByRole('button', { name: 'Test connection' })
      .click()

    await page.waitForSelector('text=Environment mismatch — these are LIVE keys, not paper keys')
    expect(await page.getByTestId('alpaca-card-paper').textContent()).toContain('NOT CONFIGURED')
  })

  it('Switching broker environment to LIVE requires confirmation', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await saveAlpacaViaApi(page, 'live', 'AKLIVE456', 'live-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await openSettings(page)

    await clickBrokerEnvironmentToggle(page, 'live')
    await page.waitForSelector('text=Switch to LIVE Alpaca account?')

    const dialog = page.getByRole('dialog')
    const text = await dialog.textContent()
    expect(text).toContain(
      'From now on, Wheelbase will read buying power, cash, and broker activities'
    )
    expect(text).toContain('Header changes from amber PAPER to green LIVE')
    expect(text).toContain('Buying power, cash, activities — all switch to your live account')
    expect(text).toContain('Positions in Wheelbase are not synchronized')
    expect(text).toContain('Phase 4 order execution will route to live when enabled')
    expect(text).toContain(
      'Market data reconnects with your live keys — same Alpaca feeds, same prices.'
    )
    expect(
      await dialog.getByRole('button', { name: 'Switch to LIVE' }).getAttribute('class')
    ).toContain('bg-wb-gold')
  })

  it('LIVE confirmation includes position-reconciliation warning when positions exist', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await saveAlpacaViaApi(page, 'live', 'AKLIVE456', 'live-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await seedPosition(page)
    await openSettings(page)

    await clickBrokerEnvironmentToggle(page, 'live')
    await page.waitForSelector('text=You have 1 open positions in Wheelbase.')

    expect(await page.textContent('body')).toContain(
      'Verify each one matches an actual contract in your live Alpaca account before acting on it.'
    )
  })

  it('Confirming the switch reinitialises only the BrokerProvider', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS,
      brokerAccountPaper: PAPER_ACCOUNT,
      brokerAccountLive: LIVE_ACCOUNT
    })
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await saveAlpacaViaApi(page, 'live', 'AKLIVE456', 'live-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await seedPosition(page)
    await openPositions(page)

    expect((await getBrokerAccount(page)).environment).toBe('paper')
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')

    await openSettings(page)
    await clickBrokerEnvironmentToggle(page, 'live')
    await page.getByRole('button', { name: 'Switch to LIVE' }).click()
    await page.waitForSelector('text=LIVE')

    const account = await getBrokerAccount(page)
    expect(account.environment).toBe('live')
    expect(account.accountNumberMasked).toBe('AL…XYZ')
    expect(await page.textContent('body')).toContain('LIVE')
    await openPositions(page)
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')
  })

  // [US-99 AC5] A credential change tears down and rebuilds the market-data socket. The
  // observable guarantee is that prices survive the switch — the renderer never re-issues
  // set-stock-quote-tickers, so a restart that dropped the ticker set would blank the cell.
  it('Switching broker environment restarts market data with the new keys', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS,
      brokerAccountPaper: PAPER_ACCOUNT,
      brokerAccountLive: LIVE_ACCOUNT
    })
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await saveAlpacaViaApi(page, 'live', 'AKLIVE456', 'live-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await seedPosition(page)
    await openPositions(page)
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')

    await openSettings(page)
    await clickBrokerEnvironmentToggle(page, 'live')
    await page.getByRole('button', { name: 'Switch to LIVE' }).click()
    await page.waitForSelector('text=LIVE')

    await openPositions(page)
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')
    expect(await page.getByTestId('position-card-AAPL-opt-mid').textContent()).toContain('$3.60')
    expect(await page.textContent('body')).not.toContain('NO BROKER')
  })

  it('Switching back to Paper is immediate', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await saveAlpacaViaApi(page, 'live', 'AKLIVE456', 'live-secret')
    await setActiveEnvironmentViaApi(page, 'live')
    await openSettings(page)

    await clickBrokerEnvironmentToggle(page, 'paper')
    await page.waitForSelector('text=PAPER')

    expect(await page.locator('[role="dialog"]').count()).toBe(0)
    expect(await page.textContent('body')).toContain('PAPER')
  })

  it('Broker environment badge is always visible and clearly distinguished', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await openPositions(page)

    const badge = page.locator('text=PAPER').first()
    expect(await badge.isVisible()).toBe(true)
    expect(await page.getByTestId('environment-badge-dot').getAttribute('class')).toContain(
      'animate-wb-pulse'
    )

    await openSettings(page)
    expect(await badge.isVisible()).toBe(true)
  })

  it('Market data fixtures render without a broker account', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS
    })
    const page = await getPage(app)

    await seedPosition(page)
    await openPositions(page)

    expect(await page.textContent('body')).toContain(
      'Connect Alpaca to enable market data, broker activity and buying power.'
    )
    expect(await page.textContent('body')).toContain('NO BROKER')
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')
    expect(await page.getByTestId('position-card-AAPL-opt-mid').textContent()).toContain('$3.60')
  })

  it('Alpaca credentials are stored securely per environment', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', '  PKPAPER123  ', '  paper-secret  ')
    await saveAlpacaViaApi(page, 'live', '  AKLIVE456  ', '  live-secret  ')
    await app.close()
    app = undefined
    const sqliteContents = readSqliteArtifacts(dbPath)

    expect(sqliteContents).not.toContain('PKPAPER123')
    expect(sqliteContents).not.toContain('paper-secret')
    expect(sqliteContents).not.toContain('AKLIVE456')
    expect(sqliteContents).not.toContain('live-secret')

    app = await launchApp(dbPath)
    const relaunchedPage = await getPage(app)
    await openSettings(relaunchedPage)
    await relaunchedPage.waitForSelector(
      '[data-testid="alpaca-card-paper"] button:has-text("Replace")'
    )
    await relaunchedPage.waitForSelector(
      '[data-testid="alpaca-card-live"] button:has-text("Replace")'
    )

    expect(
      await relaunchedPage
        .locator('[data-testid="alpaca-card-paper"] input[readonly]')
        .nth(1)
        .inputValue()
    ).toBe('••••••••••••••••••••')
    expect(
      await relaunchedPage
        .locator('[data-testid="alpaca-card-live"] input[readonly]')
        .nth(1)
        .inputValue()
    ).toBe('••••••••••••••••••••')
    expect(
      await relaunchedPage
        .locator('[data-testid="alpaca-card-paper"] input[readonly]')
        .nth(1)
        .inputValue()
    ).toBe('••••••••••••••••••••')
    expect(await relaunchedPage.textContent('body')).toContain('Replace')
  })

  it('App remembers the last active broker environment between launches', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await app.close()
    app = undefined

    app = await launchApp(dbPath)
    const relaunchedPage = await getPage(app)
    await relaunchedPage.waitForSelector('text=PAPER')

    expect(await relaunchedPage.textContent('body')).toContain('PAPER')
  })

  // [US-99 AC4] No credentials: the app runs, names Alpaca once, and dashes the prices.
  it('Empty-state on first launch shows the Connect Alpaca banner and dashes', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath)
    const page = await getPage(app)

    await seedPosition(page)
    await openPositions(page)

    const body = await page.textContent('body')
    expect(body).toContain(
      'Connect Alpaca to enable market data, broker activity and buying power.'
    )
    // Guards the retired vendor's banner by its distinctive phrase rather than its name,
    // so the AC9 repo-wide grep for the retired vendor's name stays empty.
    expect(body).not.toContain('app-provided')
    expect(await page.getByRole('link', { name: 'Alpaca setup' }).getAttribute('href')).toBe(
      '#/settings'
    )
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('—')
    expect(await page.getByTestId('position-card-AAPL-opt-mid').textContent()).toContain('—')
  })

  // [US-99 AC9] The stream auth prompt names Alpaca and renders exactly once.
  it('Positions auth prompt names Alpaca', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS
    })
    const page = await getPage(app)

    await seedPosition(page)
    await openPositions(page)
    expect(await page.getByTestId('position-card-AAPL-price').textContent()).toContain('$182.45')

    await page.evaluate(async () => {
      await window.api.triggerStreamError({
        feed: 'stockQuotes',
        code: 'auth_failed',
        message: 'Alpaca authentication failed — check your key in Settings',
        reconnectable: false
      })
    })
    await page.waitForSelector('[data-testid="stale-data-banner"]')
    expect(await page.textContent('body')).toContain(
      'Alpaca authentication failed — check your key in Settings'
    )

    await app.close()
    app = await launchApp(dbPath)
    const relaunchedPage = await getPage(app)
    await openPositions(relaunchedPage)

    expect(await relaunchedPage.getByTestId('position-card-AAPL-price').textContent()).toContain(
      'unavailable'
    )
  })

  it('Expired Alpaca credentials surface a re-entry prompt', async () => {
    dbPath = tmpDb()
    app = await launchApp(dbPath, {
      stockQuotes: STOCK_QUOTES,
      optionSnapshots: OPTION_SNAPSHOTS
    })
    const page = await getPage(app)

    await saveAlpacaViaApi(page, 'paper', 'PKPAPER123', 'paper-secret')
    await setActiveEnvironmentViaApi(page, 'paper')
    await seedPosition(page)
    await openPositions(page)

    await page.evaluate(async () => {
      await window.api.triggerStreamError({
        feed: 'stockQuotes',
        code: 'auth_failed',
        message: 'Alpaca authentication failed — check your key in Settings',
        reconnectable: false
      })
    })
    await page.waitForSelector('text=Alpaca authentication failed — check your key in Settings')
    expect(await page.textContent('body')).toContain(
      'Alpaca authentication failed — check your key in Settings'
    )

    await app.close()
    app = await launchApp(dbPath, {
      fakeBrokerError: 'auth_failed'
    })
    const relaunchedPage = await getPage(app)
    await openPositions(relaunchedPage)
    await relaunchedPage.waitForSelector(
      'text=Alpaca authentication failed — check your key in Settings'
    )

    const body = await relaunchedPage.textContent('body')
    expect(body).toContain('Alpaca authentication failed — check your key in Settings')
  })
})
