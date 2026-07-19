# US-96: View the watchlist with live prices and a Signal verdict

**As a** wheel trader scanning my bench for a good entry,
**I want** each watchlist row to show its live price, IV-rank, and earnings, plus a single Signal verdict comparing my conditions to those live values,
**So that** I can tell at a glance which names are worth pulling a chain for — without tabbing out to my broker or doing the math myself.

---

## Context

The watchlist (US-63) is where a trader decides _which_ names to screen, and each entry carries the conditions they're waiting for (US-63/US-69). This story is where that pays off: the list shows live market context — is implied vol rich enough to sell premium (IV-rank), where is price relative to the would-own level, is earnings about to gap the stock — and collapses each entry's conditions-versus-reality into one **Signal** chip. That turns a static bench into a live one, so a shifting thesis is visible without leaving Wheelbase.

Live data comes from the market-data adapter — price (US-32) and IV-rank (US-44) — and the earnings-calendar dependency (shared with US-70); **never** from the chain provider. The Signal is a pure comparison of stored conditions against that snapshot; it is informational for entry timing and is **not** a screener ranking input. Per the alert failure-isolation rule, a provider outage degrades a single cell/Signal rather than blanking the row.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the Watchlist page
  And today is 2026-07-19

Scenario: Show last price with the 1-day change
  Given AAPL last traded at $178.40, up 0.8% on the day
  When the trader views the AAPL row
  Then the row shows "$178.40"
  And a green "▲ 0.8%" beneath it

Scenario: A down day is shown in red
  Given MSFT last traded at $505.10, down 1.2% on the day
  When the trader views the MSFT row
  Then the row shows a red "▼ 1.2%"

Scenario: IV-rank is colored to match the entry thresholds
  When the trader views the watchlist
  Then an IV-rank of 34 is shown in the "acceptable" color (gold)
  And an IV-rank of 58 is shown in the "rich" color (green)
  And an IV-rank of 22 is shown in the "thin" color (muted)

Scenario: A row shows its entry-condition tags
  Given AAPL has the conditions "Would own below $170" and "Wait for high IV, IVR ≥ 50"
  When the trader views the AAPL row
  Then the row shows the condition tags "≤ $170" and "IVR ≥ 50"

Scenario: Signal reports the primary unmet gate and lists the rest
  Given AAPL has conditions "Would own below $170" and "Wait for high IV, IVR ≥ 50"
  And AAPL last traded at $178.40 with an IV-rank of 34
  When the trader views the AAPL row
  Then the Signal chip shows "4.9% away"
  And a secondary "+ IV low" is shown beneath it

Scenario: Signal is IV low when price is met but IV is not
  Given AAPL has conditions "Would own below $185" and "Wait for high IV, IVR ≥ 50"
  And AAPL last traded at $178.40 with an IV-rank of 34
  When the trader views the AAPL row
  Then the Signal chip shows "IV low"

Scenario: Signal is Entry ready when all conditions are met
  Given KO has an IV-rank of 58 and the condition "Wait for high IV, IVR ≥ 40"
  And KO has no would-own price condition
  When the trader views the KO row
  Then the Signal chip shows "Entry ready"

Scenario: A ticker with no conditions shows No thesis
  Given NVDA has no entry conditions set
  When the trader views the NVDA row
  Then the Signal chip shows "No thesis"

Scenario: Post-earnings gate blocks the Signal while earnings is near
  Given MSFT has the "Post-earnings only" condition
  And MSFT reports earnings in 3 days
  When the trader views the MSFT row
  Then the Signal chip shows "Earnings 3d"

Scenario: Earnings within the window flags any name, regardless of conditions
  Given NVDA reports earnings in 5 days
  And NVDA has no "post-earnings only" condition set
  When the trader views the NVDA row
  Then the row shows an amber "⚠ ER 5d" warning

Scenario: No earnings warning when the report is outside the window
  Given KO's next earnings is 40 days out
  When the trader views the KO row
  Then no earnings warning is shown

Scenario: Unknown earnings date surfaces a caution, not a silent pass
  Given the earnings calendar has no date for XYZ
  When the trader views the XYZ row
  Then the row shows an "ER —" caution
  And it is not treated as having no upcoming earnings

Scenario: Live data unavailable degrades the cell, not the row
  Given the market-data provider is unreachable during refresh
  When the trader views the watchlist
  Then each affected row shows "—" for price and IV-rank
  And the row itself still renders with its ticker and thesis
  And the header freshness pill reflects the stale/closed state

Scenario: IV-rank unavailable for a thin-history name
  Given GME has insufficient IV history to compute a rank
  When the trader views the GME row
  Then the IV-rank cell shows "—" rather than a misleading 0
```

---

## Technical Notes

- Source live price via the market-data adapter (US-32) and IV-rank via the IVR snapshot store (US-44). Earnings dates come from the **earnings-calendar dependency** (shared with US-70) behind its own adapter — the chain/quote provider is never the attributed source for earnings.
- Derive the Signal in a **pure function** (mirrors the `deriveSignal` helper in the mockup) that takes the stored conditions plus the live snapshot and returns `{ label, tone, secondary }`. No I/O in the derivation — keep it in `src/main/core/` style, callable from both the row render and any future alerting.
- Signal precedence: earnings gate (if within window) → all-met "Entry ready" → primary unmet gate (price distance, then IV) with the remaining unmet gate(s) listed as the `secondary`.
- IV-rank color tiers (muted `< 30`, gold `30–49`, green `≥ 50`) must share one helper with the condition presets (US-63/US-69) so the column color and the trigger thresholds can't drift.
- Compute earnings-in-window with `date-fns` against today (not string slicing); default window ~7 days for the row badge (distinct from the US-70 screener rule of earnings ≤ expiry).
- Reuse `MarketStatusPill` for freshness on the list header — do not invent a per-row timing indicator.
- Follow batch/refresh failure isolation: a market-data or earnings-calendar outage degrades the affected cell/Signal to `—`/caption and never suppresses the other rows.

---

## Out of Scope

- Creating, editing, or removing entries and their conditions (US-63 / US-69) — this story only reads and displays them.
- Scoring or ranking the watchlist (US-65) — the Signal is informational, not a ranking input.
- The screener-results earnings exclude/flag behavior (US-70) — a different surface with different logic.
- Historical price/IVR charts or trends — a single current snapshot only.
- Alerting/notifying when a Signal flips to "Entry ready" (future — the pure derivation is designed to support it, but no alert is delivered here).

---

## Dependencies

- US-63: entries and their stored conditions to display
- US-69: edited conditions/thesis are reflected on the next view
- US-32: live underlying price
- US-44: IV-rank snapshot store
- External: earnings-calendar data source (shared with US-70; unowned — flagged as an epic dependency)

---

## Estimate

8 points

## Mockup

Covered by the US-63 watchlist-manager mockup (`mockups/us-63-watchlist-manager.mdx`) — the `list` state shows the Price, IVR, and earnings columns, the condition tags, and the derived Signal chip (including the multi-gate `+ IV low` secondary).
