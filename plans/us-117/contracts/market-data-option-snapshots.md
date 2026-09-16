# Contract: market-data:option-snapshots

## Purpose

Returns the current option snapshot for each requested OCC symbol, including the Greeks and
the contract's implied volatility when the provider supplies them.

## Request

```typescript
// src/main/schemas.ts:397 — GetOptionSnapshotsPayloadSchema, unchanged by this story
z.object({
  symbols: z.array(z.string().min(1).max(25)).max(50)
})
```

## Response (success)

```typescript
{
  ok: true
  // keyed by OCC symbol; a symbol the provider has no snapshot for is simply absent
  snapshots: Record<string, IpcOptionSnapshot>
  // true only when every requested symbol resolved to nothing
  unavailable: boolean
}

interface IpcOptionSnapshot {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  // CHANGED: was required. Present only when all four Greeks are finite; `iv` removed.
  greeks?: {
    delta: string
    gamma: string
    theta: string
    vega: string
  }
  // NEW: 4dp decimal string, e.g. '0.2840'. A sibling of `greeks`, not a member of it.
  // Present only when the provider supplied a finite number. Independent of `greeks`.
  impliedVolatility?: string
  timestamp: string
}
```

Guarantees this story adds to the response:

- `impliedVolatility` and every `greeks` member are finite decimal strings. Neither is ever
  `null`, and neither is ever the string `"NaN"` — a non-finite figure is dropped at the
  Alpaca mapper, not stringified.
- `greeks` is all-or-nothing. A snapshot never carries a partial Greek set.
- `impliedVolatility` may be present with no `greeks`, and `greeks` may be present with no
  `impliedVolatility`. Roughly half of quoted contracts carry no Greeks at all, so both
  absences are ordinary, not error states.

## Error codes

| field      | code                                           | message                                                  |
| ---------- | ---------------------------------------------- | -------------------------------------------------------- |
| `__root__` | `market_data_option_snapshots_unhandled_error` | (envelope default — thrown message from `handleIpcCall`) |

No story-specific validation errors. Absence of a snapshot, of `greeks`, or of
`impliedVolatility` is a successful response with a missing key — never an error.

## Source

- Handler: `src/main/ipc/market-data.ts:64`
- Service: `src/main/services/market-data.ts:57` (`fetchOptionSnapshots`)
- Provider: `src/main/integrations/alpaca-market-data.ts:162` (`getOptionSnapshot`)
- Mapper: `src/main/integrations/alpaca-market-data-mappers.ts:118` (`mapOptionQuote`)
- Preload type: `src/preload/index.d.ts:243` (`IpcOptionSnapshot`) — **the file this story fixes**
- Renderer mirror: `src/renderer/src/api/market-data.ts:21` — **also fixed**
