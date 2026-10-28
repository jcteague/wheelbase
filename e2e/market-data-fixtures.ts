// Market-data fixture builders for the fake provider's WHEELBASE_MOCK_STOCK_QUOTES and
// WHEELBASE_MOCK_OPTION_SNAPSHOTS seams. Each returns the provider's full shape so a spec
// states only the figures it is about.

/** A flat stock quote at `price`: no change on the day, no volume. */
export function flatStockQuote(price: string): object {
  return {
    price,
    bid: price,
    ask: price,
    prevClose: price,
    change: '0',
    changePercent: '0',
    volume: 0,
    timestamp: new Date().toISOString()
  }
}

/** An option snapshot quoted at `bid` × `ask` with `mid`; `overrides` replace whole fields. */
export function optionSnapshot(
  bid: string,
  ask: string,
  mid: string,
  overrides: Record<string, unknown> = {}
): object {
  return {
    bid,
    ask,
    mid,
    lastTrade: mid,
    openInterest: null,
    volume: null,
    greeks: { delta: '-0.30', gamma: '0.02', theta: '-0.05', vega: '0.10', iv: '0.25' },
    timestamp: new Date().toISOString(),
    ...overrides
  }
}
