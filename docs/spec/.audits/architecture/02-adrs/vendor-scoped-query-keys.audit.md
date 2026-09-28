---
page: docs/spec/architecture/02-adrs/vendor-scoped-query-keys.md
audited_at: 2026-09-28
findings: 4
---

# Audit: vendor-scoped-query-keys.md

## Verified (4)

- ✓ Broker-owned reads use `['broker', ...]` — `src/renderer/src/hooks/brokerQueryKeys.ts:1-6` (`all`, `account`, `activities`).
- ✓ Market-data reads use `['market', ...]`, including `['market', 'stock-quotes', …]` and `['market', 'option-snapshots', …]` — `src/renderer/src/hooks/marketDataQueryKeys.ts:1-10`.
- ✓ Settings mutations also refresh `settingsQueryKeys.status` — `src/renderer/src/hooks/useSettings.ts:47`; key defined in `settingsQueryKeys.ts`.
- ✓ Links `../../.extracts/us-37.md` and `../../features/us-37-paper-live-broker-environment-toggle.md` exist.

## Drift (3)

- ✗ Page says broker settings mutations invalidate by `query.queryKey[0] === 'broker'` via `hasBrokerQueryKey` (lines 7, 24). The predicate is now `hasVendorQueryKey`, matching `'broker'` **or** `'market'` — `useSettings.ts:34-36,46`, with a comment that a credential change invalidates quotes too. Suggested fix: update the predicate name and scope.
- ✗ Page says switching environments must refresh broker surfaces "without blowing away stock quote or option snapshot caches" and that "market-data fetches keep running during broker switches" (lines 12, 25). Since US-99 the same Alpaca keys serve market data, and `useSettings.ts:32-36,46` deliberately invalidates every `['market', …]` query on a credential change. Suggested fix: record this as superseded by US-99 (see `alpaca-sole-market-data-vendor`).
- ✗ Page says `brokerQueryKeys` owns "broker market-status keys" (line 22). `brokerQueryKeys.ts` has no market-status key; `useMarketStatus` uses `marketDataQueryKeys.marketStatus` = `['market', 'status']` (`useMarketStatus.ts:11`, `marketDataQueryKeys.ts:2`), consistent with US-116 moving the session to the market-data port. Suggested fix: update and mark the US-37 placement as history.

## Unverifiable (1)

- ? "positions/journal data should not be invalidated unless a story explicitly requires it" — no positions invalidation in `useBrokerSettingsMutation` (`useSettings.ts:38-50`), but the broader policy is not mechanically checkable.

## Missing files (0)

None.
