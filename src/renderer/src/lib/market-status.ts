import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import type { MarketStatus } from '../api/market-data'

export function deriveMarketStatusDisplay(
  session: MarketStatus['session'] | undefined,
  stale: boolean,
  streamError: IpcStreamErrorEvent | null
): MarketStatusDisplay {
  if (streamError || stale) return 'DELAYED'
  if (session === 'regular') return 'LIVE'
  if (session === 'pre' || session === 'post') return 'EXT'
  return 'CLOSED'
}
