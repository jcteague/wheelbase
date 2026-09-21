# Contract: `ivr:collect-now` (amended)

## Purpose

Manually run the `ivr-collect` job — now the IV30 backfill/catch-up over every collection target
(open positions ∪ watchlist) — and return its batch summary. Channel name, job name and the Settings "Refresh IVR now" wiring are unchanged from US-44/US-100. The closed-day guard is **removed**: a run on a weekend or holiday finds no missing sessions and reports every ticker as up to date without a bar request, so neither the scheduled nor the explicit path is ever refused by the calendar.

## Request

```typescript
// No payload.
```

## Response (success)

```typescript
// src/main/schemas.ts
export const CollectIvrNowBatchSchema = z.object({
  successCount: z.number().int().min(0), // tickers that persisted ≥1 reading or gap this run
  errorCount: z.number().int().min(0), // tickers whose bar fetch or engine run failed (isolated)
  skippedCount: z.number().int().min(0), // tickers already up to date (nothing missing)
  skippedReason: z.enum(['market_data_unavailable']).nullable()
})
// { ok: true, batch: CollectIvrNowBatch }
```

`skippedReason`:

| value                       | when                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`'market_closed'`~~       | **removed** — superseded by the missing-sessions logic; `ivr-non-trading-day-guard-in-collector` ADR is superseded                                                         |
| `'market_data_unavailable'` | the first ticker's bar request raised `MarketDataError('auth_failed')` — no Alpaca credentials. Counts are all zero, one INFO line `ivr_collection_skipped_no_market_data` |
| `null`                      | the run executed                                                                                                                                                           |

## Error codes

| field      | code             | message                                                                                                         |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `__root__` | `internal_error` | `IVR collection failed before producing a batch summary` (handler threw and the scheduler resolved `undefined`) |

Only the standard envelope errors apply; per-ticker failures are counts, never envelope errors.

## Renderer

`CollectIvrNowResult.skippedReason` in `src/renderer/src/api/ivr.ts` widens to the same union.
`SettingsPage` shows `IV history refresh complete: N tickers updated, M errors.` on `null`, and
`IV rank needs Alpaca market-data credentials — add them above to start collecting.` on
`'market_data_unavailable'`.

## Source

- Handler: `src/main/ipc/ivr.ts` (unchanged)
- Service: `src/main/services/ivr-collector.ts` (`collectIVRSnapshots`) → `src/main/services/iv-history.ts` (`collectIvHistory`)
- Schema: `src/main/schemas.ts` (`CollectIvrNowBatchSchema`), `src/preload/index.d.ts` (`IpcCollectIvrNowBatch`)
