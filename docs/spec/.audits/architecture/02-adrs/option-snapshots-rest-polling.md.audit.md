---
page: docs/spec/architecture/02-adrs/option-snapshots-rest-polling.md
audited_at: 2026-06-29
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/option-snapshots-rest-polling.md

## Verified (12)

- ✓ `useOptionSnapshots(legs, { session })` exists with the documented signature in `src/renderer/src/hooks/useOptionSnapshots.ts:53-56`.
- ✓ `refetchInterval: session === 'closed' ? false : 60_000` matches `src/renderer/src/hooks/useOptionSnapshots.ts:64` (`POLL_INTERVAL_MS = 60_000` at line 22).
- ✓ `staleTime: 30_000` matches `src/renderer/src/hooks/useOptionSnapshots.ts:65` (`STALE_TIME_MS = 30_000` at line 23).
- ✓ `refetchOnWindowFocus: true` matches `src/renderer/src/hooks/useOptionSnapshots.ts:66`.
- ✓ `enabled: symbols.length > 0` matches `src/renderer/src/hooks/useOptionSnapshots.ts:63`.
- ✓ Provider type `MassiveMarketDataProvider` exists in `src/main/integrations/massive-market-data.ts:104`.
- ✓ Single-contract path `/v3/snapshot/options/{underlying}/{O:contract}` → `getOptionSnapshot(contractId)` matches `src/main/integrations/massive-market-data.ts:211-218` (URL built at line 215 with `withOptionPrefix`, which prepends `O:` per lines 69-71).
- ✓ Chain path `/v3/snapshot/options/{underlying}` with filters `expiration_date.gte/lte`, `contract_type`, `strike_price.gte/lte`, `limit`, `cursor` → `getOptionChainSnapshot(filter)` matches `src/main/integrations/massive-market-data.ts:220-250` (params set at lines 223-229; base URL at line 232).
- ✓ `next_url` pagination "when no `limit`" matches `src/main/integrations/massive-market-data.ts:238-247`: returns early when `filter.limit !== undefined`, otherwise loops following `firstPage.next_url` / `page.next_url`.
- ✓ IPC channel `market-data:option-snapshots` (bulk) registered in `src/main/ipc/market-data.ts:52`.
- ✓ IPC channel `market-data:option-snapshot` (single) registered in `src/main/ipc/market-data.ts:59`.
- ✓ IPC channel `market-data:option-chain` registered in `src/main/ipc/market-data.ts:67`.

## Drift (0)

None.

## Unverifiable (2)

- ? "there is no streaming bridge for options" — narrative claim. Supporting evidence: `stream()` at `src/main/integrations/massive-market-data.ts:256-263` only relays the `tickSubject` (stock `AM` frames), and the WS subscribes to `AM.*` only (`src/main/integrations/massive-market-data.ts:286`). Consistent with the claim but not a single mechanical check.
- ? "Massive's option-snapshot REST reads return Greeks and IV" — the `SnapResult` type and `mapSnapResult` handle `greeks` and `implied_volatility` (`src/main/integrations/massive-market-data.ts:39-44, 90-100`), but actual API return content is external behavior, not verifiable from source.

## Missing files (0)

- ✓ `./option-data-availability.md` exists.
- ✓ `../../features/us-33-option-mid-pnl.md` exists.
- ✓ `../../features/market-data-massive-migration.md` exists.

## Notes

- The `market-data:option-chain` handler returns `{ snapshots, nextCursor: null }` (`src/main/ipc/market-data.ts:71`). The ADR does not document the IPC return shape, so this is not drift — but the page's description of `limit`/`cursor` cursor pagination is fully internal to `getOptionChainSnapshot`; the handler always exposes `nextCursor: null` upward. Not a contradiction with any claim on the page.
