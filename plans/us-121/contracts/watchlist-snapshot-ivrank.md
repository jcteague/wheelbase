# Contract: `IpcIvRank` on `watchlist:snapshot` and `screener:results` (amended)

## Purpose

The IV-rank reading every bench card, bench detail and ranked candidate carries. Both channels
keep their envelopes and every other field; only the `ivRank` object changes shape.

## Request

```typescript
// Unchanged — neither channel takes a payload.
```

## Response (success)

```typescript
// src/preload/index.d.ts — mirrors AssessedIvRank in src/main/core/ivr-freshness.ts
interface IpcIvRank {
  value: string | null   // integer IV rank as a string ('25'); null when the 252-session window is flat (high === low)
  percentile: string     // integer IV percentile as a string ('71')
  low: string            // 52-week (252-session) IV30 low, 4 dp ('0.1800')
  high: string           // 52-week IV30 high, 4 dp ('0.4500')
  observedAt: string     // ISO instant of the anchor session's close
  ageTradingDays: number
  state: 'fresh' | 'aging' | 'stale' | 'expired' | 'predates_earnings'
}

// watchlist:snapshot row (unchanged otherwise)
{ entry, quote, ivRank: IpcIvRank | null, earnings, verdict }
// screener:results ranked candidate (unchanged otherwise)
{ …, ivRank: IpcIvRank | null, … }
```

`ivRank: null` now means: no `iv30_reading` for the ticker, fewer than 200 of the 252 window
sessions have a reading, or the anchor could not be placed on the calendar (`unreadable`, logged).
`ivr_snapshot` no longer exists, so there is no legacy source to fall back to.

Verdict semantics (`verdict.iv`): `value: null` → `unknown` with label `IV unavailable`, exactly
as a missing reading; the `stale` / `predates_earnings` labels are unchanged.

## Error codes

| field      | code             | message                                                           |
| ---------- | ---------------- | ----------------------------------------------------------------- |
| `__root__` | `internal_error` | unchanged — every expected failure is modelled inside the payload |

## Renderer mirror

`ScreenerIvRank` in `src/renderer/src/api/screener.ts` gains the same three fields and the
nullable `value`. `IvrCell` renders `n/a` for a null value **with** the tooltip (unlike a `null`
reading, which has none); `ivrTooltipCopy` appends
`52-wk IV 0.1800–0.4500 · IV percentile 71` to every tier's body.

## Source

- Service: `src/main/services/ivr-snapshots.ts` (`getAssessedIvrByUnderlying` → `readIvMetricsByUnderlying`), `src/main/services/watchlist-snapshot.ts`, `src/main/services/screener.ts`
- Core: `src/main/core/ivr-freshness.ts`, `src/main/core/iv-metrics.ts`
- Types: `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts`
