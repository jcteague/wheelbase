# ADR: Only usable IV-rank readings reach the screening engine

<!-- generated:from us-98 -->

## Decision

`screenWatchlistCandidates` builds the engine's `ivRanks` map from **usable readings
only** (`usableIvRanks`), so `screenTicker` sees nothing at all for a stale, earnings-
invalid, expired or unassessable reading. After `rankCandidates`, the full assessed
reading is overlaid back onto each surviving row as `RankedCandidate.ivRank`.

`FILTERS`, the `iv_rank_floor` predicate, the yield/score formula, rank ordering,
promotion data and exclusion reasons are all unchanged.

## Context / Why

- A stale value must be **visible but inert**. It cannot satisfy a positive gate, and it
  must not trigger a negative one either: applying `iv_rank_floor` to a number the app has
  just declared untrustworthy would exclude a candidate on evidence it does not have.
- Absent-and-stale therefore behave identically to the engine, which is what makes AC10–
  AC12 hold: rank order and `yieldPerDelta` are the same for a chain whether its IVR is
  usable, stale, expired or missing.
- Keeping the usable/display split in the service means the pure engine never learns about
  display tiers, and the renderer never learns about ageing.

## Consequences

- `ScreenerResults.ranked` is `RankedCandidate[]` — `Omit<ScoredCandidate, 'ivRank'>` with
  an `AssessedIvRank | null`. The IPC mirror widens to match.
- The service comment that once claimed "IVR is never a hard filter" now reads as
  usable-only semantics; the floor is still a hard filter, just not over unusable data.
- Both the snapshot read and the earnings read degrade internally to "unknown for
  everyone" rather than sinking the run, so there is deliberately no second `try/catch` in
  the screener's assessment path — one there could only be reached by a mock, and would
  hide a real defect.

## Alternatives considered

- **Pass the raw reading through and let the engine decide** — duplicates the tier rules
  inside the pure engine and re-introduces the stale-value-as-filter hazard.
- **Drop unusable readings entirely** — the trader loses the signal that a number exists
  but is too old to trust, which is the whole point of the story.
- **Asymmetric handling of stale-high versus stale-low** — changes the story's rule and
  makes the verdict depend on the value it is judging.

## Sources

- [extract: us-98](../../.extracts/us-98.md) — ADR "Only usable readings enter the engine; assessed readings are overlaid afterwards"
- [feature: us-98-ivr-staleness-tiers](../../features/us-98-ivr-staleness-tiers.md)
- [feature: us-67-configure-screening-criteria](../../features/us-67-configure-screening-criteria.md)
<!-- /generated -->
