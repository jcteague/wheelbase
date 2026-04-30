import { createClient } from '@alpacahq/typescript-sdk'
import { decode } from '@msgpack/msgpack'
import Decimal from 'decimal.js'
import { Observable, Subject } from 'rxjs'
import WebSocket from 'ws'

import {
  MarketDataError,
  type AccountInfo,
  type ActivityFilter,
  type BrokerActivity,
  type DataFeed,
  type MarketDataProvider,
  type MarketStatus,
  type OptionSnapshot,
  type StockQuote,
  type StreamError,
  type StreamEvent
} from './market-data-provider'

// Raw Alpaca response shapes (SDK types are incomplete)
type AlpacaStockSnapshot = {
  latest_quote: { bp: number; ap: number; t: string }
  prev_daily_bar: { c: number }
}

type AlpacaOptionSnapshot = {
  latest_trade: { t: string; p: number; s: number; x: string; c: string }
  latest_quote: {
    t: string
    bp: number
    ap: number
    bs: number
    as: number
    bx: string
    ax: string
    c: string
  }
  greeks?: { delta: number; gamma: number; theta: number; vega: number; rho: number }
  impliedVolatility?: number
}

// Raw Alpaca activity shape (union of trade/non-trade)
type AlpacaActivity = {
  activity_type: string
  id: string
  date?: string
  transaction_time?: string
  net_amount?: string
  symbol?: string
  qty?: string
  price?: string
  per_share_amount?: string
}

// Raw Alpaca stream message shape (covers auth, quotes, trades, and errors)
type AlpacaStreamMessage = {
  T: string
  msg?: string
  code?: number
  S?: string
  bp?: number
  ap?: number
  bs?: number
  as?: number
  bx?: string
  ax?: string
  t?: string
  p?: number
  s?: number
}

export type AlpacaMarketDataConfig = {
  keyId: string
  secretKey: string
  paper: boolean
  dataFeed?: string
  optionFeed?: string
}

// Fallback to EDT when Alpaca timestamp has no offset suffix.
const DEFAULT_ET_OFFSET_MINUTES = -240

const PRE_MARKET_START_HOUR = 4
const REGULAR_MARKET_START_HOUR = 9.5
const REGULAR_MARKET_END_HOUR = 16
const POST_MARKET_END_HOUR = 20

const STREAM_BASE_URL = 'wss://stream.data.alpaca.markets'

function isAuthError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: number }).status
    return status === 401 || status === 403
  }
  return false
}

function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false

  const e = err as { cause?: { code?: string }; code?: string; message?: string }
  const networkCodes = ['ECONNREFUSED', 'ENOTFOUND']

  if (e.cause?.code && networkCodes.includes(e.cause.code)) return true
  if (e.code && networkCodes.includes(e.code)) return true
  if (e.message && /fetch failed|network|ECONNREFUSED/i.test(e.message)) return true

  return false
}

function wrapError(err: unknown, context: string): never {
  if (err instanceof MarketDataError) throw err

  if (isAuthError(err)) {
    throw new MarketDataError('auth_failed', `${context}: authentication failed`)
  }

  if (isNetworkError(err)) {
    throw new MarketDataError(
      'network_error',
      `${context}: ${err instanceof Error ? err.message : 'network error'}`
    )
  }

  throw new MarketDataError(
    'unknown',
    `${context}: ${err instanceof Error ? err.message : String(err)}`
  )
}

function midPrice(bid: Decimal, ask: Decimal): Decimal {
  return bid.plus(ask).dividedBy(2)
}

function mapAlpacaSnapshotToStockQuote(snap: AlpacaStockSnapshot): StockQuote {
  const bid = new Decimal(snap.latest_quote.bp)
  const ask = new Decimal(snap.latest_quote.ap)
  const mid = midPrice(bid, ask)
  const prevClose = new Decimal(snap.prev_daily_bar.c)
  const change = mid.minus(prevClose)

  return {
    price: mid.toFixed(2),
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    change: change.toFixed(2),
    changePercent: change.dividedBy(prevClose).toFixed(4),
    prevClose: prevClose.toFixed(2),
    volume: 0,
    timestamp: snap.latest_quote.t
  }
}

function mapQuoteToStockQuote(bp: number, ap: number, timestamp: string): StockQuote {
  const bid = new Decimal(bp)
  const ask = new Decimal(ap)
  const mid = midPrice(bid, ask)

  return {
    price: mid.toFixed(2),
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    change: '0.00',
    changePercent: '0.0000',
    prevClose: '',
    volume: 0,
    timestamp
  }
}

function parseOffsetMinutes(timestamp: string): number | null {
  const match = timestamp.match(/([+-])(\d{2}):(\d{2})$/)
  if (!match) return null

  const sign = match[1] === '+' ? 1 : -1
  const hours = parseInt(match[2], 10)
  const minutes = parseInt(match[3], 10)
  return sign * (hours * 60 + minutes)
}

function deriveSession(isOpen: boolean, timestamp: string): 'regular' | 'pre' | 'post' | 'closed' {
  if (isOpen) return 'regular'

  const date = new Date(timestamp)
  const offsetMinutes = parseOffsetMinutes(timestamp) ?? DEFAULT_ET_OFFSET_MINUTES
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  let etHours = (utcMinutes + offsetMinutes) / 60

  // Normalize negative hours (e.g., 1 AM UTC - 4 = -3, should be 21)
  if (etHours < 0) etHours += 24

  if (etHours >= PRE_MARKET_START_HOUR && etHours < REGULAR_MARKET_START_HOUR) return 'pre'
  if (etHours >= REGULAR_MARKET_END_HOUR && etHours < POST_MARKET_END_HOUR) return 'post'
  return 'closed'
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  private _client: ReturnType<typeof createClient> | null = null
  private readonly config: AlpacaMarketDataConfig
  private stockSocket: WebSocket | null = null
  private optionSocket: WebSocket | null = null
  private stockSubject: Subject<StreamEvent<StockQuote | OptionSnapshot>> | null = null
  private optionSubject: Subject<StreamEvent<StockQuote | OptionSnapshot>> | null = null

  constructor(config: AlpacaMarketDataConfig) {
    this.config = config
  }

  private requireCredentials(): void {
    if (!this.config.keyId || !this.config.secretKey) {
      throw new MarketDataError('auth_failed', 'Missing Alpaca credentials')
    }
  }

  // Deferred so the app can start without credentials (e.g., in e2e tests that
  // stub window.api before the provider is ever called).
  private get client(): ReturnType<typeof createClient> {
    if (!this._client) {
      this._client = createClient({
        key: this.config.keyId,
        secret: this.config.secretKey,
        paper: this.config.paper
      })
    }
    return this._client
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    this.requireCredentials()
    try {
      const response = await this.client.getStocksSnapshots({ symbols: tickers.join(',') })
      const result = new Map<string, StockQuote>()
      const snapshots = response as unknown as Record<string, AlpacaStockSnapshot>

      for (const [symbol, snap] of Object.entries(snapshots)) {
        result.set(symbol, mapAlpacaSnapshotToStockQuote(snap))
      }

      return result
    } catch (err) {
      throw wrapError(err, 'getStockQuotes')
    }
  }

  async getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>> {
    try {
      const response = await this.client.getOptionsSnapshots({
        symbols: contractIds.join(',')
      })

      const result = new Map<string, OptionSnapshot>()
      const snapshots = (response as { snapshots: Record<string, AlpacaOptionSnapshot> }).snapshots

      for (const [contractId, snap] of Object.entries(snapshots)) {
        const bid = new Decimal(snap.latest_quote.bp)
        const ask = new Decimal(snap.latest_quote.ap)
        const mid = midPrice(bid, ask)

        result.set(contractId, {
          bid: bid.toFixed(2),
          ask: ask.toFixed(2),
          mid: mid.toFixed(2),
          lastTrade: new Decimal(snap.latest_trade.p).toFixed(2),
          openInterest: null,
          volume: null,
          greeks: {
            delta: new Decimal(snap.greeks?.delta ?? 0).toFixed(4),
            gamma: new Decimal(snap.greeks?.gamma ?? 0).toFixed(4),
            theta: new Decimal(snap.greeks?.theta ?? 0).toFixed(4),
            vega: new Decimal(snap.greeks?.vega ?? 0).toFixed(4),
            iv: new Decimal(snap.impliedVolatility ?? 0).toFixed(4)
          },
          timestamp: snap.latest_quote.t
        })
      }

      return result
    } catch (err) {
      throw wrapError(err, 'getOptionSnapshots')
    }
  }

  async getActivities(filter: ActivityFilter): Promise<BrokerActivity[]> {
    try {
      const response = (await this.client.getActivity({
        activity_type: filter.type
      })) as AlpacaActivity[]

      const activities = response.map(
        (a): BrokerActivity => ({
          activityId: a.id,
          activityType: a.activity_type,
          symbol: a.symbol ?? '',
          qty: Number(a.qty ?? 0),
          price: a.per_share_amount ?? a.price ?? '0.00',
          transactionTime: a.transaction_time ?? a.date ?? ''
        })
      )

      return activities.sort((a, b) => b.transactionTime.localeCompare(a.transactionTime))
    } catch (err) {
      throw wrapError(err, 'getActivities')
    }
  }

  async getAccountInfo(): Promise<AccountInfo> {
    try {
      const account = await this.client.getAccount()

      return {
        buyingPower: account.buying_power,
        portfolioValue: account.portfolio_value,
        cash: account.cash,
        environment: this.config.paper ? 'paper' : 'live'
      }
    } catch (err) {
      throw wrapError(err, 'getAccountInfo')
    }
  }

  async getMarketStatus(): Promise<MarketStatus> {
    this.requireCredentials()
    try {
      const clock = await this.client.getClock()

      return {
        isOpen: clock.is_open,
        nextOpen: clock.next_open,
        nextClose: clock.next_close,
        session: deriveSession(clock.is_open, clock.timestamp)
      }
    } catch (err) {
      throw wrapError(err, 'getMarketStatus')
    }
  }

  // --- Streaming ---

  supportsStreaming(feed: DataFeed): boolean {
    return feed === 'stockQuotes' || feed === 'optionQuotes' || feed === 'optionTrades'
  }

  async connect(feeds?: DataFeed[]): Promise<void> {
    this.requireCredentials()

    const requested = feeds ?? ['stockQuotes', 'optionQuotes']
    const wantStock = requested.includes('stockQuotes')
    const wantOption = requested.includes('optionQuotes') || requested.includes('optionTrades')

    const dataFeed = this.config.dataFeed ?? 'sip'
    const optionFeed = this.config.optionFeed ?? 'opra'

    const tasks: Promise<void>[] = []

    if (wantStock && !this.stockSocket) {
      this.stockSocket = new WebSocket(`${STREAM_BASE_URL}/v2/${dataFeed}`)
      this.stockSubject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
      tasks.push(this.setupAndAuthSocket(this.stockSocket, this.stockSubject, 'stockQuotes'))
    }

    if (wantOption && !this.optionSocket) {
      this.optionSocket = new WebSocket(`${STREAM_BASE_URL}/v1beta1/${optionFeed}`)
      this.optionSubject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
      tasks.push(this.setupAndAuthSocket(this.optionSocket, this.optionSubject, 'optionQuotes'))
    }

    await Promise.all(tasks)
  }

  async disconnect(): Promise<void> {
    this.stockSubject?.complete()
    this.optionSubject?.complete()
    this.stockSocket?.close()
    this.optionSocket?.close()
    this.stockSubject = null
    this.optionSubject = null
    this.stockSocket = null
    this.optionSocket = null
  }

  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    if (!this.supportsStreaming(feed)) {
      throw new MarketDataError(
        'streaming_unsupported',
        `Streaming not supported for feed: ${feed}`
      )
    }

    const isOption = feed === 'optionQuotes' || feed === 'optionTrades'
    const socket = isOption ? this.optionSocket! : this.stockSocket!
    const subject = isOption ? this.optionSubject! : this.stockSubject!
    const subscribeKey = feed === 'optionTrades' ? 'trades' : 'quotes'

    return new Observable((subscriber) => {
      socket.send(JSON.stringify({ action: 'subscribe', [subscribeKey]: symbols }))

      const sub = subject.subscribe({
        next: (event) => {
          if (symbols.includes(event.symbol)) {
            subscriber.next(event)
          }
        },
        error: (err: unknown) => subscriber.error(err),
        complete: () => subscriber.complete()
      })

      return (): void => {
        sub.unsubscribe()
        socket.send(JSON.stringify({ action: 'unsubscribe', [subscribeKey]: symbols }))
      }
    })
  }

  private setupAndAuthSocket(
    socket: WebSocket,
    subject: Subject<StreamEvent<StockQuote | OptionSnapshot>>,
    feedName: DataFeed
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let authenticated = false

      socket.on('message', (rawData: WebSocket.RawData) => {
        const data: unknown = rawData
        const msgs: AlpacaStreamMessage[] =
          typeof data === 'string'
            ? (JSON.parse(data) as AlpacaStreamMessage[])
            : (decode(data as Uint8Array) as AlpacaStreamMessage[])

        for (const msg of msgs) {
          if (msg.T === 'success' && msg.msg === 'connected') {
            socket.send(
              JSON.stringify({
                action: 'auth',
                key: this.config.keyId,
                secret: this.config.secretKey
              })
            )
          } else if (msg.T === 'success' && msg.msg === 'authenticated') {
            authenticated = true
            resolve()
          } else if (msg.T === 'error') {
            reject(
              new MarketDataError(
                msg.code === 401 || msg.code === 403 ? 'auth_failed' : 'unknown',
                msg.msg ?? 'Stream error'
              )
            )
          } else if (msg.T === 'q' && msg.S) {
            subject.next({
              feed: feedName,
              symbol: msg.S,
              data: mapQuoteToStockQuote(msg.bp ?? 0, msg.ap ?? 0, msg.t ?? ''),
              timestamp: msg.t ?? ''
            })
          }
        }
      })

      socket.on('error', (err) => {
        reject(new MarketDataError('network_error', String(err)))
      })

      socket.on('close', () => {
        if (!authenticated) {
          reject(
            new MarketDataError('stream_disconnected', `${feedName} stream closed before auth`)
          )
        }
        subject.error({
          feed: feedName,
          code: 'stream_disconnected',
          message: `${feedName} stream disconnected`,
          reconnectable: true
        } satisfies StreamError)
      })
    })
  }
}
