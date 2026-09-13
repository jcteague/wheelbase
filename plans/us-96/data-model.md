# US-96 Data Model — One live bench

No migration. Every entity below is either an existing persisted record read as-is or a
computed, transient shape. Money and ratio fields are `decimal.js` output strings as
elsewhere in the app; nothing here is stored.

## Existing persisted entities (read only)

| Entity                 | Table / source                                                                  | Fields used                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `WatchlistEntryRecord` | `watchlist` (`migrations/012`) via `services/watchlist.ts::listWatchlist`       | `ticker`, `notes`, `ownBelowPrice` (4dp TEXT, nullable), `ivrTrigger` (int, nullable), `postEarningsOnly`, `coreHolding`, `addedAt` |
| IVR reading            | `ivr_snapshot` via `services/ivr-snapshots.ts::getAssessedIvrByUnderlying`      | `value` (1dp), `observedAt`, `ageTradingDays`, `state`                                                                              |
| Earnings knowledge     | `earnings_date` via `services/earnings-dates.ts::getEarningsCalendar`           | `next: EarningsLookup`, `last`                                                                                                      |
| Trading calendar       | `trading_session` via `services/trading-calendar-store.ts::readTradingCalendar` | used only to age the IVR reading                                                                                                    |
| Screening criteria     | `app_settings` via `services/screening-criteria.ts::getScreeningCriteria`       | `dteMax` (horizon for the earnings read)                                                                                            |

## Changed engine type: `IvRankState` (main, `src/main/core/ivr-freshness.ts`)

```typescript
export type IvRankState = 'fresh' | 'aging' | 'stale' | 'expired' | 'predates_earnings'

export type AssessedIvRank = {
  value: string // as stored, 1dp
  observedAt: string // ISO scrape time
  ageTradingDays: number // completed sessions after the observation session, ≥ 0
  state: IvRankState
}

// `expired` is now a reading, not an absence. `unreadable` (corrupt value / calendar
// cannot reach the observation) is the only path that still yields "no reading".
export type IvRankAssessment =
  | { status: 'assessed'; reading: AssessedIvRank }
  | { status: 'unreadable' }
```

Tier mapping (unchanged thresholds): age ≤ 1 fresh, ≤ 3 aging, ≤ 10 stale, > 10 expired;
a known last print after the observation session and on/before today → `predates_earnings`
regardless of age. `isUsableState(state)` = `fresh | aging` — unchanged.

Mirrors that must widen in lockstep: `IpcIvRank.state` (`src/preload/index.d.ts`),
`ScreenerIvRank.state` (`src/renderer/src/api/screener.ts`), and `IvrCell`'s state table.

## New engine types: `src/main/core/watchlist-signal.ts` (pure)

```typescript
export type GateVerdict = 'met' | 'unmet' | 'unknown' | 'none'

export type Gate = {
  verdict: GateVerdict
  /** Trader-facing reason when the gate is unmet or unknown; null for met/none. */
  label: string | null
}

export type EntryVerdict = {
  price: Gate
  iv: Gate
  earnings: Gate
}

/** Everything the engine needs for one entry — plain values, no I/O. */
export type EntrySignalInput = {
  conditions: {
    ownBelowPrice: string | null // 4dp TEXT
    ivrTrigger: number | null
    postEarningsOnly: boolean
  }
  price: string | null // quote.price, null when the quote failed
  ivRank: AssessedIvRank | null
  earnings: EarningsLookup // { found, date } | { none } | { unavailable }
  now: Date
}
```

### Gate rules

| Gate     | Input                                                          | Verdict | Label                                                                                                    |
| -------- | -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| price    | `ownBelowPrice === null`                                       | none    | —                                                                                                        |
| price    | `price === null`                                               | unknown | `Price unavailable`                                                                                      |
| price    | `Decimal(price) ≤ Decimal(ownBelowPrice)`                      | met     | —                                                                                                        |
| price    | otherwise                                                      | unmet   | `Price $178.40 above $170 target` (price via `fmtMoney`-style 2dp; target trimmed like the `≤ $170` tag) |
| iv       | `ivrTrigger === null`                                          | none    | —                                                                                                        |
| iv       | `ivRank === null` or `state === 'expired'`                     | unknown | `IV unavailable`                                                                                         |
| iv       | `state === 'stale'`                                            | unknown | `IV too old to judge`                                                                                    |
| iv       | `state === 'predates_earnings'`                                | unknown | `IV predates earnings`                                                                                   |
| iv       | usable and `Number(value) ≥ ivrTrigger`                        | met     | —                                                                                                        |
| iv       | usable and below                                               | unmet   | `IV low`                                                                                                 |
| earnings | `postEarningsOnly === false`                                   | none    | —                                                                                                        |
| earnings | `found` and `0 ≤ daysUntil ≤ 7` (ET calendar days, `date-fns`) | unmet   | `Earnings in 3 days` (`Earnings today` at 0, `Earnings in 1 day`)                                        |
| earnings | `found` and `daysUntil > 7`                                    | met     | —                                                                                                        |
| earnings | `found` and date already past, `none`, or `unavailable`        | unknown | `Earnings date unknown`                                                                                  |

`reasonsFor(verdict): string[]` returns the labels of unmet/unknown gates in precedence order
**earnings → price → iv**. `allGatesPass(verdict)` is true when every gate is `met` or `none`.

### Earnings display (pure, same module)

```typescript
export type EarningsDisplay =
  | { kind: 'date'; date: string; daysUntil: number; withinWindow: boolean } // found, upcoming
  | { kind: 'unknown' } // none, past, or unavailable
```

Window is 7 days; `withinWindow` drives the caution colour on the detail panel's earnings
line (`Sep 14 · in 5 days`). Unknown renders `Unknown · needs verification`.

## New snapshot shapes: `src/main/services/watchlist-snapshot.ts`

```typescript
export type SnapshotQuote = {
  price: string
  prevClose: string | null
  timestamp: string
}

export type WatchlistSnapshotRow = {
  entry: WatchlistEntryRecord
  quote: SnapshotQuote | null // null → that ticker's fetch failed
  ivRank: AssessedIvRank | null // null → never collected or unreadable
  earnings: EarningsDisplay
  verdict: EntryVerdict
}

export type WatchlistSnapshot = {
  rows: WatchlistSnapshotRow[] // watchlist order (added_at DESC)
  asOf: string // ISO request clock the verdicts were computed at
}
```

Failure isolation: quotes via `fetchIsolatedStockQuotes` (per ticker); earnings read wrapped
like `services/screener.ts::readEarnings` (degrades to empty map → every ticker
`unavailable`); IVR read already degrades inside `getAssessedIvrByUnderlying`. The provider
factory throwing (no credentials) yields `quote: null` for every row and a logged warning —
the snapshot never fails as a whole.

## Renderer shapes

### `src/renderer/src/api/watchlist.ts` (mirror of the IPC payload)

`WatchlistSnapshotRow`, `WatchlistSnapshot`, `SnapshotQuote`, `EntryVerdict`, `Gate`,
`EarningsDisplay` — field-for-field mirrors of `src/preload/index.d.ts` `IpcWatchlistSnapshot*`.
`ScreenerIvRank` is reused for `ivRank`.

### `src/renderer/src/lib/bench.ts` (pure)

```typescript
export type BenchStock = {
  row: WatchlistSnapshotRow
  candidate: ScreenerCandidate | null // the ranked put, when the screener produced one
  rank: number | null // 1-based rank; null when waiting
  reason: string // '' when meets criteria
}

export type Bench = {
  meets: BenchStock[] // screener rank order
  waiting: BenchStock[] // watchlist order
}

export function buildBench(
  snapshot: WatchlistSnapshot,
  results: ScreenerResults | undefined // undefined while loading
): Bench
```

Rules:

- A stock **meets** when `allGatesPass(row.verdict)` **and** `results.status === 'ok'` **and**
  a ranked candidate exists for its ticker. `meets` is ordered by the candidate's index in
  `results.ranked`. Its `reason` is `''`; the card's verdict copy is `All conditions met` when
  at least one gate is `met`, else `Screening criteria met`.
- Otherwise the stock **waits** with `reason` built as: `results.status === 'provider_unavailable'`
  → `Data unavailable · not evaluated`; else `reasonsFor(verdict).join(' · ')` when non-empty;
  else the screener's exclusion `reason` for that ticker verbatim; else (results undefined /
  ticker absent) `Not screened yet`.
- `defaultSelection(bench)` = `meets[0]?.ticker ?? waiting[0]?.ticker ?? null`.

### Day change (pure, `src/renderer/src/lib/day-change.ts`)

`dayChange(quote: SnapshotQuote | null): { percent: string; direction: 'up' | 'down' | 'flat' } | null`
— `(price − prevClose) / prevClose × 100`, `Decimal` at 1dp, sign `+`/`−` (U+2212), null when
either value is missing. Colour: up → `text-wb-green`, down → `text-wb-red`, flat → muted.

## State transitions

None persisted. Renderer selection state (`selectedTicker`) is local `useState`, reset to
`defaultSelection` when the selected ticker disappears from the bench (removed, or the
results changed).

## Validation rules from acceptance criteria

- `IVR ≥ N` can only be met by a `fresh` or `aging` reading (AC "A stale reading … cannot
  satisfy"; "An aging reading still satisfies").
- A ranked candidate alone never puts a stock in Meets criteria while any gate is unmet or
  unknown (AC PEP, ORCL).
- A provider outage empties `meets` and stamps every reason `Data unavailable · not evaluated`
  while `ivRank` rows keep rendering (AC "Market data unavailable degrades verdicts, not rows").
