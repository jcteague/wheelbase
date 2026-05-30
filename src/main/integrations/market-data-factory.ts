import type { MarketDataProvider } from './market-data-provider'
import { MassiveMarketDataProvider } from './massive-market-data'
import { FakeMarketDataProvider } from './fake-market-data'

function buildProvider(): MarketDataProvider {
  if (process.env.FAKE_MARKET_DATA === 'true') {
    return new FakeMarketDataProvider()
  }
  const apiKey = process.env.MASSIVE_API_KEY
  if (apiKey) {
    return new MassiveMarketDataProvider({ apiKey })
  }
  throw new Error(
    'Market data provider not configured. Set MASSIVE_API_KEY or FAKE_MARKET_DATA=true.'
  )
}

let cached: MarketDataProvider | null = null

export const marketDataFactory = {
  create(): MarketDataProvider {
    if (!cached) cached = buildProvider()
    return cached
  },
  recreate(): void {
    cached = null
  }
}
