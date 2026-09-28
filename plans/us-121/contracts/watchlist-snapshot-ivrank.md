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

interface IpcIvRankAbsence {
  status: 'absent'
  reason: 'pending' | 'insufficient_history' | 'no_market_data' | 'failed' | 'not_collected'
  coverage?: number      // window sessions with a reading; present for insufficient_history
}

// watchlist:snapshot row (unchanged otherwise) — exactly one of the two is non-null
{ entry, quote, ivRank: IpcIvRank | null, ivRankAbsence: IpcIvRankAbsence | null, earnings, verdict }
// screener:results ranked candidate (unchanged otherwise)
{ …, ivRank: IpcIvRank | null, ivRankAbsence: IpcIvRankAbsence | null, … }
```

`ivRank: null` always comes with an `ivRankAbsence` saying why: `pending` (collection in flight in this process), `insufficient_history` (rows exist, coverage below 200 — `coverage` carries the count), `no_market_data` (last run aborted on missing credentials), `failed` (last run for this ticker failed), `not_collected` (no rows, no known status — never attempted, or a relaunch mid-backfill). An `unreadable` assessment (anchor not placeable on the calendar) reports `not_collected` and is logged. `ivr_snapshot` no longer exists, so there is no legacy source to fall back to.

Verdict semantics (`verdict.iv`): `value: null` → `unknown` with label `IV unavailable`, exactly as a missing reading; the `stale` / `predates_earnings` labels are unchanged. The absence reason never reaches the verdict engine or the screener floor.

## Error codes

| field      | code             | message                                                           |
| ---------- | ---------------- | ----------------------------------------------------------------- |
| `__root__` | `internal_error` | unchanged — every expected failure is modelled inside the payload |

## Renderer mirror

`ScreenerIvRank` in `src/renderer/src/api/screener.ts` gains the same three fields and the
nullable `value`. `IvrCell` renders `n/a` for a null value **with** the tooltip (unlike a `null`
reading, which has none); `ivrTooltipCopy` appends
`52-wk IV 0.1800–0.4500 · IV percentile 71` to every tier's body. `IvrCell` takes `absence` too: `pending` renders a muted pulsing `…` titled `Computing IV history`; the other reasons render `n/a` with `data-ivr-reason` and a reason-specific title.

## Source

- Service: `src/main/services/ivr-snapshots.ts` (`getAssessedIvrByUnderlying` → `readIvMetricsByUnderlying`), `src/main/services/watchlist-snapshot.ts`, `src/main/services/screener.ts`
- Core: `src/main/core/ivr-freshness.ts`, `src/main/core/iv-metrics.ts`
- Types: `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts`
