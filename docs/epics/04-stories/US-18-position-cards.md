# US-18: Display positions as a card grid with live price, option mark, P&L and action strip

**As a** wheel trader managing multiple active positions,
**I want to** see every position as a card that carries its live price, option mark, unrealized P&L and any open action state,
**So that** I can tell at a glance which position needs me today without reading across a ten-column row.

---

## Reconciliation note (2026-10-24)

This story was written before Epic 06 shipped live prices and before Epic 07 shipped the
management queue, and it described a static card (ticker, phase, strike, DTE, premium, basis)
with a `DashboardPage` route switch and an optional surviving table. None of that matches the
app today: the positions list is a ten-column table with live price, option mid, P&L, TARGET
badge and Expiring-soon flag (US-32, US-33, US-61), and a PMCC row sits in it (US-101).

US-108 (Linear OPT-16) pulls this story forward as its blocking prerequisite and rejects a
mixed table-plus-card dashboard. The card design it needs is the `WheelCard` and
`PositionsGrid` in `mockups/epic-09-pmcc-dashboard.mdx`, whose "Which story owns what" table
assigns the grid, the wheel card with every live cell and the wheel action strip to this
story. The acceptance criteria below are rewritten against that mockup. The original
`mockups/us-18-position-cards.mdx` is design history only.

What changed: every live column the table has today becomes a card cell; the wheel action
strip (the queue's own rows for that position) is added; the PMCC row becomes a minimal card
in the same shell so the grid has one presentation; the route stays `/` on
`PositionsListPage`; the table is removed, not kept as an alternate view; US-24's
click-to-navigate is absorbed because the row already navigates today.

---

## Context

The dashboard positions list is the app's home screen. Every wheel reads the same way: ticker
and phase, live price, the open option's mid and unrealized P&L, strike, expiration, DTE,
premium collected, cost basis. Ten table columns hold that for a wheel but cannot hold a PMCC's
two legs, and a card sitting between table rows would give the dashboard two presentations.
So the dashboard becomes one card grid. This story supplies the grid, the shared card shell and
primitives, and the wheel card; US-108 adds the PMCC card variant to the same grid.

A wheel card has three regions. The header answers "which position, what state, what price".
The body is the unrealized P&L as the big figure and one leg block for the open option. The
footer is the two ledger figures that never depend on a quote. An **action strip** at the top
of the card carries the position's open management-queue rows, so the card and the queue say
the same thing in the same words.

---

## Acceptance Criteria

```gherkin
Background:
  Given the valuation date is 2027-08-13 in America/New_York
  And the management window is the 21-DTE default and the profit target the 50% default
  And these positions exist:
    | ticker | phase          | option | strike  | expiration | dte | contracts | fill | premium_collected | basis_per_share | status |
    | MSFT   | CC_OPEN        | CALL   | 430.00  | 2027-08-23 | 10  | 1         | 2.80 | 280.00            | 402.40          | ACTIVE |
    | AAPL   | CSP_OPEN       | PUT    | 180.00  | 2027-09-12 | 30  | 1         | 3.50 | 350.00            | 176.50          | ACTIVE |
    | NVDA   | HOLDING_SHARES | —      | —       | —          | —   | 1         | —    | 640.00            | 118.60          | ACTIVE |
    | TSLA   | WHEEL_COMPLETE | —      | —       | —          | —   | 1         | —    | 1240.00           | 236.40          | CLOSED |
  And the stock quotes are MSFT $421.50, AAPL $182.45, NVDA $128.30
  And the MSFT call is quoted $1.75 × $1.85 and the AAPL put $2.55 × $2.65
  And the alert engine has evaluated active positions

Scenario: The dashboard is one card grid, not a table
  When the trader views the dashboard
  Then the Active section renders one card per active position and no table header row
  And the cards sit in a responsive multi-column grid that reflows to a single column on a narrow window
  And the Closed section renders the TSLA card muted beneath it

Scenario: The card header names the position, its phase and its live price
  When the trader views the dashboard
  Then the AAPL card header shows the ticker, the CSP_OPEN phase badge, the price $182.45 and "30d to expiration"
  And an "Open ↗" link to the position detail page sits at the far right of the header
  And the card's left edge takes the phase colour

Scenario: Unrealized P&L is the card's big figure with its share of max profit
  When the trader views the dashboard
  Then the AAPL card reads "+$90.00" in green with "+25.7% of max profit", computed as ($3.50 − $2.60) × 100
  And the MSFT card reads "+$100.00" in green with "+35.7% of max profit"

Scenario: Unrealized P&L is red when the option has gained value
  Given the AAPL put is quoted $5.10 × $5.30
  When the trader views the dashboard
  Then the AAPL card reads "-$170.00" in red with "-48.6% of max profit"

Scenario: The leg block shows the open option
  When the trader views the dashboard
  Then the AAPL leg block is tagged P and reads $180.00 put · 2027-09-12 · 30d · mid $2.60 · $3.50 credit
  And the MSFT leg block is tagged C and reads $430.00 call · 2027-08-23 · 10d · mid $1.80 · $2.80 credit

Scenario: A position holding shares shows a placeholder leg and no P&L
  When the trader views the dashboard
  Then the NVDA leg block reads "no option leg open — sell a covered call" with "—" for DTE and mid
  And the NVDA P&L reads "—" with "no option leg open"
  And the NVDA header reads "shares held · no option leg" beneath the price

Scenario: The TARGET badge fires when the leg reaches the profit target
  Given the MSFT call is quoted $1.25 × $1.35
  When the trader views the dashboard
  Then the MSFT card header shows the gold TARGET badge with the existing tooltip, because ($2.80 − $1.30) / $2.80 = 53.6% reaches 50%
  And the AAPL card shows no TARGET badge
  And no action strip is produced by the profit target

Scenario: DTE inside 7 days is gold with the Expiring-soon flag
  Given the MSFT call expires 2027-08-17, 4 days out
  When the trader views the dashboard
  Then the MSFT leg block's DTE reads 4d in gold and the header carries the existing "Expiring soon" flag
  And the AAPL DTE reads 30d without emphasis and no flag

Scenario: A wide spread marks the mid and an unavailable snapshot blanks it
  Given the AAPL put is quoted $0.50 × $1.50 and no snapshot is returned for the MSFT call this poll
  When the trader views the dashboard
  Then the AAPL mid $1.00 carries the gold ⚠ with the tooltip "Wide spread: $0.50 × $1.50 — P&L may be unreliable"
  And the MSFT mid reads "— unavailable" and the MSFT P&L reads "—" with "unavailable"
  And the MSFT premium collected and cost basis are unchanged

Scenario: The footer shows the two ledger figures
  When the trader views the dashboard
  Then the AAPL footer reads Cost basis $176.50 "/ share" and Premium collected $350.00 "to date"
  And the NVDA footer reads Cost basis $118.60 and Premium collected $640.00

Scenario: The management-window row rides on the card as a gold action strip
  When the trader views the dashboard
  Then the MSFT card carries a gold action strip reading "◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close", the queue's own summary
  And the MSFT leg block takes the gold tint, a gold left border and the ◷ mark with the same sentence as its tooltip
  And the MSFT card's left edge is gold instead of the CC_OPEN phase colour
  And the AAPL card has no strip, no leg highlight, and keeps the CSP_OPEN edge, because 30 DTE is outside the window

Scenario: The expiration-imminent row leads as EXPIRING
  Given the MSFT call expires 2027-08-17, 4 days out
  When the trader views the dashboard
  Then the MSFT strip is gold and reads "◷ EXPIRING · Expires in 4 days at $430.00 strike"
  And no MANAGEMENT WINDOW row is listed, because the two DTE rules are exclusive

Scenario Outline: Strike proximity on a put leads as ▲ STRIKE PROXIMITY in the queue's words
  Given AAPL trades at <price>
  When the trader views the dashboard
  Then the AAPL strip is <colour> and reads "▲ STRIKE PROXIMITY · <summary>"
  And the AAPL leg block takes the <colour> tint and the ▲ mark, and the card's left edge is <colour>

  Examples:
    | price   | colour | summary                                                            |
    | $181.40 | gold   | Stock is 0.8% above the $180.00 put strike                         |
    | $178.90 | red    | Stock is 0.6% below the $180.00 put strike — now in the money      |

Scenario: A covered-call breach leads as ▲ CALL BREACHED in red
  Given MSFT trades at $435.20
  When the trader views the dashboard
  Then the MSFT strip is red and reads "▲ CALL BREACHED · Stock is 1.2% above the $430.00 call strike — shares may be called away"
  And the strip carries a +1 chip whose tooltip lists "◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close"
  And the MSFT leg block takes the red tint and the marks ▲ ◷, and the card's left edge is red

Scenario: Several open rows show the worst first with the rest on a +N chip
  Given the MSFT call expires 2027-08-17, 4 days out, and MSFT trades at $435.20
  When the trader views the dashboard
  Then the strip reads "▲ CALL BREACHED · …" with a +1 chip listing "◷ EXPIRING · Expires in 4 days at $430.00 strike"
  And the lane order is ▲ red › ▲ gold › ◷ EXPIRING › ◷ MANAGEMENT WINDOW, shared with the PMCC card (US-108)

Scenario: A dismissed row does not ride on the card
  Given the trader dismissed the MSFT MANAGEMENT_WINDOW alert
  When the trader views the dashboard
  Then the MSFT card shows no strip, no leg highlight, and the CC_OPEN edge
  And the leg block still reads 10d, because the strip mirrors the queue and the DTE does not

Scenario: The whole card navigates to the detail page
  When the trader clicks anywhere on the AAPL card, its ticker, or its "Open ↗" link
  Then the AAPL position detail page opens

Scenario: A pending assignment keeps its indicator on the card
  Given a pending assignment notification exists for AAPL
  When the trader views the dashboard
  Then the AAPL card header shows the pulsing gold "Assignment pending" indicator beside the ticker

Scenario: A closed position sits in the Closed section without live figures
  When the trader views the dashboard
  Then the TSLA card is muted, shows the WHEEL_COMPLETE badge, "closed" beneath a "—" price, and "closed — no live marks" beneath a "—" P&L
  And its leg block reads "wheel complete" with dashes
  And it shows no strip, no TARGET badge, no Expiring-soon flag, and keeps Cost basis $236.40 and Premium collected $1,240.00

Scenario: Cards keep the list's sort order
  When the trader views the dashboard
  Then the Active section lists MSFT (10d), then AAPL (30d), then NVDA (no option leg)

Scenario: A PMCC renders as a minimal card in the same shell until US-108
  Given XYZ is a PMCC with a $80.00 LEAPS expiring 2028-01-21 and a $118.00 short call expiring 2027-08-20
  When the trader views the dashboard
  Then the XYZ card shows the PMCC badge, the state "LEAPS + short call open" and the live price
  And it shows one leg block per open leg with strike, expiration and DTE, each mid reading "—"
  And its P&L reads "—", its footer shows the running cost basis, and it carries no strip, no TARGET badge and no Expiring-soon flag
  And it never shows a wheel phase badge
```

---

## UI

The card (`WheelCard` in `mockups/epic-09-pmcc-dashboard.mdx`):

- **Shell:** rounded surface, `border-l-2` in the phase colour; while any action row is open,
  `border-l-4` in the worst row's tone. Closed cards at 50% opacity. Whole card clickable;
  `data-testid="position-card"` / `position-card-closed` as today.
- **Action strip:** full-width band above the header: 16px glyph, bold status word, `· summary`.
  Status words: `STRIKE PROXIMITY` (▲, red when the put is in the money, gold otherwise),
  `CALL BREACHED` (▲ red), `EXPIRING` (◷ gold), `MANAGEMENT WINDOW` (◷ gold). The summary is
  the queue row's text verbatim. More than one row: worst first by lane order (▲ red 1 › ▲ gold 2
  › EXPIRING 4 › MANAGEMENT WINDOW 5, the numbers shared with US-108's ✕ 0 / ◆ 3), the rest on a
  `+N` chip whose tooltip lists them one per line as `glyph WORD · summary`. `PROFIT_TARGET`
  never produces a strip; it keeps the TARGET badge.
- **Header:** ticker (link), `PhaseBadge`, `TargetBadge`, `ExpiringSoonFlag`, the pending
  assignment indicator (US-35), then right-aligned price over `Nd to expiration` /
  `shares held · no option leg` / `closed`, and the `Open ↗` link.
- **Body:** eyebrow `Unrealized P&L`, 2xl signed figure in the P&L tone, sub-line
  `+25.7% of max profit` / `unavailable` / `no option leg open` / `closed — no live marks`.
  One leg block: `P`/`C` tag (tooltip "Cash-secured put" / "Covered call"), any action glyphs,
  `$180.00 put · 2027-09-12`, DTE (gold inside 7 days), `mid` with the wide-spread ⚠ or
  `— unavailable`, `· $3.50 credit`. Highlighted: tone tint and a 3px tone-coloured left
  border. HOLDING_SHARES: `·` tag and the placeholder text.
- **Footer:** two cells on the elevated background: `Cost basis` `$176.50` `/ share` and
  `Premium collected` `$350.00` `to date`.
- **Grid:** `Active` / `Closed` section headers as today; `repeat(auto-fill, minmax(400px, 1fr))`
  with a 12px gap inside the page's 24px gutter.

---

## Technical Notes

- **No migration; one additive IPC field.** `positions:list` already carries everything the wheel
  card shows. `alerts:list`'s `ManagementQueueItem` gains `ruleCode` (from `alerts.rule_code`,
  already stored) so the card can map a queue row to its glyph and status word without parsing
  the summary. (Planning note 2026-10-24: the queue item had no rule code; a text match on the
  summary was rejected as fragile.)
- **Components.** `PositionsGrid` replaces `PositionTable` in `PositionsListPage` and branches
  per item on `strategyType` to `WheelCard` or the minimal `PmccCard` (which US-108 replaces).
  Shared primitives in `src/renderer/src/components/position-card/`: `CardShell` (accent,
  edge tone, muted, clickable), `ActionStrip` (takes a plain ranked list of
  `{ glyph, statusWord, tone, summary }`), `LegBlock` (tag, marks, title, DTE, mark, trailing
  slot, highlight tone), `CardFooterCell`. `PositionRow`, `PmccPositionRow`,
  `positionRowStyles.ts` and the `wb-position-row` CSS are deleted; `OptMidCell` and
  `UnrealizedPnlCell` are table cells and are replaced by the leg block and the P&L figure,
  reusing `isWideSpread` / `hasNoBid` / `formatPnlPercentForDisplay` and `computeUnrealizedPnl`
  unchanged.
- **Action rows come from the queue, not from re-evaluated predicates.** The page already
  calls `useManagementQueue`; the grid groups `ManagementQueueItem`s by `positionId` and hands
  each wheel card its rows minus `PROFIT_TARGET`. A pure `rankWheelActions(rows, { price,
strike, instrumentType })` in `src/renderer/src/lib/card-actions.ts` maps rule codes to
  glyph / status word / tone / rank; the `STRIKE_PROXIMITY` tone is red when the quote is below
  the put strike. Dismissed rows are absent from the queue and so from the strip. (US-108's PMCC
  strip is a live derivation; the two cards share `ActionStrip` and the lane numbers, not the
  data source.)
- **Preserve every test id**: `position-card`, `position-card-closed`, `position-ticker`,
  `position-card-{T}-price`, `position-card-{T}-opt-mid`, `position-card-{T}-pnl`,
  `target-badge`, `expiring-soon-flag`, `opt-mid-spread-warning`,
  `pending-assignment-indicator-{id}`. New: `action-strip` (`data-tone`), `leg-block`
  (`data-action`), `data-edge` on the shell.
- **E2E impact.** `e2e/option-pnl.spec.ts` AC-1 asserts a `thead th` named `Opt Mid`; that
  assertion is replaced by the leg block's mid. Every other list spec selects by test id and
  stays green.
- **Tailwind + `wb-*` tokens only**; the mockup's inline styles are viewer portability.
- **DTE** stays the service's `dte`; never slice a timestamp.

---

## Out of Scope

- The full PMCC card (US-108): position-level P&L, two-leg valuation, signals, tier 2.
- Portfolio summary bar (US-19), phase filter (US-20), sort controls (US-21), distance
  indicator (US-22), empty state (US-23, already shipped as part of US-2).
- Live re-evaluation of alert predicates on the card; the strip mirrors the queue.
- Any change to the management queue, alert rules or dismissal.

---

## Dependencies

- US-2 (list, sections, sort), US-32 (live price), US-33 (option mid, P&L, TARGET, wide
  spread), US-35 (pending assignment indicator), US-51 / US-59 (queue rows and dismissal),
  US-61 (Expiring-soon flag), US-101 / US-105 (PMCC list item with `long` / `short`) — all
  shipped.
- Blocks US-108 (Linear OPT-16).

## Estimate

8 points

## Mockup

- `mockups/epic-09-pmcc-dashboard.mdx` — `WheelCard`, `PositionsGrid`, `ActionStrip`,
  `CardShell`; the wheel cards on every preset. Render with `pnpm mockups`.
- `mockups/us-18-position-cards.mdx` — the 2026 pre-live-prices design; history only.
