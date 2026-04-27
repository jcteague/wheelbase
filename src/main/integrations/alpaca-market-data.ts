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
type AlpacaStockQuote = {
  t: string
  bp: number
  ap: number
  bs: number
  as: number
  bx: string
  ax: string
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

// Raw Alpaca stream message shape (covers auth, quotes, trades)
type AlpacaStreamMessage = {
  T: string
  msg?: string
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

function isAuthError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: number }).status
    return status === 401 || status === 403
  }
  return false
}

function isNetworkError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as { cause?: { code?: string }; code?: string; message?: string }
    if (e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ENOTFOUND') return true
    if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') return true
    if (e.message && /fetch failed|network|ECONNREFUSED/i.test(e.message)) return true
  }
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

function mapQuoteToStockQuote(bp: number, ap: number, timestamp: string): StockQuote {
  const bid = new Decimal(bp)
  const ask = new Decimal(ap)
  const mid = bid.plus(ask).dividedBy(2)

  return {
    price: mid.toFixed(2),
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    change: '0.00',
    changePercent: '0.00',
    volume: 0,
    timestamp
  }
}

function deriveSession(isOpen: boolean, timestamp: string): 'regular' | 'pre' | 'post' | 'closed' {
  if (isOpen) return 'regular'

  const date = new Date(timestamp)
  // Parse the offset from the timestamp string (Alpaca includes it, e.g. -04:00 for EDT)
  const offsetMatch = timestamp.match(/([+-])(\d{2}):(\d{2})$/)
  let etHours: number
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1
    const offsetHours = parseInt(offsetMatch[2], 10)
    const offsetMinutes = parseInt(offsetMatch[3], 10)
    const totalOffsetMinutes = sign * (offsetHours * 60 + offsetMinutes)
    // Convert UTC to ET using the offset from the timestamp
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes()
    const localMinutes = utcMinutes + totalOffsetMinutes
    etHours = localMinutes / 60
  } else {
    // Fallback: assume EDT (-4)
    etHours = (date.getUTCHours() * 60 + date.getUTCMinutes() - 240) / 60
  }

  // Normalize negative hours (e.g., 1 AM UTC - 4 = -3, should be 21)
  if (etHours < 0) etHours += 24

  if (etHours >= 4 && etHours < 9.5) return 'pre'
  if (etHours >= 16 && etHours < 20) return 'post'
  return 'closed'
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  private readonly client: ReturnType<typeof createClient>
  private readonly config: AlpacaMarketDataConfig
  private stockSocket: WebSocket | null = null
  private optionSocket: WebSocket | null = null
  private stockSubject: Subject<StreamEvent<StockQuote | OptionSnapshot>> | null = null
  private optionSubject: Subject<StreamEvent<StockQuote | OptionSnapshot>> | null = null

  constructor(config: AlpacaMarketDataConfig) {
    this.config = config
    this.client = createClient({
      key: config.keyId,
      secret: config.secretKey,
      paper: config.paper
    })
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    try {
      const response = await this.client.getStocksQuotesLatest({
        symbols: tickers.join(',')
      })
      const result = new Map<string, StockQuote>()

      const quotes = response.quotes as Record<string, AlpacaStockQuote>

      for (const [symbol, quote] of Object.entries(quotes)) {
        result.set(symbol, mapQuoteToStockQuote(quote.bp, quote.ap, quote.t))
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
        const mid = bid.plus(ask).dividedBy(2)

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

  async connect(): Promise<void> {
    const dataFeed = this.config.dataFeed ?? 'sip'
    const optionFeed = this.config.optionFeed ?? 'opra'

    this.stockSocket = new WebSocket(`wss://stream.data.alpaca.markets/v2/${dataFeed}`)
    this.optionSocket = new WebSocket(`wss://stream.data.alpaca.markets/v1beta1/${optionFeed}`)

    this.stockSubject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
    this.optionSubject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()

    await Promise.all([
      this.setupAndAuthSocket(this.stockSocket, this.stockSubject, 'stockQuotes'),
      this.setupAndAuthSocket(this.optionSocket, this.optionSubject, 'optionQuotes')
    ])
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
    return new Promise<void>((resolve) => {
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
            resolve()
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

      socket.on('close', () => {
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
