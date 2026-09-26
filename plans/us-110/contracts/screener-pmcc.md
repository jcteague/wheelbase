# Contracts: `screener:pmcc-results`, `screener:get-pmcc-criteria`, `screener:save-pmcc-criteria`

Three channels added to the existing `registerScreenerIpc({ db, getProvider, getCurrentDate })` in `src/main/ipc/screener.ts`. The three wheel channels are unchanged. Each handler is one `handleIpcCall` around one service call; no branching in the handler.

Preload (`src/preload/index.ts`):

```typescript
screener: {
  results: () => invoke('screener:results'),
  getCriteria: () => invoke('screener:get-criteria'),
  saveCriteria: (payload: unknown) => invoke('screener:save-criteria', payload),
  pmccResults: () => invoke('screener:pmcc-results'),
  getPmccCriteria: () => invoke('screener:get-pmcc-criteria'),
  savePmccCriteria: (payload: unknown) => invoke('screener:save-pmcc-criteria', payload)
}
```

---

## `screener:pmcc-results`

**Purpose:** screen every watchlist ticker's LEAPS-window and short-window call chains against the persisted PMCC criteria and return one ranked diagonal per surviving ticker plus every non-ranking ticker with its exclusion reason. In an `ok` screen every watchlist ticker appears in exactly one of `ranked` / `excluded`.

**Request:** none. No payload, no Zod request schema. The handler is `handleIpcCall('screener_pmcc_results_error', () => screenWatchlistPmccCandidates(getProvider, db, { currentDate: getCurrentDate() }))`. Criteria resolve inside the service from `getPmccScreeningCriteria(db)`; `opts.criteria` remains an override seam for tests.

**Response (success):**

```typescript
{
  ok: true
  status: 'ok' | 'provider_unavailable'
  ranked: IpcPmccScoredCandidate[] // rank order: earnings tier, returnPerDelta desc, ticker asc
  excluded: IpcScreenerExclusion[] // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null // newest ranked leg timestamp; null when ranked is empty
}

type IpcPmccLeg = {
  contractId: string
  strike: string // 4dp
  expiration: string // YYYY-MM-DD
  dte: number
  bid: string; ask: string; mark: string // 2dp
  spreadAbsolute: string; spreadPercent: string // 2dp
  delta: string // 4dp, absolute
  openInterest: number | null
  volume: number | null
  timestamp: string
}

type IpcPmccScoredCandidate = {
  ticker: string
  long: IpcPmccLeg
  short: IpcPmccLeg
  ivRank: IpcIvRank | null // the assessed reading, as screener:results ships it (US-98)
  netDebit: string // 2dp per share
  capitalAtRisk: string // 2dp, netDebit × 100
  strikeWidth: string // 2dp
  debitToWidthPercent: string // 2dp
  cycleYield: string // 4dp fraction
  annualizedYield: string // 4dp fraction
  returnPerDelta: string // 4dp — the rank score
  longExtrinsic: string | null // 2dp; null when no underlying price
  extrinsicCoverage: string | null // 4dp fraction; null when extrinsic is null or ≤ 0
  earnings: IpcCandidateEarnings // judged on the short leg
  timestamp: string
}
```

**`IpcScreenerExclusion.code`** widens to the PMCC codes: `iv_rank_floor`, `iv_rank_ceiling`, `earnings_in_window`, `dte_window`, `delta_unavailable`, `delta_band`, `open_interest`, `spread`, `short_strike_not_above_long`, `debit_to_width`, plus the chain-level `no_options_listed` and `data_unavailable`. `reason` is rendered verbatim by the bench; leg-level reasons are prefixed `LEAPS ` or `short call ` (see `plans/us-110/data-model.md` funnel table).

**Outage vs empty:** identical to `screener:results` — `provider_unavailable` always arrives with `ranked: []`, `excluded: []`, `quoteTimestamp: null`, and covers a mid-flight outage on either chain pull and a never-configured provider.

**Errors:** only `__root__` / `internal_error`. Every expected failure is modelled inside the payload: per-ticker chain failures → `data_unavailable` rows; a failed quote fetch → that ticker's `longExtrinsic`/`extrinsicCoverage` null; IVR/calendar/earnings read failures → unknown for everyone.

**Source:** `src/main/ipc/screener.ts`, `src/main/services/pmcc-screener.ts` (`screenWatchlistPmccCandidates`), `src/main/services/candidate-chains.ts` (`pullWatchlistChains` with `type: 'call'`), `src/main/core/pmcc-screener.ts` (`screenPmccTicker`, `rankPmccCandidates`).

---

## `screener:get-pmcc-criteria`

**Purpose:** return the persisted PMCC screening criteria, falling back to `DEFAULT_PMCC_SCREENING_CRITERIA` when nothing is saved or the stored document is unreadable, out of bounds, or inconsistent (any band inverted, or the LEAPS window not beyond the short window).

**Request:** none.

**Response (success):** `{ ok: true, criteria: IpcPmccScreeningCriteria }` — the full document in `plans/us-110/data-model.md`. Never absent, never partial.

**Errors:** only `__root__` / `internal_error`.

**Source:** `src/main/services/pmcc-screening-criteria.ts` (`getPmccScreeningCriteria`), key `pmcc_screening_criteria` in `app_settings`.

---

## `screener:save-pmcc-criteria`

**Purpose:** validate and persist a full replacement PMCC criteria document; return the stored document.

**Request:** `SavePmccScreeningCriteriaPayloadSchema` (`src/main/schemas.ts`) — the document **minus `maxSpreadAbsolute`**:

```typescript
z.object({
  longDeltaMin: z.string().refine(isDeltaInRange, DELTA_RANGE_MESSAGE),
  longDeltaMax: z.string().refine(isDeltaInRange, DELTA_RANGE_MESSAGE),
  longDteMin: z
    .number()
    .int()
    .min(DTE_MIN, DTE_MIN_MESSAGE)
    .max(LONG_DTE_MAX, LONG_DTE_MAX_MESSAGE),
  longDteMax: z
    .number()
    .int()
    .min(DTE_MIN, DTE_MIN_MESSAGE)
    .max(LONG_DTE_MAX, LONG_DTE_MAX_MESSAGE),
  shortDeltaMin: z.string().refine(isDeltaInRange, DELTA_RANGE_MESSAGE),
  shortDeltaMax: z.string().refine(isDeltaInRange, DELTA_RANGE_MESSAGE),
  shortDteMin: z.number().int().min(DTE_MIN, DTE_MIN_MESSAGE).max(DTE_MAX, DTE_MAX_MESSAGE),
  shortDteMax: z.number().int().min(DTE_MIN, DTE_MIN_MESSAGE).max(DTE_MAX, DTE_MAX_MESSAGE),
  maxDebitToWidthPercent: z.string().refine(isDebitToWidthInRange, DEBIT_TO_WIDTH_MESSAGE),
  minOpenInterest: z.number().int().refine(isOpenInterestInRange, OPEN_INTEREST_MESSAGE),
  maxSpreadPercent: z.string().refine(isSpreadPercentInRange, SPREAD_PERCENT_MESSAGE),
  minIvRank: z.string().refine(isIvRankFloorInRange, IV_RANK_MESSAGE).nullable(),
  maxIvRank: z.string().refine(isIvRankCeilingInRange, IV_RANK_CEILING_MESSAGE).nullable(),
  earningsHandling: z.enum(['exclude', 'flag'])
})
```

**Response (success):** `{ ok: true, criteria }` — same shape as `screener:get-pmcc-criteria`.

**Errors** (`field` / `code` / `message`; messages pinned verbatim by e2e):

| field                            | code                  | message                                                    |
| -------------------------------- | --------------------- | ---------------------------------------------------------- |
| any delta field                  | `out_of_range`        | `Delta must be between 0.01 and 0.99`                      |
| `longDteMin/Max`                 | `out_of_range`        | `DTE must be at least 1` / `LEAPS DTE must be at most 730` |
| `shortDteMin/Max`                | `out_of_range`        | `DTE must be at least 1` / `DTE must be at most 365`       |
| `maxDebitToWidthPercent`         | `out_of_range`        | `Max debit / width must be between 1% and 100%`            |
| `minOpenInterest`                | `out_of_range`        | `Open interest floor cannot be negative`                   |
| `maxSpreadPercent`               | `out_of_range`        | `Max spread must be between 1% and 50%`                    |
| `minIvRank`                      | `out_of_range`        | `IV rank floor must be between 0 and 100`                  |
| `maxIvRank`                      | `out_of_range`        | `IV rank ceiling must be between 0 and 100`                |
| `longDeltaMax` / `shortDeltaMax` | `inverted_band`       | `Minimum delta must be less than maximum delta`            |
| `longDteMax` / `shortDteMax`     | `inverted_band`       | `Minimum DTE must be less than maximum DTE`                |
| `longDteMin`                     | `overlapping_windows` | `LEAPS minimum DTE must exceed short-call maximum DTE`     |
| `maxIvRank`                      | `inverted_band`       | `IV-rank floor must be less than IV-rank ceiling`          |
| `__root__`                       | `internal_error`      | unhandled                                                  |

Same note as US-67: Zod parses first, so a bound caught at the boundary reaches the renderer as `code: 'custom'`; the sheet binds by `field` and never switches on `code`. A rejected payload persists nothing.

**Source:** `src/main/schemas.ts`, `src/main/services/pmcc-screening-criteria.ts` (`savePmccScreeningCriteria`), `src/main/core/screening-criteria.ts`.

---

## DOM contract the e2e suite binds to

- Strategy control: `bench-strategy` (group), `bench-strategy-wheel`, `bench-strategy-pmcc` (`aria-pressed`)
- Strip: existing `screener-criteria-strip`; in PMCC mode its leading label reads `PMCC criteria`
- Cards: existing `watchlist-row-<ticker>`, `watchlist-rank`, `watchlist-contract`, `watchlist-reason`; the rank pill `title` carries `fmtScore(returnPerDelta)`
- Detail: `bench-detail-diagonal` (the matching-diagonal card), `bench-leg-long`, `bench-leg-short`, `bench-diagonal-metrics`, `bench-detail-held-back` (existing id, PMCC copy)
- Sheet: existing `sheet-scrim`; field `aria-label`s `LEAPS minimum delta`, `LEAPS maximum delta`, `LEAPS minimum DTE`, `LEAPS maximum DTE`, `Short-call minimum delta`, `Short-call maximum delta`, `Short-call minimum DTE`, `Short-call maximum DTE`, `Max debit / width`, `Minimum open interest`, `Max bid-ask spread`, `IV-rank floor`, `IV-rank ceiling`; segments `iv-rank-floor-off|on`, `iv-rank-ceiling-off|on`, `earnings-exclude|flag`
- Empty state: existing `screener-empty` with PMCC copy
