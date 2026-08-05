# Contract: `MarketDataProvider.getOptionChainSnapshot` (extended)

> US-64 adds **no new IPC handler** (see research.md — display is US-66, scoring is
> US-65). The only contract change is to the existing **provider adapter method**,
> documented here because it is the external seam US-64 depends on and extends.

## Purpose

Fetch the option chain for one underlying, filtered by expiration/type/strike, with
each returned entry now carrying per-strike identity (`contractId`, `strike`,
`expiration`, `contractType`) and populated `openInterest` / `volume`.

## Request

```typescript
// unchanged — src/main/integrations/market-data-provider.ts
type OptionChainFilter = {
  underlying: string
  expirationFrom?: string // "YYYY-MM-DD"
  expirationTo?: string // "YYYY-MM-DD"
  type?: 'put' | 'call'
  strikeFrom?: string
  strikeTo?: string
  limit?: number
  cursor?: string
}
```

US-64 calls it with `{ underlying, expirationFrom, expirationTo, type: 'put' }`.

## Response (success)

```typescript
// CHANGED return type: OptionSnapshot[] -> OptionChainQuote[]
type OptionChainQuote = OptionSnapshot & {
  contractId: string // "AAPL260918P00190000" (O: prefix stripped)
  strike: string // 2dp decimal string
  expiration: string // "YYYY-MM-DD"
  contractType: 'put' | 'call'
}
// OptionSnapshot: bid, ask, mid, lastTrade (2dp), openInterest|null, volume|null,
//                 greeks?{delta,gamma,theta,vega} (4dp), impliedVolatility?, timestamp
```

Empty array is a **normal** response (underlying has no listed options in-window)
— not an error.

## Error codes

Thrown as `MarketDataError` (converted to the `{ ok: false, errors }` envelope only
if reached over IPC — US-64 consumes it in-process and classifies it instead). No
new story-specific codes; the existing fixed set applies:

| field      | code            | message (source)                |
| ---------- | --------------- | ------------------------------- |
| `__root__` | `auth_failed`   | 401/403 from Massive            |
| `__root__` | `not_found`     | 404 from Massive (ticker-level) |
| `__root__` | `rate_limited`  | 429 after `MAX_RETRIES`         |
| `__root__` | `network_error` | fetch/network failure           |
| `__root__` | `unknown`       | other non-ok / unexpected       |

US-64's service maps: `not_found` → per-ticker `data_unavailable` (reachable);
all others → provider-level (may roll up to overall `provider_unavailable`).

## Source

- Interface / types: `src/main/integrations/market-data-provider.ts`
- Massive impl: `src/main/integrations/massive-market-data.ts`
  (`getOptionChainSnapshot`, new `mapChainResult`, extended `ChainSnapResult`)
- Fake impl: `src/main/integrations/fake-market-data.ts`
- Existing IPC consumer (fields widen, no behavior change):
  `src/main/ipc/market-data.ts` (`market-data:option-chain`)
