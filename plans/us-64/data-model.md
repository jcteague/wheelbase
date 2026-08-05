# Data Model — US-64: Pull option chains for watchlist tickers

US-64 persists nothing. Market data is transient (per the market-data domain
invariant). These are in-memory types flowing service → (future) US-65 scorer.

## Adapter types (extended in `src/main/integrations/market-data-provider.ts`)

### `OptionChainQuote` (new)

Per-strike chain entry with identity + liquidity. Superset of `OptionSnapshot`.

```typescript
export type OptionChainQuote = OptionSnapshot & {
  contractId: string // OCC symbol, `O:` prefix stripped (e.g. "AAPL260918P00190000")
  strike: string // decimal.js string, 2dp
  expiration: string // "YYYY-MM-DD"
  contractType: 'put' | 'call'
}
```

Existing `OptionSnapshot` fields (unchanged, carried through):
`bid`, `ask`, `mid`, `lastTrade` (2dp strings), `openInterest: number | null`,
`volume: number | null`, `greeks?: { delta, gamma, theta, vega }` (4dp strings),
`impliedVolatility?` (4dp), `timestamp` (ISO). For chain results `openInterest`
and `volume` are now **populated** from Massive's `open_interest` / `day.volume`.

### Interface change

```typescript
// before: Promise<OptionSnapshot[]>
getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]>
```

`OptionChainFilter` is unchanged.

### Massive internal shape (in `massive-market-data.ts`)

```typescript
type ChainSnapResult = SnapResult & {
  details: {
    ticker: string
    strike_price: number
    expiration_date: string // "YYYY-MM-DD"
    contract_type: 'put' | 'call'
  }
  open_interest: number | null
  day: { volume: number | null } | null
}
```

`mapChainResult(r: ChainSnapResult): OptionChainQuote`:

- spreads `mapSnapResult(r)` (reuses existing money/greeks logic),
- overrides `openInterest: r.open_interest ?? null`, `volume: r.day?.volume ?? null`,
- `contractId: r.details.ticker.replace(/^O:/, '')`,
- `strike: new Decimal(r.details.strike_price).toFixed(2)`,
- `expiration: r.details.expiration_date`,
- `contractType: r.details.contract_type`.

## Core types (`src/main/core/candidate-chain.ts`, pure)

### `DteWindow`

```typescript
export type DteWindow = { min: number; max: number }
export const DEFAULT_DTE_WINDOW: DteWindow = { min: 30, max: 45 }
```

### `CandidateStrike`

The per-strike output row. `mark` is the adapter's `mid`; `delta` is
`greeks.delta` or `null` when Greeks are absent (deep ITM).

```typescript
export type CandidateStrike = {
  contractId: string
  strike: string
  expiration: string
  bid: string
  ask: string
  mark: string // = OptionChainQuote.mid, (bid+ask)/2 HALF_UP 2dp
  delta: string | null
  openInterest: number | null
  volume: number | null
  timestamp: string
}
```

### Pure functions

```typescript
// addDays(currentDate, min|max) then format 'yyyy-MM-dd'
export function dteWindowToExpirationRange(
  currentDate: Date,
  window: DteWindow
): { from: string; to: string }

// bid > 0 && ask > 0
export function isTradeableStrike(bid: string, ask: string): boolean

// drop untradeable strikes; map OptionChainQuote -> CandidateStrike
export function toCandidateStrikes(quotes: OptionChainQuote[]): CandidateStrike[]

// 'not_found' -> 'ticker'; all other codes -> 'provider'
export function classifyChainFailure(code: MarketDataErrorCode): 'ticker' | 'provider'
```

**Validation rules from ACs:**

- A strike is dropped when `bid <= 0 || ask <= 0` (zero-bid / one-sided → no
  reliable mark).
- `mark` must equal `(bid + ask) / 2` HALF_UP 2dp — inherited from the adapter's
  `mid`; the candidate row copies it, never recomputes from a float.

## Service types (`src/main/services/candidate-chains.ts`)

```typescript
export type TickerChainResult =
  | { ticker: string; status: 'ok'; strikes: CandidateStrike[] }
  | { ticker: string; status: 'no_options_listed' }
  | { ticker: string; status: 'data_unavailable' }

export type WatchlistChainsResult = {
  status: 'ok' | 'provider_unavailable'
  tickers: TickerChainResult[]
}

export async function pullWatchlistChains(
  provider: MarketDataProvider,
  db: Database.Database,
  opts?: { window?: DteWindow; currentDate?: Date }
): Promise<WatchlistChainsResult>
```

### State transitions (per ticker, inside its own try/catch)

| Provider outcome                       | `TickerChainResult.status` | Log level |
| -------------------------------------- | -------------------------- | --------- |
| returns non-empty `OptionChainQuote[]` | `ok` (+ filtered strikes)  | debug     |
| returns `[]`                           | `no_options_listed`        | debug     |
| throws `MarketDataError('not_found')`  | `data_unavailable`         | debug     |
| throws `MarketDataError` (other codes) | `data_unavailable`         | warn      |
| throws non-`MarketDataError`           | `data_unavailable`         | error     |

### Overall status

- `provider_unavailable` iff `tickers.length > 0` **and** no ticker returned `ok`
  **and** every failed ticker failed with a **provider-level** code
  (`classifyChainFailure === 'provider'`). Any `not_found` present ⇒ overall `ok`.
- otherwise `ok`.
- empty watchlist ⇒ `{ status: 'ok', tickers: [] }`.
