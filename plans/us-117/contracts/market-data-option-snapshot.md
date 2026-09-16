# Contract: market-data:option-snapshot

## Purpose

Returns the current option snapshot for a single OCC contract — the singular sibling of
`market-data:option-snapshots`, used by the promote-to-trade confirmation quote.

## Request

```typescript
// src/main/schemas.ts:402 — GetOptionSnapshotPayloadSchema, unchanged by this story
z.object({
  underlying: z.string().min(1),
  contract: z.string().regex(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/)
})
```

## Response (success)

```typescript
{
  ok: true
  snapshot: IpcOptionSnapshot // identical shape to the plural handler
}
```

`IpcOptionSnapshot` is defined once in `src/preload/index.d.ts` and shared by both handlers,
so the `greeks?` / `impliedVolatility?` change described in
[`market-data-option-snapshots.md`](./market-data-option-snapshots.md) applies here
unchanged. This handler is where the non-finite warn is emitted (see below) — it is the
per-contract read, so one log line corresponds to one bad contract.

## Error codes

| field      | code                                          | message                                                  |
| ---------- | --------------------------------------------- | -------------------------------------------------------- |
| `__root__` | `market_data_option_snapshot_unhandled_error` | (envelope default — thrown message from `handleIpcCall`) |

No story-specific validation errors.

## Observability added by this story

| Level  | Event                                      | Fields                                              | When                                                                                                         |
| ------ | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `warn` | `alpaca_option_snapshot_non_finite_figure` | `contract`, `fields` (e.g. `['impliedVolatility']`) | Alpaca sent a figure as a number that is `NaN` or `Infinity`; the figure is dropped from the mapped snapshot |

Emitted from `AlpacaMarketDataProvider.getOptionSnapshot`
(`src/main/integrations/alpaca-market-data.ts:162`), using the pure `nonFiniteFigures(snap)`
helper. Deliberately **not** emitted from `getOptionChainSnapshot` — 161 contracts per
underlying would make it noise.

## Source

- Handler: `src/main/ipc/market-data.ts:71`
- Provider: `src/main/integrations/alpaca-market-data.ts:162`
- Mapper: `src/main/integrations/alpaca-market-data-mappers.ts:118`
