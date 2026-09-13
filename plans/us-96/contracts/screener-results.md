# Contract: screener:results (amendment — `expired` IV-rank state)

## Purpose

Existing handler (US-65/US-66/US-70/US-98) that screens the watchlist and returns ranked
candidates and explained exclusions. US-96 amends only the shape of `ivRank` on a ranked
candidate: an expired reading is now delivered as a reading in state `expired` instead of
being collapsed to `null`. Nothing else about the channel changes.

## Request

```typescript
// No payload (unchanged).
```

## Response (success)

```typescript
interface IpcIvRank {
  value: string // 1dp
  observedAt: string // ISO scrape time
  ageTradingDays: number
  state: 'fresh' | 'aging' | 'stale' | 'expired' | 'predates_earnings' // ← 'expired' added
}

interface IpcScoredCandidate {
  // … unchanged fields …
  ivRank: IpcIvRank | null // null → never collected or unreadable → render "n/a"
}

// { ok: true, status: 'ok' | 'provider_unavailable', ranked, excluded, quoteTimestamp } — unchanged
```

Engine behaviour is unchanged: `services/screener.ts::usableIvRanks` still passes only
`fresh`/`aging` readings to the scoring engine, so an `expired` reading neither satisfies nor
triggers the IV-rank floor (US-98 ACs "The IV-rank floor is not applied to an expired
reading" and "A stale IV rank never blocks a candidate from ranking" hold).

## Error codes

| field      | code             | message                                               |
| ---------- | ---------------- | ----------------------------------------------------- |
| `__root__` | `internal_error` | Only the standard envelope error applies (unchanged). |

## Renderer consequence

`IvrCell` renders an `expired` reading as `exp` beside a quarter-full ring, with
`data-ivr-state="expired"`. `null` keeps rendering `n/a` with `data-ivr-state="empty"` and no
ring. US-98's e2e "An expired reading is indistinguishable from no reading" is renamed to
"An expired reading shows exp and behaves as no reading" and asserts `exp` / `expired`.

## Source

- Handler: `src/main/ipc/screener.ts` (unchanged)
- Service: `src/main/services/screener.ts` (unchanged), `src/main/services/ivr-snapshots.ts` (stops mapping expired → null)
- Engine: `src/main/core/ivr-freshness.ts` (`IvRankState` gains `expired`; `assessIvRank` returns the reading)
- Types: `src/preload/index.d.ts` `IpcIvRank`, `src/renderer/src/api/screener.ts` `ScreenerIvRank`
