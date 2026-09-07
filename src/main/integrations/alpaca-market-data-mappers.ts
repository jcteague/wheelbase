// Pure vendor↔domain layer for the Alpaca market-data provider: the shapes Alpaca actually
// sends (as observed 2026-09-06), the URL builders, and the mappings onto the
// `MarketDataProvider` types. No I/O — every function here is total and side-effect free, so
// the vendor's quirks can be pinned by tests without a socket or a fetch stub.

import Decimal from 'decimal.js'
import {
  MarketDataError,
  type OptionChainFilter,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent
} from './market-data-provider'
import { ALPACA_TRADING_BASE_URLS } from './alpaca-hosts'
import { parseOccSymbol } from '../core/option-symbol'
import type { AlpacaCredentials } from '../services/settings'

export const DATA_BASE_URL = 'https://data.alpaca.markets'
// Alpaca's free plan serves IEX rather than the consolidated SIP tape.
const STOCK_FEED = 'iex'
// The free plan has no OPRA entitlement; `indicative` is the derived-quote feed it does serve.
const OPTION_FEED = 'indicative'
const CHAIN_PAGE_SIZE = 1000
const CONTRACTS_PAGE_SIZE = 10000

type AlpacaBar = { o: number; h: number; l: number; c: number; v: number; t: string }

// --- Stock snapshots ---

// Every block is optional: Alpaca omits a block entirely rather than sending nulls, and a
// pre-open IEX snapshot can carry a quote with no trade behind it.
export type AlpacaStockSnapshot = {
  latestTrade?: { p: number; t: string }
  latestQuote?: { bp: number; ap: number; t: string }
  dailyBar?: AlpacaBar
  prevDailyBar?: AlpacaBar
}

export type AlpacaStockSnapshots = Record<string, AlpacaStockSnapshot | undefined>

export function buildStockSnapshotsUrl(tickers: string[]): string {
  const params = new URLSearchParams({ symbols: tickers.join(','), feed: STOCK_FEED })
  return `${DATA_BASE_URL}/v2/stocks/snapshots?${params.toString()}`
}

// A snapshot with no trade has no price to anchor bid/ask against, so it is dropped rather
// than reported as $0.00.
export function mapStockSnapshot(snap: AlpacaStockSnapshot): StockQuote | null {
  if (!snap.latestTrade) return null

  const price = new Decimal(snap.latestTrade.p)
  const prevClose = snap.prevDailyBar ? new Decimal(snap.prevDailyBar.c) : null
  const change = prevClose ? price.minus(prevClose) : null

  return {
    price: price.toFixed(2),
    bid: new Decimal(snap.latestQuote?.bp ?? snap.latestTrade.p).toFixed(2),
    ask: new Decimal(snap.latestQuote?.ap ?? snap.latestTrade.p).toFixed(2),
    prevClose: prevClose ? prevClose.toFixed(2) : '',
    change: change ? change.toFixed(2) : '',
    changePercent:
      change && prevClose && !prevClose.isZero()
        ? change.dividedBy(prevClose).times(100).toFixed(4)
        : '',
    volume: snap.dailyBar?.v ?? 0,
    timestamp: new Date(snap.latestTrade.t).toISOString()
  }
}

// --- Option snapshots ---

type AlpacaGreeks = Partial<{
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}>

type CompleteGreeks = { delta: number; gamma: number; theta: number; vega: number }

// Strikes Alpaca has no model for carry `greeks: {}` — present but empty — and strikes that
// have never been quoted or traded omit latestQuote / latestTrade entirely.
export type AlpacaOptionSnapshot = {
  latestQuote?: { bp: number; ap: number; t: string }
  latestTrade?: { p: number; t: string }
  greeks?: AlpacaGreeks
  impliedVolatility?: number
  dailyBar?: AlpacaBar
}

export type AlpacaOptionSnapshots = {
  snapshots: Record<string, AlpacaOptionSnapshot | undefined>
  next_page_token: string | null
}

export type AlpacaContracts = {
  option_contracts: Array<{ symbol: string; open_interest: string | null }>
  next_page_token: string | null
}

function isCompleteGreeks(g: AlpacaGreeks | undefined): g is CompleteGreeks {
  return (
    g != null &&
    typeof g.delta === 'number' &&
    typeof g.gamma === 'number' &&
    typeof g.theta === 'number' &&
    typeof g.vega === 'number'
  )
}

function computeMid(bid: Decimal, ask: Decimal): Decimal {
  return bid.plus(ask).dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

// A missing quote block means no market — zeroed bid/ask is what downstream tradeability
// checks already treat as unquoted, and it keeps one dead strike from discarding the chain.
export function mapOptionQuote(snap: AlpacaOptionSnapshot): OptionSnapshot {
  const bid = new Decimal(snap.latestQuote?.bp ?? 0)
  const ask = new Decimal(snap.latestQuote?.ap ?? 0)
  const quote: OptionSnapshot = {
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    mid: computeMid(bid, ask).toFixed(2),
    lastTrade: new Decimal(snap.latestTrade?.p ?? 0).toFixed(2),
    openInterest: null,
    volume: snap.dailyBar?.v ?? null,
    // Epoch 0 reads as "never quoted"; Alpaca's nanosecond precision truncates to ms here.
    timestamp: new Date(snap.latestQuote?.t ?? snap.latestTrade?.t ?? 0).toISOString()
  }
  // A partial greek set is unusable for the screener's delta ranking, so it is dropped
  // wholesale rather than emitted half-filled. `rho` is never surfaced.
  if (isCompleteGreeks(snap.greeks)) {
    quote.greeks = {
      delta: new Decimal(snap.greeks.delta).toFixed(4),
      gamma: new Decimal(snap.greeks.gamma).toFixed(4),
      theta: new Decimal(snap.greeks.theta).toFixed(4),
      vega: new Decimal(snap.greeks.vega).toFixed(4)
    }
  }
  if (typeof snap.impliedVolatility === 'number') {
    quote.impliedVolatility = new Decimal(snap.impliedVolatility).toFixed(4)
  }
  return quote
}

// Identity comes from the OCC map key rather than the payload: the chain response carries no
// strike or expiration fields of its own. Returns null for a key that is not an OCC symbol.
export function mapChainEntry(
  key: string,
  snap: AlpacaOptionSnapshot,
  openInterest: number | null
): OptionChainQuote | null {
  const identity = parseOccSymbol(key)
  if (!identity) return null
  return {
    ...mapOptionQuote(snap),
    contractId: identity.contractId,
    strike: identity.strike,
    expiration: identity.expiration,
    contractType: identity.contractType,
    openInterest
  }
}

export function parseOpenInterest(raw: string | null): number | null {
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

// `strike_price_*` and `expiration_date_*` are spelled identically on both the chain and
// the contracts endpoint, so the shared bounds are built once.
function appendFilterBounds(params: URLSearchParams, filter: OptionChainFilter): void {
  if (filter.type) params.set('type', filter.type)
  if (filter.expirationFrom) params.set('expiration_date_gte', filter.expirationFrom)
  if (filter.expirationTo) params.set('expiration_date_lte', filter.expirationTo)
  if (filter.strikeFrom) params.set('strike_price_gte', filter.strikeFrom)
  if (filter.strikeTo) params.set('strike_price_lte', filter.strikeTo)
}

export function buildChainUrl(filter: OptionChainFilter, pageToken?: string): string {
  const params = new URLSearchParams({ feed: OPTION_FEED })
  appendFilterBounds(params, filter)
  params.set('limit', String(Math.min(filter.limit ?? CHAIN_PAGE_SIZE, CHAIN_PAGE_SIZE)))
  const token = pageToken ?? filter.cursor
  if (token) params.set('page_token', token)
  return `${DATA_BASE_URL}/v1beta1/options/snapshots/${filter.underlying}?${params.toString()}`
}

export function buildSingleSnapshotUrl(contractId: string): string {
  const params = new URLSearchParams({ symbols: contractId, feed: OPTION_FEED })
  return `${DATA_BASE_URL}/v1beta1/options/snapshots?${params.toString()}`
}

export function buildContractsUrl(
  filter: OptionChainFilter,
  environment: AlpacaCredentials['environment'],
  pageToken?: string
): string {
  const params = new URLSearchParams({ underlying_symbols: filter.underlying })
  appendFilterBounds(params, filter)
  params.set('limit', String(CONTRACTS_PAGE_SIZE))
  if (pageToken) params.set('page_token', pageToken)
  return `${ALPACA_TRADING_BASE_URLS[environment]}/v2/options/contracts?${params.toString()}`
}

// --- Websocket frames ---

// Alpaca sends every server message as a JSON array of frames.
export type AlpacaWsFrame = {
  T: string
  msg?: string
  code?: number
  /** Echoed back on a `subscription` frame: the symbols the server now holds for us. */
  bars?: string[]
  S?: string
  c?: number
  v?: number
  t?: string
}

export function parseFrames(text: string): AlpacaWsFrame[] {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? (parsed as AlpacaWsFrame[]) : []
  } catch {
    return []
  }
}

// A minute bar carries no quote or previous close, so only price and volume are populated —
// the renderer treats the blank fields as "unchanged since the REST seed".
export function mapBar(frame: AlpacaWsFrame): StreamEvent<StockQuote> {
  const price = new Decimal(frame.c ?? 0).toFixed(2)
  const timestamp = new Date(frame.t ?? 0).toISOString()
  return {
    feed: 'stockQuotes',
    symbol: frame.S ?? '',
    data: {
      price,
      bid: price,
      ask: price,
      change: '',
      changePercent: '',
      prevClose: '',
      volume: frame.v ?? 0,
      timestamp
    },
    timestamp
  }
}

export function classifyStreamError(code: number | undefined): string {
  if (code === 405) return 'symbol_limit'
  if (code === 406) return 'connection_limit'
  return 'unknown'
}

export function connectError(frame: AlpacaWsFrame): MarketDataError {
  if (frame.code === 402) return new MarketDataError('auth_failed', 'Alpaca WebSocket auth failed')
  if (frame.code === 409) {
    return new MarketDataError('streaming_unsupported', 'insufficient subscription')
  }
  return new MarketDataError('unknown', frame.msg ?? 'Alpaca WebSocket error')
}
