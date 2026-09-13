import { ScreenerStateCard } from './ScreenerStateCard'
import { AlertBox } from './ui/AlertBox'

// [US-96] What the bench shows when the screen came back without market data: the card
// that says so and offers the one action that can fix it, and — always with it — the
// paragraph explaining what survives an outage, because a trader who only sees "no
// candidates" has no way to tell an outage from an empty screen.

const OUTAGE_COPY =
  'Market data is unavailable. Saved stocks and theses are still here. Prices are last-known; IV ranks come from the local snapshot store and keep their own age. No stocks are marked as meeting criteria.'

type MarketDataOutageProps = {
  /** With no credentials saved Alpaca was never contacted, so "couldn't be reached" would
   *  point the trader at an outage instead of at Settings. */
  marketDataConfigured: boolean
  onRetry: () => void
  onOpenSettings: () => void
}

export function MarketDataOutage({
  marketDataConfigured,
  onRetry,
  onOpenSettings
}: MarketDataOutageProps): React.JSX.Element {
  // Same card either way; only the diagnosis and the way out of it differ.
  const state = marketDataConfigured
    ? {
        title: 'Market data unavailable',
        body: "Alpaca market data couldn't be reached on the last refresh. Candidates can't be scored until chain data is available.",
        actionLabel: 'Retry refresh',
        onAction: onRetry
      }
    : {
        title: 'Market data not connected',
        body: 'Connect Alpaca in Settings to score candidates — no market-data credentials are saved yet.',
        actionLabel: 'Open Settings',
        onAction: onOpenSettings
      }

  return (
    <>
      <ScreenerStateCard data-testid="screener-unavailable" tone="error" {...state} />
      <AlertBox variant="warning">{OUTAGE_COPY}</AlertBox>
    </>
  )
}
