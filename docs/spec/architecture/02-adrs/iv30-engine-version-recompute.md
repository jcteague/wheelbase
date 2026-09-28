# ADR: IV30 recompute is driven by `engine_version` and never refetches

<!-- generated:from us-121 -->

## Decision

`IV30_ENGINE_VERSION` (an integer in `src/main/core/iv30.ts`) is stamped on every
`iv30_reading` row. `recomputeIvHistory` re-runs `iv30FromInputs` — the same arithmetic path as
`computeIv30` — over every row whose `engine_version` is behind the current one (or every row when
`force` is set), rewriting `iv30` and the version in one transaction. It takes no provider
argument, so it cannot make a market-data request.

`collectIvHistory` calls it for the ticker **before** computing missing sessions, so an engine fix
ships as an ordinary release and every install corrects itself on its next run. A row whose stored
inputs no longer invert (or whose far-expiration set is half-written) is counted
`unrecomputable`, left unchanged, and logged at WARN.

The guarantee covers what the stored inputs can reproduce. A defect in strike or expiration
**selection** may need a candidate the engine discarded; that correction is a refetch, and the
story says so.

## Why

A corrected engine must correct every derived metric. Metrics are derived on read
([iv30-series-with-inputs-metrics-on-read](./iv30-series-with-inputs-metrics-on-read.md)), so the
only stored thing to correct is `iv30` itself. Version stamping makes the upgrade automatic and
idempotent; the e2e scenario drives the same function through `_test:iv-history-recompute`.

## Alternatives considered

- **A Settings button** — UI for a maintenance event nobody schedules.
- **Recompute on app start** — the daily run already owns the write path and its failure isolation.

## Known limit

Unrecomputable rows are re-selected, and re-warned, on every collect (review advisory, not applied).

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "Recompute is driven by `engine_version`…"
- `src/main/core/iv30.ts`, `src/main/services/iv-history.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
