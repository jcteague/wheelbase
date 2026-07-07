// Shared fixtures for the evaluateAlerts test suites (US-50 + US-53/54/55).
// Imported by evaluate-alerts.test.ts and evaluate-alerts.e2e.test.ts; not a
// test module itself (the `*-test-utils.ts` name is excluded from the vitest
// `*.test.ts` glob, matching alpaca-stream-test-utils.ts).

import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { addDays, format } from 'date-fns'
import { vi } from 'vitest'
import {
  MarketDataError,
  type MarketDataProvider,
  type OptionSnapshot,
  type StockQuote
} from '../integrations/market-data-provider'
import { buildOccSymbol } from '../../shared/option-symbol'
import type { FetchEarnings } from './evaluate-alerts'

// ---------------------------------------------------------------------------
// Clock fixtures — a fixed NOW and a one-day-later LATER for re-run scenarios.
// ---------------------------------------------------------------------------

export const NOW = new Date('2026-06-25T16:00:00.000Z')
export const NOW_ISO = NOW.toISOString()
export const LATER = new Date('2026-06-26T16:00:00.000Z')
export const LATER_ISO = LATER.toISOString()
export const TWO_DAYS_LATER = new Date('2026-06-27T16:00:00.000Z')
export const TWO_DAYS_LATER_ISO = TWO_DAYS_LATER.toISOString()

/** A `YYYY-MM-DD` expiration that is `dte` calendar days after `from`. */
export function expirationForDte(dte: number, from: Date = NOW): string {
  return format(addDays(from, dte), 'yyyy-MM-dd')
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

export function seedPosition(
  db: Database.Database,
  input: { id: string; ticker: string; phase: string }
): void {
  db.prepare(
    `INSERT INTO positions
       (id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at)
     VALUES (?, ?, 'WHEEL', 'ACTIVE', ?, '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(input.id, input.ticker, input.phase)
}

/** Seeds a CSP/CC position + active short option leg at a specific entry premium. */
export function seedShortOptionAtPremium(
  db: Database.Database,
  input: {
    id: string
    ticker: string
    phase: 'CSP_OPEN' | 'CC_OPEN'
    strike: string
    contracts: number
    entryPremium: string
    expiration: string
    profitTargetPercent?: number | null
    managementWindowDteOverride?: number | null
  }
): void {
  db.prepare(
    `INSERT INTO positions
       (id, ticker, strategy_type, status, phase, profit_target_percent,
        management_window_dte_override, opened_date, created_at, updated_at)
     VALUES (?, ?, 'WHEEL', 'ACTIVE', ?, ?, ?, '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(
    input.id,
    input.ticker,
    input.phase,
    input.profitTargetPercent ?? null,
    input.managementWindowDteOverride ?? null
  )

  const isCc = input.phase === 'CC_OPEN'
  db.prepare(
    `INSERT INTO legs
       (id, position_id, leg_role, action, instrument_type, strike, expiration,
        contracts, premium_per_contract, fill_date, created_at, updated_at)
     VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, ?, '2026-06-01',
             '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`
  ).run(
    randomUUID(),
    input.id,
    isCc ? 'CC_OPEN' : 'CSP_OPEN',
    isCc ? 'CALL' : 'PUT',
    input.strike,
    input.expiration,
    input.contracts,
    input.entryPremium
  )
}

/** Builds the OCC symbol for a seeded leg the way the service will. */
export function occFor(input: {
  ticker: string
  expiration: string
  strike: string
  instrumentType: 'PUT' | 'CALL'
}): string {
  return buildOccSymbol(input)
}

/** Seeds a short-option position at a pinned entry premium (and, for US-57/58,
 *  pinned per-position overrides) and returns its OCC symbol — call sites that
 *  need both the seed and a matching `stubProvider` key would otherwise repeat
 *  the `seedShortOptionAtPremium` + `occFor` pairing verbatim. */
export function seedShortOptionWithOcc(
  db: Database.Database,
  input: Parameters<typeof seedShortOptionAtPremium>[1]
): string {
  seedShortOptionAtPremium(db, input)
  return occFor({
    ticker: input.ticker,
    expiration: input.expiration,
    strike: input.strike,
    instrumentType: input.phase === 'CC_OPEN' ? 'CALL' : 'PUT'
  })
}

// ---------------------------------------------------------------------------
// Alert-row readback
// ---------------------------------------------------------------------------

export interface AlertRow {
  id: string
  position_id: string
  rule_code: string
  urgency: string
  summary: string
  quick_action: string
  status: string
  triggered_at: string
  last_evaluated_at: string
  resolved_at: string | null
}

export function readAlertRows(db: Database.Database): AlertRow[] {
  return db.prepare('SELECT * FROM alerts ORDER BY rowid').all() as AlertRow[]
}

// ---------------------------------------------------------------------------
// Market-data providers
// ---------------------------------------------------------------------------

export function makeStockQuote(price: string): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    change: '0',
    changePercent: '0',
    prevClose: price,
    volume: 0,
    timestamp: NOW_ISO
  }
}

export function makeOptionSnapshot(mid: string): OptionSnapshot {
  return {
    bid: mid,
    ask: mid,
    mid,
    lastTrade: mid,
    openInterest: null,
    volume: null,
    timestamp: NOW_ISO
  }
}

/**
 * Provider that answers every ticker/symbol with data chosen to keep the
 * market-data rules inert: a price far from any strike (STRIKE_PROXIMITY never
 * fires) and a mid above entry (PROFIT_TARGET never fires) — while still being
 * present, so neither rule skips. Lets the DTE-only scenarios stay focused.
 */
export function inertProvider(): MarketDataProvider {
  return {
    getStockQuotes: vi.fn(
      async (tickers: string[]) => new Map(tickers.map((t) => [t, makeStockQuote('1.00')]))
    ),
    getOptionSnapshot: vi.fn(async () => makeOptionSnapshot('999.0000')),
    getOptionChainSnapshot: vi.fn(async () => []),
    supportsStreaming: () => false,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    stream: vi.fn()
  } as unknown as MarketDataProvider
}

// ---------------------------------------------------------------------------
// Earnings fetchers (US-56)
// ---------------------------------------------------------------------------

/** fetchEarnings stub resolving the supplied ticker → 'YYYY-MM-DD' map verbatim;
 *  tickers absent from the map are simply omitted (the missing-data path). */
export function stubEarnings(earningsByTicker: Record<string, string>): FetchEarnings {
  return vi.fn(async () => earningsByTicker)
}

/**
 * fetchEarnings stub that keeps EARNINGS_PROXIMITY inert: every requested ticker
 * gets an earnings date far beyond the 10-day window, so the rule neither fires
 * nor skips — the earnings analogue of `inertProvider`.
 */
export function inertEarnings(): FetchEarnings {
  return vi.fn(async (tickers: string[], opts?: { now?: Date }) =>
    Object.fromEntries(tickers.map((t) => [t, format(addDays(opts?.now ?? NOW, 45), 'yyyy-MM-dd')]))
  )
}

/**
 * Stub MarketDataProvider resolving quotes/snapshots from the supplied maps.
 * Absent OCC symbols throw `MarketDataError('not_found')` so the missing-mark
 * path is exercised; absent tickers are simply omitted from the returned map.
 */
export function stubProvider(
  opts: { midBySymbol?: Record<string, string>; priceByTicker?: Record<string, string> } = {}
): MarketDataProvider {
  const midBySymbol = opts.midBySymbol ?? {}
  const priceByTicker = opts.priceByTicker ?? {}
  return {
    getStockQuotes: vi.fn(async (tickers: string[]) => {
      const map = new Map<string, StockQuote>()
      for (const t of tickers) {
        const price = priceByTicker[t]
        if (price !== undefined) map.set(t, makeStockQuote(price))
      }
      return map
    }),
    getOptionSnapshot: vi.fn(async (contractId: string) => {
      const mid = midBySymbol[contractId]
      if (mid === undefined) {
        throw new MarketDataError('not_found', `no snapshot for ${contractId}`)
      }
      return makeOptionSnapshot(mid)
    }),
    getOptionChainSnapshot: vi.fn(async () => []),
    supportsStreaming: () => false,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    stream: vi.fn()
  } as unknown as MarketDataProvider
}
