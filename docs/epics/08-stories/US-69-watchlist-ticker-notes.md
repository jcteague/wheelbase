# US-69: Edit a watchlist entry

**As a** wheel trader whose thesis for a name changes over time,
**I want to** open an existing watchlist entry and change its thesis or the entry conditions I'm waiting for,
**So that** my bench stays accurate as prices move and my plans evolve.

---

## Context

A watchlist entry (US-63) captures a thesis and conditions when it's created, but theses shift: the price I'd be happy to own at drops, IV finally lifts, or I decide a name is now a core holding I'll wheel anytime. Editing lets the trader keep the bench honest instead of letting it decay into stale reasoning. It reuses the same form as create — the **ticker is fixed** (you can't rename an entry; remove and re-add for a different symbol), while the free-text thesis and the structured conditions are edited together in one surface. This supersedes the earlier thesis-only inline editor by folding thesis + conditions into a single edit form.

---

## Acceptance Criteria

```gherkin
Background:
  Given the watchlist contains AAPL
  And AAPL has the note "Would own below $170" and the condition "Would own below" set to $170.00

Scenario: Edit the thesis text
  When the trader opens AAPL and changes the note to "Would own below $165 after the split"
  And saves
  Then the AAPL row shows "Would own below $165 after the split"
  And the note persists after the page is reloaded

Scenario: Clear the thesis
  When the trader opens AAPL, clears the note, and saves
  Then the AAPL row shows no note
  And AAPL remains on the watchlist

Scenario: Reject an over-length thesis
  When the trader enters a note longer than 500 characters
  Then a validation error appears: "Note must be 500 characters or fewer"
  And the note is not saved

Scenario: Change a condition value
  When the trader opens AAPL and changes "Would own below" from $170.00 to $165.00
  And saves
  Then the AAPL row shows the condition tag "≤ $165"

Scenario: Add a condition to an existing entry
  When the trader opens AAPL and adds "Wait for high IV" set to IVR ≥ 50
  And saves
  Then the AAPL row shows the condition tag "IVR ≥ 50"

Scenario: Remove a condition
  Given AAPL has the conditions "Would own below $170" and "Wait for high IV, IVR ≥ 50"
  When the trader opens AAPL, removes the "Wait for high IV" condition, and saves
  Then the AAPL row no longer shows the "IVR ≥ 50" tag

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

- Editing reuses the shared add/edit entry form (US-63) with the ticker read-only; it persists the same fields (`notes` + the condition columns) via `watchlist:update` through `handleIpcCall`.
- The note is free text; reuse the 500-char bound from `newWheelSchema.thesis`. It is informational only — it never affects scoring or ranking.
- Changing conditions updates the stored inputs; the Signal that reflects them is recomputed and rendered by the View story (US-96) — this story does not itself compute the Signal.
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

Covered by the US-63 watchlist-manager mockup (`mockups/us-63-watchlist-manager.mdx`) — the `edit` state shows the pre-filled form with the fixed ticker, editable thesis, and condition rows.
