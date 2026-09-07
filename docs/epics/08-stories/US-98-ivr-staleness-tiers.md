# US-98: Age an IV-rank reading so a stale one can't pass as current

**As a** wheel trader deciding whether a name's premium is rich enough to sell into,
**I want** an IV rank to show how old it is, and to stop counting as met once it's too old,
**So that** I don't commit capital to a thin credit because the app showed me a number from before the last earnings print.

---

## Context

IV rank is `(IV_current − IV_52wk_low) / (IV_52wk_high − IV_52wk_low) × 100`. The denominator reshapes over months; the numerator can move violently overnight. So "how stale is too stale" is really "how far can IV30 have travelled since we looked," and that has three different answers:

- **Quiet drift** — 1–3 vol points a day on a liquid name, which against a 20–40 point 52-week range is roughly 3–10 IVR points per day. A two-day-old 55 might really be 48. Same decision zone.
- **Regime shift** — VIX re-rates and every name moves at once. Uncommon, but it invalidates the whole table together.
- **Earnings crush** — IV ramps into the print then drops 30–50% overnight. A name reading IVR 70 the day before can read 25 the morning after. **A one-day-old snapshot is well inside any sane time threshold and still catastrophically wrong.** Time-based staleness cannot catch this; only event-based invalidation can.

The harm is asymmetric, and that sets how conservative this should be. A **stale-low** reading makes you skip a name that's actually rich — an invisible, cheap miss. A **stale-high** reading makes you sell premium that isn't there: you commit capital expecting a fat credit, the fill comes back thin, and you've taken assignment risk at a price that no longer compensates you. Getting paid too little for risk you accepted is the failure mode worth engineering against.

US-65 widened `ivRank` to carry `observedAt` so this story has something to read. Nothing consumes it yet — today a snapshot from March renders identically to one from last night.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader's watchlist contains KO
  And the market calendar recognises weekends and exchange holidays

Scenario: A reading from the last close shows without an age qualifier
  Given KO's IV rank of 38.0 was observed at the previous market close
  When the trader views the screener results
  Then the KO row shows an IV rank of 38.0
  And no age qualifier is shown

Scenario: Friday's close is still fresh on Monday morning
  Given KO's IV rank was observed at Friday's close
  And it is now Monday before the next collection has run
  When the trader views the screener results
  Then the KO IV rank is treated as 0 trading days old
  And no age qualifier is shown

Scenario: An exchange holiday does not age a reading
  Given KO's IV rank was observed at Wednesday's close
  And Thursday is a recognised exchange holiday
  And it is now Thursday
  When the trader views the screener results
  Then the KO IV rank is treated as 0 trading days old

Scenario: An aging reading shows its age but stays usable
  Given KO's IV rank of 38.0 was observed 2 trading days ago
  When the trader views the screener results
  Then the KO row shows an IV rank of 38.0 with an age of 2 days

Scenario: A stale reading is muted and cannot satisfy an IV condition
  Given KO's IV rank of 58.0 was observed 6 trading days ago
  And KO has the entry condition "IVR >= 50"
  When the trader views the watchlist
  Then the KO IV rank is shown muted with its age
  And the Signal does not report the IV condition as met

Scenario: An expired reading is indistinguishable from no reading
  Given KO's IV rank was observed 12 trading days ago
  When the trader views the screener results
  Then the KO row shows "n/a" for IV rank

Scenario: An earnings print invalidates a reading regardless of age
  Given KO's IV rank of 62.0 was observed 1 trading day ago
  And the earnings store records KO's last print as the day after that observation
  When the trader views the screener results
  Then the KO IV rank is not shown as current
  And the row explains that the reading predates the earnings report

Scenario: A print before the observation does not invalidate the reading
  Given KO's IV rank of 62.0 was observed 1 trading day ago
  And the earnings store records KO's last print as 5 trading days before that observation
  When the trader views the screener results
  Then the KO row shows an IV rank of 62.0
  And no age qualifier is shown

Scenario: Missing earnings knowledge falls back to the time tiers alone
  Given KO's IV rank of 62.0 was observed 1 trading day ago
  And the earnings store has no row for KO
  When the trader views the screener results
  Then the KO row shows an IV rank of 62.0
  And the row does not claim the reading is current through earnings

Scenario: A stale IV rank never blocks a candidate from ranking
  Given KO's IV rank was observed 12 trading days ago
  And KO has a surviving strike within the delta band
  When the trader runs the screener
  Then the KO candidate still appears in the ranked results
  And its yield-per-delta score is unaffected

Scenario: The IV-rank floor is not applied to a stale reading
  Given the screening criteria set an IV-rank floor of 50
  And KO's IV rank of 22.0 was observed 6 trading days ago
  And KO has a surviving strike within the delta band
  When the trader runs the screener
  Then KO is not excluded for its IV rank
  And the KO candidate appears in the ranked results
  And its IV rank is shown muted with its age

Scenario: The IV-rank floor is not applied to an expired reading
  Given the screening criteria set an IV-rank floor of 50
  And KO's IV rank of 22.0 was observed 12 trading days ago
  And KO has a surviving strike within the delta band
  When the trader runs the screener
  Then KO is not excluded for its IV rank
  And the KO row shows "n/a" for IV rank

Scenario: Signal refuses to claim entry readiness on an unusable reading
  Given KO's only unmet gate is "IVR >= 40"
  And KO's IV rank of 58.0 was observed 6 trading days ago
  When the trader views the watchlist
  Then the Signal does not show "Entry ready"
  And the Signal indicates the IV reading is too old to judge
```

---

## Technical Notes

- **Age must be measured in trading days, never calendar days.** A Friday-close snapshot viewed Monday is 3 calendar days and **0 trading days** old. Calendar-day math makes every Monday look like an outage.
- **Definition of age.** Map `observedAt` to the trading session it belongs to: the most recent session whose close is at or before `observedAt`, on the **America/New_York** calendar (a scrape at 22:30 ET belongs to that day's session even though its UTC timestamp is already tomorrow). Age is the number of session closes strictly after that session and at or before now. During Monday's session, Friday's reading is 0 old; after Monday's close it is 1 old, until Monday's collection replaces it. Use `date-fns` / `date-fns-tz` for the zone conversion — never `slice(0, 10)` on the ISO string (CLAUDE.md date rule), and note `persistSnapshot` dedupes on the **UTC** day, which is a different basis and must not be reused here.
- This needs the same trading-calendar capability that `docs/epics/06-stories/followup-ivr-trading-day-calendar.md` recommends — the collector's current `isTradingDay` only rejects weekends, so weekday holidays are misclassified. **Build the two together**; a staleness threshold on top of the existing heuristic is wrong every Thanksgiving.
- Proposed tiers against `ivRank.observedAt` (**validate against real screening habits before building** — see below):

  | Age (trading days) | State   | Behaviour                                                          |
  | ------------------ | ------- | ------------------------------------------------------------------ |
  | 0–1                | Fresh   | Show normally                                                      |
  | 2–3                | Aging   | Show with age; still decision-usable                               |
  | 4–10               | Stale   | Show muted with age; cannot satisfy an IV condition or Signal gate |
  | > 10               | Expired | Render `n/a`                                                       |

- **Earnings invalidation overrides the table.** If the ticker's most recent earnings print falls after the reading's session close and at or before now, the reading is unusable regardless of age — rendered muted with an "predates earnings" caption on the watchlist and screener rows. This is the read-path twin of Epic 12's US-91 (flag earnings proximity on IVR display surfaces).
- **The earnings store must learn the last print, not just the next.** US-70's `earnings_date` table (`migrations/013_create_earnings_date.sql`) holds one row per ticker with `next_earnings` only, overwritten on each fetch, so a print that has passed is forgotten — the invalidation question is unanswerable from it today. This story amends the store:
  - **Migration:** add `last_earnings TEXT` (`'YYYY-MM-DD'`, NULL = checked, no print inside the lookback window — positive knowledge, mirroring `next_earnings` NULL). Still one row per ticker, still overwritten; the [earnings-persisted-per-ticker ADR](../../spec/architecture/02-adrs/earnings-persisted-per-ticker.md) shape is unchanged.
  - **Fetcher:** `src/main/integrations/finnhub-earnings.ts` already requests a window of `EARNINGS_LOOKBACK_DAYS` (7) back to 30 ahead, so the past rows are on the wire — but the parser collapses them to a single `{ status: 'found', date }` that is the next date if one exists, else the latest past one, which makes a `found` date ambiguous. Widen the lookback to **30 days** and return `last` and `next` as separate fields (both nullable). 30 days is enough because a reading older than 10 trading days is Expired regardless, so only a print inside roughly the last two calendar weeks can ever change a verdict. One request per ticker as before — no new traffic against the 60 req/min free tier.
  - **Store:** persist both dates in `src/main/services/earnings-dates.ts` and expose the last print to readers alongside the next. Refresh cadence needs no change: rows within `NEAR_EARNINGS_DAYS` already re-read every `MIN_REFETCH_HOURS`, so `last_earnings` populates within 12 hours of a print passing.
  - **Why not roll `next` into `last` when the date passes:** that only works if the store saw the date before the print. A ticker added to the watchlist the morning after its earnings would have no last print on record; the lookback fetch covers it for free.
  - **US-70 readers are unaffected:** `EarningsLookup` consumers keep reading the next date; the `none`/`unavailable` distinction is preserved.
- **Degradation.** If the store has no row for a ticker or the feed is `unavailable`, the time tiers apply alone and the row must **not** claim the reading survived earnings (no "current through earnings" affirmation — absence of a caption, not a green mark). Per the failure-isolation rule, an earnings-store failure degrades that ticker's verdict, never the run.
- **The IVR snapshot history cannot substitute.** `ivr_snapshot` stores `iv30`, so an earnings crush would show as a drop between consecutive rows — but a stale reading has, by definition, no newer row to compare against. The earnings calendar is the only source that can catch a print behind a stale reading.
- **One rule for both surfaces: an unusable reading is an unknown, and an unknown never decides anything.** It cannot satisfy a positive gate (a watchlist `IVR ≥ N` condition, the Signal's "Entry ready"), and it cannot trigger a negative filter (US-67's `iv_rank_floor` exclusion). Concretely, the screener service maps a Stale or Expired reading to `ivRank: null` before the engine sees it, so the floor's existing `applies` guard (`criteria.minIvRank !== null && ctx.ivRank !== null`) skips it — the same path a never-collected ticker already takes under US-65's "a missing IVR never excludes". Fresh and Aging readings reach the engine unchanged and the floor applies to them normally.
- **Stated consequence of that rule:** a thin bench name that the floor was excluding will _reappear_ in ranked results once its reading ages past the Stale boundary, showing `n/a` or a muted age instead of a number. That is intended — the trader can see the gap, and the age indicator is the collection-health signal called out below. The alternative (excluding on an unknown reading) was considered and rejected because it contradicts "a stale IV rank never blocks a candidate from ranking" and turns a collector outage into an empty screen.
- Tiering is a **pure function** of `observedAt` + now + the trading calendar → a state. It belongs in `src/main/core/`, not in a component, so both the screener and the watchlist derive the same verdict.
- **Two different unreliability flags, don't conflate them.** Epic 12's US-87 introduces a data-completeness flag for an IVR computed on a partial 52-week window. That is a different defect from a stale reading and needs its own treatment in the UI.
- `observedAt` is the scrape time (`new Date().toISOString()` in the Barchart scraper), not a Barchart-reported observation time. It is an **upper bound** on freshness: if the source ever serves a cached page, `observedAt` looks fresh while the value isn't. Undetectable from our side; worth knowing, not worth engineering around.
- Age older than 1 trading day in steady state means the collector failed or the ticker was newly added. The age indicator doubles as a collection-health signal — likely worth surfacing on the snapshot-status diagnostics page Epic 12 already plans.

---

## Out of Scope

- Changing the collection cadence or adding an on-demand refresh to cure staleness (a stale reading should be _labelled_, not silently re-fetched mid-render).
- Backfill of missing history.
- The partial-52-week-window completeness flag (Epic 12, US-87).
- Applying staleness to any other market data — price and chain quotes have their own freshness treatment via the market-status pill.
- Changing how US-67's `iv_rank_floor` treats a Fresh or Aging reading. The floor remains a hard exclusion on a usable reading; this story only decides that an unusable one is treated as absent (see Technical Notes).

---

## Dependencies

- **US-65:** widened `ivRank` to `{ value, observedAt }` — the field this story reads
- **US-67:** the `iv_rank_floor` exclusion whose interaction with Stale/Expired readings this story fixes (treated as absent, never as failing)
- **US-97:** watchlist underlyings must be collected, or bench names have no reading to age
- **Follow-up: IVR trading-day calendar** (`docs/epics/06-stories/`) — required for correct trading-day arithmetic; build together
- **US-70:** the `earnings_date` store and Finnhub fetcher this story amends with `last_earnings` (see Technical Notes); the time tiers can ship without that amendment, the invalidation rule cannot
- **Consumed by US-66** (IV-rank column) and **US-96** (IV-rank cell + Signal gate)

---

## Estimate

5 points — the time tiers plus trading calendar are ~3, the `last_earnings` store amendment plus invalidation rule ~2. The rule is small enough to stay in this story rather than split out.

## Open Questions — validate before building

The tier boundaries above are a practitioner's default, not a measured preference. Confirm against real habits:

- When you check IV rank before selling a put, are you reading last night's close or pulling a live quote? How much do they differ in practice?
- After a name reports earnings, how long before you'd trust its IV rank again?
- Shown `IVR 38 (4 days old)`, would you act, refresh, or skip?
- Do you screen the bench on a schedule (weekend planning) or opportunistically? That decides whether the typical reading is 0 or 2 days old.

## Mockup

Deferred — the treatment lands inside the existing US-66 ranked-results and US-96 watchlist mockups (age qualifier, muted state, `n/a`, and the Signal's too-old verdict) rather than in a screen of its own. Update both once the tiers are validated.
