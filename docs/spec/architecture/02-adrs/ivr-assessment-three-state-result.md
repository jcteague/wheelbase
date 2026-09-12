# ADR: IV-rank assessment returns a three-state result, not `null`

<!-- generated:from us-98 -->

## Decision

`assessIvRank` returns `{ status: 'assessed'; reading } | { status: 'expired' } |
{ status: 'unreadable' }` rather than `AssessedIvRank | null`. Both non-assessed states
render identically as "no IV rank", but only `unreadable` is logged as degradation, by
`getAssessedIvrByUnderlying` at the service boundary
(`ivr_assessment_unreadable_snapshot`).

Relatedly, the wire type carries no `usable` boolean. `AssessedIvRank` is
`{ value, observedAt, ageTradingDays, state }`; usability is derived from `state` by
`isUsableState` in main and by the tone rule inside `IvrCell`.

## Context / Why

- `expired` and `unreadable` are not the same event. One is the ordinary consequence of a
  reading ageing out; the other means a corrupt persisted value, or a calendar that cannot
  reach the observation. Collapsing both to `null` is what let a corrupt row degrade the
  screen in silence, with nothing in the logs to find.
- A `usable` field alongside `state` is two sources of truth for one rule. Deriving it
  means a fixture cannot express an inconsistent pair, and the rule cannot drift between
  main and renderer.
- Core stays pure: the distinction is _returned_, and the boundary decides what to log.

## Consequences

- The IPC contract in `plans/us-98/contracts/screener-results.md` is amended — the shipped
  `IpcIvRank` has four fields, not five.
- Callers must handle three cases, but only one of them produces a reading, so the mapping
  to `AssessedIvRank | null` at the service boundary stays a one-liner.

## Alternatives considered

- **`AssessedIvRank | null`** (the plan's shape) — silent on corrupt data.
- **Throwing on unreadable input** — uses exceptions for ordinary unknown-data control
  flow, which the plan explicitly rules out.

## Sources

- [extract: us-98](../../.extracts/us-98.md) — ADRs "Assessment returns a three-state result, not `null`" and "`usable` is derived at both ends, not carried on the wire"
- [feature: us-98-ivr-staleness-tiers](../../features/us-98-ivr-staleness-tiers.md)
<!-- /generated -->
