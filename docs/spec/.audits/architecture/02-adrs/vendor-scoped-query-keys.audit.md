---
page: docs/spec/architecture/02-adrs/vendor-scoped-query-keys.md
audited_at: 2026-06-27
findings: 0
---

# Audit: vendor-scoped-query-keys.md

## Verified (6)

- ✓ Broker-owned reads use `['broker', ...]` — `src/renderer/src/hooks/brokerQueryKeys.ts`: `all=['broker']`, `account=['broker','account']`, `marketStatus=['broker','market-status']`, `activities(...)=['broker','activities',type,since]`. Matches "brokerQueryKeys now owns broker account, broker activities, and broker market-status keys."
- ✓ Market-data reads use `['market', ...]` — `src/renderer/src/hooks/marketDataQueryKeys.ts:3,5`: `['market','stock-quotes',...]` and `['market','option-snapshots',...]`. Matches the Consequences exactly.
- ✓ Invalidation by `query.queryKey[0] === 'broker'` — `src/renderer/src/hooks/useSettings.ts:28-29` (`hasBrokerQueryKey` predicate).
- ✓ `useSettings` mutations call `invalidateQueries({ predicate: hasBrokerQueryKey })` plus `invalidateQueries({ queryKey: settingsQueryKeys.status })` — `useSettings.ts:40-41`.
- ✓ `settingsQueryKeys.status` exists — `src/renderer/src/hooks/settingsQueryKeys.ts` and referenced at `useSettings.ts:48`.
- ✓ Vendor split is clean (no `'market-data'` prefix remains) — grep confirms `'market'` prefix only.

## Drift (0)

None.

## Unverifiable (2)

- ? "Market-data fetches keep running during broker switches" — runtime/UX behavior; the predicate-scoped invalidation supports the claim but the live behavior is not mechanically verified.
- ? "Before US-37, market-status lived awkwardly beside market-data keys" — historical narrative; flag for human review.

## Missing files (0)

None within src/ scope.
