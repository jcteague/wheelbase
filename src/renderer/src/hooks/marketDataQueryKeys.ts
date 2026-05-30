export const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market-data', 'stock-quotes', [...tickers].sort().join(',')] as const,
  marketStatus: ['broker', 'market-status'] as const,
  optionSnapshots: (symbols: string[]) =>
    ['market-data', 'option-snapshots', [...symbols].sort().join(',')] as const
}
