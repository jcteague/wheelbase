// [US-96] watchlist:snapshot — one bench row per watchlist entry, built at a single
// request clock from the day's quote, the freshness-assessed IVR reading and the
// earnings calendar, then judged by the pure verdict engine.
//
// Every boundary here is allowed to fail on its own: an unconfigured provider, one
// ticker's quote, the earnings store, the trading-calendar refresh and the IVR read each
// degrade to "unknown" for what they feed, never to a failed snapshot. A missing answer
// is always modelled — `quote: null`, `ivRank: null`, `{ kind: 'unknown' }` — so the
// gate engine can report it as `unknown` rather than a quiet pass.
import type Database from 'better-sqlite3'

import {
  earningsDisplay,
  evaluateEntry,
  type EarningsDisplay,
  type EntryVerdict
} from '../core/watchlist-signal'
import type { AssessedIvRank } from '../core/ivr-freshness'
import type { EarningsLookup } from '../core/screener'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { logger } from '../logger'
import type { WatchlistEntryRecord } from '../schemas'
import type { EarningsCalendarKnowledge } from './earnings-dates'
import { readEarningsOrEmpty } from './earnings-horizon'
import { getAssessedIvrByUnderlying } from './ivr-snapshots'
import type { IpcStockQuote } from './market-data'
import { getScreeningCriteria } from './screening-criteria'
import { ensureTradingCalendar, readTradingCalendar } from './trading-calendar-store'
import { fetchIsolatedStockQuotes } from './underlying-quotes'
import { listWatchlist } from './watchlist'

export type SnapshotQuote = {
  price: string
  prevClose: string | null
  timestamp: string
}

export type WatchlistSnapshotRow = {
  entry: WatchlistEntryRecord
  quote: SnapshotQuote | null // null → that ticker's fetch failed
  ivRank: AssessedIvRank | null // null → never collected or unreadable
  earnings: EarningsDisplay
  verdict: EntryVerdict
}

export type WatchlistSnapshot = {
  rows: WatchlistSnapshotRow[] // watchlist order (added_at DESC)
  asOf: string // ISO request clock the verdicts were computed at
}

export type WatchlistSnapshotOptions = { currentDate: Date }

/** Quotes for the whole watchlist, or none at all when the provider cannot be built —
 *  an unconfigured or unreachable provider is a modelled state, not an error. */
async function readQuotes(
  getProvider: () => MarketDataProvider,
  tickers: string[]
): Promise<Map<string, IpcStockQuote>> {
  let provider: MarketDataProvider
  try {
    provider = getProvider()
  } catch (err) {
    logger.warn({ err }, 'watchlist_snapshot_provider_unavailable')
    return new Map()
  }
  return fetchIsolatedStockQuotes(provider, tickers)
}

function snapshotQuote(quote: IpcStockQuote | undefined): SnapshotQuote | null {
  return quote === undefined
    ? null
    : { price: quote.price, prevClose: quote.prevClose, timestamp: quote.timestamp }
}

function buildRow(
  entry: WatchlistEntryRecord,
  quotes: Map<string, IpcStockQuote>,
  assessed: Map<string, AssessedIvRank | null>,
  earnings: Map<string, EarningsCalendarKnowledge>,
  currentDate: Date
): WatchlistSnapshotRow {
  const quote = snapshotQuote(quotes.get(entry.ticker))
  const ivRank = assessed.get(entry.ticker) ?? null
  // A ticker the store said nothing about is `unavailable`, never "no earnings" —
  // absence of an answer must not read as absence of risk.
  const nextEarnings: EarningsLookup = earnings.get(entry.ticker)?.next ?? { status: 'unavailable' }

  logger.debug(
    {
      ticker: entry.ticker,
      hasQuote: quote !== null,
      ivRankState: ivRank?.state ?? null,
      earnings: nextEarnings.status
    },
    'watchlist_snapshot_entry_input'
  )

  return {
    entry,
    quote,
    ivRank,
    earnings: earningsDisplay(nextEarnings, currentDate),
    verdict: evaluateEntry({
      conditions: {
        ownBelowPrice: entry.ownBelowPrice,
        ivrTrigger: entry.ivrTrigger,
        postEarningsOnly: entry.postEarningsOnly
      },
      price: quote?.price ?? null,
      ivRank,
      earnings: nextEarnings,
      now: currentDate
    })
  }
}

export async function buildWatchlistSnapshot(
  getProvider: () => MarketDataProvider,
  db: Database.Database,
  { currentDate }: WatchlistSnapshotOptions
): Promise<WatchlistSnapshot> {
  const asOf = currentDate.toISOString()
  const entries = listWatchlist(db)
  // Nothing to price, so nothing to build a provider for — an empty watchlist must not
  // cost a credential check or a network round trip.
  if (entries.length === 0) return { rows: [], asOf }

  const tickers = entries.map((entry) => entry.ticker)
  const criteria = getScreeningCriteria(db)

  const [quotes, earnings] = await Promise.all([
    readQuotes(getProvider, tickers),
    readEarningsOrEmpty(
      db,
      tickers,
      criteria,
      currentDate,
      'watchlist_snapshot_earnings_read_failed'
    ),
    // Awaited, not fired and forgotten: the read below must see refreshed rows, or a
    // fresh install shows `n/a` for a whole render. Self-throttling and self-logging,
    // so in steady state this is one indexed query and never rejects.
    ensureTradingCalendar(db, getProvider, currentDate)
  ])
  const assessed = getAssessedIvrByUnderlying(db, tickers, {
    now: currentDate,
    calendar: readTradingCalendar(db, currentDate),
    lastEarnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.last]))
  })

  const rows = entries.map((entry) => buildRow(entry, quotes, assessed, earnings, currentDate))

  logger.info({ rowCount: rows.length, quotedCount: quotes.size, asOf }, 'watchlist_snapshot_built')
  return { rows, asOf }
}
