# ADR: Alert evaluation computes, then persists in a single transaction

<!-- generated:from us-50 -->

## Decision

`evaluateAlerts` runs in two phases. The **compute phase** (outside any transaction) loads evaluable positions, builds engine inputs, calls `evaluatePosition` per position wrapped in a per-position `try/catch` so one bad position cannot abort the run, and accumulates all matches + skips. The **persist phase** (one `db.transaction(...)`) upserts every matched alert and resolves every open alert not re-matched this run. No DB writes happen until all pure computation has succeeded.

## Why

Directly satisfies the criterion that the job must not leave partially written alert rows if one rule evaluation errors — computation errors are contained before any write, and the single transaction makes the write set atomic. Mirrors the `detect-assignments` pattern (build a map → single `db.transaction`).

## Alternatives considered

- **Per-position transactions** — rejected; a mid-run failure would leave some positions updated and others not, contradicting the atomicity criterion.

## Source

- `plans/us-50/research.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
