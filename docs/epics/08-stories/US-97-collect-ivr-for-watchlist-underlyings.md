# US-97: Collect IVR snapshots for watchlist underlyings

**As a** wheel trader screening names I don't own yet,
**I want** the nightly IVR collection to cover my watchlist as well as my open positions,
**So that** IV rank is actually populated for the candidates I'm deciding between, instead of reading "n/a" on exactly the rows I'm evaluating.

---

## Context

IV rank is how a premium seller decides **whether it's worth selling a put on a name at all** — rich implied vol means the premium compensates for the assignment risk; thin IV means the same strike pays too little for the capital it ties up. That decision happens _before_ a position exists, on the bench.

But the collector US-44 built picks its targets from open positions only:

```sql
SELECT ticker FROM positions WHERE status != 'CLOSED'
```

US-44 named this deliberately in its Out of Scope — "Watchlist underlyings (only active-position underlyings are collected)" — which was defensible when nothing read IVR outside the positions list. Epic 08 changed that. Two shipped-or-planned readers now depend on IVR for names the trader does **not** hold:

- **US-65** joins the latest IVR onto every ranked candidate. A watchlist-only ticker gets `ivRank: null`.
- **US-96** builds whole acceptance criteria on it — IV-rank cells colored thin/acceptable/rich, condition tags like `IVR ≥ 50`, and a Signal chip that reads `"IV low"`. None of those scenarios can fire without a snapshot.

The read side already degrades correctly (US-65's AC-7 requires a missing IVR to never exclude a candidate), so this is not a crash — it's a silently empty column on the screen whose entire purpose is that column. This story closes the collection gap so the bench has the same volatility context the book does.

---

## Acceptance Criteria

```gherkin
Background:
  Given the watchlist contains KO, AAPL, and XYZ
  And the trader holds an open CSP on MSFT
  And MSFT is not on the watchlist

Scenario: Watchlist underlyings are collected alongside held positions
  When the daily IVR collection runs
  Then an ivr_snapshot row is written for KO, AAPL, XYZ, and MSFT

Scenario: A ticker that is both held and watchlisted is collected once
  Given AAPL is on the watchlist and also has an open CSP
  When the daily IVR collection runs
  Then IVR is fetched for AAPL exactly once
  And exactly one AAPL snapshot exists for that day

Scenario: A watchlist ticker with no IVR coverage is skipped, not failed
  Given Barchart does not cover XYZ
  When the daily IVR collection runs
  Then XYZ is counted as skipped
  And the run still reports success for KO, AAPL, and MSFT

Scenario: One ticker failing does not suppress the others
  Given the IVR fetch for KO fails with a network error
  When the daily IVR collection runs
  Then AAPL, XYZ, and MSFT are still attempted
  And the KO failure is logged at warn level
  And the run reports one error alongside the successes

Scenario: Removing a ticker from the watchlist stops future collection
  Given KO has an ivr_snapshot from yesterday
  And KO is removed from the watchlist
  And KO has no open position
  When the daily IVR collection runs
  Then no new KO snapshot is written
  And yesterday's KO snapshot is still readable

Scenario: The manual collect-now trigger covers the watchlist too
  Given the trader has just added TSLA to the watchlist
  When the trader triggers IVR collection manually
  Then IVR is fetched for TSLA

Scenario: A screened candidate shows a real IV rank instead of n/a
  Given KO is on the watchlist with no open position
  And the daily IVR collection has recorded an IVR of 38.0 for KO
  When the trader runs the screener
  Then the KO candidate row shows an IV rank of 38.0
```

---

## Technical Notes

- The change is confined to `listActiveUnderlyings` in `src/main/services/ivr-collector.ts` — union the watchlist into the target query rather than adding a second collection pass:

  ```sql
  SELECT ticker FROM positions WHERE status != 'CLOSED'
  UNION
  SELECT ticker FROM watchlist
  ```

  `UNION` (not `UNION ALL`) plus the existing `new Set(...)`/`toUpperCase()` normalization already satisfies the collect-once scenario.

- Everything downstream of the target list already handles this shape: the collector dedupes, upper-cases, sorts, sleeps 1s between requests, and isolates per-ticker failures. No change to `persistSnapshot`, the scheduler registration, or the `ivr:collect-now` IPC.
- **Runtime cost is the thing to watch.** Collection is sequential with a 1s pause between tickers, so the after-close run grows by roughly one second per watchlist name. A 25-name watchlist turns a 5-name run into a ~30s run. That is acceptable for a job that fires 60 minutes after close, but it argues against ever making the watchlist unbounded without revisiting the pacing.
- `not_available` (ticker not covered by Barchart) is already handled as a skip rather than an error. That path gets exercised far more often now — speculative bench names are likelier to be uncovered than names the trader already holds — so the skip count becoming non-zero is normal, not a signal of breakage.
- No migration. No new dependency. `watchlist` (US-63) and `ivr_snapshot` (US-44) both already exist.

---

## Out of Scope

- **Staleness handling.** `getLatestIvrByUnderlying` returns the newest row regardless of age, so a ticker that stopped being collected still reports its last known IVR with no age signal. This gets more likely with bench names (removed from the watchlist, or dropped by the scraper), but deciding the tolerance and the UI treatment is its own story.
- Backfilling IVR history for tickers already on the watchlist — first run after this ships produces the first snapshot.
- Changing the collection cadence, the 1s rate limit, or the scraper itself (US-43).
- IVR for PMCC or call-side screening (Epic 09).
- The IV-rank display, coloring, and Signal logic (US-66, US-96).

---

## Dependencies

- **US-44:** `ivr_snapshot` table, collector, and scheduler job (this story amends its target query)
- **US-63:** `watchlist` table supplies the added ticker universe
- **Unblocks US-96:** its IV-rank cells, `IVR ≥ N` condition tags, and Signal verdicts have no data source without this
- **Completes US-65:** the `ivRank` field is wired and tested, but reads empty for watchlist-only tickers until this lands

---

## Estimate

2 points

## Mockup

None — this is a collection-targets change with no renderer surface. The data it produces is displayed by the US-66 ranked-results and US-96 watchlist mockups, both of which already show populated IV-rank values.
