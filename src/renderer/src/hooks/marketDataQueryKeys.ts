export const marketDataQueryKeys = {
  stockQuotes: (tickers: string[]) =>
    ['market', 'stock-quotes', [...tickers].sort().join(',')] as const,
  optionSnapshots: (symbols: string[]) =>
    ['market', 'option-snapshots', [...symbols].sort().join(',')] as const
}
