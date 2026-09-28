# ADR: The IV-rank window is the 252 sessions strictly before the anchor, gated at 200

<!-- generated:from us-121 -->

## Decision

- **Anchor** = the session of the ticker's latest stored reading (not today).
- **Window** = the 252 sessions immediately preceding the anchor on the cached exchange calendar.
  The anchor is ranked against the window but is not part of it.
- **Coverage gate:** metrics are published only when ≥ 200 of the 252 window sessions hold a
  reading. Otherwise rank, percentile, low and high all read `n/a`, and the absence reason is
  `insufficient_history` with `coverage`, `window: 252`, `required: 200`.

```
low        = min(window readings)          high = max(window readings)
rank       = clamp((anchor − low) / (high − low) × 100, 0, 100)     // null when high = low
percentile = count(window readings strictly below anchor) / count(window) × 100
both rounded half-up to an integer (Decimal)
```

`observedAt` on the published reading is the anchor session's close, so the US-98 freshness tiers
age a stale anchor exactly as before. A flat window publishes `value: null` with a percentile and
range; `ivGate` reads it as `unknown('IV unavailable')` and `usableIvRanks` drops it, so the
screener floor never sees a null.

## Why

- Every acceptance scenario's arithmetic excludes today from its own range: 0.2475 in 0.18–0.45 →
  25; 0.47 clamps to 100 while the high still reports 0.45.
- Rank is a min/max statistic — one missed spike day corrupts the max for a year — so coverage is
  not cosmetic. Percentile degrades gracefully, which is why both are reported.
- Anchoring on the latest reading keeps a stale series legible (and marked stale) instead of vanishing.

## Alternatives considered

- **52 calendar weeks** — sessions are the unit freshness already speaks in.
- **Including today in the window** — breaks the clamp scenario.
- **Withholding only rank on sparse coverage** — a range built on 150 sessions is precisely the
  untrustworthy number the gate exists to hide.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADRs "The rank window is the 252 completed sessions…", "`AssessedIvRank.value` becomes nullable…"
- `src/main/core/iv-metrics.ts`, `src/main/services/iv-history-read.ts`, `src/main/core/ivr-freshness.ts`
- Related: [ivr-freshness-in-completed-sessions](./ivr-freshness-in-completed-sessions.md),
  [usable-ivr-only-reaches-the-engine](./usable-ivr-only-reaches-the-engine.md)
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
