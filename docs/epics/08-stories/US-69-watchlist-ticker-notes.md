# US-69: Edit a watchlist entry

**As a** wheel trader whose thesis for a name changes over time,
**I want to** open an existing watchlist entry and change its thesis or the entry conditions I'm waiting for,
**So that** my bench stays accurate as prices move and my plans evolve.

---

## Context

A watchlist entry (US-63) captures a thesis and conditions when it's created, but theses shift: the price I'd be happy to own at drops, IV finally lifts, or I decide a name is now a core holding I'll wheel anytime. Editing lets the trader keep the bench honest instead of letting it decay into stale reasoning. It reuses the same form as create — the **ticker is fixed** (you can't rename an entry; remove and re-add for a different symbol), while the free-text thesis and the structured conditions are edited together in one surface. This supersedes the earlier thesis-only inline editor by folding thesis + conditions into a single edit form.

> **Reconciled 2026-09-13 against US-96.** This story was written when the watchlist was a
> table and every outcome was stated as "the AAPL **row** shows…". US-96 folded the screener
> into the Watchlist page: the table is gone, replaced by **cards** split into "Meets
> criteria" and "Stocks of interest" beside a sticky **detail panel**. The criteria below now
> name that surface.
>
> Three consequences worth stating, because they change the work rather than just the wording:
>
> - **The detail panel is where an edit belongs.** It already shows the thesis under "Your
>   thesis" and every condition as a gate badge with its verdict (`≤ $170 · not met`), so it
>   is the one place a trader already reads what they are about to change. The card has no
>   room and shows conditions only in passing.
> - **Condition tags render in the detail panel, not on the card.** `watchlist-tag` chips moved
>   there, and only the tags no gate speaks for (today just `core`) render as chips at all —
>   price, IVR and post-earnings are gate badges. An assertion about "the row shows the tag
>   `≤ $165`" has to become an assertion about that gate badge.
> - **An edit must re-judge the bench, not just redraw it.** Conditions are inputs to the pure
>   verdict engine (`core/watchlist-signal.ts`), so changing one can move a stock between
>   sections. Saving has to invalidate the snapshot the way add and remove already do.
>
> One criterion below — "the thesis seeds the promote flow" — is **already satisfied** by
> US-96's Review trade handoff, which reads `entry.notes` into the pre-filled form. It is kept
> as a regression guard rather than as new work.

---

## Acceptance Criteria

```gherkin
Background:
  Given the watchlist contains AAPL
  And AAPL has the note "Would own below $170" and the condition "Would own below" set to $170.00

Scenario: Edit the thesis text
  When the trader opens AAPL and changes the note to "Would own below $165 after the split"
  And saves
  Then the AAPL detail panel shows "Would own below $165 after the split" under "Your thesis"
  And the note persists after the page is reloaded

Scenario: Clear the thesis
  When the trader opens AAPL, clears the note, and saves
  Then the AAPL detail panel reads "No thesis yet." under "Your thesis"
  And AAPL remains on the bench

Scenario: Reject an over-length thesis
  When the trader enters a note longer than 500 characters
  Then a validation error appears: "Note must be 500 characters or fewer"
  And the note is not saved

Scenario: Change a condition value
  When the trader opens AAPL and changes "Would own below" from $170.00 to $165.00
  And saves
  Then the AAPL detail panel shows the price condition as "≤ $165"

Scenario: Add a condition to an existing entry
  When the trader opens AAPL and adds "Wait for high IV" set to IVR ≥ 50
  And saves
  Then the AAPL detail panel shows an IV condition reading "IVR ≥ 50" with its verdict

Scenario: Remove a condition
  Given AAPL has the conditions "Would own below $170" and "Wait for high IV, IVR ≥ 50"
  When the trader opens AAPL, removes the "Wait for high IV" condition, and saves
  Then the AAPL detail panel shows no IV condition
  And the price condition "≤ $170" is still shown

Scenario: The edit is opened from the stock detail panel
  When the trader selects AAPL on the bench
  Then the detail panel offers a way to edit the thesis and conditions

Scenario: Changing a condition re-judges the bench
  Given AAPL is under "Stocks of interest" with the reason "IV low"
  And AAPL's fresh IV rank of 34 sits below its "IVR ≥ 50" condition
  When the trader lowers the IV condition to IVR ≥ 30 and saves
  Then AAPL's IV condition reads as met
  And AAPL is re-evaluated against the bench without a manual refresh

Scenario: The ticker cannot be changed in the edit form
  When the trader opens AAPL in the edit form
  Then the ticker "AAPL" is shown fixed and is not editable

Scenario: The thesis seeds the promote flow
  Given AAPL has the note "Would own below $170"
  When the trader promotes an AAPL screener result to the new-wheel form
  Then the form's thesis field is pre-filled with "Would own below $170"
```

---

## Technical Notes

- Editing reuses the shared add/edit entry form (US-63) with the ticker read-only; it persists the same fields (`notes` + the condition columns) via `watchlist:update` through `handleIpcCall`. That channel **does not exist yet** — the watchlist service is `addWatchlistEntry` / `listWatchlist` / `removeWatchlistEntry` only, so the IPC, the service function and a `WatchlistUpdatePayloadSchema` are all new.
- **The save must invalidate the bench.** `useAddToWatchlist` and `useRemoveFromWatchlist` already invalidate `['watchlist']` and `['screener','results']`; the update mutation needs the same, or a changed condition will not move the stock between sections until the next refresh.
- **`WatchlistAddForm` is behind the "+ Add stock" toggle** on the combined page and is built with React Hook Form + a Zod resolver (`watchlistEntrySchema`). Reusing it for edit means seeding defaults from the entry and rendering the ticker read-only rather than as an input — note the schema's `.default()` booleans make its input and output types differ, which the existing form already handles with a three-generic `useForm`.
- The note is free text; reuse the 500-char bound from `newWheelSchema.thesis`. It is informational only — it never affects scoring or ranking.
- Changing conditions updates the stored inputs; the verdict that reflects them is recomputed by `core/watchlist-signal.ts` and rendered by US-96 — this story does not itself compute any verdict.
- Promote (US-68) reads the note to seed `thesis`; if the note is empty, `thesis` is left blank.

---

## Out of Scope

- Creating or removing entries (US-63)
- Live price / IV-rank / earnings values and the derived Signal display (US-96)
- Changing an entry's ticker (remove + re-add instead)
- Rich text / markdown / attachments in notes; note history / audit trail
- Using the note or conditions as a screening/ranking input

---

## Dependencies

- US-63: the watchlist entry (ticker + thesis + conditions) to edit
- US-68: consumes the note to seed the promote thesis (soft dependency)
- US-96: renders the recomputed Signal after an edit (soft dependency)

---

## Estimate

3 points

## Mockup

The US-63 watchlist-manager mockup (`mockups/us-63-watchlist-manager.mdx`) still shows the
pre-filled form with its fixed ticker, editable thesis and condition rows — the form itself is
unchanged. **What it does not show is where the edit opens from**, because it predates the
combined bench. A mockup pass over the detail panel's edit affordance is worth doing before
this is planned.
