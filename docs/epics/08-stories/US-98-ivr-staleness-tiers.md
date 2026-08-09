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
  And KO reported earnings after that observation
  When the trader views the screener results
  Then the KO IV rank is not shown as current
  And the row explains that the reading predates the earnings report

Scenario: A stale IV rank never blocks a candidate from ranking
  Given KO's IV rank was observed 12 trading days ago
  And KO has a surviving strike within the delta band
  When the trader runs the screener
  Then the KO candidate still appears in the ranked results
  And its yield-per-delta score is unaffected

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
- This needs the same trading-calendar capability that `docs/epics/06-stories/followup-ivr-trading-day-calendar.md` recommends — the collector's current `isTradingDay` only rejects weekends, so weekday holidays are misclassified. **Build the two together**; a staleness threshold on top of the existing heuristic is wrong every Thanksgiving.
- Proposed tiers against `ivRank.observedAt` (**validate against real screening habits before building** — see below):

  | Age (trading days) | State   | Behaviour                                                          |
  | ------------------ | ------- | ------------------------------------------------------------------ |
  | 0–1                | Fresh   | Show normally                                                      |
  | 2–3                | Aging   | Show with age; still decision-usable                               |
  | 4–10               | Stale   | Show muted with age; cannot satisfy an IV condition or Signal gate |
  | > 10               | Expired | Render `n/a`                                                       |

- **Earnings invalidation overrides the table.** If a confirmed earnings date falls between `observedAt` and now, the reading is unusable regardless of age. This is the read-path twin of Epic 12's US-91 (flag earnings proximity on IVR display surfaces). It depends on the same earnings-calendar source as US-70 and US-96; until that lands, this rule cannot be implemented and the time tiers ship alone.
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
- Making IV rank a hard screening filter. It stays soft/display-only in v1; if US-67 later adds an IVR criterion, it inherits the strict gate rather than the display tolerance.

---

## Dependencies

- **US-65:** widened `ivRank` to `{ value, observedAt }` — the field this story reads
- **US-97:** watchlist underlyings must be collected, or bench names have no reading to age
- **Follow-up: IVR trading-day calendar** (`docs/epics/06-stories/`) — required for correct trading-day arithmetic; build together
- **Earnings-calendar source** (shared with US-70 / US-96) — required for the earnings-invalidation rule only; the time tiers can ship without it
- **Consumed by US-66** (IV-rank column) and **US-96** (IV-rank cell + Signal gate)

---

## Estimate

5 points — 3 if the earnings-invalidation rule is deferred until the earnings calendar lands.

## Open Questions — validate before building

The tier boundaries above are a practitioner's default, not a measured preference. Confirm against real habits:

- When you check IV rank before selling a put, are you reading last night's close or pulling a live quote? How much do they differ in practice?
- After a name reports earnings, how long before you'd trust its IV rank again?
- Shown `IVR 38 (4 days old)`, would you act, refresh, or skip?
- Do you screen the bench on a schedule (weekend planning) or opportunistically? That decides whether the typical reading is 0 or 2 days old.

## Mockup

Deferred — the treatment lands inside the existing US-66 ranked-results and US-96 watchlist mockups (age qualifier, muted state, `n/a`, and the Signal's too-old verdict) rather than in a screen of its own. Update both once the tiers are validated.
