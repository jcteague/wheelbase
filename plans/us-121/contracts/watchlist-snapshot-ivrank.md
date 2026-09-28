# Contract: `IpcIvRank` and `IpcIvRankAbsence` on `watchlist:snapshot` and `screener:results` (amended)

## Purpose

The IV-rank reading every bench card, bench detail and ranked candidate carries, and — when there
is no reading — the reason it is absent. Both channels keep their envelopes and every other field;
the `ivRank` object changes shape and an `ivRankAbsence` sibling is added.

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

// Mirrors IvRankAbsence in src/main/services/ivr-snapshots.ts. Display-only: the verdict and the
// screener floor never read it.
type IpcIvRankAbsence =
  | { reason: 'pending' }              // a run for this ticker is in flight (backfill or catch-up)
  | { reason: 'no_market_data' }       // the last run had no Alpaca market-data credentials
  | { reason: 'failed' }               // the last run for this ticker failed
  | { reason: 'insufficient_history'; coverage: number; window: number; required: number } // e.g. 150 / 252 / 200
  | { reason: 'not_collected' }        // no rows and no run known to this process (also a fresh relaunch)

// watchlist:snapshot row (unchanged otherwise) — exactly one of ivRank / ivRankAbsence is non-null
{ entry, quote, ivRank: IpcIvRank | null, ivRankAbsence: IpcIvRankAbsence | null, earnings, verdict }
// screener:results ranked candidate (unchanged otherwise)
{ …, ivRank: IpcIvRank | null, ivRankAbsence: IpcIvRankAbsence | null, … }
```

Precedence when no reading is published: `pending` > `no_market_data` > `failed` >
`insufficient_history` > `not_collected`. A published reading always wins over a run status.
`pending`, `no_market_data` and `failed` are process state — cleared when a run for the ticker
succeeds, gone on relaunch.

`ivRank: null` now means: no `iv30_reading` for the ticker, fewer than 200 of the 252 window
sessions have a reading, or the anchor could not be placed on the calendar (`unreadable`, logged) —
and `ivRankAbsence` says which (an `unreadable` anchor reports `not_collected`). `ivr_snapshot` no
longer exists, so there is no legacy source to fall back to.

Verdict semantics (`verdict.iv`): `value: null` → `unknown` with label `IV unavailable`, exactly
as a missing reading; the `stale` / `predates_earnings` labels are unchanged.

## Error codes

| field      | code             | message                                                           |
| ---------- | ---------------- | ----------------------------------------------------------------- |
| `__root__` | `internal_error` | unchanged — every expected failure is modelled inside the payload |

## Renderer mirror

`ScreenerIvRank` in `src/renderer/src/api/screener.ts` gains the same three fields and the
nullable `value`; `ScreenerIvRankAbsence` mirrors `IpcIvRankAbsence`, and `WatchlistSnapshotRow`
(`api/watchlist.ts`) / `ScreenerCandidate` (`api/screener.ts`) gain `ivRankAbsence`. `IvrCell`
renders `n/a` for a null value **with** the tooltip (unlike a `null` reading, which has none);
`ivrTooltipCopy` appends `52-wk IV 0.1800–0.4500 · IV percentile 71` to every tier's body.

`IvrCell({ ivRank, absence })` renders a `null` reading by its absence:

| reason                 | rendering                                                                 | `title`                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pending`              | `…` in `text-wb-text-muted animate-wb-pulse`, `data-ivr-state="pending"`  | `Computing IV history`                                           |
| `insufficient_history` | `n/a`, `data-ivr-state="empty"`, `data-ivr-reason="insufficient_history"` | `IV history covers 150 of the last 252 sessions; rank needs 200` |
| `no_market_data`       | `n/a`, `data-ivr-state="empty"`, `data-ivr-reason="no_market_data"`       | `IV rank needs Alpaca market-data credentials`                   |
| `failed`               | `n/a`, `data-ivr-state="empty"`, `data-ivr-reason="failed"`               | `Last IV history run failed`                                     |
| `not_collected`        | `n/a`, `data-ivr-state="empty"`, `data-ivr-reason="not_collected"`        | `No IV rank collected` (unchanged)                               |

`ReadingNote` (bench detail) renders one note per reason with `data-kind` = the reason: `pending`
and `insufficient_history` and `not_collected` as `info`, `failed` and `no_market_data` as
`warning`; each names the ticker, the reason and that the IV condition cannot be judged until it
clears. The `insufficient_history` note quotes `coverage`, `window` and `required`.

## Source

- Service: `src/main/services/ivr-snapshots.ts` (`readIvRankLookup` → `readIvMetricsByUnderlying`, `absenceFor`), `src/main/services/iv-run-state.ts`, `src/main/services/watchlist-snapshot.ts`, `src/main/services/screener.ts`
- Core: `src/main/core/ivr-freshness.ts`, `src/main/core/iv-metrics.ts`
- Types: `src/preload/index.d.ts`, `src/renderer/src/api/screener.ts`, `src/renderer/src/api/watchlist.ts`
