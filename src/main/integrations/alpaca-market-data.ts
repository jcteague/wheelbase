import { Subject, defer, filter, type Observable } from 'rxjs'
import WebSocket from 'ws'
import {
  MarketDataError,
  type MarketDataFeed,
  type MarketDataProvider,
  type OptionChainFilter,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote,
  type StreamError,
  type StreamEvent
} from './market-data-provider'
import {
  buildChainUrl,
  buildContractsUrl,
  buildSingleSnapshotUrl,
  buildStockSnapshotsUrl,
  classifyStreamError,
  connectError,
  mapBar,
  mapChainEntry,
  mapOptionQuote,
  mapStockSnapshot,
  parseFrames,
  parseOpenInterest,
  type AlpacaContracts,
  type AlpacaOptionSnapshot,
  type AlpacaOptionSnapshots,
  type AlpacaStockSnapshots,
  type AlpacaWsFrame
} from './alpaca-market-data-mappers'
import { isNetworkError } from './integration-errors'
import type { AlpacaCredentials } from '../services/settings'
import { logger } from '../logger'

const MAX_RETRIES = 2
const STREAM_URL = 'wss://stream.data.alpaca.markets/v2/iex'
const AUTH_TIMEOUT_MS = 10_000

export type AlpacaMarketDataConfig = {
  loadCredentials: () => AlpacaCredentials | null
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  private readonly loadCredentials: () => AlpacaCredentials | null
  private ws: WebSocket | null = null
  private readonly subscribed = new Set<string>()
  // Not readonly: an rxjs Subject is permanently stopped once it errors, so a stream
  // fault swaps in a fresh one to keep reconnection possible. See failStream.
  private tickSubject = new Subject<StreamEvent<StockQuote>>()

  constructor(config: AlpacaMarketDataConfig) {
    this.loadCredentials = config.loadCredentials
  }

  private credentials(): AlpacaCredentials {
    const credentials = this.loadCredentials()
    if (!credentials) {
      throw new MarketDataError('auth_failed', 'Alpaca credentials not configured')
    }
    return credentials
  }

  private async apiFetch(
    url: string,
    credentials: AlpacaCredentials,
    retryCount = 0
  ): Promise<unknown> {
    logger.debug({ url, retryCount }, 'alpaca_api_request')
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': credentials.keyId,
          'APCA-API-SECRET-KEY': credentials.secret
        }
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
      // Retry-After is either delta-seconds or an HTTP-date; only the former is usable as
      // a delay. An absent or non-numeric header falls back to a second rather than
      // producing a NaN, which setTimeout floors to 0 and which would burn the whole
      // retry budget in a single tick.
      const retryAfterHeader = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
      const delayMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 1000
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return this.apiFetch(url, credentials, retryCount + 1)
    }

    if (response.status === 404) {
      throw new MarketDataError('not_found', `HTTP 404: ${url}`)
    }
    if (!response.ok) {
      throw new MarketDataError('unknown', `HTTP ${response.status}`)
    }

    logger.debug({ url, status: response.status }, 'alpaca_api_response')
    return response.json()
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    if (tickers.length === 0) return new Map()
    const credentials = this.credentials()

    const data = (await this.apiFetch(
      buildStockSnapshotsUrl(tickers),
      credentials
    )) as AlpacaStockSnapshots

    const quotes = new Map<string, StockQuote>()
    for (const ticker of tickers) {
      const snap = data[ticker]
      if (!snap) continue
      const quote = mapStockSnapshot(snap)
      if (!quote) {
        logger.debug({ ticker }, 'alpaca_stock_snapshot_skipped')
        continue
      }
      quotes.set(ticker, quote)
    }
    return quotes
  }

  async getOptionSnapshot(contractId: string): Promise<OptionSnapshot> {
    const credentials = this.credentials()
    const data = (await this.apiFetch(
      buildSingleSnapshotUrl(contractId),
      credentials
    )) as AlpacaOptionSnapshots

    const snap = data.snapshots?.[contractId]
    if (!snap) {
      throw new MarketDataError('not_found', `Option contract ${contractId} not in snapshot`)
    }
    return mapOptionQuote(snap)
  }

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]> {
    const credentials = this.credentials()

    const entries: Array<[string, AlpacaOptionSnapshot]> = []
    let pageToken: string | undefined
    do {
      const page = (await this.apiFetch(
        buildChainUrl(filter, pageToken),
        credentials
      )) as AlpacaOptionSnapshots
      for (const [key, snap] of Object.entries(page.snapshots ?? {})) {
        if (snap) entries.push([key, snap])
      }
      // An explicit limit means the caller is paging itself — hand back the one page.
      pageToken = filter.limit === undefined ? (page.next_page_token ?? undefined) : undefined
    } while (pageToken)

    if (entries.length === 0) return []

    const openInterest = await this.fetchOpenInterest(filter, credentials)

    const quotes: OptionChainQuote[] = []
    for (const [key, snap] of entries) {
      const quote = mapChainEntry(key, snap, openInterest.get(key) ?? null)
      if (!quote) {
        logger.debug({ key, underlying: filter.underlying }, 'alpaca_chain_key_unparseable')
        continue
      }
      quotes.push(quote)
    }

    logger.info(
      {
        underlying: filter.underlying,
        contracts: quotes.length,
        twoSided: quotes.filter((q) => Number(q.bid) > 0 && Number(q.ask) > 0).length,
        withGreeks: quotes.filter((q) => q.greeks !== undefined).length,
        oiResolved: quotes.filter((q) => q.openInterest !== null).length
      },
      'Alpaca chain snapshot mapped'
    )
    return quotes
  }

  // Open interest is a nice-to-have ranking input, so a contracts outage degrades the whole
  // chain to `openInterest: null` rather than failing the refresh.
  private async fetchOpenInterest(
    filter: OptionChainFilter,
    credentials: AlpacaCredentials
  ): Promise<Map<string, number | null>> {
    const openInterest = new Map<string, number | null>()
    try {
      let pageToken: string | undefined
      do {
        const page = (await this.apiFetch(
          buildContractsUrl(filter, credentials.environment, pageToken),
          credentials
        )) as AlpacaContracts
        for (const row of page.option_contracts ?? []) {
          openInterest.set(row.symbol, parseOpenInterest(row.open_interest))
        }
        pageToken = page.next_page_token ?? undefined
      } while (pageToken)
    } catch (err) {
      logger.warn({ underlying: filter.underlying, err }, 'alpaca_open_interest_unavailable')
      return new Map()
    }
    return openInterest
  }

  // The free plan streams IEX bars only; option feeds stay on the REST snapshot path.
  supportsStreaming(feed: MarketDataFeed): boolean {
    return feed === 'stockQuotes'
  }

  async connect(feeds?: MarketDataFeed[]): Promise<void> {
    const credentials = this.credentials()
    logger.debug({ feeds }, 'alpaca_ws_connecting')

    // A timed-out handshake leaves its socket open, and Alpaca's free plan allows a single
    // concurrent connection — so never open a second one alongside it. The subscription
    // record goes with it: server-side subscriptions belong to the socket that made them,
    // and keeping them would make the replacement's diff a no-op.
    this.ws?.close()
    this.ws = null
    this.subscribed.clear()

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(STREAM_URL)
      this.ws = ws

      // Alpaca acknowledges the socket before it accepts auth, so a silent server would
      // otherwise leave connect() pending forever and the REST seed never retried.
      // `settle` is declared below but only ever called asynchronously, well after its
      // initialiser has run.
      const authTimer = setTimeout(() => {
        settle(() => {
          ws.close()
          reject(new MarketDataError('network_error', 'auth timeout'))
        })
      }, AUTH_TIMEOUT_MS)

      let settled = false
      const settle = (finish: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(authTimer)
        finish()
      }

      ws.on('message', (rawData: Buffer | string) => {
        const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : rawData
        for (const frame of parseFrames(text)) {
          if (frame.T === 'success' && frame.msg === 'connected') {
            ws.send(
              JSON.stringify({
                action: 'auth',
                key: credentials.keyId,
                secret: credentials.secret
              })
            )
          } else if (frame.T === 'success' && frame.msg === 'authenticated') {
            logger.info('alpaca_ws_authenticated')
            settle(resolve)
          } else if (frame.T === 'subscription') {
            // The server's own list, not ours — a divergence between the two is exactly
            // what this log exists to make visible.
            logger.debug({ bars: frame.bars ?? [] }, 'alpaca_ws_subscription_confirmed')
          } else if (frame.T === 'error') {
            this.handleErrorFrame(frame, settled, () =>
              settle(() => {
                reject(connectError(frame))
                ws.close()
              })
            )
          } else if (frame.T === 'b') {
            this.tickSubject.next(mapBar(frame))
          }
        }
      })

      ws.on('error', (err: Error) => {
        settle(() => reject(new MarketDataError('network_error', err.message)))
      })

      ws.on('close', () => {
        logger.info('alpaca_ws_closed')
        // A close that arrives before the handshake finishes would otherwise leave connect()
        // pending until the auth timeout.
        settle(() => reject(new MarketDataError('network_error', 'socket closed')))

        // A socket's close event lands after the closing handshake, by which time a
        // reconnect may already have installed its replacement. Clearing state here
        // unconditionally would null out the live socket and silence the stream.
        if (this.ws !== ws) return
        this.ws = null

        // Alpaca closes without an error frame on a transport drop or a server-side
        // shutdown. Silence here left the renderer showing a connected dot over a stream
        // that would never emit again, so the fault is surfaced for the service to act on.
        this.failStream({
          feed: 'stockQuotes',
          code: 'connection_lost',
          message: 'Alpaca market data stream closed',
          reconnectable: true
        })
      })
    })
  }

  private subscribedBars(): string[] {
    return [...this.subscribed]
  }

  // Before connect() settles an error frame is a handshake rejection; afterwards it is a
  // live-stream fault (symbol or connection limit) that belongs on the error channel.
  private handleErrorFrame(
    frame: AlpacaWsFrame,
    connected: boolean,
    rejectConnect: () => void
  ): void {
    if (!connected) {
      rejectConnect()
      return
    }
    this.failStream({
      feed: 'stockQuotes',
      code: classifyStreamError(frame.code),
      message: frame.msg ?? 'Alpaca WebSocket error',
      reconnectable: false
    })
  }

  // Errors the subject the current subscribers hold, then installs a fresh one so a later
  // connect() + stream() can deliver ticks again. Without the swap a single symbol-limit
  // rejection would end streaming for the life of the process.
  private failStream(streamError: StreamError): void {
    const failing = this.tickSubject
    this.tickSubject = new Subject<StreamEvent<StockQuote>>()
    // The socket's subscription record dies with the stream. Keeping it would make the next
    // stream() call compute an empty "added" diff and silently subscribe to nothing.
    this.subscribed.clear()
    logger.warn(streamError, 'alpaca_ws_stream_error')
    failing.error(streamError)
  }

  async disconnect(): Promise<void> {
    this.ws?.close()
    this.ws = null
    this.subscribed.clear()
  }

  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    void feed
    this.reconcileSubscriptions(symbols)
    const symbolSet = new Set(symbols)
    // Deferred so each subscription binds to whichever subject is live at that moment,
    // rather than capturing the one that existed when stream() was called.
    return defer(() =>
      this.tickSubject.pipe(filter((ev) => symbolSet.size === 0 || symbolSet.has(ev.symbol)))
    )
  }

  // Alpaca counts subscribed symbols against a free-plan cap, so only the delta is sent and
  // a pre-connect call is a no-op that connect() + the next stream() call will replay.
  private reconcileSubscriptions(symbols: string[]): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const wanted = new Set(symbols)
    const removed = this.subscribedBars().filter((s) => !wanted.has(s))
    const added = symbols.filter((s) => !this.subscribed.has(s))
    if (removed.length === 0 && added.length === 0) return

    if (removed.length > 0) {
      ws.send(JSON.stringify({ action: 'unsubscribe', bars: removed }))
      for (const symbol of removed) this.subscribed.delete(symbol)
    }
    if (added.length > 0) {
      ws.send(JSON.stringify({ action: 'subscribe', bars: added }))
      for (const symbol of added) this.subscribed.add(symbol)
    }
    logger.debug({ bars: this.subscribedBars() }, 'alpaca_ws_subscription_sent')
  }
}
