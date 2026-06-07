# ADR: Vendor-scoped query keys

<!-- generated:from us-37 -->

## Decision

Renderer query keys are split by vendor boundary. Broker-owned reads use `['broker', ...]`, market-data reads use `['market', ...]`, and broker settings mutations invalidate broker queries by checking `query.queryKey[0] === 'broker'` while separately refreshing `settingsQueryKeys.status`.

## Context / Why

- Before US-37, market-status lived awkwardly beside market-data keys even though it is part of the broker environment story.
- Scoped invalidation is required so switching from paper to live refreshes broker account/activity/status surfaces without blowing away stock quote or option snapshot caches.
- The settings UI needs a fast status refresh after save/remove/switch actions, but positions/journal data should not be invalidated unless a story explicitly requires it.

## Alternatives considered

- **Invalidate everything after every settings mutation** — rejected because the story explicitly preserves uninterrupted market-data polling and streaming.
- **Keep mixed key prefixes (`broker`, `market-data`)** — rejected because it makes vendor-scoped invalidation and reasoning harder.

## Consequences

- `brokerQueryKeys` now owns broker account, broker activities, and broker market-status keys.
- `marketDataQueryKeys` now uses `['market', 'stock-quotes', ...]` and `['market', 'option-snapshots', ...]`.
- `useSettings` mutations call `invalidateQueries({ predicate: hasBrokerQueryKey })` plus `invalidateQueries({ queryKey: settingsQueryKeys.status })`.
- Market-data fetches keep running during broker switches, matching the story's UX contract.

## Sources

- [extract: us-37](../../.extracts/us-37.md)
- [feature: us-37-paper-live-broker-environment-toggle](../../features/us-37-paper-live-broker-environment-toggle.md)
<!-- /generated -->
