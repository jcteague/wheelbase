import type { MarketDataProvider } from './market-data-provider'
import { AlpacaMarketDataProvider } from './alpaca-market-data'
import { loadAlpacaCredentialsFromEnv } from './alpaca-credentials'
import { FakeMarketDataProvider } from './fake-market-data'
import type { AlpacaCredentials } from '../services/settings'

type MarketDataFactoryConfig = {
  loadActiveAlpacaCredentials: () => AlpacaCredentials | null
}

let config: MarketDataFactoryConfig = {
  loadActiveAlpacaCredentials: loadAlpacaCredentialsFromEnv
}

// Construction never fails: credentials are resolved per request, so an unconfigured app
// still starts and each market-data call raises auth_failed for the UI to render.
function buildProvider(): MarketDataProvider {
  if (process.env.FAKE_MARKET_DATA === 'true') {
    return new FakeMarketDataProvider()
  }
  return new AlpacaMarketDataProvider({ loadCredentials: config.loadActiveAlpacaCredentials })
}

let cached: MarketDataProvider | null = null

export const marketDataFactory = {
  configure(next: MarketDataFactoryConfig): void {
    config = next
    cached = null
  },
  create(): MarketDataProvider {
    if (!cached) cached = buildProvider()
    return cached
  },
  recreate(): void {
    cached = null
  },
  disconnect(): Promise<void> {
    return cached ? cached.disconnect() : Promise.resolve()
  }
}
