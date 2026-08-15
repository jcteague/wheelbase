# US-67: Configure screening defaults

**As a** wheel trader with a defined risk appetite,
**I want to** configure the screener's criteria — delta band, DTE window, premium-yield floor, liquidity gates, price ceiling, and earnings handling — from a sheet on the Screener itself,
**So that** the ranked results reflect how I actually pick entries, and I can tune the filters against the results I'm looking at instead of navigating away to Settings.

---

## Context

Every wheel trader screens differently: a conservative trader wants 0.15–0.20 delta and 45 DTE; an aggressive one wants 0.30–0.40 and weeklies. The scorer (US-65) ships with sane defaults, but the criteria must be editable and persisted so screening is reproducible session to session. Per the domain briefing, delta and DTE are structural hard filters, liquidity is a hard gate, yield and IV rank are primarily ranking inputs (optional soft floors), and earnings handling is a policy choice (exclude vs flag). These are configurable preferences, not hard-coded constants.

**Criteria editing lives on the Screener, not in Settings.** Tuning a filter is an act of reading results — you widen a delta band _because_ the list came back empty, or tighten it _because_ rank 1 is closer to the money than you want. Putting the form behind a nav hop to Settings breaks that loop. A right-hand sheet over the results matches the pattern every other form in the app already uses (`AssignmentSheet`, `RollCspSheet`, `CallAwaySheet`, `CloseCcEarlySheet`), and it lets the results refresh underneath the moment the criteria are saved.

Persistence is unchanged by that decision: the criteria still live in the same settings store as the global alert thresholds (US-57), still validated by one Zod schema on both sides of IPC. Only the editing surface moves. Settings keeps broker credentials and alert defaults; it never gains a screening-criteria section.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the Screener page
  And the persisted criteria are: delta band 0.20–0.30, DTE window 30–45,
    minimum open interest 500, max spread 10%, price ceiling off,
    IV-rank floor off, earnings "Exclude"
  And the ranked results were screened with those criteria

Scenario: Open the criteria sheet from the page header
  When the trader clicks "Criteria" in the Screener page header
  Then the screening-criteria sheet opens over the results
  And every field is pre-filled from the persisted criteria
  And the sidebar navigation remains visible and clickable

Scenario: Open the criteria sheet from the criteria summary strip
  Given a summary strip above the results reads
    "Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude"
  When the trader clicks the summary strip
  Then the screening-criteria sheet opens

Scenario: Open the criteria sheet from the empty state
  Given no candidates matched the current criteria
  Then the empty card offers "Adjust criteria"
  When the trader clicks "Adjust criteria"
  Then the screening-criteria sheet opens
  And the trader is not navigated away from the Screener

Scenario: Save new screening criteria and re-screen
  When the trader sets the delta band to 0.15–0.20
  And sets the DTE window to 40–45
  And clicks "Save & re-screen"
  Then the criteria are persisted
  And the sheet closes
  And the results refresh, filtered to 0.15–0.20 delta and 40–45 DTE
  And the page shows "Screening criteria saved"
  And the criteria summary strip reads "Δ 0.15–0.20 · DTE 40–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude"

Scenario: Saved criteria survive a restart
  Given the trader saved the delta band as 0.15–0.20
  When the app is restarted and the criteria sheet is reopened
  Then the delta band reads 0.15–0.20

Scenario: Toggle earnings handling between exclude and flag
  Given earnings handling is "Exclude"
  When the trader changes earnings handling to "Flag only"
  And saves
  Then candidates with earnings inside the DTE window are shown with a warning instead of excluded

Scenario: Reject an inverted delta band
  When the trader sets the delta band to 0.30–0.20
  Then a validation error appears: "Minimum delta must be less than maximum delta"
  And "Save & re-screen" is disabled

Scenario: Reject an inverted DTE window
  When the trader sets the DTE window to 45–30
  Then a validation error appears: "Minimum DTE must be less than maximum DTE"
  And "Save & re-screen" is disabled

Scenario: Reject out-of-range criteria
  When the trader enters "<field>" as "<value>"
  Then a validation error appears: "<message>"
  And no criteria are saved
  And the results behind the sheet are unchanged

  Examples:
    | field              | value | message                              |
    | max delta          | 1.5   | Delta must be between 0.01 and 0.99  |
    | minimum DTE        | 0     | DTE must be at least 1               |
    | minimum open interest | -100 | Open interest floor cannot be negative |
    | max spread %       | 0     | Max spread must be between 1% and 50% |

Scenario: IV-rank floor is optional and off by default
  Given the IV-rank floor toggle is off
  When the trader screens
  Then candidates are not excluded for low IV rank
  And when the trader enables the floor at 30, candidates below IVR 30 drop out of the ranked list

Scenario: Price ceiling is optional and off by default
  Given the price-ceiling toggle is off
  When the trader screens
  Then candidates are not excluded by underlying price
  And when the trader enables the ceiling at $75, candidates whose underlying trades above $75 drop out

Scenario: Dismissing the sheet discards unsaved edits
  Given the trader changed the delta band to 0.15–0.20 without saving
  When the trader clicks Cancel, the close button, or the scrim
  Then the sheet closes
  And the persisted criteria are still 0.20–0.30
  And the results are not re-screened
  And reopening the sheet shows 0.20–0.30

Scenario: Reset to defaults
  Given the trader saved a delta band of 0.15–0.20
  When the trader opens the sheet and clicks "Reset to defaults"
  Then every field returns to its shipped default
  And nothing is persisted until "Save & re-screen" is clicked

Scenario: Settings does not own screening criteria
  When the trader opens Settings
  Then no screening-criteria section is shown
  And the alert defaults and broker credentials sections are unchanged
```

---

## Technical Notes

- **Surface:** a right-hand sheet on the Screener page, built from `src/renderer/src/components/ui/Sheet.tsx` (`SheetOverlay` / `SheetPanel` / `SheetHeader` / `SheetBody` / `SheetFooter`) and portalled via `getSheetPortal()`, matching `AssignmentSheet` / `RollCspSheet` / `CallAwaySheet` / `CloseCcEarlySheet`. `SheetOverlay` is already `left-[200px]`, which keeps the sidebar reachable.
- **Panel width 460px**, not the 400px `SheetPanel` default — the paired min/max inputs plus the Off/On toggles don't fit comfortably at 400.
- **Storage is unchanged:** the same settings store used for the global alert thresholds (US-57). Renderer-first Zod validation mirrored by Zod-backed IPC validation with matching bounds (the alert-thresholds pattern). Moving the surface must not fork the schema.
- **Form:** React Hook Form + `zodResolver`, per the renderer form rule. The schema uses `.default()`, so input ≠ output — use the 3-generic `useForm` and `reset` in the mutation's `onSuccess`.
- Delta band and DTE window are paired min/max inputs with cross-field validation (min < max), which gates the footer's primary action.
- Earnings handling is an enum: `exclude` (default) or `flag`. The IV-rank floor and the price ceiling are both optional numerics that default to **disabled** — a fixed dollar ceiling is a per-account buying-power preference, and defaulting it on would silently hide large-cap optionable names (AAPL, MSFT, SPY) out of the box; a low IV-rank floor would empty results in a low-vol regime.
- **Saving re-screens.** The primary action is `Save & re-screen`: persist, close the sheet, then invalidate the `screener:results` query so the table behind the sheet refreshes. This is the behavioural payoff of co-locating the form with the results.
- **Three entry points, one sheet:** the `⚙ Criteria` header button, the criteria summary strip above the results, and the empty card's action. The summary strip does double duty — it shows what is currently filtering while the trader reads the results.
- **US-66 copy changes.** The empty card currently reads "Loosen your delta band or DTE window in Screener settings" with no action; this story replaces that with an in-place **Adjust criteria** button (`ScreenerPage.tsx` / `ScreenerStateCard`). The dangling reference to a settings destination goes away.
- The scorer (US-65) reads these persisted criteria; a single criteria object flows to the engine so the settings, the results, and the promote pre-fill never drift. The `criteria` override on `screenWatchlistCandidates` (defaulting to `DEFAULT_SCREENING_CRITERIA`) is the seam this story fills.
- **Assumption — dismissal discards silently.** Cancel / close / scrim throw away unsaved edits with no confirmation, consistent with every existing sheet. If criteria editing should warn on dirty dismissal, that is a deliberate divergence from the established pattern and needs to be called out before build.

---

## Out of Scope

- Multiple named criteria presets / profiles
- Per-ticker criteria overrides
- PMCC screening criteria (Epic 09)
- Sector-correlation limits and buying-power-based ceilings (future)
- A confirm-on-dirty-dismiss prompt (see the assumption above)

---

## Dependencies

- US-65: the scorer consumes the persisted criteria
- US-66: the Screener page hosts the sheet, and its empty-state copy changes

---

## Estimate

3 points

## Mockup

`mockups/us-67-screening-criteria-sheet.mdx` — states: `entry`, `default`, `invalid`, `optional`, `saved`.

Superseded: `mockups/us-67-screening-defaults.mdx` (the original Settings-page placement).
