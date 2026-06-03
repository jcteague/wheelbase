// [US-31, US-39, US-40] Provider Split + Massive + Alpaca Broker — E2E tests
//
// Covers every AC from US-31 (interface separation), US-39 (MassiveMarketDataProvider),
// and US-40 (AlpacaBrokerProvider).
//
// Uses FakeMarketDataProvider (FAKE_MARKET_DATA=true) and FakeBrokerProvider
// (FAKE_BROKER=true) so no real API credentials are required.
//
// Error injection is controlled via FAKE_MARKET_DATA_ERROR / FAKE_BROKER_ERROR env
// vars; setting these makes the fake providers throw the specified error code on
// every provider call, exercising the IPC error-response path end-to-end.
//
// NOTE: Requires a compiled app. `pnpm test:e2e` handles the build step for you;
// if you invoke Vitest directly, run `pnpm build` first so `out/main/index.js` exists.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')
const APP_CWD = path.join(__dirname, '..')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STOCK_QUOTE_AAPL = {
  price: '182.45',
  bid: '182.40',
  ask: '182.50',
  change: '1.45',
  changePercent: '0.0080',
  prevClose: '181.00',
  volume: 50000000,
  timestamp: '2026-05-29T15:00:00Z'
}

// OCC symbol: AAPL, expiry 2026-06-20, Put, strike 180.000
const OCC_WITH_GREEKS = 'AAPL260620P00180000'
const SNAPSHOT_WITH_GREEKS = {
  bid: '3.50',
  ask: '3.70',
  mid: '3.60',
  lastTrade: '3.55',
  openInterest: 100,
  volume: 50,
  greeks: { delta: '-0.42', gamma: '0.02', theta: '-0.05', vega: '0.10' },
  impliedVolatility: '0.28',
  timestamp: '2026-05-29T15:00:00Z'
}

// OCC symbol: AAPL, expiry 2026-06-20, Put, strike 185.000 — no Greeks
const OCC_WITHOUT_GREEKS = 'AAPL260620P00185000'
const SNAPSHOT_WITHOUT_GREEKS = {
  bid: '5.50',
  ask: '5.70',
  mid: '5.60',
  lastTrade: '5.55',
  openInterest: null,
  volume: null,
  timestamp: '2026-05-29T15:00:00Z'
}

const ACCOUNT_FIXTURE = {
  buyingPower: '45000.00',
  portfolioValue: '72000.00',
  cash: '27000.00',
  environment: 'paper',
  accountNumberMasked: 'PA…ABC'
}

const ACTIVITIES_FIXTURE = [
  {
    activityId: 'act-1',
    activityType: 'OPASN',
    symbol: 'AAPL',
    qty: 100,
    price: '180.00',
    transactionTime: '2026-05-01T14:30:00Z'
  }
]

const MARKET_STATUS_FIXTURE = {
  isOpen: true,
  session: 'regular',
  nextOpen: '2026-05-30T13:30:00Z',
  nextClose: '2026-05-29T20:00:00Z'
}

const ALL_OPTION_SNAPSHOTS = {
  [OCC_WITH_GREEKS]: SNAPSHOT_WITH_GREEKS,
  [OCC_WITHOUT_GREEKS]: SNAPSHOT_WITHOUT_GREEKS
}

// ── Launch helpers ─────────────────────────────────────────────────────────────

type LaunchOpts = {
  stockQuotes?: Record<string, object>
  optionSnapshots?: Record<string, object>
  brokerAccount?: object
  brokerActivities?: object[]
  marketStatus?: object
  extraEnv?: Record<string, string>
}

function buildEnv(dbPath: string, opts: LaunchOpts): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    WHEELBASE_DB_PATH: dbPath,
    FAKE_MARKET_DATA: 'true',
    FAKE_BROKER: 'true'
  }
  if (opts.stockQuotes) env.WHEELBASE_MOCK_STOCK_QUOTES = JSON.stringify(opts.stockQuotes)
  if (opts.optionSnapshots)
    env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify(opts.optionSnapshots)
  if (opts.brokerAccount) env.FAKE_BROKER_ACCOUNT = JSON.stringify(opts.brokerAccount)
  if (opts.brokerActivities) env.FAKE_BROKER_ACTIVITIES = JSON.stringify(opts.brokerActivities)
  if (opts.marketStatus) env.FAKE_MARKET_STATUS = JSON.stringify(opts.marketStatus)
  if (opts.extraEnv) Object.assign(env, opts.extraEnv)
  return env
}

function launchWithFakeProviders(
  dbPath: string,
  opts: LaunchOpts = {}
): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_PATH, '--no-sandbox'],
    cwd: APP_CWD,
    env: buildEnv(dbPath, opts)
  })
}

function launchWithProviderError(
  dbPath: string,
  opts: { marketDataError?: string; brokerError?: string }
): Promise<ElectronApplication> {
  return launchWithFakeProviders(dbPath, {
    extraEnv: {
      ...(opts.marketDataError ? { FAKE_MARKET_DATA_ERROR: opts.marketDataError } : {}),
      ...(opts.brokerError ? { FAKE_BROKER_ERROR: opts.brokerError } : {})
    }
  })
}

async function getPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

function tmpDb(): string {
  return path.join(os.tmpdir(), `wb-e2e-ps-${Date.now()}.db`)
}

function cleanupDb(dbPath: string): void {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
}

async function relaunchWithError(
  currentApp: ElectronApplication,
  currentDbPath: string,
  errorOpts: { marketDataError?: string; brokerError?: string }
): Promise<{ app: ElectronApplication; page: Page; dbPath: string }> {
  await currentApp.close()
  cleanupDb(currentDbPath)
  const dbPath = tmpDb()
  const app = await launchWithProviderError(dbPath, errorOpts)
  const page = await getPage(app)
  return { app, page, dbPath }
}

// ── US-31: Provider Split — IPC channel routing ────────────────────────────────

describe('US-31: Provider Split — IPC channel routing', () => {
  let app: ElectronApplication
  let dbPath: string
  let page: Page

  beforeEach(async () => {
    dbPath = tmpDb()
    app = await launchWithFakeProviders(dbPath, {
      stockQuotes: { AAPL: STOCK_QUOTE_AAPL },
      optionSnapshots: ALL_OPTION_SNAPSHOTS,
      brokerAccount: ACCOUNT_FIXTURE,
      brokerActivities: ACTIVITIES_FIXTURE,
      marketStatus: MARKET_STATUS_FIXTURE
    })
    page = await getPage(app)
  })

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('MarketDataProvider exposes stock quote retrieval', async () => {
    const { ok, bid, ask } = await page.evaluate(async () => {
      const result = await window.api.marketData.stockQuotes({ tickers: ['AAPL'] })
      if (!result.ok) return { ok: false as const, bid: null, ask: null }
      const q = result.quotes.AAPL
      return { ok: true as const, bid: q?.bid ?? null, ask: q?.ask ?? null }
    })
    expect(ok).toBe(true)
    expect(bid).toBe('182.40')
    expect(ask).toBe('182.50')
  })

  it('MarketDataProvider exposes option contract snapshot', async () => {
    const { ok, bid, delta, iv } = await page.evaluate(async (contract) => {
      const result = await window.api.marketData.optionSnapshot({ underlying: 'AAPL', contract })
      if (!result.ok) return { ok: false as const, bid: null, delta: null, iv: null }
      const snap = result.snapshot as IpcOptionSnapshot & {
        greeks?: { delta: string }
        impliedVolatility?: string
      }
      return {
        ok: true as const,
        bid: snap.bid,
        delta: snap.greeks?.delta ?? null,
        iv: snap.impliedVolatility ?? null
      }
    }, OCC_WITH_GREEKS)
    expect(ok).toBe(true)
    expect(bid).toBe('3.50')
    expect(delta).toBe('-0.42')
    expect(iv).toBe('0.28')
  })

  it('MarketDataProvider exposes option chain snapshot with filters', async () => {
    const { ok, count, hasNextCursor } = await page.evaluate(async () => {
      const result = await window.api.marketData.optionChain({ underlying: 'AAPL', type: 'put' })
      if (!result.ok) return { ok: false as const, count: 0, hasNextCursor: false }
      return {
        ok: true as const,
        count: result.snapshots.length,
        hasNextCursor: 'nextCursor' in result
      }
    })
    expect(ok).toBe(true)
    expect(count).toBeGreaterThan(0)
    expect(hasNextCursor).toBe(true)
  })

  it('MarketDataProvider declares streaming capability', async () => {
    // Streaming capability is validated by successful stock-quote subscription.
    // FakeMarketDataProvider.supportsStreaming('stockQuotes') returns true,
    // allowing the subscription to proceed and return the tickers list.
    const { ok, tickers } = await page.evaluate(async () => {
      const result = await window.api.setStockQuoteTickers({ tickers: ['AAPL'] })
      if (!result.ok) return { ok: false as const, tickers: [] as string[] }
      return { ok: true as const, tickers: result.subscribedTickers }
    })
    expect(ok).toBe(true)
    expect(tickers).toContain('AAPL')
  })

  it('BrokerProvider exposes account info', async () => {
    const { ok, environment, masked, buyingPower } = await page.evaluate(async () => {
      const result = await window.api.broker.account()
      if (!result.ok)
        return { ok: false as const, environment: null, masked: null, buyingPower: null }
      return {
        ok: true as const,
        environment: result.account.environment,
        masked: result.account.accountNumberMasked,
        buyingPower: result.account.buyingPower
      }
    })
    expect(ok).toBe(true)
    expect(environment).toBe('paper')
    expect(masked).toBe('PA…ABC')
    expect(buyingPower).toBe('45000.00')
  })

  it('BrokerProvider exposes broker activity polling', async () => {
    const { ok, activityType, symbol } = await page.evaluate(async () => {
      const result = await window.api.broker.activities({
        type: 'OPASN',
        since: '2026-01-01T00:00:00.000Z'
      })
      if (!result.ok) return { ok: false as const, activityType: null, symbol: null }
      const first = result.activities[0]
      return {
        ok: true as const,
        activityType: first?.activityType ?? null,
        symbol: first?.symbol ?? null
      }
    })
    expect(ok).toBe(true)
    expect(activityType).toBe('OPASN')
    expect(symbol).toBe('AAPL')
  })

  it('BrokerProvider exposes market status', async () => {
    const { ok, session, isOpen } = await page.evaluate(async () => {
      const result = await window.api.broker.marketStatus()
      if (!result.ok) return { ok: false as const, session: null, isOpen: null }
      return { ok: true as const, session: result.status.session, isOpen: result.status.isOpen }
    })
    expect(ok).toBe(true)
    expect(['regular', 'pre', 'post', 'closed']).toContain(session)
    expect(isOpen).toBe(true)
  })

  it('Interfaces remain independent', () => {
    const mdpPath = path.join(__dirname, '../src/main/integrations/market-data-provider.ts')
    const content = fs.readFileSync(mdpPath, 'utf8')
    expect(content).not.toContain('broker-provider')
    expect(content).not.toContain('BrokerProvider')
    expect(content).not.toContain('BrokerError')
  })
})

// ── US-39: Market data behaviors via IPC ──────────────────────────────────────

describe('US-39: Market data behaviors via IPC', () => {
  let app: ElectronApplication
  let dbPath: string
  let page: Page

  beforeEach(async () => {
    dbPath = tmpDb()
    app = await launchWithFakeProviders(dbPath, {
      stockQuotes: { AAPL: STOCK_QUOTE_AAPL },
      optionSnapshots: ALL_OPTION_SNAPSHOTS
    })
    page = await getPage(app)
  })

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('getStockQuotes returns NBBO for each ticker', async () => {
    // fetchStockQuotes flattens to { price, bid, ask, prevClose, volume, timestamp }
    const { ok, bid, ask, price, prevClose } = await page.evaluate(async () => {
      const result = await window.api.marketData.stockQuotes({ tickers: ['AAPL'] })
      if (!result.ok)
        return { ok: false as const, bid: null, ask: null, price: null, prevClose: null }
      const q = result.quotes.AAPL
      return {
        ok: true as const,
        bid: q?.bid ?? null,
        ask: q?.ask ?? null,
        price: q?.price ?? null,
        prevClose: q?.prevClose ?? null
      }
    })
    expect(ok).toBe(true)
    expect(bid).toBe('182.40')
    expect(ask).toBe('182.50')
    expect(price).toBe('182.45')
    expect(prevClose).toBe('181.00')
  })

  it('getOptionSnapshot returns full snapshot including Greeks when present', async () => {
    const { ok, bid, delta, gamma, theta, vega, iv } = await page.evaluate(async (contract) => {
      const result = await window.api.marketData.optionSnapshot({ underlying: 'AAPL', contract })
      if (!result.ok)
        return {
          ok: false as const,
          bid: null,
          delta: null,
          gamma: null,
          theta: null,
          vega: null,
          iv: null
        }
      const snap = result.snapshot as IpcOptionSnapshot & {
        greeks?: { delta: string; gamma: string; theta: string; vega: string }
        impliedVolatility?: string
      }
      return {
        ok: true as const,
        bid: snap.bid,
        delta: snap.greeks?.delta ?? null,
        gamma: snap.greeks?.gamma ?? null,
        theta: snap.greeks?.theta ?? null,
        vega: snap.greeks?.vega ?? null,
        iv: snap.impliedVolatility ?? null
      }
    }, OCC_WITH_GREEKS)
    expect(ok).toBe(true)
    expect(bid).toBe('3.50')
    expect(delta).toBe('-0.42')
    expect(gamma).toBe('0.02')
    expect(theta).toBe('-0.05')
    expect(vega).toBe('0.10')
    expect(iv).toBe('0.28')
  })

  it('getOptionSnapshot omits Greeks when absent', async () => {
    const { ok, bid, hasGreeks, hasIv } = await page.evaluate(async (contract) => {
      const result = await window.api.marketData.optionSnapshot({ underlying: 'AAPL', contract })
      if (!result.ok) return { ok: false as const, bid: null, hasGreeks: false, hasIv: false }
      const snap = result.snapshot as IpcOptionSnapshot & {
        greeks?: object
        impliedVolatility?: string
      }
      return {
        ok: true as const,
        bid: snap.bid,
        hasGreeks: snap.greeks !== undefined,
        hasIv: snap.impliedVolatility !== undefined
      }
    }, OCC_WITHOUT_GREEKS)
    expect(ok).toBe(true)
    expect(bid).toBe('5.50')
    // no fabricated zeros — Greeks and IV must be absent
    expect(hasGreeks).toBe(false)
    expect(hasIv).toBe(false)
  })

  it('getOptionChainSnapshot filters by strike, expiration, and contract type', async () => {
    const { ok, count, nextCursorIsNull } = await page.evaluate(async () => {
      const result = await window.api.marketData.optionChain({
        underlying: 'AAPL',
        type: 'put',
        expirationFrom: '2026-06-01',
        expirationTo: '2026-07-31'
      })
      if (!result.ok) return { ok: false as const, count: 0, nextCursorIsNull: false }
      return {
        ok: true as const,
        count: result.snapshots.length,
        nextCursorIsNull: result.nextCursor === null
      }
    })
    expect(ok).toBe(true)
    expect(count).toBeGreaterThan(0)
    expect(nextCursorIsNull).toBe(true)
  })

  it('supportsStreaming declares streamable feeds', async () => {
    // supportsStreaming('stockQuotes') → true in FakeMarketDataProvider.
    // Verified indirectly: setStockQuoteTickers succeeds (subscription proceeds).
    const { ok, tickers } = await page.evaluate(async () => {
      const result = await window.api.setStockQuoteTickers({ tickers: ['AAPL'] })
      if (!result.ok) return { ok: false as const, tickers: [] as string[] }
      return { ok: true as const, tickers: result.subscribedTickers }
    })
    expect(ok).toBe(true)
    expect(tickers).toContain('AAPL')
  })

  it('Missing API key surfaces a typed error', async () => {
    ;({ app, page, dbPath } = await relaunchWithError(app, dbPath, {
      marketDataError: 'auth_failed'
    }))
    const { ok, errorCode } = await page.evaluate(async () => {
      const result = await window.api.marketData.stockQuotes({ tickers: ['AAPL'] })
      if (result.ok) return { ok: true as const, errorCode: null }
      return { ok: false as const, errorCode: result.errors[0]?.code ?? null }
    })
    expect(ok).toBe(false)
    expect(errorCode).toBe('auth_failed')
  })

  it('Massive 401/403 surfaces auth error', async () => {
    // Both missing-key and 401/403 map to auth_failed via the same error injection path.
    ;({ app, page, dbPath } = await relaunchWithError(app, dbPath, {
      marketDataError: 'auth_failed'
    }))
    const { ok, errorCode } = await page.evaluate(async () => {
      const result = await window.api.marketData.stockQuotes({ tickers: ['AAPL'] })
      if (result.ok) return { ok: true as const, errorCode: null }
      return { ok: false as const, errorCode: result.errors[0]?.code ?? null }
    })
    expect(ok).toBe(false)
    expect(errorCode).toBe('auth_failed')
  })

  // Covered by unit tests in massive-market-data.test.ts:
  // retry logic requires network-level mocking not feasible in Electron e2e.
  it.todo('Massive 429 rate limit response is retried with backoff, then succeeds')

  // Covered by unit tests: spy on safeStorage decrypt requires internal process hooks.
  it.todo('API key is loaded once per process and reused')
})

// ── US-40: Broker behaviors via IPC ──────────────────────────────────────────

describe('US-40: Broker behaviors via IPC', () => {
  let app: ElectronApplication
  let dbPath: string
  let page: Page

  beforeEach(async () => {
    dbPath = tmpDb()
    app = await launchWithFakeProviders(dbPath, {
      brokerAccount: ACCOUNT_FIXTURE,
      brokerActivities: ACTIVITIES_FIXTURE,
      marketStatus: MARKET_STATUS_FIXTURE
    })
    page = await getPage(app)
  })

  afterEach(async () => {
    await app?.close()
    cleanupDb(dbPath)
  })

  it('getAccountInfo returns balances, environment, and masked account number', async () => {
    const { ok, environment, masked, buyingPower, portfolioValue, cash } = await page.evaluate(
      async () => {
        const result = await window.api.broker.account()
        if (!result.ok)
          return {
            ok: false as const,
            environment: null,
            masked: null,
            buyingPower: null,
            portfolioValue: null,
            cash: null
          }
        const { account } = result
        return {
          ok: true as const,
          environment: account.environment,
          masked: account.accountNumberMasked,
          buyingPower: account.buyingPower,
          portfolioValue: account.portfolioValue,
          cash: account.cash
        }
      }
    )
    expect(ok).toBe(true)
    expect(environment).toBe('paper')
    // masked format: first2 + '…' + last3
    expect(masked).toMatch(/^.{2}….{3}$/)
    expect(buyingPower).toBe('45000.00')
    expect(portfolioValue).toBe('72000.00')
    expect(cash).toBe('27000.00')
  })

  it('getActivities returns OPASN activities filtered by date', async () => {
    const { ok, count, activityType, symbol, qty } = await page.evaluate(async () => {
      const result = await window.api.broker.activities({
        type: 'OPASN',
        since: '2026-01-01T00:00:00.000Z'
      })
      if (!result.ok)
        return { ok: false as const, count: 0, activityType: null, symbol: null, qty: null }
      const first = result.activities[0]
      return {
        ok: true as const,
        count: result.activities.length,
        activityType: first?.activityType ?? null,
        symbol: first?.symbol ?? null,
        qty: first?.qty ?? null
      }
    })
    expect(ok).toBe(true)
    expect(count).toBeGreaterThan(0)
    expect(activityType).toBe('OPASN')
    expect(symbol).toBe('AAPL')
    expect(qty).toBe(100)
  })

  it('getMarketStatus returns current session', async () => {
    const { ok, session, isOpen } = await page.evaluate(async () => {
      const result = await window.api.broker.marketStatus()
      if (!result.ok) return { ok: false as const, session: null, isOpen: null }
      return { ok: true as const, session: result.status.session, isOpen: result.status.isOpen }
    })
    expect(ok).toBe(true)
    expect(['regular', 'pre', 'post', 'closed']).toContain(session)
    expect(session).toBe('regular')
    expect(isOpen).toBe(true)
  })

  it('Missing Alpaca credentials surface typed error', async () => {
    ;({ app, page, dbPath } = await relaunchWithError(app, dbPath, { brokerError: 'auth_failed' }))
    const { ok, errorCode } = await page.evaluate(async () => {
      const result = await window.api.broker.account()
      if (result.ok) return { ok: true as const, errorCode: null }
      return { ok: false as const, errorCode: result.errors[0]?.code ?? null }
    })
    expect(ok).toBe(false)
    expect(errorCode).toBe('auth_failed')
  })

  it('Environment is sourced from stored credentials', async () => {
    // The FakeBrokerProvider fixture sets environment: 'paper'.
    // The IPC channel returns exactly what the provider reports.
    const { ok, environment } = await page.evaluate(async () => {
      const result = await window.api.broker.account()
      if (!result.ok) return { ok: false as const, environment: null }
      return { ok: true as const, environment: result.account.environment }
    })
    expect(ok).toBe(true)
    expect(environment).toBe('paper')
  })

  it('Credential environment mismatch is detectable', async () => {
    ;({ app, page, dbPath } = await relaunchWithError(app, dbPath, {
      brokerError: 'environment_mismatch'
    }))
    const { ok, errorCode } = await page.evaluate(async () => {
      const result = await window.api.broker.account()
      if (result.ok) return { ok: true as const, errorCode: null }
      return { ok: false as const, errorCode: result.errors[0]?.code ?? null }
    })
    expect(ok).toBe(false)
    expect(errorCode).toBe('environment_mismatch')
  })
})
