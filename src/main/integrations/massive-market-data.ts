import Decimal from 'decimal.js'
import type { Observable } from 'rxjs'
import {
  MarketDataError,
  type MarketDataFeed,
  type MarketDataProvider,
  type OptionChainFilter,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent
} from './market-data-provider'
import { isNetworkError } from './integration-errors'

const BASE_URL = 'https://api.syncswimmer.com'
const MAX_RETRIES = 2

export type MassiveMarketDataConfig = { apiKey: string }

type SnapResult = {
  latest_quote: { b: number; a: number; t: string }
  latest_trade: { p: number; t: string }
  greeks: { delta: number; gamma: number; theta: number; vega: number } | null
  implied_volatility: number | null
}

type ChainResponse = {
  results: SnapResult[]
  next_url: string | null
}

function parseUnderlying(contractId: string): string {
  const match = contractId.match(/^[A-Z]+/)
  return match ? match[0] : contractId
}

function computeMid(bid: Decimal, ask: Decimal): Decimal {
  return bid.plus(ask).dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

function mapSnapResult(r: SnapResult): OptionSnapshot {
  const bid = new Decimal(r.latest_quote.b)
  const ask = new Decimal(r.latest_quote.a)
  const mid = computeMid(bid, ask)
  const snap: OptionSnapshot = {
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    mid: mid.toFixed(2),
    lastTrade: new Decimal(r.latest_trade.p).toFixed(2),
    openInterest: null,
    volume: null,
    timestamp: r.latest_quote.t
  }
  if (r.greeks !== null) {
    snap.greeks = {
      delta: new Decimal(r.greeks.delta).toFixed(4),
      gamma: new Decimal(r.greeks.gamma).toFixed(4),
      theta: new Decimal(r.greeks.theta).toFixed(4),
      vega: new Decimal(r.greeks.vega).toFixed(4)
    }
  }
  if (r.implied_volatility !== null) {
    snap.impliedVolatility = new Decimal(r.implied_volatility).toFixed(4)
  }
  return snap
}

export class MassiveMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string

  constructor(config: MassiveMarketDataConfig) {
    this.apiKey = config.apiKey
  }

  private requireApiKey(): void {
    if (!this.apiKey) {
      throw new MarketDataError('auth_failed', 'Massive API key not configured')
    }
  }

  private async apiFetch(url: string, retryCount = 0): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      })
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

    if (!response.ok) {
      throw new MarketDataError('unknown', `HTTP ${response.status}`)
    }

    return response.json()
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    this.requireApiKey()
    const pairs = await Promise.all(
      tickers.map(async (ticker) => {
        const data = (await this.apiFetch(`${BASE_URL}/v3/quotes/${ticker}/last`)) as {
          results: { last: { b: number; a: number; t: string } }
        }
        const { b, a, t } = data.results.last
        const bid = new Decimal(b)
        const ask = new Decimal(a)
        const mid = computeMid(bid, ask)
        const quote: StockQuote = {
          price: mid.toFixed(2),
          bid: bid.toFixed(2),
          ask: ask.toFixed(2),
          change: '0.00',
          changePercent: '0.0000',
          prevClose: '',
          volume: 0,
          timestamp: t
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
      `${BASE_URL}/v3/snapshot/options/${underlying}/${contractId}`
    )) as { results: SnapResult }
    return mapSnapResult(data.results)
  }

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]> {
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

    const snapshots: OptionSnapshot[] = []
    const firstPage = (await this.apiFetch(firstUrl)) as ChainResponse
    snapshots.push(...firstPage.results.map(mapSnapResult))

    if (filter.limit !== undefined) {
      return snapshots
    }

    let nextUrl = firstPage.next_url
    while (nextUrl) {
      const page = (await this.apiFetch(nextUrl)) as ChainResponse
      snapshots.push(...page.results.map(mapSnapResult))
      nextUrl = page.next_url
    }

    return snapshots
  }

  supportsStreaming(feed: MarketDataFeed): boolean {
    return feed === 'stockQuotes' || feed === 'optionQuotes'
  }

  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    void feed
    void symbols
    throw new MarketDataError('streaming_unsupported', 'streaming not yet supported')
  }

  async connect(): Promise<void> {
    // no-op
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}
