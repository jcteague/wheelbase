# Contract: screener:results

## Purpose

Screens every watchlist ticker's pulled put chain against the screening criteria and
returns the ranked survivors (one strike per ticker) plus every non-ranking ticker with
its exclusion reason.

## Request

No payload. The handler takes no arguments and therefore has no Zod request schema —
`ipcMain.handle('screener:results', () => ...)`. Criteria come from
`DEFAULT_SCREENING_CRITERIA` until US-67 persists overrides (the service already accepts
a `criteria` option for that seam).

```typescript
// invoke('screener:results')  — no payload
```

## Response (success)

```typescript
{
  ok: true
  status: 'ok' | 'provider_unavailable'
  ranked: ScoredCandidate[]        // rank order (yieldPerDelta desc); [] = nothing survived
  excluded: ScreenerExclusion[]    // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null    // newest ranked strike's ISO quote time; null when ranked is empty
}

type ScoredCandidate = {
  ticker: string
  contractId: string
  strike: string           // 4dp
  expiration: string       // 'YYYY-MM-DD'
  dte: number
  bid: string              // 2dp
  ask: string              // 2dp
  mark: string             // 2dp
  spreadAbsolute: string   // 2dp
  spreadPercent: string    // 2dp
  delta: string            // 4dp, absolute
  openInterest: number | null
  volume: number | null
  ivRank: IvRank | null    // { value, observedAt }; null → US-66 renders "n/a"
  capitalSecured: string   // 2dp
  periodYield: string      // 4dp fraction
  annualizedYield: string  // 4dp fraction
  yieldPerDelta: string    // 4dp — the rank score
  timestamp: string        // ISO
}

type ScreenerExclusion = {
  ticker: string
  code:
    | 'price_ceiling'
    | 'earnings_in_window'
    | 'dte_window'
    | 'delta_unavailable'
    | 'delta_band'
    | 'open_interest'
    | 'spread'
    | 'no_options_listed'
    | 'data_unavailable'
  reason: string           // e.g. 'spread 22% exceeds 10%'
}
```

`status: 'provider_unavailable'` always comes with `ranked: []`, `excluded: []`, and
`quoteTimestamp: null` — the market-data-unavailable state US-66 renders distinctly from
an empty-but-successful screen (`status: 'ok'`, `ranked: []`).

## Error codes

| field      | code             | message                        |
| ---------- | ---------------- | ------------------------------ |
| `__root__` | `internal_error` | `An unexpected error occurred` |

Only the standard envelope error applies. There is no request payload to validate, and
every expected failure mode is modelled **inside** the success payload rather than
thrown: a provider outage becomes `status: 'provider_unavailable'`, per-ticker provider
failures become `data_unavailable` exclusions, and an IVR or quote-fetch failure degrades
to missing soft data. `handleIpcCall` catches anything genuinely unexpected (e.g. a
SQLite failure) into the row above.

## Source

- Handler: `src/main/ipc/screener.ts` (`registerScreenerIpc({ db, getProvider })`)
- Service: `src/main/services/screener.ts` (`screenWatchlistCandidates`)
- Engine: `src/main/core/screener.ts` (`screenTicker`, `rankCandidates`)
- Preload: `src/preload/index.ts` — `screener: { results: () => invoke('screener:results') }`
  </content>
