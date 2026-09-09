# Contract: screener:results amended by US-98

## Request

No payload and no new request Zod schema. Keep the handler inside handleIpcCall with a single service call. Optional clock is a composition dependency, never renderer input:

```ts
handleIpcCall('screener_results_error', () =>
  screenWatchlistCandidates(getProvider, db, { currentDate: clock.now() })
)
```

Production clock defaults to new Date(). Test-only shared clock is injected from main composition.

## Success

```ts
type IpcIvRank = {
  value: string
  observedAt: string
  ageTradingDays: number
  state: 'fresh' | 'aging' | 'stale' | 'predates_earnings'
  usable: boolean
}
// { ok: true, status: 'ok' | 'provider_unavailable',
//   ranked: IpcScoredCandidate[], excluded: IpcScreenerExclusion[],
//   quoteTimestamp: string | null }
```

Only ranked[].ivRank widens to the shape above or null. It is null for absent/time-expired/unassessable readings. Earnings invalidation precedes time expiry and retains its explanatory assessed reading. All other candidate fields and result fields remain unchanged. Mirror this type in preload index.d.ts and renderer api/screener.ts.

Invariants: usable iff fresh/aging; age nonnegative integer; invalid input never reports Fresh. Muted display data never reaches the engine as an IV filter input. Ranked order and yieldPerDelta remain engine-owned. Fresh/Aging floor behavior and reason date stamp remain unchanged.

## Failure

Provider outage stays the existing success payload with status provider_unavailable. Per-ticker IVR failure degrades that reading to null; earnings failure falls back to time tiers. Standard unexpected-error envelope remains:
`{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }`.

## Watchlist consumer

US-96's snapshot response must mirror the same assessed IVR, rather than accepting renderer-computed age. See watchlist-ivr.md for the prerequisite integration contract. Do not add a separate IVR request per row.
