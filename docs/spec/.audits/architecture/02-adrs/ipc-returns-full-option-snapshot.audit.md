---
page: docs/spec/architecture/02-adrs/ipc-returns-full-option-snapshot.md
audited_at: 2026-06-27
findings: 0
---

# Audit: ipc-returns-full-option-snapshot.md

## Verified (4)

- ✓ `market-data:option-snapshots` handler exists (`src/main/ipc/market-data.ts:52`) and returns `fetchOptionSnapshots(...)` 1:1 without field stripping.
- ✓ `IpcOptionSnapshot` includes the full shape — `greeks`, `lastTrade`, `openInterest`, `volume` (plus `bid/ask/mid/timestamp`) — in `src/preload/index.d.ts:242-257`.
- ✓ `IpcStockQuote` (`src/preload/index.d.ts:210-217`) has NO `change`/`changePercent` fields, confirming the contrast claim that stock quotes drop those hardcoded-to-0 fields.
- ✓ Provider `OptionSnapshot` type (`src/main/integrations/market-data-provider.ts:36-50`) carries the same data forwarded to the renderer.

## Drift (0)

(none material — note: the IPC greeks key is `iv` while the provider type exposes `impliedVolatility` as a sibling and `greeks` without `iv`; the IPC layer reshapes them into one `greeks` object. This is a flattening detail, not a contradiction of the ADR's "full shape forwarded, not stripped" claim.)

## Unverifiable (0)

## Missing files (0)

- ✓ `../../features/us-33-option-mid-pnl.md` exists.

One-line: Audited ipc-returns-full-option-snapshot.md: 4 verified, 0 drift, 0 unverifiable, 0 missing.
