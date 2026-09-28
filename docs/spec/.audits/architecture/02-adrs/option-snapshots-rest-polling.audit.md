---
page: docs/spec/architecture/02-adrs/option-snapshots-rest-polling.md
audited_at: 2026-09-28
findings: 5
---

# Audit: option-snapshots-rest-polling.md

## Verified (4)

- ✓ `useOptionSnapshots(legs, { session })` — `src/renderer/src/hooks/useOptionSnapshots.ts:18-20, 53-56`.
- ✓ `refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`, `enabled: symbols.length > 0` — `useOptionSnapshots.ts:22-23, 60-67`.
- ✓ No streaming bridge for options — only `stockQuotes` is streamed (`src/main/services/market-data.ts:116`).
- ✓ IPC channels `market-data:option-snapshots`, `market-data:option-snapshot`, `market-data:option-chain` — `src/main/ipc/market-data.ts:65, 72, 80`.

## Drift (3)

- ✗ Line 7: snapshots are read "against the Massive provider (`MassiveMarketDataProvider`)". The factory builds `AlpacaMarketDataProvider` (`src/main/integrations/market-data-factory.ts:17-22`); Massive was retired by US-99.
- ✗ Lines 9-12: Massive `/v3/snapshot/options/{underlying}[/{O:contract}]` paths with `next_url` pagination. Current paths are Alpaca `/v1beta1/options/snapshots/{underlying}` (chain) and `/v1beta1/options/snapshots?symbols=` (single), paginated by `page_token` — `src/main/integrations/alpaca-market-data-mappers.ts:207-218`, `alpaca-market-data.ts:326-341`.
- ✗ Line 18 / 22 rationale: "the Massive socket carries only `AM` aggregate-minute stock frames" — present tense; live socket is Alpaca IEX `bars` (`alpaca-market-data.ts:56`). The conclusion (options via REST polling) still holds.

## Unverifiable (1)

- ? 60 s cadence "matches the story" / aligns with US-32 — rationale.

## Missing files (2)

- ✗ Source `plans/us-33/research.md` — `plans/us-33/` no longer exists.
- ✗ Source `plans/us-33/plan.md` — same. (`plans/market-data-massive-migration/research.md` and both feature pages exist.)
