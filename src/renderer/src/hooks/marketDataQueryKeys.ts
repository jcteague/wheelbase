export const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market-data', 'stock-quotes', tickers.slice().sort().join(',')] as const,
  marketStatus: ['market-data', 'market-status'] as const
}
