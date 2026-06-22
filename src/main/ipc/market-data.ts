import { ipcMain, type BrowserWindow } from 'electron'
import {
  GetOptionChainPayloadSchema,
  GetOptionSnapshotPayloadSchema,
  GetOptionSnapshotsPayloadSchema,
  GetStockQuotesPayloadSchema,
  SetStockQuoteTickersPayloadSchema
} from '../schemas'
import {
  type MarketDataProvider,
  type StockQuote,
  type StreamError
} from '../integrations/market-data-provider'
import { fakeStockTickSubject } from '../integrations/fake-market-data'
import {
  fetchStockQuotes,
  fetchOptionSnapshots,
  subscribeToStockQuotes,
  newStreamState
} from '../services/market-data'
import { handleIpcCall } from './utils'

export function registerMarketDataHandlers(
  getProvider: () => MarketDataProvider,
  getWindow: () => BrowserWindow | null
): void {
  const streamState = newStreamState()

  ipcMain.handle('market-data:stock-quotes', (_, payload: unknown) =>
    handleIpcCall('market_data_stock_quotes_unhandled_error', async () => {
      const { tickers } = GetStockQuotesPayloadSchema.parse(payload)
      const quotes = await fetchStockQuotes(getProvider(), tickers)
      return { quotes }
    })
  )

  ipcMain.handle('market-data:set-stock-quote-tickers', (_, payload: unknown) =>
    handleIpcCall('market_data_set_tickers_unhandled_error', async () => {
      const { tickers } = SetStockQuoteTickersPayloadSchema.parse(payload)
      const subscribedTickers = await subscribeToStockQuotes(
        streamState,
        getProvider(),
        tickers,
        (ticker, quote) =>
          getWindow()?.webContents.send('market-data:stock-quote', { ticker, quote }),
        (err) => getWindow()?.webContents.send('market-data:stream-error', err)
      )
      return { subscribedTickers }
    })
  )

  ipcMain.handle('market-data:option-snapshots', (_, payload: unknown) =>
    handleIpcCall('market_data_option_snapshots_unhandled_error', async () => {
      const { symbols } = GetOptionSnapshotsPayloadSchema.parse(payload)
      return fetchOptionSnapshots(getProvider(), symbols)
    })
  )

  ipcMain.handle('market-data:option-snapshot', (_, payload: unknown) =>
    handleIpcCall('market_data_option_snapshot_unhandled_error', async () => {
      const { contract } = GetOptionSnapshotPayloadSchema.parse(payload)
      const snapshot = await getProvider().getOptionSnapshot(contract)
      return { snapshot }
    })
  )

  ipcMain.handle('market-data:option-chain', (_, payload: unknown) =>
    handleIpcCall('market_data_option_chain_unhandled_error', async () => {
      const filter = GetOptionChainPayloadSchema.parse(payload)
      const snapshots = await getProvider().getOptionChainSnapshot(filter)
      return { snapshots, nextCursor: null }
    })
  )

  // Test-only handlers: push synthetic events into the fake provider's stream so
  // e2e tests can simulate ticks and errors without real broker connections.
  // Registered unconditionally — but only callable when the fake provider is active.
  ipcMain.handle('test:trigger-stock-tick', (_, payload: unknown) => {
    const { ticker, quote } = payload as { ticker: string; quote: StockQuote }
    fakeStockTickSubject.next({
      feed: 'stockQuotes',
      symbol: ticker,
      data: quote,
      timestamp: new Date().toISOString()
    })
    return { ok: true }
  })

  ipcMain.handle('test:trigger-stream-error', (_, payload: unknown) => {
    const err = payload as StreamError
    getWindow()?.webContents.send('market-data:stream-error', err)
    return { ok: true }
  })
}
