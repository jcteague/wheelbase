import type { MarketDataProvider } from './market-data-provider'
import { AlpacaMarketDataProvider } from './alpaca-market-data'

export type MarketDataConfig = {
  provider: 'alpaca'
  keyId: string
  secretKey: string
  paper: boolean
  dataFeed?: string
  optionFeed?: string
}

export function createMarketDataProvider(config: MarketDataConfig): MarketDataProvider {
  switch (config.provider) {
    case 'alpaca':
      return new AlpacaMarketDataProvider({
        keyId: config.keyId,
        secretKey: config.secretKey,
        paper: config.paper,
        dataFeed: config.dataFeed,
        optionFeed: config.optionFeed
      })
    default:
      throw new Error(`Unknown market data provider: ${config.provider as string}`)
  }
}
