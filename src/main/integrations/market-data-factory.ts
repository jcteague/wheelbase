import type { MarketDataProvider } from './market-data-provider'
import { MassiveMarketDataProvider } from './massive-market-data'
import { FakeMarketDataProvider } from './fake-market-data'

type MarketDataFactoryConfig = {
  loadMassiveApiKey: () => string
}

let config: MarketDataFactoryConfig = {
  loadMassiveApiKey: () => process.env.MASSIVE_API_KEY ?? ''
}

function buildProvider(): MarketDataProvider {
  if (process.env.FAKE_MARKET_DATA === 'true') {
    return new FakeMarketDataProvider()
  }
  const apiKey = config.loadMassiveApiKey()
  if (apiKey) {
    return new MassiveMarketDataProvider({ apiKey })
  }
  throw new Error(
    'Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true.'
  )
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
