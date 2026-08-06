import Decimal from 'decimal.js'
import { Subject, filter, type Observable } from 'rxjs'
import WebSocket from 'ws'
import {
  MarketDataError,
  type MarketDataFeed,
  type MarketDataProvider,
  type OptionChainFilter,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent
} from './market-data-provider'
import { isNetworkError } from './integration-errors'
import { logger } from '../logger'

const BASE_URL = 'https://api.massive.com'
const WS_URL = 'wss://delayed.massive.com/stocks'
const MAX_RETRIES = 2

export type MassiveMarketDataConfig = { apiKey: string }

// Polygon-compatible WebSocket message shapes
type WsStatusMsg = { ev: 'status'; status: string; message?: string }
type WsAmMsg = {
  ev: 'AM'
  sym: string
  v: number
  vw: number
  c: number
  o: number
  h: number
  l: number
  s: number // start ms
  e: number // end ms
}
type WsMsg = WsStatusMsg | WsAmMsg

// Polygon-compatible option snapshot shape. Every block is optional: chain entries for
// strikes that have never traded (or are never quoted) omit last_trade / last_quote /
// greeks entirely rather than sending nulls.
type SnapResult = {
  last_quote?: { bid: number; ask: number; last_updated: number }
  last_trade?: { price: number; sip_timestamp: number }
  greeks?: { delta: number; gamma: number; theta: number; vega: number } | null
  implied_volatility?: number | null
}

// Chain snapshot results additionally carry per-strike identity and liquidity that
// the single-contract snapshot omits.
type ChainSnapResult = SnapResult & {
  details: {
    ticker: string
    strike_price: number
    expiration_date: string
    contract_type: 'put' | 'call'
  }
  open_interest: number | null
  day: { volume: number | null } | null
}

// `results` is omitted (not empty) when nothing matches the filter — e.g. a ticker with
// no expirations inside the requested window.
type ChainResponse = {
  results?: ChainSnapResult[]
  next_url: string | null
}

// Massive v2 stock snapshot shape (aggregate bars, no live bid/ask)
type StockSnapshotResult = {
  ticker: {
    day: { c: number; v: number }
    min: { c: number; t: number } // last-minute close + timestamp (ms)
    prevDay: { c: number }
    todaysChange: number
    todaysChangePerc: number
  }
}

function parseUnderlying(contractId: string): string {
  const match = contractId.match(/^[A-Z]+/)
  return match ? match[0] : contractId
}

// Massive/Polygon options tickers are prefixed with `O:` (e.g. `O:SPY260604P00750000`).
// The renderer builds bare OCC symbols, so the prefix is applied at the API boundary here.
function withOptionPrefix(contractId: string): string {
  return contractId.startsWith('O:') ? contractId : `O:${contractId}`
}

function computeMid(bid: Decimal, ask: Decimal): Decimal {
  return bid.plus(ask).dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

function mapSnapResult(r: SnapResult): OptionSnapshot {
  // A missing quote block means no market — zeroed bid/ask is what downstream
  // tradeability checks already treat as unquoted, and it keeps one absent strike
  // from discarding the whole chain.
  const bid = new Decimal(r.last_quote?.bid ?? 0)
  const ask = new Decimal(r.last_quote?.ask ?? 0)
  const mid = computeMid(bid, ask)
  const snap: OptionSnapshot = {
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    mid: mid.toFixed(2),
    lastTrade: new Decimal(r.last_trade?.price ?? 0).toFixed(2),
    openInterest: null,
    volume: null,
    // Massive timestamps are epoch nanoseconds; epoch 0 reads as "never quoted".
    timestamp: new Date((r.last_quote?.last_updated ?? 0) / 1_000_000).toISOString()
  }
  if (r.greeks) {
    snap.greeks = {
      delta: new Decimal(r.greeks.delta).toFixed(4),
      gamma: new Decimal(r.greeks.gamma).toFixed(4),
      theta: new Decimal(r.greeks.theta).toFixed(4),
      vega: new Decimal(r.greeks.vega).toFixed(4)
    }
  }
  if (r.implied_volatility != null) {
    snap.impliedVolatility = new Decimal(r.implied_volatility).toFixed(4)
  }
  return snap
}

// Reuses mapSnapResult's money/greeks logic, then layers on the chain-only identity
// and real open-interest/volume that the single-contract snapshot leaves null.
function mapChainResult(r: ChainSnapResult): OptionChainQuote {
  return {
    ...mapSnapResult(r),
    openInterest: r.open_interest ?? null,
    volume: r.day?.volume ?? null,
    contractId: r.details.ticker.replace(/^O:/, ''),
    // 4dp TEXT is the codebase-wide money representation (legs.strike, own_below_price),
    // so chain strikes compare directly against persisted ones.
    strike: new Decimal(r.details.strike_price).toFixed(4),
    expiration: r.details.expiration_date,
    contractType: r.details.contract_type
  }
}

export class MassiveMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string
  private ws: WebSocket | null = null
  private readonly tickSubject = new Subject<StreamEvent<StockQuote>>()

  constructor(config: MassiveMarketDataConfig) {
    this.apiKey = config.apiKey
  }

  private emitTick(msg: WsAmMsg): void {
    const price = new Decimal(msg.c)
    const quote: StockQuote = {
      price: price.toFixed(2),
      bid: price.toFixed(2),
      ask: price.toFixed(2),
      change: '',
      changePercent: '',
      prevClose: '',
      volume: msg.v,
      timestamp: new Date(msg.e).toISOString()
    }
    this.tickSubject.next({
      feed: 'stockQuotes',
      symbol: msg.sym,
      data: quote,
      timestamp: quote.timestamp
    })
  }

  private requireApiKey(): void {
    if (!this.apiKey) {
      throw new MarketDataError('auth_failed', 'Massive API key not configured')
    }
  }

  private authedUrl(url: string): string {
    const parsed = new URL(url)
    parsed.searchParams.set('apiKey', this.apiKey)
    return parsed.toString()
  }

  private async apiFetch(url: string, retryCount = 0): Promise<unknown> {
    logger.debug({ url, retryCount }, 'massive_api_request')
    let response: Response
    try {
      response = await fetch(this.authedUrl(url))
    } catch (err) {
      if (isNetworkError(err)) {
        throw new MarketDataError(
          'network_error',
          err instanceof Error ? err.message : 'network error'
        )
      }
      throw new MarketDataError('unknown', err instanceof Error ? err.message : String(err))
    }

    if (response.status === 401 || response.status === 403) {
      throw new MarketDataError('auth_failed', `HTTP ${response.status}`)
    }

    if (response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        throw new MarketDataError('rate_limited', 'rate limit exceeded')
      }
      const retryAfterHeader = response.headers.get('Retry-After')
      const delayMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 1000
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return this.apiFetch(url, retryCount + 1)
    }

    if (response.status === 404) {
      throw new MarketDataError('not_found', `HTTP 404: ${url}`)
    }
    if (!response.ok) {
      throw new MarketDataError('unknown', `HTTP ${response.status}`)
    }

    logger.debug({ url, status: response.status }, 'massive_api_response')
    return response.json()
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    this.requireApiKey()
    const pairs = await Promise.all(
      tickers.map(async (ticker) => {
        const data = (await this.apiFetch(
          `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`
        )) as StockSnapshotResult
        const { day, min, prevDay, todaysChange, todaysChangePerc } = data.ticker
        // Massive provides aggregate bars — use last-minute close as price (no live bid/ask)
        const price = new Decimal(min.c)
        const quote: StockQuote = {
          price: price.toFixed(2),
          bid: price.toFixed(2),
          ask: price.toFixed(2),
          change: new Decimal(todaysChange).toFixed(2),
          changePercent: new Decimal(todaysChangePerc).toFixed(4),
          prevClose: new Decimal(prevDay.c).toFixed(2),
          volume: day.v,
          timestamp: new Date(min.t).toISOString()
        }
        return [ticker, quote] as [string, StockQuote]
      })
    )
    return new Map(pairs)
  }

  async getOptionSnapshot(contractId: string): Promise<OptionSnapshot> {
    this.requireApiKey()
    const underlying = parseUnderlying(contractId)
    const data = (await this.apiFetch(
      `${BASE_URL}/v3/snapshot/options/${underlying}/${withOptionPrefix(contractId)}`
    )) as { results: SnapResult }
    return mapSnapResult(data.results)
  }

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]> {
    this.requireApiKey()
    const params = new URLSearchParams()
    if (filter.expirationFrom) params.set('expiration_date.gte', filter.expirationFrom)
    if (filter.expirationTo) params.set('expiration_date.lte', filter.expirationTo)
    if (filter.type) params.set('contract_type', filter.type)
    if (filter.strikeFrom) params.set('strike_price.gte', filter.strikeFrom)
    if (filter.strikeTo) params.set('strike_price.lte', filter.strikeTo)
    if (filter.limit !== undefined) params.set('limit', String(filter.limit))
    if (filter.cursor) params.set('cursor', filter.cursor)

    const queryString = params.toString()
    const firstUrl = `${BASE_URL}/v3/snapshot/options/${filter.underlying}${queryString ? `?${queryString}` : ''}`

    const snapshots: OptionChainQuote[] = []
    const firstPage = (await this.apiFetch(firstUrl)) as ChainResponse
    snapshots.push(...(firstPage.results ?? []).map(mapChainResult))

    if (filter.limit !== undefined) {
      return snapshots
    }

    let nextUrl = firstPage.next_url
    while (nextUrl) {
      const page = (await this.apiFetch(nextUrl)) as ChainResponse
      snapshots.push(...(page.results ?? []).map(mapChainResult))
      nextUrl = page.next_url
    }

    return snapshots
  }

  supportsStreaming(): boolean {
    return true
  }

  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    void feed
    const symbolSet = new Set(symbols)
    return this.tickSubject.pipe(filter((ev) => symbolSet.size === 0 || symbolSet.has(ev.symbol)))
  }

  async connect(): Promise<void> {
    this.requireApiKey()
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      this.ws = ws

      ws.on('open', () => {
        ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }))
      })

      ws.on('message', (rawData: Buffer | string) => {
        const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : rawData
        let messages: WsMsg[]
        try {
          messages = JSON.parse(text) as WsMsg[]
        } catch {
          return
        }
        for (const msg of messages) {
          if (msg.ev === 'status') {
            if (msg.status === 'auth_success') {
              ws.send(JSON.stringify({ action: 'subscribe', params: 'AM.*' }))
            } else if (msg.status === 'success') {
              logger.info({ serverMsg: msg.message }, 'massive_ws_subscribed')
              resolve()
            } else if (msg.status === 'auth_failed') {
              reject(new MarketDataError('auth_failed', 'Massive WebSocket auth failed'))
              ws.close()
            }
          } else if (msg.ev === 'AM') {
            this.emitTick(msg)
          }
        }
      })

      ws.on('error', (err) => {
        reject(new MarketDataError('network_error', err.message))
      })

      ws.on('close', () => {
        this.ws = null
        logger.info('massive_ws_closed')
      })
    })
  }

  async disconnect(): Promise<void> {
    this.ws?.close()
    this.ws = null
  }
}
