import { describe, expect, it } from 'vitest'
import { marketDataQueryKeys } from './marketDataQueryKeys'

describe('marketDataQueryKeys', () => {
  it('market data keys start with market, not broker or market-data', () => {
    expect(marketDataQueryKeys.stockQuotes(['MSFT', 'AAPL'])[0]).toBe('market')
    expect(marketDataQueryKeys.optionSnapshots(['AAPL260516P00180000'])[0]).toBe('market')
  })
})
