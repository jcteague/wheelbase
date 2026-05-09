# Data Model: US-33

## Schema changes

### Migration `005_add_profit_target_percent.sql`

```sql
ALTER TABLE positions
  ADD COLUMN profit_target_percent INTEGER;
```

- `INTEGER`, nullable, no default. `NULL` means "use the global default constant".
- Valid values when non-null: `1..100` inclusive (no DB-level CHECK — validated in service layer if/when an edit IPC ships; for now the column is read-only and seeded only via tests/dev).

---

## Domain types (TypeScript)

### `OptionInstrumentType` (existing)

```ts
type InstrumentType = 'PUT' | 'CALL' | 'STOCK'
```

Already in `src/main/core/types.ts`. Reused.

### `BuildOccSymbolInput` (new)

```ts
type BuildOccSymbolInput = {
  ticker: string // e.g. 'AAPL'  (uppercased internally)
  expiration: string // 'YYYY-MM-DD'
  strike: string | number // dollars (e.g. '180', 180, '180.50')
  instrumentType: 'PUT' | 'CALL'
}
```

### `UnrealizedPnlInput` / `UnrealizedPnlResult` (new — added to `src/main/core/costbasis.ts`)

```ts
type UnrealizedPnlInput = {
  entryPremium: string // dollars-per-contract, decimal string ('3.50')
  currentMid: string // dollars-per-contract, decimal string ('1.30')
  contracts: number // positive integer
}

type UnrealizedPnlResult = {
  pnl: string // dollars total, 4dp ('220.0000')
  pnlPercent: string // 0–100 scale, 4dp ('62.8571')
  maxProfit: string // dollars total, 4dp ('350.0000')
}
```

### `ActiveLegSummary` (new — exposed by `positions:list`)

Added to `PositionListItem`:

```ts
type PositionListItem = {
  // ... existing fields
  instrumentType: 'PUT' | 'CALL' | null // null when no open option leg
  contracts: number | null // null when no open option leg
  entryPremiumPerContract: string | null // null when no open option leg
  profitTargetPercent: number | null // null → use global default
}
```

The renderer derives:

- `occSymbol = instrumentType && strike && expiration ? buildOccSymbol(...) : null`
- `targetPercent = profitTargetPercent ?? DEFAULT_PROFIT_TARGET_PERCENT` (50)

### `OptionSnapshot` (existing — already on the provider type)

Reused from `src/main/integrations/market-data-provider.ts`:

```ts
type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks: { delta: string; gamma: string; theta: string; vega: string; iv: string }
  timestamp: string
}
```

For US-33 the renderer ignores `greeks` and `lastTrade`; US-34 will pick those up.

---

## Derived UI states

### `OptionPnlDisplay` (renderer-only)

Computed once per row from a `(quote: OptionSnapshot | undefined, leg: ActiveLegSummary | null)` pair:

| State        | Condition                             | Visible             |
| ------------ | ------------------------------------- | ------------------- |
| `noLeg`      | `leg === null`                        | `—` mid, `—` P&L    |
| `noQuote`    | `leg !== null && quote === undefined` | `—` mid, `—` P&L    |
| `noBid`      | `leg !== null && quote.bid === '0'`   | mid + "no bid" tag  |
| `wideSpread` | `(ask − bid) / mid > 0.10 && mid > 0` | mid + amber warning |
| `normal`     | otherwise                             | mid + signed P&L    |

### `TargetReached` (renderer-only)

```
targetPercent = leg.profitTargetPercent ?? 50
targetReached = pnlPercent >= targetPercent
```

When `true`, the row shows a gold `TARGET` badge with tooltip text exactly:

```
{pnlPercent.toFixed(1)}% of max profit (${maxProfit.toFixed(2)}) — target is {targetPercent}%
```

The `pnlPercent` and `maxProfit` formatting strips trailing zeros to one decimal place
to match the AC text "62.9%" rather than "62.8571%".

---

## Constants

```ts
// src/main/core/profit-target.ts
export const DEFAULT_PROFIT_TARGET_PERCENT = 50

// src/renderer/src/lib/option-display.ts
export const WIDE_SPREAD_THRESHOLD = 0.1
```

---

## Validation rules

- `buildOccSymbol`:
  - `ticker` non-empty after trim; throw `Error('Invalid ticker')` otherwise.
  - `expiration` matches `/^\d{4}-\d{2}-\d{2}$/`; throw on mismatch.
  - `strike > 0` and finite; throw on invalid.
  - `instrumentType in ['PUT', 'CALL']`; throw on `'STOCK'` or other.
- `computeUnrealizedPnl`:
  - `entryPremium > 0`; throw on `<=0`.
  - `currentMid >= 0`; throw on negative.
  - `contracts >= 1` and integer; throw otherwise.
- IPC payload `GetOptionSnapshotsPayloadSchema`:
  - `symbols: z.array(z.string().min(1).max(25)).max(50)` — OCC symbols are at most 21 chars, capped at 25 with headroom; max 50 per request to match stock-quotes.

---

## State transitions

None — this story is read-only over option snapshots and adds a single nullable column to `positions` that is not yet user-editable.
