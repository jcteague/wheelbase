# US-18: Positions as a card grid

<!-- generated:from us-18 -->

## Summary

The dashboard's ten-column positions table is gone. Every position renders as a card in one
responsive grid (`PositionsGrid`), active positions first and closed ones muted below.

- **Wheel card.** Shows the live underlying price, the open option's mark, unrealized P&L as the
  headline figure, one leg block, and a footer with cost basis and premium collected. An **action
  strip** carries the position's open [management-queue](us-51-management-queue-dashboard.md) rows
  in the queue's own words, worst first, with a `+N` chip for the rest.
- **PMCC card.** A PMCC renders as a minimal card in the same shell until US-108 (OPT-16) replaces
  it.

The action strip answers "which position needs me today?" on the position itself. The strip
**mirrors** the queue rather than re-evaluating alert predicates, so a dismissed row disappears
from the card as well.

The only main-process change is an additive `ruleCode` on the `alerts:list` queue item. There is
**no migration**. US-18 blocks US-108, which rejects a mixed table-plus-card dashboard, so the
wheel had to become a card first.

Story: [Linear OPT-30 / US-18](https://linear.app/optionswheel/issue/OPT-30) (Linear is the
requirements authority; `docs/epics/04-stories/US-18-position-cards.md` is the archived source it
was reconciled from). Implementation notes:
[`docs/us-18-implementation.md`](../../us-18-implementation.md). Mockup:
[`mockups/epic-09-pmcc-dashboard.mdx`](../../../mockups/epic-09-pmcc-dashboard.mdx) (`WheelCard`,
`PositionsGrid`, `CardShell`, `ActionStrip`, `LegTag`, `FootCell`, `PriceBlock`, `QUEUE_ACTION`).
`mockups/us-18-position-cards.mdx` is history only.

## Acceptance criteria

From Linear OPT-30: 21 Gherkin scenarios, where S13 is an outline with two examples, making 22 e2e
cases.

**Background.** Valuation date 2027-08-13 (America/New_York), a 21-DTE management window and a 50%
profit target. The fixtures are:

| Position | Phase                     | Option leg        | Fill / basis                   | Quote   | Option bid × ask |
| -------- | ------------------------- | ----------------- | ------------------------------ | ------- | ---------------- |
| MSFT     | `CC_OPEN`                 | $430 call, 10 DTE | fill 2.80, basis 402.40        | $421.50 | $1.75 × $1.85    |
| AAPL     | `CSP_OPEN`                | $180 put, 30 DTE  | fill 3.50, basis 176.50        | $182.45 | $2.55 × $2.65    |
| NVDA     | `HOLDING_SHARES`          | none              | basis 118.60                   | $128.30 | —                |
| TSLA     | `WHEEL_COMPLETE` (closed) | none              | basis 236.40, premium 1,240.00 | —       | —                |

The alert engine has already evaluated.

1. **S1 — One card grid, not a table.** One card per active position and no table header row. The
   grid is multi-column and reflows to one column on a narrow window. TSLA is muted under Closed.
2. **S2 — Header.** Ticker, `CSP_OPEN` badge, `$182.45`, `30d to expiration`, and an `Open ↗` link
   at the far right. The left edge takes the phase colour.
3. **S3 — Unrealized P&L is the big figure.**
   - AAPL: `+$90.00` in green with `+25.7% of max profit`, from (3.50 − 2.60) × 100.
   - MSFT: `+$100.00` with `+35.7% of max profit`.
4. **S4 — P&L is red when the option gained value.** AAPL put at $5.10 × $5.30 → `-$170.00` in red,
   `-48.6% of max profit`.
5. **S5 — Leg block shows the open option.**
   - AAPL, tag `P`: `$180.00 put · 2027-09-12 · 30d · mid $2.60 · $3.50 credit`.
   - MSFT, tag `C`: `$430.00 call · 2027-08-23 · 10d · mid $1.80 · $2.80 credit`.
6. **S6 — Shares-only card.** NVDA:
   - leg reads `no option leg open — sell a covered call`, with `—` DTE and mid;
   - P&L reads `—` / `no option leg open`;
   - header reads `shares held · no option leg`.
7. **S7 — TARGET badge.** MSFT call at $1.25 × $1.35 → gold `TARGET` badge with the existing
   tooltip (53.6% ≥ 50%). AAPL shows none. The profit target never produces an action strip.
8. **S8 — DTE inside 7 days.** MSFT at 4 DTE → `4d` in gold plus the `Expiring soon` flag. AAPL at
   30d is plain, with no flag.
9. **S9 — Wide spread or unavailable snapshot.**
   - AAPL at $0.50 × $1.50 → mid `$1.00` with a gold ⚠ and the tooltip
     `Wide spread: $0.50 × $1.50 — P&L may be unreliable`.
   - MSFT with no snapshot → mid `— unavailable`, P&L `—` / `unavailable`.
   - Ledger figures are unchanged in both cases.
10. **S10 — Footer ledger figures.**
    - AAPL: Cost basis `$176.50` `/ share`, Premium collected `$350.00` `to date`.
    - NVDA: `$118.60` and `$640.00`.
11. **S11 — A management-window row becomes a gold strip.** MSFT's strip reads
    `◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close`, the queue summary verbatim.
    - The leg gets a gold tint, a gold left border, and a ◷ mark with the same tooltip.
    - The card edge turns gold.
    - AAPL (30 DTE) has no strip and keeps its `CSP_OPEN` edge.
12. **S12 — EXPIRING leads.** MSFT at 4 DTE → gold `◷ EXPIRING · Expires in 4 days at $430.00
strike`. There is no MANAGEMENT WINDOW row, because the two DTE rules are mutually exclusive.
13. **S13 (outline) — STRIKE PROXIMITY on a put.**
    - At $181.40 → gold `▲ STRIKE PROXIMITY · Stock is 0.8% above the $180.00 put strike`.
    - At $178.90 → red `… 0.6% below the $180.00 put strike — now in the money`.
    - The leg tint, ▲ mark and card edge follow the strip's colour.
14. **S14 — CALL BREACHED in red.** MSFT at $435.20 → red `▲ CALL BREACHED · Stock is 1.2% above
the $430.00 call strike — shares may be called away`. - A `+1` chip lists the MANAGEMENT WINDOW line. - The leg shows both marks, ▲ ◷, and the card edge is red.
15. **S15 — Worst first, the rest on `+N`.** MSFT at 4 DTE and $435.20 → CALL BREACHED leads and the
    `+1` chip lists EXPIRING. Lane order is ▲ red › ▲ gold › ◷ EXPIRING › ◷ MANAGEMENT WINDOW, shared
    with US-108.
16. **S16 — A dismissed row does not ride on the card.** After MSFT's `MANAGEMENT_WINDOW` alert is
    dismissed:
    - no strip and no leg highlight;
    - the edge returns to `CC_OPEN`;
    - the leg still reads `10d`.
17. **S17 — The whole card navigates.** Clicking the card, the ticker or `Open ↗` opens the detail
    page.
18. **S18 — Pending assignment.** A pulsing gold `Assignment pending` indicator appears beside the
    ticker.
19. **S19 — Closed card.** TSLA is muted, with a `WHEEL_COMPLETE` badge.
    - Price reads `—` over `closed`; P&L reads `—` over `closed — no live marks`.
    - The leg reads `wheel complete`, with dashes.
    - No strip, TARGET badge or flag.
    - Cost basis `$236.40`, Premium collected `$1,240.00`.
20. **S20 — Sort order is kept.** Active lists MSFT (10d), then AAPL (30d), then NVDA (no option
    leg).
21. **S21 — Minimal PMCC card.** XYZ has an $80 LEAPS expiring 2028-01-21 and a $118 short call
    expiring 2027-08-20. The card shows:
    - a `PMCC` badge and `LEAPS + short call open`;
    - the live price;
    - one leg block per open leg, with strike, expiration, DTE and mid `—`;
    - P&L `—`;
    - the running cost basis in the footer.

    It shows no strip, TARGET badge or flag, and never a wheel phase badge.

UI notes from the story: `PROFIT_TARGET` never produces a strip, closed cards render at 50%
opacity, and the whole card is clickable.

Out of scope: the full PMCC card (US-108), live re-evaluation of alert predicates, and any change to
the queue, the alert rules or dismissal.

`e2e/position-cards.spec.ts` covers all 22 cases (S1–S21, S13a/b).

## What was built

### Data flow

1. `listManagementQueue` (`src/main/services/alerts.ts`) now also selects the stored
   `alerts.rule_code`, so each `ManagementQueueItem` carries a `ruleCode`.
2. `PositionsListPage` subscribes to `useManagementQueue`. TanStack Query dedupes this with the
   queue panel's own subscription.
3. The page builds a `LaneContext` (live quote price and the leg strike) for each active **wheel**
   position.
4. It calls the pure `actionsByPosition(rows, ctxById)` once, producing a
   `ReadonlyMap<positionId, CardAction[]>`.
5. `PositionsGrid` branches on `item.strategyType`: `WheelCard` for a wheel, `PmccCard` for a PMCC.
   Cards never see queue rows.

### Action lanes

`src/renderer/src/lib/card-actions.ts` holds `WHEEL_LANES`, a registry keyed by `RuleCode`:

| `ruleCode`            | Strip                 | Tone                                   | Lane  |
| --------------------- | --------------------- | -------------------------------------- | ----- |
| `COVERED_CALL_BREACH` | `▲ CALL BREACHED`     | red                                    | 1     |
| `STRIKE_PROXIMITY`    | `▲ STRIKE PROXIMITY`  | red when quote < put strike, else gold | 1 / 2 |
| `EXPIRATION_IMMINENT` | `◷ EXPIRING`          | gold                                   | 4     |
| `MANAGEMENT_WINDOW`   | `◷ MANAGEMENT WINDOW` | gold                                   | 5     |

- **Dropped rules.** Any other code has no lane and never reaches a wheel card: `PROFIT_TARGET`,
  `EARNINGS_PROXIMITY`, and `PMCC_*`.
- **Reserved lanes.** Lanes 0 and 3 are reserved for US-108's ✕ and ◆. The lane numbers are
  exported as `LANE_*` constants for it.
- **Ordering.** `rankWheelActions` sorts stably by lane.
- **Text.** The strip's text is `glyph WORD · summary` (`formatActionLine`). The summary is the
  queue row's text verbatim, except `STRIKE_PROXIMITY`, which core's `strikeProximitySummary`
  recomputes from the same live price that sets the tone (stored text when there is no price).

### Card states

`deriveWheelCardDisplay` (`src/renderer/src/lib/wheel-card-display.ts`) turns a list item, its
option snapshot and its quote into a `WheelCardDisplay`, a discriminated union of three states:

- `closed`
- `shares`
- `option`, with a valued or `unavailable` P&L, and a leg carrying its mark and its no-bid or
  wide-spread note.

`WheelCard.tsx` only composes; every figure comes from the display. The figures come from existing
helpers:

- `computeUnrealizedPnl`
- `formatPnlPercentForDisplay`, with `% of max profit` appended
- `isWideSpread` and `hasNoBid`
- `isDteUrgent` (≤ 7 DTE)
- `resolveProfitTarget`

`no bid` wins over the wide-spread warning, because a zero bid always reads as wide.

### Shared primitives

The primitives in `src/renderer/src/components/position-card/` are:

- `CardShell`, `CardHeader` and `PriceBlock`
- `ActionStrip`
- `LegBlock` and `LegTag`
- `CardFooter` and `CardFooterCell`
- shared class strings in `styles.ts`

They are typed on plain props (`CardTone`, `CardAccent = StrategyPhase<'WHEEL'> | 'PMCC'`) and know
nothing about queue rows or list items. Two details matter for styling:

- **Card edge.** `CardShell` draws a 2px left border in the phase accent. When the card has actions,
  the border becomes 4px in the worst action's tone. The shell exposes the result as `data-edge`.
- **Clickability.** `CardShell` takes a required `href`; a click anywhere on the card navigates there, open or closed.

### Minimal PMCC card

`PmccCard` uses the same shell:

- a teal accent and a `PMCC` badge;
- a state label, `LEAPS + short call open` or `No short open`;
- the price over `Nd to next decision`, where the DTE is `short?.dte ?? long.dte`;
- one `L` / `S` leg block per open leg, each with a `—` mark;
- P&L `—` / `no valuation yet`;
- a basis and premium footer.

It has no strip, TARGET badge or flag.

### Closed and edge cases

- **Closed cards.** They keep the short phase badge (for example `CSP ✓`), show `—` for price, mid,
  DTE and P&L, and request no snapshots or quotes. They stay clickable. The leg text is
  `wheel complete` only for `WHEEL_COMPLETE`; any other closed wheel reads `position closed`.
- **No row-wide highlight at ≤ 7 DTE.** Only the DTE figure and the flag change. The card edge is
  reserved for action tones.

### Grid

`PositionsGrid` uses `grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))]`, so on a narrow
window it drops to one column and the cards shrink to fit.

### Removed

These were deleted outright rather than wrapped:

- the table rows: `PositionCard.tsx` (`PositionRow`) and `PmccPositionRow.tsx`;
- the cells: `OptMidCell.tsx`, `UnrealizedPnlCell.tsx` and `PriceCell.tsx`;
- `positionRowStyles.ts`, together with all of the above files' tests;
- `TABLE_COLUMNS` and the `.wb-position-row*` CSS.

The helpers in `lib/option-display.ts` stay.

### Supporting changes

- **`occSymbolForLeg`.** This helper in `src/shared/option-symbol.ts` replaces two hand-written
  copies, one in the page and one in `useOptionSnapshots`.
- **Fake provider.** `FakeMarketDataProvider` now throws `MarketDataError('not_found')` instead of
  `'unknown'` for a missing option snapshot, matching the Alpaca adapter. One missing contract no
  longer fails the whole batch.

### Tests

- **No property tests.** No `src/main/core/` engine changed. The service change is a projection,
  and the renderer libs map over a finite enum with an example test for every branch.
- **Page test.** The page test mocks `WheelCard` and `PmccCard`, with a `mock-actions-{T}` stub that
  asserts the queue-to-card grouping at page level.
- **Existing e2e specs.** `e2e/option-pnl.spec.ts` AC-1 now asserts the card's mid, and the absence
  of a `thead`, instead of the `Opt Mid` column header. Three PMCC and settings specs had
  table-shaped selectors rewritten to leg-block text.

**Logging is unchanged.**

### Known limitation

The `STRIKE_PROXIMITY` tone and its summary come from different moments:

- the **tone** comes from the live quote;
- the **summary** is the text from the last alert evaluation.

Near the strike, the two can briefly disagree. For example, the strip can be red while the text
still reads `above the … put strike`. The likely fix is to carry the price direction on the alert
itself. See
[wheel-card-strip-mirrors-management-queue](../architecture/02-adrs/wheel-card-strip-mirrors-management-queue.md).

## Architecture decisions

Recorded in this story:

- **The wheel strip mirrors the management queue.** Its strip is not built from re-evaluated alert
  predicates. Related decisions in the same ADR:
  - `ruleCode` joins `ManagementQueueItem`;
  - lanes form a keyed registry with lanes 0 and 3 reserved;
  - the `STRIKE_PROXIMITY` tone comes from the live quote;
  - the page subscribes to the queue a second time.

  See
  [wheel-card-strip-mirrors-management-queue](../architecture/02-adrs/wheel-card-strip-mirrors-management-queue.md).

- **One set of card primitives for both strategies.** Related decisions in the same ADR:
  - `WheelCardDisplay` is a discriminated union;
  - the minimal PMCC card stands in until US-108;
  - the table cells are deleted, not wrapped.

  See
  [position-card-primitives-shared-across-strategies](../architecture/02-adrs/position-card-primitives-shared-across-strategies.md).

Existing decisions this story builds on:

- [management-queue-read-path](../architecture/02-adrs/management-queue-read-path.md)
- [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md)
- [pmcc-list-item-discriminated-union](../architecture/02-adrs/pmcc-list-item-discriminated-union.md)
  (its minimal PMCC row is superseded by `PmccCard`)
- [positions-list-active-closed-grouping](../architecture/02-adrs/positions-list-active-closed-grouping.md)
- [spread-no-bid-renderer-predicates](../architecture/02-adrs/spread-no-bid-renderer-predicates.md)
- [underlying-via-stockquotes](../architecture/02-adrs/underlying-via-stockquotes.md)
- [occ-symbol-pure-leaf](../architecture/02-adrs/occ-symbol-pure-leaf.md)

See [domain/alerts](../domain/alerts.md) for the rule set the lanes map, and
[architecture/03-design-system](../architecture/03-design-system.md) for the `wb-*` tokens the
cards use.

## Contracts touched

- **IPC: `alerts:list`.** Each item gains `ruleCode: RuleCode`, read from the already-stored
  `alerts.rule_code`.
  - Ordering is unchanged: urgency rank, then `triggered_at ASC`.
  - The handler and the standard error envelope are unchanged.

  See [contracts/ipc-handlers](../contracts/ipc-handlers.md).

- **Types.** `ManagementQueueItem.ruleCode` is added in `src/main/schemas.ts`. Preload already
  aliases the schema type, so preload needed no edit. New renderer types:
  - `CardTone`, `CardAction`, `LaneContext`, `QueueRowForCard`, `QueueRowForPosition`,
    `WHEEL_LANES` and the `LANE_*` constants in `lib/card-actions.ts`;
  - the `WheelCardDisplay` union in `lib/wheel-card-display.ts`;
  - `CardAccent` in `components/position-card/types.ts`.

  See [contracts/zod-schemas](../contracts/zod-schemas.md).

- **DOM test ids (e2e contract).** All of the table's test ids are preserved:
  - `position-card` and `position-card-closed`
  - `position-ticker`
  - `position-card-{T}-price`, `position-card-{T}-opt-mid` and `position-card-{T}-pnl`
  - `target-badge`, `expiring-soon-flag` and `opt-mid-spread-warning`
  - `pending-assignment-indicator-{id}`

  New ids and attributes:
  - `action-strip`, with `role="status"` and `data-tone`
  - `leg-block`, with `data-action`
  - `data-edge` on the shell

- **Schema.** None. There is no migration and no seed data. See
  [schema/tables](../schema/tables.md).

## Source files

- `src/main/schemas.ts`: `ManagementQueueItem.ruleCode`
- `src/main/services/alerts.ts`: `listManagementQueue` selects `rule_code`, plus `QueueRow` and
  `mapQueueRow`
- `src/main/integrations/fake-market-data.ts`: `not_found` for a missing snapshot
- `src/shared/option-symbol.ts`: `occSymbolForLeg`
- `src/renderer/src/hooks/useOptionSnapshots.ts`: uses `occSymbolForLeg`
- `src/renderer/src/lib/card-actions.ts`: lanes, `rankWheelActions`, `formatActionLine` and
  `actionsByPosition`
- `src/renderer/src/lib/wheel-card-display.ts`: `deriveWheelCardDisplay` and the `WheelCardDisplay`
  union
- `src/renderer/src/components/position-card/`:
  - `types.ts`, `styles.ts`
  - `CardShell.tsx`, `CardHeader.tsx`, `PriceBlock.tsx`
  - `ActionStrip.tsx`, `LegTag.tsx`, `LegBlock.tsx`
  - `CardFooter.tsx`, `CardFooterCell.tsx`
  - `WheelCard.tsx`, `PmccCard.tsx`
- `src/renderer/src/components/PositionsGrid.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`: the grid replaces the table, and the page wires
  `useManagementQueue`
- `src/renderer/src/test-fixtures/wheel-cards.ts`: shared card fixtures
- `src/renderer/src/index.css`: the `.wb-position-row*` rules are removed
- `e2e/position-cards.spec.ts`: 22 cases, S1–S21 and S13a/b
- `e2e/position-card-helpers.ts`: seeds for the card scenarios
- Selectors updated in `e2e/option-pnl.spec.ts`, `e2e/open-pmcc-position.spec.ts`,
  `e2e/pmcc-leaps-roll.spec.ts` and `e2e/settings-environment.spec.ts`

Sources: [extract: us-18](../.extracts/us-18.md), `plans/us-18/`,
[`docs/us-18-implementation.md`](../../us-18-implementation.md).

Related stories:

- [us-2](./us-2-position-list.md): the positions list this replaces the table of.
- [us-32](./us-32-live-position-prices.md) and [us-33](./us-33-option-mid-pnl.md): the live price,
  option mid, P&L and TARGET figures the card now carries.
- [us-51](./us-51-management-queue-dashboard.md): the queue the strip mirrors.
- [us-59](./us-59-dismiss-alert.md): dismissal, which removes a row from the strip for free.
- [us-52](./us-52-expiration-imminent-alert.md),
  [us-53-54-55](./us-53-54-55-market-data-alert-rules.md) and
  [us-62](./us-62-covered-call-breach-alert.md): the rules behind the four lanes.
- [us-101](./us-101-open-pmcc-position.md), [us-103](./us-103-pmcc-cost-basis.md) and
  [us-105](./us-105-roll-pmcc-leaps.md): the PMCC list data the minimal card shows.
- US-108 (OPT-16): replaces the minimal PMCC card and adds the ✕ and ◆ lanes.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
