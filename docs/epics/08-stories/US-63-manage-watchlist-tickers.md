# US-63: Create and remove watchlist entries

**As a** wheel trader building my bench of candidates,
**I want to** add a ticker — optionally with a thesis and the entry conditions I'm waiting for — and remove ones I no longer track,
**So that** the screener has a stable, curated universe and every entry carries why it's on my bench.

---

## Context

The wheel starts with picking an underlying you're willing to own. Traders keep a short bench of candidate tickers — names they've researched, would accept assignment on, and want to watch for a good premium-selling entry. This story is the foundation of the watchlist: the **entry** is the unit, and it's more than a symbol — it carries an optional free-text thesis and the structured conditions the trader is waiting for (would-own price, IV-rank trigger, post-earnings gate, core-holding). Capturing them at create time makes the bench meaningful immediately.

This story owns **creating** and **removing** entries. Editing an existing entry is US-69; the live price / IV-rank / earnings values and the derived Signal shown on the list are US-96. Keep it a curated bench, not a market scanner.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the Watchlist page

Scenario: Add a ticker to the watchlist
  Given the watchlist contains AAPL and MSFT
  When the trader adds "NVDA"
  Then NVDA appears in the watchlist
  And the watchlist shows 3 tickers

Scenario: A newly added ticker appears at the top of the list
  Given the watchlist contains AAPL and MSFT
  When the trader adds "NVDA"
  Then NVDA is the first row in the watchlist

Scenario: Create an entry with a thesis and entry conditions
  Given the watchlist is empty
  When the trader adds "PLTR" with the thesis "Would own below $38 after the run-up"
  And sets the condition "Would own below" to $38.00
  And sets the condition "Wait for high IV" to IVR ≥ 50
  Then PLTR appears with the note "Would own below $38 after the run-up"
  And the row shows the condition tags "≤ $38" and "IVR ≥ 50"

Scenario: Conditions and thesis are optional
  Given the watchlist is empty
  When the trader adds "NVDA" with no thesis and no conditions
  Then NVDA is created
  And its row carries no condition tags

Scenario: Ticker symbols are normalized to uppercase
  Given the watchlist is empty
  When the trader adds "nvda"
  Then the watchlist shows "NVDA"

Scenario: Reject a duplicate ticker
  Given the watchlist already contains AAPL
  When the trader adds "AAPL"
  Then a validation error appears: "AAPL is already on the watchlist"
  And the watchlist still shows AAPL only once

Scenario: Reject an empty or malformed symbol
  Given the trader is on the Watchlist page
  When the trader adds "<value>"
  Then a validation error appears: "<message>"
  And no ticker is added

  Examples:
    | value    | message                              |
    |          | Enter a ticker symbol                |
    | 12345    | Enter a valid ticker symbol          |
    | AB CD    | Enter a valid ticker symbol          |

Scenario: Remove a ticker from the watchlist
  Given the watchlist contains AAPL and MSFT
  When the trader removes AAPL
  Then AAPL no longer appears in the watchlist
  And the watchlist shows MSFT only

Scenario: Empty watchlist shows guidance
  Given the watchlist has no tickers
  When the trader opens the Watchlist page
  Then an empty state explains that adding tickers enables the screener
```

---

## Technical Notes

- `watchlist` table keyed by normalized ticker; columns: `ticker`, `added_at`, `notes` (nullable, 500-char bound reused from `newWheelSchema.thesis`), and the structured conditions `own_below_price`, `ivr_trigger` (nullable numerics), `post_earnings_only`, `core_holding` (booleans, default false).
- Reuse the existing `tickerSchema` from `src/renderer/src/schemas/common.ts` so the watchlist and the new-wheel form enforce the same symbol rules.
- IPC: `watchlist:list`, `watchlist:add`, `watchlist:remove`, each through `handleIpcCall`. `add` accepts the optional thesis + conditions in one payload.
- The add form is the shared add/edit surface — editing an existing entry (US-69) reuses it with the ticker fixed.
- Conditions are informational (they drive the Signal in US-96); they are **never** a screener ranking input.
- Adding a ticker does **not** validate that the symbol is optionable or even real at add-time — that surfaces later when the screener pulls chains (US-64), which marks unresolvable symbols "data unavailable" rather than blocking the add.
- Removing a ticker only removes it from the screener universe; it never touches open positions or trade history for that symbol.

---

## Out of Scope

- Editing an existing entry's thesis or conditions (US-69)
- Live price / IV-rank / earnings values and the derived Signal on the list (US-96)
- Pulling option chains or screening (US-64+); promoting to a wheel (US-68)
- Bulk import / CSV upload of tickers
- Validating that the symbol is optionable at add-time

---

## Dependencies

- None (foundation story for the watchlist)
- US-69 shares the add/edit form (soft; either can ship first)

---

## Estimate

5 points

## Mockup

`mockups/us-63-watchlist-manager.mdx` — the `add`, `duplicate`, and `empty` states. The same shared mockup also depicts editing (US-69) and the live columns + Signal (US-96); only create/remove/validation/ordering belongs to US-63.
