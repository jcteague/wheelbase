# US-18 — Positions as a card grid

The dashboard's ten-column positions table is gone. Every position now renders as a card in one
responsive grid. A wheel card carries its live price, the open option's mark, unrealized P&L,
one leg block, the two ledger figures, and an **action strip** that mirrors the position's open
management-queue rows in the queue's own words. A PMCC renders as a minimal card in the same
shell until US-108 replaces it.

Story: [OPT-30](https://linear.app/optionswheel/issue/OPT-30) ·
Plan: `plans/us-18/plan.md` · Type design: `plans/us-18/data-model.md` ·
Decisions: `plans/us-18/research.md` · Mockup: `mockups/epic-09-pmcc-dashboard.mdx`
(`WheelCard`, `PositionsGrid`)

## Why

US-108 needs a PMCC card and rejects a mixed table-plus-card dashboard, so the wheel had to
become a card first. A card also answers the trader's real question ("which position needs me
today?") faster than reading across a row: the action strip puts the queue's verdict on the
position itself.

## How it fits together

```mermaid
flowchart LR
  subgraph Main process
    DB[(alerts.rule_code)] --> LMQ[listManagementQueue]
    LMQ -->|ManagementQueueItem + ruleCode| IPC[alerts:list]
  end
  IPC --> UMQ[useManagementQueue]
  PL[positions:list] --> Page[PositionsListPage]
  UMQ --> Page
  Quotes[useStockQuotes] --> Page
  Snaps[useOptionSnapshots] --> Page
  Page -->|"actionsByPosition(rows, ctxById)"| Map[(ReadonlyMap&lt;id, CardAction[]&gt;)]
  Map --> Grid[PositionsGrid]
  Page --> Grid
  Grid -->|strategyType WHEEL| WC[WheelCard]
  Grid -->|strategyType PMCC| PC[PmccCard]
  WC --> D[deriveWheelCardDisplay]
  WC & PC --> Prims[CardShell · CardHeader · PriceBlock · ActionStrip · LegBlock · LegTag · CardFooter]
```

### 1. `ruleCode` on the queue read

`ManagementQueueItem` gains `ruleCode: RuleCode`, selected from the already-stored
`alerts.rule_code` in `listManagementQueue` (`src/main/services/alerts.ts`). The card maps a row
to its lane by rule, never by parsing the summary. No migration. The change is identical to the
one on the unmerged `wb-107` branch, so the two merge cleanly.

### 2. Lanes: `src/renderer/src/lib/card-actions.ts`

`WHEEL_LANES` is a registry keyed by `RuleCode`:

| Rule                  | Strip                 | Tone                                   | Lane  |
| --------------------- | --------------------- | -------------------------------------- | ----- |
| `COVERED_CALL_BREACH` | `▲ CALL BREACHED`     | red                                    | 1     |
| `STRIKE_PROXIMITY`    | `▲ STRIKE PROXIMITY`  | red when quote < put strike, else gold | 1 / 2 |
| `EXPIRATION_IMMINENT` | `◷ EXPIRING`          | gold                                   | 4     |
| `MANAGEMENT_WINDOW`   | `◷ MANAGEMENT WINDOW` | gold                                   | 5     |

Any other code (`PROFIT_TARGET`, `EARNINGS_PROXIMITY`, `PMCC_*`) has no lane and never rides on a
wheel card. Lanes 0 and 3 are reserved for US-108's ✕ and ◆; the numbers are exported as
`LANE_*` constants. `STRIKE_PROXIMITY` takes both its tone and its text from the live price, via
core's exported `priceDirection` and `strikeProximitySummary`; every other lane shows the queue
summary verbatim. `rankWheelActions` sorts stably by lane; `actionsByPosition` groups the queue
by position, using each position's own quote price and strike for the tone. Dismissed rows are
absent from the queue, so they are absent from the strip.

### 3. Primitives: `src/renderer/src/components/position-card/`

Typed on plain props, with no knowledge of queue rows or list items, so US-108 reuses them:

- `CardShell` — `border-l-2` in the phase accent (`CardAccent = StrategyPhase<'WHEEL'> | 'PMCC'`,
  coloured from `PHASE_TOKEN`), or `border-l-4` in the worst action's tone; `data-edge`; navigates
  to its `href` on click; muted at 50% when closed. Hover recolours every border but the left.
- `CardHeader` — ticker link, badges, price block and `Open ↗`, shared by both cards.
- `ActionStrip` — `role="status"`, `data-tone`; the worst action, then a `+N` chip whose tooltip
  lists the rest as `glyph WORD · summary`.
- `LegBlock` / `LegTag` — `P` / `C` / `·` / `L` / `S` tag, action marks, tone tint and border,
  `data-action`.
- `PriceBlock` (with the day-change line; an open card with no price shows `unavailable` and
  `title="Price unavailable"`, a closed one just `closed`), `CardFooter`, `CardFooterCell`, and
  shared class strings in `styles.ts`.

### 4. `WheelCard` and `deriveWheelCardDisplay`

`src/renderer/src/lib/wheel-card-display.ts` turns a list item, its snapshot and its quote into a
`WheelCardDisplay`, a discriminated union of three states:

- `closed` — price `—` / `closed`, P&L `closed — no live marks`, leg `wheel complete`
  (only for `WHEEL_COMPLETE`) or `position closed`.
- `shares` — `shares held · no option leg`, P&L `no option leg open`, placeholder leg
  `no option leg open — sell a covered call`.
- `option` — the live price, a valued P&L (amount, gain/loss tone, percent of max profit, the
  profit-target hit when reached) or `unavailable`, and an option leg (title, expiration, DTE,
  urgency at ≤ 7 DTE, mark with the no-bid or wide-spread note, credit).

A closed card cannot carry a TARGET badge or a live P&L, and a shares card cannot carry an
urgent DTE: those combinations do not type-check (`expectTypeOf(...).not.toExtend` guards them).
`WheelCard.tsx` only composes; every figure comes from the display.

### 5. Minimal `PmccCard`

Teal accent, `PMCC` badge, the state label (`LEAPS + short call open`, or `No short open`
between short calls), the live price over `Nd to next decision`, one `L` / `S` leg block per open
leg with a `—` mark, P&L `—` / `no valuation yet`, and the running basis. No strip, TARGET badge
or Expiring-soon flag.

### 6. Grid and page

`PositionsGrid` renders `grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))]`, so the grid
drops to one column, and cards shrink to fit, on a narrow window. `PositionsListPage` subscribes
to `useManagementQueue` (TanStack Query dedupes it with the queue panel's subscription) and
passes the `actionsByPosition` map down. Every test id the table exposed is preserved.

### Removed

`PositionCard.tsx` (`PositionRow`), `PmccPositionRow.tsx`, `OptMidCell.tsx`,
`UnrealizedPnlCell.tsx`, `PriceCell.tsx`, `positionRowStyles.ts`, their tests, and the
`.wb-position-row*` CSS.

### Supporting changes

- `occSymbolForLeg` in `src/shared/option-symbol.ts` replaces two hand-written copies (page and
  `useOptionSnapshots`).
- The fake market-data provider throws `not_found` (not `unknown`) for a missing option snapshot,
  matching the Alpaca adapter, so one missing contract no longer fails the whole batch.

## Tests

- Vitest: lanes, grouping, display derivation (including the `-0%` rounding and closed-phase
  cases), every primitive, both cards, the grid and the page wiring.
- E2E: `e2e/position-cards.spec.ts` covers all 22 scenarios (S1–S21, S13a/b), seeded through
  `e2e/position-card-helpers.ts`. `option-pnl` AC-1 now asserts the card's mid rather than the
  `Opt Mid` column header. Three PMCC and settings specs had their table-shaped selectors updated
  to the leg-block text.
