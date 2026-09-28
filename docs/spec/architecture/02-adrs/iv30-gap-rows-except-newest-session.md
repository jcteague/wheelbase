# ADR: A session that cannot produce a reading is recorded as a gap — except the newest one

<!-- generated:from us-121 -->

## Decision

`iv30_gap (underlying, session, method, reason, attempted_at)` records every session the engine
attempted and could not read, with `reason` one of `no_underlying_bar` or `no_tradeable_pair`.

A gap is a **result, not a reading**:

- it never contributes a value;
- it counts against the 200-of-252 coverage gate;
- it stops the next run re-probing that session (missing = required − readings − gaps).

The **most recent completed session is never written as a gap.** A bar that has not arrived yet
is retried by the next run rather than recorded as permanently missing. A gap row is deleted in
the same transaction if a later write produces a reading for that session.

A ticker whose rows are all gaps reads `insufficient_history` with coverage 0, not
`not_collected` — the app did try.

## Why

- "Missing sessions" must be computable without refetching. Without gap rows every nightly run on
  a thin name would re-probe every historical gap (ETSY: 16 sessions ≈ 7 wasted requests a night).
- The newest-session exception exists because the day's bar can lag; a wrongly recorded gap would
  suppress that session forever.

## Alternatives considered

- **A nullable `iv30` on `iv30_reading`** — violates "no reading is stored for that day" and
  complicates every coverage query.
- **No gap table, unbounded re-probing** — wasteful, and an install offline for weeks would grow its
  nightly catch-up without bound.
- **Retrying gaps on a schedule** — Alpaca does not revise daily bars, so there is nothing to wait for.

## Known limit

`no_underlying_bar` gaps are never re-probed, so a transient empty stock-bar response gaps that
session permanently (review advisory, not applied).

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "A session that cannot produce a reading is recorded as a gap…"
- `plans/us-121/research.md`, `plans/us-121/refactor-phase-results.md` (code review B3)
- `src/main/services/iv-history.ts`, `src/main/services/iv-history-store.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
