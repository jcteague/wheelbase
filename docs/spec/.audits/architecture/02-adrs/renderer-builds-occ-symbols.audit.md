---
page: docs/spec/architecture/02-adrs/renderer-builds-occ-symbols.md
audited_at: 2026-09-28
findings: 2
---

# Audit: renderer-builds-occ-symbols.md

## Verified (8)

- ✓ `useOptionSnapshots(legs: ActiveLegSummary[], …)` builds symbols with `buildOccSymbol` and calls `getOptionSnapshots(symbols)` — `src/renderer/src/hooks/useOptionSnapshots.ts:3-9, 25-43, 53-62`.
- ✓ Per-leg `try/catch` skips invalid legs — `useOptionSnapshots.ts:29-40`.
- ✓ Transport is `market-data:option-snapshots` — `src/main/ipc/market-data.ts:65`; no server-side symbol-building IPC channel exists in `src/main/ipc/`.
- ✓ Single builder in `src/shared/option-symbol.ts`; `src/main/core/option-symbol.ts` re-exports it — `core/option-symbol.ts:1-6`.
- ✓ Format and example `AAPL260516P00180000` — `src/shared/option-symbol.ts:4-5, 26-27`.
- ✓ Validates ticker, `YYYY-MM-DD` expiration, `strike > 0`, throwing `Error` — `src/shared/option-symbol.ts:31-50` (`Invalid ticker`, `Invalid expiration`, `Invalid strike`).
- ✓ `instrumentType: 'PUT' | 'CALL' | 'STOCK'`, with `'STOCK'` rejected at runtime via `Invalid instrumentType` — `src/shared/option-symbol.ts:17, ~62`.
- ✓ Only `decimal.js` imported — `src/shared/option-symbol.ts:7`.

## Drift (0)

None.

## Unverifiable (1)

- ? "Moving construction server-side would add an IPC round-trip with no benefit" — rationale.

## Missing files (2)

- ✗ Source `plans/us-33/research.md` — `plans/us-33/` no longer exists.
- ✗ Source `plans/us-33/plan.md` — same. (`plans/market-data-massive-migration/research.md` exists.)
