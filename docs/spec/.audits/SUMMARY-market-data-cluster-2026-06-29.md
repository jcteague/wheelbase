# Spec Audit Summary — Market-Data Cluster — 2026-06-29

Scope: the 23-page **market-data / Massive-migration cluster** (refreshed earlier
today via `/update-spec market-data-massive-migration`). This is a scoped audit —
the full-spec record remains in [SUMMARY.md](./SUMMARY.md) (2026-06-27). The 23
per-page audit files under `.audits/` have been refreshed to today.

Totals: **23 pages audited · 12 clean · 11 with drift · 25 drift findings.**

## Drift detected (11 pages)

- [contracts/alpaca-integration.md](../contracts/alpaca-integration.md) — **6** findings
  - Repeatedly names a `createBrokerProvider` factory **function** that doesn't exist; the real surface is the `brokerFactory` object with `create()` / `recreate()`.
  - Factory **throws** `BrokerError('auth_failed')` rather than returning `null`.
  - Plus 4 lesser contract-precision drifts; 3 unverifiable.
- [features/us-39-massive-market-data-provider.md](../features/us-39-massive-market-data-provider.md) — **5** findings
  - Attributes `MarketDataError` / `BrokerError` to `integration-errors.ts`; they live in `market-data-provider.ts` and `broker-provider.ts`.
  - `option-chain` `strikeFrom/strikeTo` documented as `number`; code types them `string`.
  - Renderer market-data adapter doesn't wrap the new singular/chain channels.
  - `OptionSnapshot` open-interest/volume are always `null` from Massive.
  - `connect(feeds?)` documented with a `feeds` arg the Massive impl ignores.
- [features/market-data-massive-migration.md](../features/market-data-massive-migration.md) — **2** findings
  - `MarketDataError` / `MarketDataErrorCode` / `MarketDataFeed` attributed to `integration-errors.ts`; actually in `market-data-provider.ts` (`integration-errors.ts` only exports `isNetworkError`).
  - Claims `createMarketDataProvider()` removed, but stale `@deprecated` JSDoc still sits in `alpaca.ts:17,23` (code-comment, not spec).
- [features/us-32-live-position-prices.md](../features/us-32-live-position-prices.md) — **2** findings
  - Query-key prefix wrong: page says `['market-data', 'stock-quotes', …]` / `['market-data','market-status']`; code uses `['market', 'stock-quotes', …]` and market-status lives in `brokerQueryKeys.marketStatus = ['broker','market-status']`.
  - `market-data:stock-quotes` result is wrapped `{ quotes: Record<string, IpcStockQuote> }`, not a bare record.
- [domain/market-data.md](../domain/market-data.md) — **2** findings
  - Connect-once guard described as a module-scoped `let connected`; it's actually a `state.connected` field on the handler's `StreamState`, flipped in the `subscribeToStockQuotes` service.
  - `before-quit` calls `marketDataFactory.disconnect()` (+ `e.preventDefault()`/`app.exit(0)`), not `provider.disconnect()`.
- [architecture/02-adrs/market-data-stale-detection.md](../architecture/02-adrs/market-data-stale-detection.md) — **2** findings
  - References an eslint-disable comment that no longer exists.
  - Describes a 30s periodic-tick fix as deferred tech debt; it's since implemented (`STALE_POLL_INTERVAL_MS = 30 * 1000`, `setInterval`).
- [architecture/02-adrs/market-data-tanstack-cache.md](../architecture/02-adrs/market-data-tanstack-cache.md) — **2** findings
  - Query-key prefix wrong: page says `['market-data', …]`; code uses `['market', …]`.
  - Documented `useStockQuotes` return omits the `stale: boolean` / `minutesAgo: number` fields the hook returns.
- [architecture/02-adrs/marketdataerror-structured-codes.md](../architecture/02-adrs/marketdataerror-structured-codes.md) — **1** finding (+2 dead refs)
  - `streaming_unsupported` table row is never thrown by the Massive provider (only by `fake-market-data.ts`).
- [architecture/02-adrs/market-data-provider-lifecycle.md](../architecture/02-adrs/market-data-provider-lifecycle.md) — **1** finding
  - Claims a `market-data:market-status` handler exists; it doesn't (market status is `broker:market-status`). The "three handlers" count is stale.
- [architecture/02-adrs/market-status-pill.md](../architecture/02-adrs/market-status-pill.md) — **1** finding
  - Claims the pill renders on the position **detail** header; it renders only on `PositionsListPage`.
- [architecture/02-adrs/renderer-builds-occ-symbols.md](../architecture/02-adrs/renderer-builds-occ-symbols.md) — **1** finding
  - Says the builder validates `instrumentType ∈ {PUT, CALL}`; the input type accepts `'PUT' | 'CALL' | 'STOCK'` (`STOCK` rejected at runtime). Runtime intent matches; documented domain is narrower.

## Clean (12 pages)

- [features/us-31-market-data-provider-adapter.md](../features/us-31-market-data-provider-adapter.md) (28 ✓)
- [architecture/02-adrs/market-data-provider-interface.md](../architecture/02-adrs/market-data-provider-interface.md) (19 ✓)
- [architecture/02-adrs/market-data-stream-with-rest-seed.md](../architecture/02-adrs/market-data-stream-with-rest-seed.md) (13 ✓)
- [architecture/02-adrs/market-data-push-events.md](../architecture/02-adrs/market-data-push-events.md) (13 ✓)
- [architecture/02-adrs/ws-package-streaming.md](../architecture/02-adrs/ws-package-streaming.md) (12 ✓)
- [architecture/02-adrs/option-snapshots-rest-polling.md](../architecture/02-adrs/option-snapshots-rest-polling.md) (12 ✓)
- [architecture/02-adrs/market-session-derivation.md](../architecture/02-adrs/market-session-derivation.md) (11 ✓)
- [architecture/02-adrs/option-data-availability.md](../architecture/02-adrs/option-data-availability.md) (10 ✓)
- [architecture/02-adrs/occ-symbol-pure-leaf.md](../architecture/02-adrs/occ-symbol-pure-leaf.md) (9 ✓)
- [architecture/02-adrs/ipc-returns-full-option-snapshot.md](../architecture/02-adrs/ipc-returns-full-option-snapshot.md) (8 ✓)
- [architecture/02-adrs/msgpack-option-streaming.md](../architecture/02-adrs/msgpack-option-streaming.md) (7 ✓)
- [architecture/02-adrs/alpaca-sdk-rest-only.md](../architecture/02-adrs/alpaca-sdk-rest-only.md) (12 ✓, 1 dead ref — see below)

## Dead source-citation findings (3)

The `plans/` dirs are mostly deleted (extracts are the durable source), so plan-path
citations rot. Found in:

- `marketdataerror-structured-codes.md` — 2 dead `plans/us-31/*` source references.
- `alpaca-sdk-rest-only.md` — 1 stale `plans/us-31/research.md` citation.

## Incidental code findings (not spec drift)

Surfaced by auditors; fix in code separately:

- `src/preload/index.ts:56` comment references a nonexistent env var `WHEELBASE_MARKET_MOCK`; the real flag is `FAKE_MARKET_DATA`.
- `src/main/integrations/alpaca.ts:17,23` retains a `@deprecated createMarketDataProvider()` JSDoc pointing at the removed factory name.

## Notable root cause

Two of the highest-value drifts (the `integration-errors.ts` mis-attribution on the
feature page and us-39) trace back to the **extract itself** — its Source Code
References list `integration-errors.ts` as the home of `MarketDataError`. Correct
the extract first, then a re-run propagates the fix to both pages.

## Recommended next steps

1. **Fix the extract**, then re-run `/update-spec market-data-massive-migration`: move `MarketDataError`/`MarketDataErrorCode`/`MarketDataFeed` attribution from `integration-errors.ts` → `market-data-provider.ts`. This clears the recurring drift on the feature page and us-39 in one pass.
2. **Manually patch** the contract/ADR drifts that aren't extract-driven:
   - `contracts/alpaca-integration.md`: `createBrokerProvider` → `brokerFactory` object; note the `auth_failed` throw.
   - Query-key prefix `'market-data'` → `'market'` (us-32 + tanstack-cache ADR), and point market-status at `brokerQueryKeys`.
   - `market-data-provider-lifecycle.md`: drop the `market-data:market-status` handler / "three handlers" claim.
   - `market-status-pill.md`: pill is list-page only.
   - `market-data-stale-detection.md`: 30s periodic tick is shipped, not deferred.
3. **Sweep dead `plans/us-31/*` citations** out of the two ADRs (these likely recur across the spec — a full-spec audit would find more).
4. File the two incidental code-comment bugs separately from the spec work.

Per-page reports live alongside this file under `docs/spec/.audits/`.
