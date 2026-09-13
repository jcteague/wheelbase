# US-96: One live bench — the watchlist and screener on a single page

**As a** wheel trader scanning my bench for a good entry,
**I want** one Watchlist page that shows every name I'm watching with its live price and an aged IV rank, sorts the bench into the names that meet my criteria today and the names I'm still waiting on, and lets me review one stock's thesis, condition checks, and matching put in place,
**So that** I can tell at a glance which names are worth opening a wheel on — and act on one — without hopping between a watchlist and a screener or tabbing out to my broker.

---

## Context

Epic 08 shipped the bench in two halves. The Watchlist page (US-63) holds the names and the conditions the trader is waiting for; the Screener page (US-65–US-68, US-70) pulls chains for those names and ranks the best put per ticker. Reading the bench therefore meant reading two pages and doing the join in your head: _is this name in the ranked list, and does it also satisfy my own entry conditions?_

This story folds the two into **one page at `/watchlist`**, following the concept-B mockup. The screener's ranked candidates and the watchlist's entry conditions are combined per stock into a single verdict:

- **Meets criteria** — every saved stock condition passes on a **usable** IV reading _and_ the screener found a qualifying put. Cards are ordered by the screener's rank.
- **Stocks of interest** — everything else, each carrying the reason it is held back: an unmet price or IV condition, an earnings gate, an unusable IV reading, or the screener's verbatim exclusion reason.

Selecting any card opens a **stock detail** panel: last price and day change, the IV rank beside its freshness ring, the thesis, each entry condition with its verdict, the earnings date, and — for a name that meets criteria — the matching put's metrics with a **Review trade** action that hands off to the pre-filled new-wheel form (US-68). The screening-criteria sheet (US-67), refresh, and add-stock form (US-63) live in this page's header. The standalone Screener page and its nav item are retired.

IV rank gets the treatment US-98 designed but did not ship: a **freshness ring** whose fill steps down by tier (fresh, aging, stale, expired, predates-earnings) with a tooltip explaining what the reading can and cannot decide. The rule that ties it all together is US-98's: **an unusable reading is an unknown, and an unknown never decides anything** — it cannot satisfy an `IVR ≥ N` condition, so a stale-rich reading can never promote a name into Meets criteria.

Live price comes from the market-data adapter, IV rank from the IVR snapshot store (aged through the US-98 freshness engine), earnings from the shared earnings-calendar store (US-70) — never from the chain provider. Per the failure-isolation rule, a provider outage degrades a cell or a verdict, never a row.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader is on the Watchlist page
  And today is Wednesday 2026-09-09 at 10:42 CT, and the last completed session was Tuesday 2026-09-08
  And the screening criteria are the shipped defaults
  And the watchlist holds KO, XLF, PEP, DIS, ORCL, AAPL, MSFT, AMD, and XYZ

# ── One page ───────────────────────────────────────────────────────────────

Scenario: The screener lives on the Watchlist page
  When the trader looks at the sidebar
  Then there is a Watchlist entry and no Screener entry
  And the Watchlist page header offers "Screening criteria", "Refresh", and "Add stock" actions
  And the header shows the market-status pill

Scenario: A stock that passes its conditions and has a qualifying put meets criteria
  Given KO has the condition "IVR ≥ 40" and a fresh IV rank of 58
  And the screener ranks a KO $60 put expiring Oct 16 at a 1.58% period yield
  When the trader views the page
  Then KO is listed under "Meets criteria"
  And the KO card reads "$60.00 put · Oct 16 · 1.58% yield"

Scenario: Meets-criteria cards follow the screener's rank order
  Given KO and XLF both meet criteria
  And the screener ranks KO above XLF by yield-per-delta
  When the trader views "Meets criteria"
  Then KO is the first card and XLF the second

Scenario: A stock with no personal conditions meets criteria on the screening defaults alone
  Given XLF has no entry conditions
  And the screener ranks an XLF put
  When the trader views the XLF card
  Then XLF is listed under "Meets criteria" with the verdict "Screening criteria met"

Scenario: The detail panel shows the matching put and a Review trade action
  Given KO meets criteria with a $60 put, Oct 16, 37 DTE, mark $0.95, delta 0.22, open interest 1,800, spread $0.06 (6%)
  When the trader selects the KO card
  Then the detail panel shows "$60.00 PUT", "Oct 16 · 37 DTE", mark "$0.95", period yield "1.58%", annualized "15.62%/yr", delta "0.22", open interest "1,800", spread "$0.06 (6%)"
  And it shows "Cash to secure 1 contract: $6000.00"
  And a "Review trade" action is offered

Scenario: Review trade hands off to the pre-filled new-wheel form
  Given KO meets criteria and carries the thesis "Core wheel"
  When the trader selects KO and clicks "Review trade"
  Then the new-wheel form opens pre-filled with ticker KO, strike 60, expiration Oct 16, premium 0.95, contracts 1
  And the thesis field reads "Core wheel"
  And no position has been created

Scenario: The first meets-criteria stock is selected by default
  When the page first loads with KO ranked first
  Then the detail panel shows KO

# ── Price ─────────────────────────────────────────────────────────────────

Scenario: Show last price with the day change
  Given AAPL last traded at $178.40, up 0.8% on the day
  When the trader views the AAPL card and selects it
  Then the card shows "$178.40"
  And the detail panel shows a green day change of "+0.8%"

Scenario: A down day is shown in red
  Given MSFT last traded at $505.10, down 1.2% on the day
  When the trader selects MSFT
  Then the detail panel shows a red day change of "−1.2%"

# ── Condition verdicts ────────────────────────────────────────────────────

Scenario: An unmet price condition and an unmet IV condition are both reported
  Given AAPL has the conditions "Would own below $170" and "IVR ≥ 50"
  And AAPL last traded at $178.40 with a fresh IV rank of 34
  When the trader views the AAPL card
  Then AAPL is listed under "Stocks of interest"
  And the card's reason reads "Price $178.40 above $170 target · IV low"

Scenario: Only the IV condition is reported when the price condition is met
  Given AAPL has the conditions "Would own below $185" and "IVR ≥ 50"
  And AAPL last traded at $178.40 with a fresh IV rank of 34
  When the trader views the AAPL card
  Then the card's reason reads "IV low"

Scenario: The detail panel shows each entry condition with its verdict
  Given AAPL has the conditions "Would own below $170" and "IVR ≥ 50", price $178.40, fresh IV rank 34
  When the trader selects AAPL
  Then the entry conditions show "≤ $170 · not met" and "IVR ≥ 50 · not met"
  And the thesis text is shown beneath "Your thesis"

Scenario: The post-earnings gate holds a stock while earnings is near
  Given MSFT has the "Post-earnings only" condition
  And MSFT reports earnings in 3 days
  When the trader views the MSFT card
  Then MSFT is listed under "Stocks of interest" with the reason "Earnings in 3 days"

Scenario: Earnings within the window is shown for any stock, regardless of conditions
  Given AMD has no "Post-earnings only" condition
  And AMD reports earnings in 5 days
  When the trader selects AMD
  Then the detail panel's earnings line reads "Sep 14 · in 5 days" in the caution color

Scenario: No earnings caution when the report is outside the window
  Given KO's next earnings is 40 days out
  When the trader selects KO
  Then the earnings line shows the date without a caution

Scenario: An unknown earnings date is a caution, not a silent pass
  Given the earnings calendar has no date for XYZ
  When the trader selects XYZ
  Then the earnings line reads "Unknown · needs verification"

Scenario: A stock whose conditions pass but has no qualifying put shows the screener's reason
  Given AMD has the condition "IVR ≥ 50" and a fresh IV rank of 52
  And the screener excluded AMD's closest strike with reason "spread 14% exceeds 10%"
  When the trader views the AMD card
  Then AMD is listed under "Stocks of interest"
  And the card's reason reads "spread 14% exceeds 10%"

# ── IV-rank freshness (US-98 treatment) ───────────────────────────────────

Scenario: A fresh reading shows a full green ring
  Given KO's IV rank of 58 was observed at the previous close
  When the trader views the KO card
  Then the IV rank reads "58" beside a full green freshness ring

Scenario: An aging reading still satisfies an IV condition
  Given KO has the condition "IVR ≥ 40" and its IV rank of 58 was observed 2 trading days ago
  And the screener ranks a KO put
  When the trader views the page
  Then KO is listed under "Meets criteria"
  And the KO IV rank reads "58 · 2d" beside a three-quarter ring

Scenario: A stale reading is muted and cannot satisfy an IV condition
  Given PEP has the condition "IVR ≥ 45" and its IV rank of 58 was observed 6 trading days ago
  And the screener ranks a PEP $150 put
  When the trader views the page
  Then PEP is listed under "Stocks of interest" with the reason "IV too old to judge"
  And the PEP IV rank reads "58 · 6d" muted beside a half-full ring
  And selecting PEP shows the held-back put "$150.00 · Oct 16 · 1.19% yield"

Scenario: A reading that predates earnings cannot satisfy an IV condition
  Given ORCL has the condition "IVR ≥ 50" and an IV rank of 62 observed 1 trading day ago
  And the earnings store records ORCL's last print as the day after that observation
  When the trader views the ORCL card
  Then ORCL is listed under "Stocks of interest" with the reason "IV predates earnings"
  And the ORCL IV rank reads "62" muted beside an empty gold ring

Scenario: An expired reading shows exp and a never-collected ticker shows n/a
  Given DIS's IV rank was observed 12 trading days ago
  And XYZ has never had an IV rank collected
  When the trader views the cards
  Then the DIS IV rank reads "exp" beside a quarter-full ring
  And the XYZ IV rank reads "n/a" with no ring
  And both cards carry the reason "IV unavailable"

Scenario: Hovering the ring explains the reading
  Given PEP's IV rank of 58 was observed 6 trading days ago at the Aug 28 close
  When the trader hovers the PEP freshness ring
  Then a tooltip titled "Stale" reads "6 trading days old", names the Aug 28 observation, and says the reading cannot satisfy an IV condition

# ── Screening criteria, refresh, add ──────────────────────────────────────

Scenario: Screening criteria are edited from the Watchlist page
  When the trader clicks "Screening criteria"
  Then the criteria sheet opens over the page with every field pre-filled
  And the criteria strip above the sections reads "Δ 0.20–0.30 · DTE 30–45 · OI ≥ 500 · Spread ≤ 10% · Earnings Exclude"

Scenario: Saving criteria re-screens the bench in place
  Given KO and XLF meet criteria
  When the trader saves a delta band of 0.15–0.20
  Then the sheet closes, "Screening criteria saved" is shown, and the sections refresh without leaving the page

Scenario: Refresh re-screens the bench
  When the trader clicks "Refresh"
  Then the screener runs again and the sections and prices update

Scenario: Add stock reveals the add form and the new stock joins the bench
  When the trader clicks "Add stock", enters "NVDA", and submits
  Then NVDA appears under "Stocks of interest" after the re-screen
  And the header count increases by one

Scenario: Removing a stock still works from its card
  Given AAPL and MSFT are on the watchlist
  When the trader removes AAPL from its card
  Then only MSFT remains

# ── States ────────────────────────────────────────────────────────────────

Scenario: No stock meets criteria
  Given every ranked put was filtered out by the criteria
  When the trader views "Meets criteria"
  Then it reads "No candidates match your criteria" with an "Adjust criteria" action
  And every stock is listed under "Stocks of interest"

Scenario: Market data unavailable degrades verdicts, not rows
  Given the market-data provider is unreachable during refresh
  When the trader views the page
  Then a "Market data unavailable" notice with a "Retry refresh" action is shown
  And no stock is listed under "Meets criteria"
  And every card still shows its ticker and thesis with the reason "Data unavailable · not evaluated"
  And each price reads "—"
  And IV ranks from the local snapshot store are still shown with their rings

Scenario: Market data not connected points at Settings
  Given no market-data credentials are saved
  When the trader views the page
  Then a "Market data not connected" notice with an "Open Settings" action is shown

Scenario: Stale marks are flagged when the market is closed
  Given the market-status pill reads CLOSED
  When the trader views a bench with meets-criteria stocks
  Then a "Stale snapshot" badge and the quote time are shown in the header

Scenario: An empty watchlist explains itself
  Given the watchlist is empty
  When the trader views the page
  Then the empty-state guidance is shown with the add form
```

---

## Technical Notes

- **One route.** `/watchlist` becomes the combined page; the `/screener` route, `ScreenerPage`, its nav item, and `PAGE_TITLES['/screener']` are removed. The criteria sheet, criteria strip, state cards (`ScreenerStateCard`), and promote handoff (`buildPromoteSearch`) move over unchanged. `ScreenerResultsTable` and `ScreenerExcludedSection` retire — their content is carried by the meets-criteria cards, the detail panel's matching-put block, and the per-card reason.
- **New read-only IPC: `watchlist:snapshot`.** Returns one row per watchlist entry: the entry, the underlying quote (or `null`), the freshness-assessed IV rank (or `null`), the earnings knowledge, and a **verdict** computed in the main process at one request clock. Quotes are fetched per ticker with per-ticker failure isolation; the earnings and IVR reads degrade to unknown-for-everyone. No chain pull — `screener:results` stays a separate, heavier query.
- **Pure verdict engine `src/main/core/watchlist-signal.ts`.** Takes the entry's conditions plus the snapshot values and returns per-gate verdicts — price gate, IV gate, earnings gate — each `met | unmet | unknown | none` with a display label. No I/O, so future alerting can call it. The IV gate follows the US-98 table: usable at/above threshold → met; usable below → unmet "IV low"; `stale` → unknown "IV too old to judge"; `predates_earnings` → unknown "IV predates earnings"; missing/`expired` → unknown "IV unavailable". Precedence when listing reasons: earnings gate, then price, then IV, then the screener's exclusion reason.
- **The join is a pure renderer helper.** `src/renderer/src/lib/bench.ts` merges the snapshot rows with `screener:results` into `{ meets, waiting }`: a stock meets criteria when every gate is `met` or `none` **and** a ranked candidate exists for it; `meets` keeps the screener's rank order. Everything else is waiting, with its reason string built from the unmet/unknown gates and, failing those, the screener's verbatim exclusion reason. This mirrors the `verdict.ts` precedent (pure compute in `lib/`).
- **Expired readings reach the renderer.** The freshness engine gains `expired` as a fifth `IvRankState` carried on an assessed reading (value, observedAt, ageTradingDays) instead of collapsing to `null`. `isUsableState` is unchanged, so the screener engine still never scores on it. `IpcIvRank.state` and `ScreenerIvRank.state` widen to match.
- **`IvrCell` gains the ring and tooltip.** Fill is a step function of state: fresh 1, aging ¾, stale ½, expired ¼, predates_earnings 0 (gold, center dot). Value tone: usable → surface color; otherwise muted; expired renders `exp`. Absent renders `n/a` with no ring. The tooltip (a shadcn `Tooltip` primitive, added if absent) names the tier, value, observed session in ET, age in trading days, and what the reading can decide. `data-ivr-state` and the accessible label remain the e2e assertion surface. US-98's e2e "An expired reading is indistinguishable from no reading" changes to assert `exp`.
- **Price and day change.** Use `useStockQuotes`-style semantics on the snapshot quote: `price`, and `(price − prevClose) / prevClose` for the percent change, formatted with one decimal and a sign; `prevClose` null → no change line. The price gate compares `price` against `own_below_price` with `decimal.js`.
- **Earnings window.** Compute "in N days" with `date-fns` `differenceInCalendarDays` on the Eastern day, never string slicing. Row window is 7 days; the screener's earnings-before-expiry rule (US-70) is unchanged and still decides the candidate's exclusion.
- **Freshness in the header.** Reuse `MarketStatusPill`, the `Stale snapshot` badge, and the quoted-time caption from the Screener page. No per-row timing indicator.
- **Preserve US-63 test seams.** Cards keep `watchlist-row-{ticker}`, `watchlist-ticker`, `watchlist-tag` (tags render in the detail panel), and `watchlist-remove-{ticker}`; the add form is unchanged and toggled by "Add stock".
- **Failure isolation.** A quote fetch failure empties that ticker's price only; an IVR or earnings read failure degrades every ticker's IV/earnings knowledge to unknown without failing the snapshot; a screener provider outage yields the outage card and leaves the snapshot rows rendered.

---

## Out of Scope

- Editing an entry's thesis or conditions (US-69) — cards and the detail panel are read-only.
- Live streaming ticks on the bench — the page is a snapshot refreshed by Refresh, criteria save, add, and window focus; freshness is conveyed by the header pill.
- Alerting when a stock flips into Meets criteria (future; the pure verdict engine is designed for it).
- Changing screener scoring, the IV-rank floor, or the earnings-before-expiry rule.
- Historical price or IVR charts.

---

## Dependencies

- US-63: entries and conditions; the add form and remove action reused as-is
- US-65 / US-66 / US-67 / US-68 / US-70: screener results, criteria sheet, promote codec, earnings verdicts
- US-97: watchlist underlyings are collected, so bench names have a reading to age
- US-98: freshness engine and `IvrCell`; this story adds the ring, tooltip, and `expired` state
- US-99: Alpaca market-data provider for quotes and chains

---

## Estimate

13 points — the snapshot IPC + verdict engine (~3), the combined page and detail panel (~5), the IvrCell ring/tooltip + expired plumbing (~2), and retiring the Screener page with its e2e re-pointing (~3).

## Mockup

`mockups/us-96-combined-watchlist-b-focus.mdx` (concept B · Focus) — the two-section left column, the sticky stock-detail panel, the matching-put block with Review trade, the reason line per waiting stock, the freshness ring and tooltip in every tier (KO fresh, MSFT aging, PEP stale, DIS expired, ORCL predates earnings, XYZ never collected), the add-stock form, and the no-matches / data-unavailable states. The ring legend row is annotation and does not ship. Preview: `mockups/previews/us-96-focus.png`.
