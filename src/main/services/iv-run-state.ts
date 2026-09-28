// [US-121] Why a ticker has no IV rank right now, as far as this process knows. Process state,
// never persisted: a relaunch mid-backfill honestly reads `not_collected` until the next run.
// The collector and the on-demand path own the transitions; the read path only asks.

import type { IvHistoryTickerOutcome } from './iv-history'

export type IvRunStatus = 'pending' | 'failed' | 'no_market_data'

export type IvRunState = {
  markPending(ticker: string): void
  /** The batch marks every remaining target when one reports no_market_data. */
  markNoMarketData(tickers: readonly string[]): void
  /** collected / up_to_date → entry cleared; failed → 'failed'; no_market_data → 'no_market_data'. */
  settle(ticker: string, outcome: IvHistoryTickerOutcome): void
  get(ticker: string): IvRunStatus | undefined
}

export function createIvRunState(): IvRunState {
  const statuses = new Map<string, IvRunStatus>()
  const key = (ticker: string): string => ticker.toUpperCase()

  return {
    markPending: (ticker) => void statuses.set(key(ticker), 'pending'),
    markNoMarketData: (tickers) => tickers.forEach((t) => statuses.set(key(t), 'no_market_data')),
    settle: (ticker, outcome) => {
      switch (outcome.status) {
        case 'collected':
        case 'up_to_date':
          statuses.delete(key(ticker))
          return
        case 'failed':
        case 'no_market_data':
          statuses.set(key(ticker), outcome.status)
      }
    },
    get: (ticker) => statuses.get(key(ticker))
  }
}
